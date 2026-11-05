-- Raw accounting cost columns must not be selectable through PostgREST.
-- The existing owner-only profit permission remains the source of truth.
create or replace function public.read_protected_cost(
  p_source text, p_row_id uuid, p_warehouse_id uuid default null
)
returns numeric(18,4)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_result numeric(18,4);
begin
  if v_company is null or not public.can_view_profit() then return null; end if;
  case p_source
    when 'invoice_cost' then
      select cost_total into v_result from public.invoices
      where id = p_row_id and company_id = v_company;
    when 'invoice_profit' then
      select profit_total into v_result from public.invoices
      where id = p_row_id and company_id = v_company;
    when 'invoice_line' then
      select unit_cost into v_result from public.invoice_items
      where id = p_row_id and company_id = v_company;
    when 'transfer_line' then
      select unit_cost into v_result from public.warehouse_transfer_items
      where id = p_row_id and company_id = v_company;
    when 'stock' then
      select avg_cost into v_result from public.item_stock
      where item_id = p_row_id and warehouse_id = p_warehouse_id and company_id = v_company;
    when 'opening' then
      select unit_cost into v_result from public.stock_opening_balances
      where item_id = p_row_id and warehouse_id = p_warehouse_id and company_id = v_company;
    else raise exception 'invalid_cost_source' using errcode = '22023';
  end case;
  return v_result;
end $$;

-- A quantity editor cannot submit a masked cost as zero. The caller sends null
-- and the transaction preserves the existing opening cost inside the database.
do $$
declare
  v_definition text := pg_get_functiondef('public.save_opening_balances(jsonb,jsonb)'::regprocedure);
  v_marker text := '    if v_stock.unit_cost is null or v_stock.unit_cost < 0 then';
  v_insert text := $code$
    if not public.can_view_profit() then
      if v_stock.unit_cost is not null then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
      select coalesce(o.unit_cost, i.purchase_price, 0) into v_stock.unit_cost
      from public.items i
      left join public.stock_opening_balances o
        on o.item_id = i.id and o.company_id = v_company
        and o.warehouse_id = v_stock.warehouse_id
      where i.id = v_stock.item_id and i.company_id = v_company;
    end if;
$code$;
begin
  if strpos(v_definition, v_marker) = 0 then
    raise exception 'save_opening_balances definition did not match';
  end if;
  execute replace(v_definition, v_marker, v_insert || v_marker);
end $$;
revoke all on function public.read_protected_cost(text,uuid,uuid) from public, anon;
grant execute on function public.read_protected_cost(text,uuid,uuid) to authenticated;

do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array['invoices','invoice_items','item_stock',
      'warehouse_transfer_items','stock_opening_balances','stock_opening_adjustments'] loop
    execute format('revoke select on public.%I from public, anon, authenticated', v_table);
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
    from pg_attribute where attrelid = ('public.' || v_table)::regclass
      and attnum > 0 and not attisdropped
      and attname not in ('cost_total','profit_total','unit_cost','avg_cost');
    execute format('grant select (%s) on public.%I to authenticated', v_columns, v_table);
  end loop;
end $$;

-- Keep the security-invoker views and their existing shape. Only the cost
-- expressions change; safe columns continue to use the caller's RLS policies.
do $$
declare
  v_view text;
  v_definition text;
begin
  foreach v_view in array array['v_invoice_list','v_invoice_items',
      'v_warehouse_transfer_list','v_stock_opening_balances','v_warehouse_items'] loop
    v_definition := pg_get_viewdef(('public.' || v_view)::regclass, true);
    if v_view = 'v_invoice_list' then
      v_definition := replace(v_definition, 'i.cost_total', 'public.read_protected_cost(''invoice_cost'', i.id)');
      v_definition := replace(v_definition, 'i.profit_total', 'public.read_protected_cost(''invoice_profit'', i.id)');
    elsif v_view = 'v_invoice_items' then
      v_definition := replace(v_definition, 'ii.unit_cost', 'public.read_protected_cost(''invoice_line'', ii.id)');
      v_definition := replace(v_definition,
        E'    public.read_protected_cost(''invoice_line'', ii.id),\n',
        E'    public.read_protected_cost(''invoice_line'', ii.id)::numeric(18,4) AS unit_cost,\n');
    elsif v_view = 'v_warehouse_transfer_list' then
      v_definition := replace(v_definition, 'ti.unit_cost', 'public.read_protected_cost(''transfer_line'', ti.id)');
      v_definition := regexp_replace(v_definition,
        '(\(?COALESCE\(lines.total_value[^\n]+)( AS total_value)',
        '(CASE WHEN public.can_view_profit() THEN \1 ELSE NULL::numeric END)::numeric(18,4)\2', 'i');
    else
      -- Match only the unit-cost expression, not earlier quantity columns.
      v_definition := regexp_replace(v_definition,
        '(\(?COALESCE\((s.avg_cost|o.unit_cost)[^\n]+)( AS unit_cost)',
        '(CASE WHEN public.can_view_profit() THEN \1 ELSE NULL::numeric END)::numeric(18,4)\3', 'i');
      v_definition := replace(v_definition, 's.avg_cost', 'public.read_protected_cost(''stock'', i.id, w.id)');
      v_definition := replace(v_definition, 'o.unit_cost', 'public.read_protected_cost(''opening'', i.id, w.id)');
    end if;
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v_view, v_definition);
  end loop;
end $$;

-- Transfer editors need quantities, not the authoritative stored cost.
create or replace view public.v_warehouse_transfer_items
with (security_invoker = true) as
select id, company_id, transfer_id, item_id, qty,
  public.read_protected_cost('transfer_line', id)::numeric(18,4) as unit_cost,
  created_at, updated_at
from public.warehouse_transfer_items;
revoke all on public.v_warehouse_transfer_items from public, anon;
grant select on public.v_warehouse_transfer_items to authenticated;

-- Only the owner may receive cost-derived KPI values.
do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    'public.get_warehouse_stock_kpis(uuid,text)'::regprocedure,
    'public.get_warehouse_transfer_kpis(text,text,text,boolean)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_definition := replace(v_definition,
      '''total_val'', coalesce(sum(case when v.current_qty > 0 then v.current_qty * v.unit_cost else 0 end), 0)::numeric(18,4)',
      '''total_val'', case when public.can_view_profit() then coalesce(sum(case when v.current_qty > 0 then v.current_qty * v.unit_cost else 0 end), 0)::numeric(18,4) else null end');
    v_definition := replace(v_definition,
      '''total_value'', coalesce(sum(v.total_value), 0)::numeric(18,4)',
      '''total_value'', case when public.can_view_profit() then coalesce(sum(v.total_value), 0)::numeric(18,4) else null end');
    execute v_definition;
  end loop;
end $$;

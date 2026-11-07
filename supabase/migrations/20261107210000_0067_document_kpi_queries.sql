-- The document predicate binds $3 (column filters) and $4 (literal search).
-- Aggregate only the columns needed by each summary, avoiding full-row JSON
-- conversion and its protected projections during filtering.
create or replace function public.get_invoice_kpis_columns(
  p_columns jsonb, p_kind text, p_search text default null, p_status text default 'all',
  p_date_from text default null, p_date_to text default null, p_show_deleted boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_predicate text;
  v_profit text := 'null::numeric';
  v_source text := 'public.v_invoice_list v';
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('goods.' || p_kind || '.view');
  v_predicate := public.document_list_predicate('invoice', p_columns, p_search);
  if public.can_view_profit() then
    -- The stored amount is the same value read by read_protected_cost. Only
    -- authorized callers take this branch, and the join is company-scoped.
    v_source := v_source || ' join public.invoices i on i.id = v.id and i.company_id = $1';
    v_profit := 'coalesce(sum(i.profit_total), 0)::numeric(18,4)';
  end if;
  execute
    'select jsonb_build_object(
      ''total_amount'', coalesce(sum(v.total), 0)::numeric(18,4),
      ''paid_amount'', coalesce(sum(v.paid), 0)::numeric(18,4),
      ''remaining_amount'', coalesce(sum(v.remaining), 0)::numeric(18,4),
      ''profit_total'', ' || v_profit || ', ''count'', count(*))
    from ' || v_source || '
    where v.company_id = $1 and v.kind = $2
      and (v.deleted_at is not null) = $7
      and ($5 is null or v.invoice_date >= $5)
      and ($6 is null or v.invoice_date <= $6)
      and (coalesce(nullif($8, ''''), ''all'') = ''all''
        or ($8 = ''paid'' and v.remaining <= 0)
        or ($8 = ''partial'' and v.paid > 0 and v.remaining > 0)
        or ($8 = ''unpaid'' and v.paid <= 0 and v.remaining > 0))
      and (' || v_predicate || ')'
    into v_result using v_company, p_kind, p_columns, p_search,
      nullif(p_date_from, '')::date, nullif(p_date_to, '')::date, p_show_deleted is true, p_status;
  return v_result;
end $$;
revoke all on function public.get_invoice_kpis_columns(jsonb,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.get_invoice_kpis_columns(jsonb,text,text,text,text,text,boolean) to authenticated;

create or replace function public.get_receipt_kpis_columns(
  p_columns jsonb, p_direction text, p_cash_box_id uuid default null, p_search text default null,
  p_date_from text default null, p_date_to text default null, p_show_deleted boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('money.' || p_direction || '.view');
  execute
    'select jsonb_build_object(
      ''total_amount'', coalesce(sum(v.amount), 0)::numeric(18,4),
      ''invoice_linked'', coalesce(sum(v.amount) filter (where v.invoice_id is not null), 0)::numeric(18,4),
      ''count'', count(*))
    from public.v_receipt_list v
    where v.company_id = $1 and v.direction = $2
      and (v.deleted_at is not null) = $7
      and ($5 is null or v.receipt_date >= $5)
      and ($6 is null or v.receipt_date <= $6)
      and ($8 is null or v.cash_box_id = $8)
      and (' || public.document_list_predicate('receipt', p_columns, p_search) || ')'
    into v_result using v_company, p_direction, p_columns, p_search,
      nullif(p_date_from, '')::date, nullif(p_date_to, '')::date, p_show_deleted is true, p_cash_box_id;
  return v_result;
end $$;
revoke all on function public.get_receipt_kpis_columns(jsonb,text,uuid,text,text,text,boolean) from public, anon;
grant execute on function public.get_receipt_kpis_columns(jsonb,text,uuid,text,text,text,boolean) to authenticated;

create or replace function public.get_warehouse_transfer_kpis_columns(
  p_columns jsonb, p_search text default null, p_date_from text default null,
  p_date_to text default null, p_show_deleted boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_value text := 'null::numeric';
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('goods.warehouse_transfer.view');
  if public.can_view_profit() then
    v_value := 'coalesce(sum(v.total_value), 0)::numeric(18,4)';
  end if;
  execute
    'select jsonb_build_object(''total_value'', ' || v_value || ',
      ''total_qty'', coalesce(sum(v.total_qty), 0)::numeric(18,4), ''count'', count(*))
    from public.v_warehouse_transfer_list v
    where v.company_id = $1
      and (v.deleted_at is not null) = $7
      and ($5 is null or v.transfer_date >= $5)
      and ($6 is null or v.transfer_date <= $6)
      and (' || public.document_list_predicate('warehouse_transfer', p_columns, p_search) || ')'
    into v_result using v_company, null::text, p_columns, p_search,
      nullif(p_date_from, '')::date, nullif(p_date_to, '')::date, p_show_deleted is true;
  return v_result;
end $$;
revoke all on function public.get_warehouse_transfer_kpis_columns(jsonb,text,text,text,boolean) from public, anon;
grant execute on function public.get_warehouse_transfer_kpis_columns(jsonb,text,text,text,boolean) to authenticated;

create or replace function public.get_cash_box_transfer_kpis_columns(
  p_columns jsonb, p_cash_box_id uuid default null, p_search text default null,
  p_date_from text default null, p_date_to text default null, p_show_deleted boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('money.cash_box_transfer.view');
  execute
    'select jsonb_build_object(
      ''total_amount'', coalesce(sum(v.amount), 0)::numeric(18,4), ''count'', count(*))
    from public.v_cash_box_transfer_list v
    where v.company_id = $1
      and (v.deleted_at is not null) = $7
      and ($5 is null or v.transfer_date >= $5)
      and ($6 is null or v.transfer_date <= $6)
      and ($8 is null or v.source_cash_box_id = $8 or v.destination_cash_box_id = $8)
      and (' || public.document_list_predicate('cash_transfer', p_columns, p_search) || ')'
    into v_result using v_company, null::text, p_columns, p_search,
      nullif(p_date_from, '')::date, nullif(p_date_to, '')::date, p_show_deleted is true, p_cash_box_id;
  return v_result;
end $$;
revoke all on function public.get_cash_box_transfer_kpis_columns(jsonb,uuid,text,text,text,boolean) from public, anon;
grant execute on function public.get_cash_box_transfer_kpis_columns(jsonb,uuid,text,text,text,boolean) to authenticated;

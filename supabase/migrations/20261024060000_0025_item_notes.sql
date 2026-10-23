alter table public.items add column notes text;

create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.unit,
  w.id as warehouse_id,
  w.name as warehouse_name,
  coalesce(o.opening_qty, 0)::numeric(18,4) as opening_qty,
  coalesce(o.unit_cost, i.purchase_price)::numeric(18,4) as unit_cost,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  case when o.item_id is null then false else
    exists (
      select 1 from public.invoices inv join public.invoice_items ii on ii.invoice_id = inv.id
      where inv.company_id = i.company_id and inv.warehouse_id = w.id and ii.item_id = i.id
        and inv.created_at >= o.created_at
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = i.company_id and a.warehouse_id = w.id and a.item_id = i.id
    ) end as cost_locked,
  w.notes as warehouse_notes,
  i.notes as item_notes
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;
grant select on public.v_stock_opening_balances to authenticated;

create or replace function public.create_item_with_opening_stock_and_notes(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item_id uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_item_id := public.create_item_with_opening_stock(
    p_name, p_unit, p_sale_price, p_purchase_price, p_is_active,
    p_warehouse_id, p_opening_qty, p_unit_cost
  );
  update public.items
  set notes = nullif(btrim(p_notes), '')
  where id = v_item_id and company_id = v_company;
  if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
  return v_item_id;
end;
$$;

revoke all on function public.create_item_with_opening_stock_and_notes(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.create_item_with_opening_stock_and_notes(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text) to authenticated;

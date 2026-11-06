-- The view is also consumed by SECURITY DEFINER list and KPI RPCs. Their
-- item-company filter cannot substitute for matching the warehouse company:
-- those callers bypass the warehouse RLS that normally hides foreign rows.
create or replace view public.v_warehouse_items
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.code as item_code,
  i.unit,
  i.sale_price,
  i.purchase_price,
  i.serial_number as item_number,
  i.notes as item_notes,
  i.is_active as item_is_active,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.serial_number as warehouse_number,
  w.notes as warehouse_notes,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  (case when public.can_view_profit() then
    coalesce(public.read_protected_cost('stock', i.id, w.id),
             public.read_protected_cost('opening', i.id, w.id),
             i.purchase_price, 0)::numeric(18,4)
   else null::numeric end)::numeric(18,4) as unit_cost
from public.items i
join public.warehouses w on w.company_id = i.company_id
left join public.item_stock s
  on s.company_id = i.company_id and s.warehouse_id = w.id and s.item_id = i.id
left join public.stock_opening_balances o
  on o.company_id = i.company_id and o.warehouse_id = w.id and o.item_id = i.id
where i.is_active is true and w.is_active is true;

revoke all on public.v_warehouse_items from public, anon;
grant select on public.v_warehouse_items to authenticated;

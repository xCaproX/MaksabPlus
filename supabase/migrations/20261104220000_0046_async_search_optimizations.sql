-- =====================================================================
-- 0046_async_search_optimizations.sql
-- إضافة أسعار البيع والشراء لعرض أرصدة المخازن لتسريع البحث اللحظي
-- مع فهرس مخصص لتسريع البحث عن الحسابات
-- =====================================================================

create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id, i.id as item_id, i.name as item_name, i.unit,
  w.id as warehouse_id, w.name as warehouse_name,
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
  w.notes as warehouse_notes, i.notes as item_notes,
  i.serial_number as item_number, w.serial_number as warehouse_number,
  i.code as item_code,
  i.sale_price::numeric(18,4) as sale_price,
  i.purchase_price::numeric(18,4) as purchase_price
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;

grant select on public.v_stock_opening_balances to authenticated;

-- فهرس لتسريع البحث عن الحسابات النشطة بالنوع والاسم
create index if not exists accounts_search_active_idx
  on public.accounts (company_id, kind, name)
  where is_active is true and system_key is null;

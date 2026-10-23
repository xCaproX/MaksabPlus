alter table public.warehouses add column notes text;
alter table public.cash_boxes add column notes text;

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
  w.notes as warehouse_notes
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;
grant select on public.v_stock_opening_balances to authenticated;

create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select cb.id, cb.company_id, cb.name, cb.is_active,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(rec.amount, 0) + coalesce(tr.amount, 0))::numeric(18,4) as balance,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance,
  cb.is_primary,
  cb.notes
from public.cash_boxes cb
left join (
  select cash_box_id, sum(case when direction = 'in' then amount else -amount end) as amount
  from public.receipts where deleted_at is null group by cash_box_id
) rec on rec.cash_box_id = cb.id
left join (
  select cash_box_id, sum(amount_delta) as amount from public.opening_balance_adjustments
  where cash_box_id is not null group by cash_box_id
) adj on adj.cash_box_id = cb.id
left join (
  select cash_box_id, sum(amount_delta) as amount from (
    select destination_cash_box_id as cash_box_id, amount as amount_delta
    from public.cash_box_transfers where deleted_at is null
    union all
    select source_cash_box_id, -amount from public.cash_box_transfers where deleted_at is null
  ) movements group by cash_box_id
) tr on tr.cash_box_id = cb.id;
grant select on public.v_cash_box_balances to authenticated;

-- أثر الإيصال الحر على الحساب يعتمد على نوع الحساب واتجاه حركة النقد.
create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  coalesce(inv.total, 0)::numeric(18,4) as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4) as paid,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(inv.total, 0) - coalesce(rec.balance_effect, 0))::numeric(18,4) as balance,
  ((coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0 or a.opening_balance <> 0 or coalesce(adj.cnt, 0) > 0) as has_documents,
  a.system_key,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance
from public.accounts a
left join (
  select account_id,
    sum(case when kind in ('sale', 'purchase') then total else -total end) filter (where deleted_at is null) as total,
    count(*) as cnt
  from public.invoices group by account_id
) inv on inv.account_id = a.id
left join (
  select r.account_id,
    sum(case when r.invoice_id is null then r.amount
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null) as amount,
    sum(case when r.invoice_id is null then
        case when (a.kind = 'customer' and r.direction = 'in')
                   or (a.kind = 'supplier' and r.direction = 'out')
          then r.amount else -r.amount end
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null) as balance_effect,
    count(*) as cnt
  from public.receipts r
  join public.accounts a on a.id = r.account_id
  left join public.invoices i on i.id = r.invoice_id
  group by r.account_id
) rec on rec.account_id = a.id
left join (
  select account_id, sum(amount_delta) as amount, count(*) as cnt
  from public.opening_balance_adjustments where account_id is not null group by account_id
) adj on adj.account_id = a.id;
grant select on public.v_account_balances to authenticated;

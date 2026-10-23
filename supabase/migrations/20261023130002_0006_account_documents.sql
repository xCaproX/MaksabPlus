-- =====================================================================
-- 0006_account_documents.sql
-- إضافة has_documents إلى v_account_balances لتعطيل تغيير نوع الحساب
-- في الواجهة قبل أن ترفضه قاعدة البيانات (نفس شرط 0005).
-- =====================================================================

create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  coalesce(inv.total, 0)::numeric(18,4)                         as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4)                        as paid,
  (coalesce(inv.total, 0) - coalesce(rec.amount, 0))::numeric(18,4) as balance,
  (coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0             as has_documents
from public.accounts a
left join (
  select account_id, sum(total) as total, count(*) as cnt
  from public.invoices
  group by account_id
) inv on inv.account_id = a.id
left join (
  select account_id, sum(amount) as amount, count(*) as cnt
  from public.receipts
  group by account_id
) rec on rec.account_id = a.id;

grant select on public.v_account_balances to authenticated;

-- =====================================================================
-- 0043_performance_indexes.sql
-- فهارس جزئية ومركبة (Partial & Composite Indexes) لتسريع استعلامات
-- أرصدة الحسابات والخزن والتحويلات مع عزل الشركات (Multi-Tenancy)
-- =====================================================================

-- 1. فواتير غير محذوفة حسب الحساب والشركة
create index if not exists invoices_account_active_idx
  on public.invoices (company_id, account_id)
  where (deleted_at is null);

-- 2. إيصالات غير محذوفة حسب الحساب والشركة
create index if not exists receipts_account_active_idx
  on public.receipts (company_id, account_id)
  where (deleted_at is null);

-- 3. إيصالات غير محذوفة حسب الخزنة والشركة
create index if not exists receipts_cash_box_active_idx
  on public.receipts (company_id, cash_box_id)
  where (deleted_at is null);

-- 4. تحويلات الخزن غير المحذوفة حسب الخزنة المصدر والخزنة المستلمة
create index if not exists cash_box_transfers_source_active_idx
  on public.cash_box_transfers (company_id, source_cash_box_id)
  where (deleted_at is null);

create index if not exists cash_box_transfers_dest_active_idx
  on public.cash_box_transfers (company_id, destination_cash_box_id)
  where (deleted_at is null);

-- 5. تحويلات المخازن غير المحذوفة حسب المخزن المصدر والمخزن المستلم
create index if not exists warehouse_transfers_source_active_idx
  on public.warehouse_transfers (company_id, source_warehouse_id)
  where (deleted_at is null);

create index if not exists warehouse_transfers_dest_active_idx
  on public.warehouse_transfers (company_id, destination_warehouse_id)
  where (deleted_at is null);

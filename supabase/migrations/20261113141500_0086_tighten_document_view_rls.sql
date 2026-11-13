-- =====================================================================
-- 20261113141500_0086_tighten_document_view_rls.sql
-- Phase 0 (SEC-01 & SEC-02): إحكام سياسات القراءة المباشرة على جداول المستندات
-- 1. إزالة توسيع balances.view و management.view من invoices_permissions و receipts_permissions
--    (الاعتماد على الصلاحيات الفعلية لنوع المستند مع الإبقاء على قراءة الإيصال المرتبط بفاتورة مصرح بها لعرض v_invoice_list).
-- 2. تضييق سياسات warehouse_transfers و warehouse_transfer_items و cash_box_transfers
--    إلى صلاحيات التحويلات الخاصة بها بدلاً من goods.view / money.view / balances.view.
-- =====================================================================

alter policy invoices_permissions on public.invoices
  using (
    public.has_permission('goods.' || kind || '.view')
    or public.has_permission('goods.' || kind || '.create')
    or public.has_permission('goods.' || kind || '.edit')
    or public.has_permission('goods.' || kind || '.delete')
  )
  with check (
    public.has_permission('goods.' || kind || '.create')
    or public.has_permission('goods.' || kind || '.edit')
    or public.has_permission('goods.' || kind || '.delete')
  );

alter policy receipts_permissions on public.receipts
  using (
    public.has_permission('money.' || direction || '.view')
    or public.has_permission('money.' || direction || '.create')
    or public.has_permission('money.' || direction || '.edit')
    or public.has_permission('money.' || direction || '.delete')
    or (
      invoice_id is not null
      and exists (
        select 1
        from public.invoices i
        where i.id = invoice_id
          and i.company_id = public.current_company_id()
      )
    )
  )
  with check (
    public.has_permission('money.' || direction || '.create')
    or public.has_permission('money.' || direction || '.edit')
    or public.has_permission('money.' || direction || '.delete')
  );

alter policy warehouse_transfers_permissions on public.warehouse_transfers
  using (
    public.has_permission('goods.warehouse_transfer.view')
    or public.has_permission('goods.warehouse_transfer.create')
    or public.has_permission('goods.warehouse_transfer.edit')
    or public.has_permission('goods.warehouse_transfer.delete')
  )
  with check (
    public.has_permission('goods.warehouse_transfer.create')
    or public.has_permission('goods.warehouse_transfer.edit')
    or public.has_permission('goods.warehouse_transfer.delete')
  );

alter policy warehouse_transfer_items_permissions on public.warehouse_transfer_items
  using (
    exists (
      select 1
      from public.warehouse_transfers wt
      where wt.id = transfer_id
        and wt.company_id = public.current_company_id()
    )
  )
  with check (
    public.has_permission('goods.warehouse_transfer.create')
    or public.has_permission('goods.warehouse_transfer.edit')
  );

alter policy cash_box_transfers_permissions on public.cash_box_transfers
  using (
    public.has_permission('money.cash_box_transfer.view')
    or public.has_permission('money.cash_box_transfer.create')
    or public.has_permission('money.cash_box_transfer.edit')
    or public.has_permission('money.cash_box_transfer.delete')
  )
  with check (
    public.has_permission('money.cash_box_transfer.create')
    or public.has_permission('money.cash_box_transfer.edit')
    or public.has_permission('money.cash_box_transfer.delete')
  );

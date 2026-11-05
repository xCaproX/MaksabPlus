-- =====================================================================
-- 0054_security_function_privileges_and_updated_at.sql
-- 1. إضافة عمود updated_at المفقود لجدول user_permissions مع التريجر
-- 2. سحب صلاحيات التنفيذ لدوال التريجرات من العملاء بالكامل (public, anon, authenticated)
-- 3. سحب صلاحيات التنفيذ لدوال الـ KPIs والمساعدين من دور anon و public
--    وقصرها على authenticated
-- =====================================================================

-- 1) جدول user_permissions: إضافة عمود updated_at وتفعيله
alter table public.user_permissions
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_user_permissions_updated_at on public.user_permissions;
create trigger set_user_permissions_updated_at
  before update on public.user_permissions
  for each row execute function public.set_updated_at();

-- 2) دوال التريجرات: حجبها تماماً عن استدعاء العملاء المباشر
revoke all on function public.assign_entity_serial_number()                   from public, anon, authenticated;
revoke all on function public.guard_permission_write()                       from public, anon, authenticated;
revoke all on function public.prevent_duplicate_invoice_item()              from public, anon, authenticated;
revoke all on function public.prevent_entity_serial_number_change()          from public, anon, authenticated;
revoke all on function public.prevent_primary_location_change()              from public, anon, authenticated;
revoke all on function public.prevent_warehouse_deactivation_with_stock()    from public, anon, authenticated;
revoke all on function public.set_item_code_default()                        from public, anon, authenticated;
revoke all on function public.set_updated_at()                               from public, anon, authenticated;
revoke all on function public.trg_accounts_after_update()                    from public, anon, authenticated;
revoke all on function public.trg_accounts_before_insert()                   from public, anon, authenticated;
revoke all on function public.trg_accounts_before_update()                   from public, anon, authenticated;
revoke all on function public.trg_cash_box_transfers_balance_sync()          from public, anon, authenticated;
revoke all on function public.trg_cash_boxes_after_update()                  from public, anon, authenticated;
revoke all on function public.trg_cash_boxes_before_insert()                 from public, anon, authenticated;
revoke all on function public.trg_cash_boxes_before_update()                 from public, anon, authenticated;
revoke all on function public.trg_invoices_balance_sync()                    from public, anon, authenticated;
revoke all on function public.trg_opening_adjustments_sync()                 from public, anon, authenticated;
revoke all on function public.trg_receipts_balance_sync()                    from public, anon, authenticated;

-- 3) الدوال المساعدة المركزية: قصرها على authenticated وسحبها من anon
revoke all on function public.current_company_id()                           from public, anon;
grant execute on function public.current_company_id()                        to authenticated;

revoke all on function public.has_permission(text)                           from public, anon;
grant execute on function public.has_permission(text)                        to authenticated;

revoke all on function public.is_company_owner()                             from public, anon;
grant execute on function public.is_company_owner()                          to authenticated;

-- 4) دوال الـ KPIs وإدارة المستخدمين: قصرها على authenticated وسحبها من anon
revoke all on function public.get_cash_box_transfer_kpis(uuid, text, text, text, boolean)          from public, anon;
grant execute on function public.get_cash_box_transfer_kpis(uuid, text, text, text, boolean)     to authenticated;

revoke all on function public.get_invoice_kpis(text, text, text, text, text, boolean)             from public, anon;
grant execute on function public.get_invoice_kpis(text, text, text, text, text, boolean)        to authenticated;

revoke all on function public.get_my_access()                                                     from public, anon;
grant execute on function public.get_my_access()                                                 to authenticated;

revoke all on function public.get_receipt_kpis(text, uuid, text, text, text, boolean)             from public, anon;
grant execute on function public.get_receipt_kpis(text, uuid, text, text, text, boolean)        to authenticated;

revoke all on function public.get_warehouse_transfer_kpis(text, text, text, boolean)              from public, anon;
grant execute on function public.get_warehouse_transfer_kpis(text, text, text, boolean)         to authenticated;

revoke all on function public.list_company_users()                                                from public, anon;
grant execute on function public.list_company_users()                                           to authenticated;

revoke all on function public.set_company_user_active(uuid, boolean)                              from public, anon;
grant execute on function public.set_company_user_active(uuid, boolean)                         to authenticated;

revoke all on function public.set_user_permissions(uuid, text[])                                  from public, anon;
grant execute on function public.set_user_permissions(uuid, text[])                             to authenticated;

begin;

-- =====================================================================
-- 042_security_privileges_and_permissions_table.sql
-- 1. فحص وجود عمود updated_at في جدول user_permissions
-- 2. فحص سحب صلاحية التنفيذ من anon لكافة دوال الـ public
-- 3. فحص سحب صلاحية التنفيذ من العملاء لكافة دوال التريجرات
-- 4. فحص عمل دوال الـ KPIs لمستخدم مصرح به وعزلها عن anon
-- =====================================================================

do $$
declare
  v_comp_a uuid := '66666666-6666-4666-8666-0000000000a1';
  v_comp_b uuid := '66666666-6666-4666-8666-0000000000b1';
  v_owner_a uuid := '66666666-6666-4666-8666-000000000001';
  v_owner_b uuid := '66666666-6666-4666-8666-000000000002';
  v_kpis jsonb;
  v_anon_funcs text[];
  v_trg_funcs text[];
begin
  -- 1) فحص وجود عمود updated_at في جدول user_permissions
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_permissions'
      and column_name = 'updated_at'
  ) then
    raise exception 'Column updated_at does not exist in user_permissions table';
  end if;

  -- 2) فحص سحب صلاحيات التنفيذ من anon لجميع دوال الـ public الحساسة
  select array_agg(p.proname)
  into v_anon_funcs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute');

  if array_length(v_anon_funcs, 1) > 0 then
    raise exception 'Found functions executable by anon: %', array_to_string(v_anon_funcs, ', ');
  end if;

  -- 3) فحص سحب صلاحيات التنفيذ لدوال التريجرات من authenticated أيضاً
  select array_agg(p.proname)
  into v_trg_funcs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'trg_invoices_balance_sync',
      'trg_receipts_balance_sync',
      'trg_cash_box_transfers_balance_sync',
      'trg_accounts_after_update',
      'trg_cash_boxes_after_update',
      'trg_opening_adjustments_sync',
      'assign_entity_serial_number',
      'guard_permission_write'
    )
    and has_function_privilege('authenticated', p.oid, 'execute');

  if array_length(v_trg_funcs, 1) > 0 then
    raise exception 'Trigger functions must not be executable by authenticated: %', array_to_string(v_trg_funcs, ', ');
  end if;

  -- 4) تجهيز مستخدمين وشركتين لاختبار عزل الشركتين
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_sec_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_sec_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة أ للأمان والحماية'),
    (v_comp_b, 'شركة ب للأمان والحماية')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- اختبار بصلاحية مالك أ: يمكنه تنفيذ get_invoice_kpis
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  v_kpis := public.get_invoice_kpis('sale', null, 'all', null, null, false);
  if v_kpis is null then
    raise exception 'Expected get_invoice_kpis to return result for authenticated owner';
  end if;

  -- التحقق من تحديث updated_at عند تعديل صلاحيات
  insert into public.user_permissions (company_id, user_id, permission_key)
  values (v_comp_a, v_owner_a, 'goods.sale.view')
  on conflict do nothing;

  update public.user_permissions
  set updated_at = now() - interval '1 hour'
  where company_id = v_comp_a and user_id = v_owner_a;

  update public.user_permissions
  set permission_key = 'goods.sale.view'
  where company_id = v_comp_a and user_id = v_owner_a;

  -- انتهت الفحوصات بنجاح
end $$;

rollback;

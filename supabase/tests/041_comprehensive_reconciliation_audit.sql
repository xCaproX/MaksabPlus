begin;

-- =====================================================================
-- 041_comprehensive_reconciliation_audit.sql
-- اختبارات التحقق من سجل وفحص ومطابقة الأرصدة والمخزون الشاملة
-- =====================================================================

do $$
declare
  v_comp_a uuid := '77777777-7777-4777-8777-0000000000a1';
  v_comp_b uuid := '77777777-7777-4777-8777-0000000000b1';
  v_owner_a uuid := '77777777-7777-4777-8777-000000000001';
  v_emp_a uuid := '77777777-7777-4777-8777-000000000002';
  v_owner_b uuid := '77777777-7777-4777-8777-000000000003';

  v_res jsonb;
  v_failed boolean := false;
begin
  -- إعداد الشركات والمستخدمين
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_audit_a@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp_audit_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_audit_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة أ للتدقيق'),
    (v_comp_b, 'شركة ب للتدقيق')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك شركة أ', 'owner', true),
    (v_emp_a, v_comp_a, 'موظف شركة أ', 'employee', true),
    (v_owner_b, v_comp_b, 'مالك شركة ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- 1) فحص أذونات التنفيذ: anon و public يجب أن تكون مسحوبة
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'run_comprehensive_reconciliation'
      and grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Expected run_comprehensive_reconciliation to have execute revoked from public and anon';
  end if;

  -- 2) فحص منع الموظف العادي من تشغيل الفحص الشامل
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  v_failed := false;
  begin
    perform public.run_comprehensive_reconciliation('reconcile', 'محاولة غير مصرح بها');
  exception when others then
    if sqlstate = '42501' then
      v_failed := true;
    else
      raise exception 'Unexpected error for employee: % (%)', sqlerrm, sqlstate;
    end if;
  end;

  if not v_failed then
    raise exception 'Employee should NOT be allowed to run comprehensive reconciliation!';
  end if;

  -- 3) تشغيل الفحص بواسطة المالك لشركة أ في وضع المحاكاة
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  v_res := public.run_comprehensive_reconciliation('simulation', 'فحص تجريبي استكشافي');

  if (v_res->>'mode') <> 'simulation' then
    raise exception 'Expected mode simulation, got %', (v_res->>'mode');
  end if;

  if (v_res->>'performed_by_name') <> 'مالك شركة أ' then
    raise exception 'Expected performed_by_name مالك شركة أ, got %', (v_res->>'performed_by_name');
  end if;

  -- 4) تشغيل الفحص بواسطة المالك لشركة أ في وضع التصحيح الفعلي
  v_res := public.run_comprehensive_reconciliation('reconcile', 'فحص وإقفال رسمي');

  if (v_res->>'mode') <> 'reconcile' then
    raise exception 'Expected mode reconcile, got %', (v_res->>'mode');
  end if;
end $$;

-- 5) فحص RLS كـ authenticated
set local role authenticated;

-- المالك أ يرى سجلاته
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-000000000001', true);
do $$
declare
  v_cnt integer;
begin
  select count(*) into v_cnt from public.balance_reconciliation_logs;
  if v_cnt < 2 then
    raise exception 'Owner A should see at least 2 logs, saw %', v_cnt;
  end if;
end $$;

-- الموظف أ لا يستطيع قراءة السجل
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-000000000002', true);
do $$
declare
  v_cnt integer;
begin
  select count(*) into v_cnt from public.balance_reconciliation_logs;
  if v_cnt <> 0 then
    raise exception 'Employee A should see 0 logs via RLS, saw %', v_cnt;
  end if;
end $$;

-- مالك شركة ب لا يرى سجلات شركة أ
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-000000000003', true);
do $$
declare
  v_cnt integer;
begin
  select count(*) into v_cnt from public.balance_reconciliation_logs;
  if v_cnt <> 0 then
    raise exception 'Owner B should see 0 logs of company A via RLS, saw %', v_cnt;
  end if;
end $$;

rollback;

-- =====================================================================
-- 075_platform_suspension_and_user_lifecycle.sql
-- اختبارات الهجرة 0089:
-- 1. صلاحيات وعزل get_my_inactive_status ودوّال تعديل/حذف المستخدمين عن anon و authenticated.
-- 2. حالة إيقاف الشركة + عرض سبب الإيقاف للعميل فقط (دون admin_notes ودون تسريب لمستخدم موقوف أو شركة أخرى).
-- 3. مسح سبب الإيقاف تلقائياً عند إعادة تفعيل الشركة.
-- 4. حماية آخر مالك نشط عند التعطيل أو التخفيض لموظف أو الحذف الكلي للمستخدم.
-- 5. تعديل بيانات المستخدم + ترقيته لمالك (مسح user_permissions القديمة) + حذف مستخدم آخر بنجاح.
-- =====================================================================

begin;

do $$
declare
  v_admin_id uuid := '75757575-7575-4757-8757-000000000001';
  v_owner_a1 uuid := '75757575-7575-4757-8757-000000000002';
  v_owner_a2 uuid := '75757575-7575-4757-8757-000000000003';
  v_emp_a    uuid := '75757575-7575-4757-8757-000000000004';
  v_owner_b  uuid := '75757575-7575-4757-8757-000000000005';
  v_no_prof  uuid := '75757575-7575-4757-8757-000000000006';

  v_comp_a uuid;
  v_comp_b uuid;

  v_code text;
  v_comp_name text;
  v_reason text;
  v_cnt integer;
  v_blocked boolean;
  v_role text;
  v_full_name text;
begin
  -- 1. فحص الامتيازات الصارم على الدوال الجديدة
  if has_function_privilege('anon', 'public.get_my_inactive_status()', 'execute')
     or has_function_privilege('anon', 'public.platform_update_company_user_profile(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.platform_delete_company_user_data(uuid, uuid)', 'execute') then
    raise exception 'anon must not execute any new platform or inactive status functions';
  end if;

  if has_function_privilege('authenticated', 'public.platform_update_company_user_profile(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_delete_company_user_data(uuid, uuid)', 'execute') then
    raise exception 'authenticated must not execute service-role user lifecycle functions';
  end if;

  -- 2. تجهيز مستخدمين وشركتين
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin_id, 'authenticated', 'authenticated', 'admin75@test.local', 'hash', now(), now(), now()),
    (v_owner_a1, 'authenticated', 'authenticated', 'owner75a1@test.local', 'hash', now(), now(), now()),
    (v_owner_a2, 'authenticated', 'authenticated', 'owner75a2@test.local', 'hash', now(), now(), now()),
    (v_emp_a,    'authenticated', 'authenticated', 'emp75a@test.local', 'hash', now(), now(), now()),
    (v_owner_b,  'authenticated', 'authenticated', 'owner75b@test.local', 'hash', now(), now(), now()),
    (v_no_prof,  'authenticated', 'authenticated', 'noprof75@test.local', 'hash', now(), now(), now());

  insert into public.platform_admins (user_id, full_name, is_active)
  values (v_admin_id, 'مطور 75', true);

  perform set_config('request.jwt.claims', '', true);
  set local role service_role;

  v_comp_a := public.platform_provision_company_records('شركة أ 75', 'ملاحظة سرية جداً لا تظهر للعميل', v_owner_a1, 'مالك أ الأول');
  v_comp_b := public.platform_provision_company_records('شركة ب 75', 'ملاحظة شركة ب السرية', v_owner_b, 'مالك ب');
  perform public.platform_add_company_user_record(v_comp_a, v_emp_a, 'موظف أ', 'employee');

  reset role;
  insert into public.user_permissions (company_id, user_id, permission_key)
  values (v_comp_a, v_emp_a, 'goods.sale.view');

  -- 3. عندما تكون الشركة والمستخدم نشطين لا ترجع get_my_inactive_status أي صفوف
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_cnt from public.get_my_inactive_status();
  if v_cnt <> 0 then
    raise exception 'active company user must receive empty inactive status';
  end if;

  -- المستخدم بدون ملف شركة يرجع no_profile
  perform set_config('request.jwt.claims', json_build_object('sub', v_no_prof, 'role', 'authenticated')::text, true);
  select reason_code, company_name, suspension_reason
  into v_code, v_comp_name, v_reason
  from public.get_my_inactive_status();
  if v_code <> 'no_profile' or v_reason <> '' then
    raise exception 'expected no_profile status, got %, %', v_code, v_reason;
  end if;

  -- مطور المنصة لا يظهر له inactive status أبداً
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.get_my_inactive_status();
  if v_cnt <> 0 then
    raise exception 'platform admin must receive empty inactive status';
  end if;

  -- 4. إيقاف الموظف فردياً ثم إيقاف الشركة كلها مع سبب إيقاف للعميل
  perform public.platform_set_company_user_active(v_comp_a, v_emp_a, false);
  perform public.platform_update_company(
    v_comp_a,
    'شركة أ 75',
    'ملاحظة سرية جداً لا تظهر للعميل',
    false,
    'برجاء تجديد الاشتراك الشهري والتواصل مع الدعم'
  );

  -- المالك النشط يرى company_suspended مع الاسم وسبب الإيقاف (وليس ملاحظة المطور)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a1, 'role', 'authenticated')::text, true);
  select reason_code, company_name, suspension_reason
  into v_code, v_comp_name, v_reason
  from public.get_my_inactive_status();
  if v_code <> 'company_suspended'
     or v_comp_name <> 'شركة أ 75'
     or v_reason <> 'برجاء تجديد الاشتراك الشهري والتواصل مع الدعم' then
    raise exception 'unexpected suspended status for company owner: code=%, name=%, reason=%', v_code, v_comp_name, v_reason;
  end if;

  -- الموظف المعطّل فردياً يرى user_deactivated ولا يرى سبب إيقاف الشركة
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  select reason_code, company_name, suspension_reason
  into v_code, v_comp_name, v_reason
  from public.get_my_inactive_status();
  if v_code <> 'user_deactivated' or v_reason <> '' then
    raise exception 'individually deactivated employee must get user_deactivated without suspension reason: %, %', v_code, v_reason;
  end if;

  -- شركة ب معزولة تماماً وتعمل بشكل طبيعي
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.get_my_inactive_status();
  if v_cnt <> 0 then
    raise exception 'company B must remain active and unaffected';
  end if;

  -- 5. إعادة تفعيل شركة أ تمسح suspension_reason تلقائياً
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  perform public.platform_update_company(v_comp_a, 'شركة أ 75', 'ملاحظة سرية محدثة', true, 'نص لا ينبغي بقاؤه بعد التفعيل');
  select suspension_reason into v_reason from public.platform_list_companies() where id = v_comp_a;
  if v_reason <> '' then
    raise exception 'reactivating company must clear suspension_reason, got %', v_reason;
  end if;

  -- 6. حماية آخر مالك نشط (v_owner_a1 هو المالك النشط الوحيد الآن)
  v_blocked := false;
  begin
    perform public.platform_set_company_user_active(v_comp_a, v_owner_a1, false);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'deactivating last active owner must fail';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;

  v_blocked := false;
  begin
    perform public.platform_update_company_user_profile(v_comp_a, v_owner_a1, 'مالك أ الأول', 'employee');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'downgrading last active owner to employee must fail';
  end if;

  v_blocked := false;
  begin
    perform public.platform_delete_company_user_data(v_comp_a, v_owner_a1);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'deleting last active owner must fail';
  end if;

  -- عزل الشركات: لا يمكن تعديل أو حذف مستخدم من شركة أخرى
  v_blocked := false;
  begin
    perform public.platform_update_company_user_profile(v_comp_a, v_owner_b, 'تزوير', 'employee');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'cross-company user profile update must fail';
  end if;

  -- 7. إضافة مالك ثاني نشط يسمح بتعديل وحذف المالك الأول أو ترقية الموظف
  perform public.platform_add_company_user_record(v_comp_a, v_owner_a2, 'مالك أ الثاني', 'owner');

  -- ترقية الموظف لمالك تمسح user_permissions الخاصة به
  perform public.platform_update_company_user_profile(v_comp_a, v_emp_a, 'موظف أ المرقى', 'owner');
  reset role;
  select access_role, full_name into v_role, v_full_name from public.profiles where id = v_emp_a;
  if v_role <> 'owner' or v_full_name <> 'موظف أ المرقى' then
    raise exception 'failed to promote employee to owner cleanly';
  end if;
  select count(*) into v_cnt from public.user_permissions where user_id = v_emp_a;
  if v_cnt <> 0 then
    raise exception 'promoting user to owner should clear redundant user_permissions';
  end if;

  -- الآن يوجد ملاك آخرون نشطون: يمكن حذف المالك الأول وتخفيض الثاني فقط طالما بقي مالك نشط
  set local role service_role;
  perform public.platform_delete_company_user_data(v_comp_a, v_owner_a1);
  reset role;
  select count(*) into v_cnt from public.profiles where id = v_owner_a1;
  if v_cnt <> 0 then
    raise exception 'deleted company user profile must be removed';
  end if;

  -- التأكد من بقاء باقي مستخدمي شركة أ وشركة ب سليمة
  select count(*) into v_cnt from public.profiles where company_id = v_comp_a;
  if v_cnt <> 2 then
    raise exception 'expected 2 remaining users in company A, got %', v_cnt;
  end if;
end;
$$;

rollback;

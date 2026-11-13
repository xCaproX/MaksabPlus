-- =====================================================================
-- 074_platform_admin_companies.sql
-- اختبارات الهجرة 0088:
-- 1. صلاحيات وعزل جداول ودوال مطور المنصة عن anon و users الشركات.
-- 2. الفصل الصارم بين platform_admins و profiles.
-- 3. تهيئة شركة جديدة + حساب مالك + مخزن وخزنة رئيسيين + ملاحظات خاصة.
-- 4. إيقاف وتفعيل الشركة وتأثيره الفوري على جميع مستخدميها مع الحفاظ على إيقاف الموظفين.
-- 5. إدارة مستخدمي الشركة (قائمة / تفعيل / تغيير كلمة مرور المالك والموظف).
-- 6. الحذف الكامل لشركة مع فواتيرها وإيصالاتها وتحويلاتها وحساباتها النظامية دون المساس بالشركة الأخرى.
-- =====================================================================

begin;

do $$
declare
  v_admin_id uuid := '74747474-7474-4747-8747-000000000001';
  v_owner_a uuid := '74747474-7474-4747-8747-000000000002';
  v_emp_a uuid := '74747474-7474-4747-8747-000000000003';
  v_owner_b uuid := '74747474-7474-4747-8747-000000000004';
  v_owner_a2 uuid := '74747474-7474-4747-8747-000000000005';

  v_comp_a uuid;
  v_comp_b uuid;
  v_wh_a uuid;
  v_box_a uuid;
  v_wh_a2 uuid;
  v_box_a2 uuid;
  v_item_a uuid;
  v_cust_a uuid;
  v_sale_id uuid;

  v_access jsonb;
  v_cnt integer;
  v_deleted_users uuid[];
  v_inv_count bigint;
  v_users_count bigint;
  v_notes text;
  v_pw text;
  v_blocked boolean;
begin
  -- 1. فحص الامتيازات (privileges) على الجداول والدوال
  if has_function_privilege('anon', 'public.is_platform_admin()', 'execute')
     or has_function_privilege('anon', 'public.get_platform_admin_identity()', 'execute')
     or has_function_privilege('anon', 'public.platform_list_companies()', 'execute')
     or has_function_privilege('anon', 'public.platform_list_company_users(uuid)', 'execute')
     or has_function_privilege('anon', 'public.platform_update_company(uuid, text, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.platform_set_company_user_active(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.platform_set_company_user_password(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.platform_provision_company_records(text, text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.platform_add_company_user_record(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.platform_delete_company_data(uuid)', 'execute') then
    raise exception 'anon must not execute any platform admin functions';
  end if;

  if has_function_privilege('authenticated', 'public.platform_provision_company_records(text, text, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_add_company_user_record(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_delete_company_data(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.guard_platform_admin_identity()', 'execute')
     or has_function_privilege('authenticated', 'public.accounts_guard_system()', 'execute') then
    raise exception 'authenticated must not execute service-only or trigger functions';
  end if;

  if has_table_privilege('anon', 'public.platform_admins', 'select')
     or has_table_privilege('authenticated', 'public.platform_admins', 'select')
     or has_table_privilege('anon', 'public.platform_company_metadata', 'select')
     or has_table_privilege('authenticated', 'public.platform_company_metadata', 'select') then
    raise exception 'clients must have zero direct privileges on platform tables';
  end if;

  -- 2. إنشاء حسابات auth.users تجريبية وتنصيب مطور المنصة
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin_id, 'authenticated', 'authenticated', 'platform-admin@test.local', 'hash-init', now(), now(), now()),
    (v_owner_a, 'authenticated', 'authenticated', 'owner74a@test.local', 'hash-init', now(), now(), now()),
    (v_emp_a, 'authenticated', 'authenticated', 'emp74a@test.local', 'hash-init', now(), now(), now()),
    (v_owner_b, 'authenticated', 'authenticated', 'owner74b@test.local', 'hash-init', now(), now(), now()),
    (v_owner_a2, 'authenticated', 'authenticated', 'owner74a2@test.local', 'hash-init', now(), now(), now());

  insert into public.platform_admins (user_id, full_name, is_active)
  values (v_admin_id, 'مطور التجارب', true);

  -- 3. تهيئة شركتين عبر دوال service_role
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;

  v_comp_a := public.platform_provision_company_records('شركة أ 74', 'ملاحظة سرية أ', v_owner_a, 'مالك أ');
  v_comp_b := public.platform_provision_company_records('شركة ب 74', 'ملاحظة سرية ب', v_owner_b, 'مالك ب');

  perform public.platform_add_company_user_record(v_comp_a, v_emp_a, 'موظف أ', 'employee');
  perform public.platform_add_company_user_record(v_comp_a, v_owner_a2, 'مالك ثاني أ', 'owner');

  -- التحقق من إنشاء المخزن والخزنة الرئيسيين والحسابات النظامية
  reset role;
  select count(*) into v_cnt from public.warehouses where company_id = v_comp_a and is_primary = true and name = 'المخزن الرئيسي';
  if v_cnt <> 1 then raise exception 'primary warehouse missing for provisioned company'; end if;

  select count(*) into v_cnt from public.cash_boxes where company_id = v_comp_a and is_primary = true and name = 'الخزنة الرئيسية';
  if v_cnt <> 1 then raise exception 'primary cash_box missing for provisioned company'; end if;

  select count(*) into v_cnt from public.accounts where company_id = v_comp_a and system_key is not null;
  if v_cnt < 1 then raise exception 'fixed accounts missing for provisioned company'; end if;

  -- التحقق من الفصل الصارم بين platform_admins و profiles
  set local role service_role;
  v_blocked := false;
  begin
    perform public.platform_add_company_user_record(v_comp_a, v_admin_id, 'محاولة دمج', 'owner');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'platform_admin must not be allowed in company profiles';
  end if;

  v_blocked := false;
  begin
    perform public.platform_add_company_user_record(v_comp_b, v_owner_a, 'مستخدم مكرر', 'owner');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'existing company user must not be added to second company';
  end if;

  reset role;
  v_blocked := false;
  begin
    insert into public.platform_admins (user_id, full_name) values (v_owner_a, 'محاولة ترقية مالك');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'company profile user must not be allowed in platform_admins';
  end if;

  -- 4. إنشاء بيانات وحركات في شركة أ كمستخدم مالك أ
  select id into v_wh_a from public.warehouses where company_id = v_comp_a and is_primary = true;
  select id into v_box_a from public.cash_boxes where company_id = v_comp_a and is_primary = true;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_wh_a2 := public.create_warehouse('فرعي 74', null);
  v_box_a2 := public.create_cash_box_with_opening_balance_and_notes('فرعية 74', 50, null);
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code('صنف 74', 'قطعة', 100, 60, true, v_wh_a, 20, 60, null, 'ITM-74');
  v_cust_a := public.save_account_with_notes(null, 'عميل 74', 'customer', null, true, 10, null);
  v_sale_id := public.create_invoice_with_cash_box(
    'sale', v_cust_a, v_wh_a, current_date, 50, 'بيع 74',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 100)),
    v_box_a
  );
  perform public.create_free_receipt(v_cust_a, v_box_a, current_date, 25, 'قبض 74', null, 'in');
  perform public.create_warehouse_transfer(
    v_wh_a, v_wh_a2, current_date, 'تحويل مخزن 74',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1))
  );
  perform public.create_cash_box_transfer(v_box_a, v_box_a2, current_date, 10, 'تحويل خزنة 74');

  -- التحقق أن مالك أ لا يملك أي وصول لدوال مطور المنصة ولا يقرأ ملاحظات المطور
  if public.is_platform_admin() then
    raise exception 'company owner must not pass is_platform_admin()';
  end if;

  v_blocked := false;
  begin
    perform public.platform_list_companies();
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'company owner must be denied platform_list_companies()'; end if;

  v_blocked := false;
  begin
    perform public.platform_update_company(v_comp_a, 'تلاعب', 'اختراق', true);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'company owner must be denied platform_update_company()'; end if;

  -- التحقق أن الموظف أيضاً ممنوع تماماً
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    perform public.platform_list_company_users(v_comp_a);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'employee must be denied platform_list_company_users()'; end if;

  -- 5. دخول مطور المنصة والتحقق من هويته وقوائمه
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if not public.is_platform_admin() then
    raise exception 'platform_admin must pass is_platform_admin()';
  end if;
  if public.current_company_id() is not null then
    raise exception 'platform_admin current_company_id() must be NULL';
  end if;
  if public.is_company_owner() then
    raise exception 'platform_admin is_company_owner() must be false';
  end if;

  v_access := public.get_my_access();
  if v_access is distinct from jsonb_build_object('role', 'platform_admin', 'permissions', '[]'::jsonb) then
    raise exception 'unexpected get_my_access() for platform_admin: %', v_access;
  end if;

  select count(*) into v_cnt from public.get_platform_admin_identity() where email = 'platform-admin@test.local';
  if v_cnt <> 1 then raise exception 'get_platform_admin_identity() failed'; end if;

  select users_count, invoices_count, admin_notes
  into v_users_count, v_inv_count, v_notes
  from public.platform_list_companies()
  where id = v_comp_a;

  if v_users_count <> 3 or v_inv_count <> 1 or v_notes <> 'ملاحظة سرية أ' then
    raise exception 'unexpected company summary: users=%, invoices=%, notes=%', v_users_count, v_inv_count, v_notes;
  end if;

  -- تعديل الاسم والملاحظات وتعطيل موظف أ وإعادة ضبط كلمة مرور مالك أ
  perform public.platform_set_company_user_active(v_comp_a, v_emp_a, false);

  v_blocked := false;
  begin
    perform public.platform_set_company_user_password(v_comp_a, v_owner_a, '123');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'short password must be rejected'; end if;

  v_blocked := false;
  begin
    perform public.platform_set_company_user_password(v_comp_a, v_owner_b, 'NewPass#1234');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'cross-company password reset must fail'; end if;

  perform public.platform_set_company_user_password(v_comp_a, v_owner_a, 'NewPass#1234');
  reset role;
  select encrypted_password into v_pw from auth.users where id = v_owner_a;
  if v_pw = 'hash-init' then
    raise exception 'password hash was not updated by platform_set_company_user_password';
  end if;

  -- إيقاف شركة أ بالكامل من لوحة مطور المنصة
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.platform_update_company(v_comp_a, 'شركة أ المعدلة', 'ملاحظة محدثة', false);

  -- التحقق أن مالك أ محجوب فور إيقاف الشركة بينما مالك ب يعمل بشكل طبيعي
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  if public.current_company_id() is not null
     or public.is_company_owner()
     or public.has_permission('goods.sale.view')
     or public.get_my_access() is not null then
    raise exception 'suspended company owner must lose tenant access immediately';
  end if;
  select count(*) into v_cnt from public.accounts;
  if v_cnt <> 0 then
    raise exception 'suspended company owner must not see any accounts';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  if public.current_company_id() <> v_comp_b or not public.is_company_owner() then
    raise exception 'company B must remain completely unaffected by company A suspension';
  end if;

  -- إعادة تفعيل شركة أ: يعود مالك أ، ويبقى الموظف الموقوف فردياً غير نشط
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  perform public.platform_update_company(v_comp_a, 'شركة أ المعدلة', 'ملاحظة محدثة', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  if public.current_company_id() <> v_comp_a or not public.is_company_owner() then
    raise exception 'reactivated company owner must regain access';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  if public.current_company_id() is not null or public.get_my_access() is not null then
    raise exception 'individually suspended employee must remain blocked after company reactivation';
  end if;

  -- 6. التأكد من أن الحساب النظامي ما زال محمياً من الحذف المباشر خارج دالة حذف الشركة
  reset role;
  v_blocked := false;
  begin
    delete from public.accounts where company_id = v_comp_b and system_key is not null;
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'direct delete of system accounts must remain blocked';
  end if;

  -- 7. الحذف الكامل لشركة أ مع كافة حركاتها وفواتيرها وحساباتها النظامية ومستخدميها
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;
  v_deleted_users := public.platform_delete_company_data(v_comp_a);

  if coalesce(array_length(v_deleted_users, 1), 0) <> 3
     or not (v_owner_a = any(v_deleted_users))
     or not (v_emp_a = any(v_deleted_users))
     or not (v_owner_a2 = any(v_deleted_users))
     or (v_admin_id = any(v_deleted_users))
     or (v_owner_b = any(v_deleted_users)) then
    raise exception 'unexpected returned user IDs for deleted company: %', v_deleted_users;
  end if;

  reset role;
  select count(*) into v_cnt from public.companies where id = v_comp_a;
  if v_cnt <> 0 then raise exception 'deleted company still exists'; end if;

  select count(*) into v_cnt from public.invoices where company_id = v_comp_a;
  if v_cnt <> 0 then raise exception 'deleted company invoices still exist'; end if;

  select count(*) into v_cnt from public.profiles where company_id = v_comp_a;
  if v_cnt <> 0 then raise exception 'deleted company profiles still exist'; end if;

  select count(*) into v_cnt from public.companies where id = v_comp_b;
  if v_cnt <> 1 then raise exception 'company B must remain intact after company A deletion'; end if;

  select count(*) into v_cnt from public.accounts where company_id = v_comp_b and system_key is not null;
  if v_cnt < 1 then raise exception 'company B fixed accounts must remain intact'; end if;
end;
$$;

rollback;

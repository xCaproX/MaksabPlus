-- =====================================================================
-- 076_profiles_platform_admin_guard.sql
-- اختبارات الهجرة 0090:
-- 1. منع anon و authenticated من استدعاء دالة التريجر مباشرة.
-- 2. منع إدراج أو تعديل صف في public.profiles لمستخدم موجود في public.platform_admins.
-- 3. استمرار نجاح العمليات الطبيعية لمستخدمي الشركات وعدم كسر الفصل المتناظر.
-- =====================================================================

begin;

do $$
declare
  v_admin_id uuid := '76767676-7676-4767-8767-000000000001';
  v_owner_id uuid := '76767676-7676-4767-8767-000000000002';
  v_emp_id   uuid := '76767676-7676-4767-8767-000000000003';
  v_comp_id  uuid;
  v_blocked  boolean;
  v_name     text;
begin
  -- 1. دالة التريجر داخلية ولا يجوز أن يملك العميل صلاحية execute عليها
  if has_function_privilege('anon', 'public.guard_profile_not_platform_admin()', 'execute')
     or has_function_privilege('authenticated', 'public.guard_profile_not_platform_admin()', 'execute') then
    raise exception 'clients must not execute guard_profile_not_platform_admin()';
  end if;

  -- 2. تجهيز مطور منصة ومستخدمين
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin_id, 'authenticated', 'authenticated', 'admin76@test.local', 'hash', now(), now(), now()),
    (v_owner_id, 'authenticated', 'authenticated', 'owner76@test.local', 'hash', now(), now(), now()),
    (v_emp_id,   'authenticated', 'authenticated', 'emp76@test.local',   'hash', now(), now(), now());

  insert into public.platform_admins (user_id, full_name, is_active)
  values (v_admin_id, 'مطور 76', true);

  perform set_config('request.jwt.claims', '', true);
  set local role service_role;
  v_comp_id := public.platform_provision_company_records('شركة 76', null, v_owner_id, 'مالك 76');
  perform public.platform_add_company_user_record(v_comp_id, v_emp_id, 'موظف 76', 'employee');
  reset role;

  -- 3. الإدراج المباشر في profiles لمطور منصة يجب أن يُرفض برمز 22023
  v_blocked := false;
  begin
    insert into public.profiles (id, company_id, full_name, access_role, is_active)
    values (v_admin_id, v_comp_id, 'محاولة تسلل', 'owner', true);
  exception when sqlstate '22023' then
    if sqlerrm like '%platform_admin_cannot_belong_to_company%' then
      v_blocked := true;
    else
      raise exception 'unexpected 22023 error on profiles insert: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'expected trigger rejection on INSERT into profiles for platform admin';
  end if;

  -- 4. محاولة تغيير id في profiles إلى id مطور منصة يجب أن تُرفض
  v_blocked := false;
  begin
    update public.profiles
    set id = v_admin_id
    where id = v_emp_id;
  exception when sqlstate '22023' then
    if sqlerrm like '%platform_admin_cannot_belong_to_company%' then
      v_blocked := true;
    else
      raise exception 'unexpected 22023 error on profiles update: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'expected trigger rejection on UPDATE of profiles.id to platform admin';
  end if;

  -- 5. الإضافة عبر دالة تهيئة مستخدمي الشركة لمطور منصة تظل مرفوضة
  v_blocked := false;
  set local role service_role;
  begin
    perform public.platform_add_company_user_record(v_comp_id, v_admin_id, 'مطور كموظف', 'employee');
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'expected rejection on platform_add_company_user_record for platform admin';
  end if;

  -- 6. التعديل الطبيعي على ملف مستخدم الشركة يظل يعمل بسلاسة
  update public.profiles
  set full_name = 'موظف 76 محدث'
  where id = v_emp_id;

  select full_name into v_name
  from public.profiles
  where id = v_emp_id;
  if v_name <> 'موظف 76 محدث' then
    raise exception 'normal profile update must still succeed';
  end if;

  -- 7. الفصل المتناظر: إدراج مستخدم شركة داخل platform_admins يظل مرفوضاً
  v_blocked := false;
  begin
    insert into public.platform_admins (user_id, full_name, is_active)
    values (v_emp_id, 'محاولة عكسية', true);
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'expected symmetric rejection on INSERT into platform_admins for tenant user';
  end if;
end;
$$;

rollback;

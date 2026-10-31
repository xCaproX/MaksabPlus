begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end; $$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

create or replace function public.test_get_user_password_hash(p_id uuid)
returns text language sql security definer set search_path = auth, public as $$
  select encrypted_password from auth.users where id = p_id;
$$;
grant execute on function public.test_get_user_password_hash(uuid) to authenticated;

-- Setup Company A (Owner A + Employee A)
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('29292929-2929-4929-8929-292929292901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner_a@test.local', extensions.crypt('old_pass_1', extensions.gen_salt('bf')), now(), now(), now()),
  ('29292929-2929-4929-8929-292929292902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emp_a@test.local', extensions.crypt('old_pass_2', extensions.gen_salt('bf')), now(), now(), now());

insert into public.companies(id, name) values ('29292929-2929-4929-8929-2929292929a1', 'شركة أ');

insert into public.profiles(id, company_id, full_name, access_role, is_active)
values
  ('29292929-2929-4929-8929-292929292901', '29292929-2929-4929-8929-2929292929a1', 'مالك أ', 'owner', true),
  ('29292929-2929-4929-8929-292929292902', '29292929-2929-4929-8929-2929292929a1', 'موظف أ', 'employee', true);

-- Setup Company B (Owner B + Employee B)
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('29292929-2929-4929-8929-292929292911', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner_b@test.local', extensions.crypt('old_pass_3', extensions.gen_salt('bf')), now(), now(), now()),
  ('29292929-2929-4929-8929-292929292912', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emp_b@test.local', extensions.crypt('old_pass_4', extensions.gen_salt('bf')), now(), now(), now());

insert into public.companies(id, name) values ('29292929-2929-4929-8929-2929292929b1', 'شركة ب');

insert into public.profiles(id, company_id, full_name, access_role, is_active)
values
  ('29292929-2929-4929-8929-292929292911', '29292929-2929-4929-8929-2929292929b1', 'مالك ب', 'owner', true),
  ('29292929-2929-4929-8929-292929292912', '29292929-2929-4929-8929-2929292929b1', 'موظف ب', 'employee', true);

-- Test as Owner A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"29292929-2929-4929-8929-292929292901"}', true);

do $$
declare
  v_err text := null;
  v_new_hash text;
begin
  -- 1. Owner A can set password for Employee A
  perform public.set_company_user_password('29292929-2929-4929-8929-292929292902', 'new_valid_password_123');
  v_new_hash := public.test_get_user_password_hash('29292929-2929-4929-8929-292929292902');
  perform public.test_expect(v_new_hash = extensions.crypt('new_valid_password_123', v_new_hash), 'password hash matches new password');

  -- 2. Reject short password
  begin
    perform public.set_company_user_password('29292929-2929-4929-8929-292929292902', 'short');
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'password_too_short', 'short password is rejected');

  -- 3. Owner A cannot change password for Employee B (Company B)
  v_err := null;
  begin
    perform public.set_company_user_password('29292929-2929-4929-8929-292929292912', 'cross_tenant_password_123');
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'invalid_company_user', 'cross-tenant user password update is rejected');

  -- 4. Owner A cannot change password for another owner
  v_err := null;
  begin
    perform public.set_company_user_password('29292929-2929-4929-8929-292929292911', 'owner_to_owner_pwd');
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'invalid_company_user', 'owner cannot change another owner password via this function');
end; $$;

-- Test as Employee A
select set_config('request.jwt.claims', '{"sub":"29292929-2929-4929-8929-292929292902"}', true);

do $$
declare
  v_err text := null;
begin
  -- 5. Employee A cannot set anyone's password
  begin
    perform public.set_company_user_password('29292929-2929-4929-8929-292929292902', 'employee_attempt_123');
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'permission_denied', 'employee is denied permission to set passwords');
end; $$;

rollback;

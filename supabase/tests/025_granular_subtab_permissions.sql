begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %',p_label,coalesce(p_detail,''); end if;
end; $$;
grant execute on function public.test_expect(boolean,text,text) to authenticated;

-- Setup Company A & B
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at)
values
  ('25252525-2525-4525-8525-252525252501','00000000-0000-0000-0000-000000000000','authenticated','authenticated','seller@company-a.local',now(),now(),now()),
  ('25252525-2525-4525-8525-252525252502','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@company-b.local',now(),now(),now());

insert into public.companies(id,name) values
  ('25252525-2525-4525-8525-2525252525a1','شركة أ'),
  ('25252525-2525-4525-8525-2525252525b1','شركة ب');

insert into public.profiles(id,company_id,full_name,access_role) values
  ('25252525-2525-4525-8525-252525252501','25252525-2525-4525-8525-2525252525a1','بائع مبيعات','employee'),
  ('25252525-2525-4525-8525-252525252502','25252525-2525-4525-8525-2525252525b1','موظف شركة ب','employee');

-- Assign granular sub-tab permissions to seller
insert into public.user_permissions(company_id,user_id,permission_key) values
  ('25252525-2525-4525-8525-2525252525a1','25252525-2525-4525-8525-252525252501','goods.sale.view'),
  ('25252525-2525-4525-8525-2525252525a1','25252525-2525-4525-8525-252525252501','goods.sale.create'),
  ('25252525-2525-4525-8525-2525252525a1','25252525-2525-4525-8525-252525252501','data.view'),
  ('25252525-2525-4525-8525-2525252525b1','25252525-2525-4525-8525-252525252502','money.out.view');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25252525-2525-4525-8525-252525252501"}',true);

do $$
declare v_access jsonb;
begin
  -- 1. Test assigned granular permissions
  perform public.test_expect(public.has_permission('goods.sale.view'),
    'granular goods.sale.view is granted');
  perform public.test_expect(public.has_permission('goods.sale.create'),
    'granular goods.sale.create is granted');

  -- 2. Test unassigned subtab permissions are denied
  perform public.test_expect(not public.has_permission('goods.purchase.view'),
    'unassigned goods.purchase.view is denied');
  perform public.test_expect(not public.has_permission('goods.purchase.create'),
    'unassigned goods.purchase.create is denied');
  perform public.test_expect(not public.has_permission('goods.waste.create'),
    'unassigned goods.waste.create is denied');

  -- 3. Test hierarchical backward-compatibility fallback (parent data.view grants data.customers.view)
  perform public.test_expect(public.has_permission('data.customers.view'),
    'parent data.view grants subtab data.customers.view');
  perform public.test_expect(public.has_permission('data.items.view'),
    'parent data.view grants subtab data.items.view');

  -- 4. Test RLS isolation: cannot read company B user permissions
  perform public.test_expect(
    not exists(select 1 from public.user_permissions where company_id='25252525-2525-4525-8525-2525252525b1'),
    'company A employee cannot read company B user permissions');
end; $$;

rollback;

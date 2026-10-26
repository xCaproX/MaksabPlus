begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, '');
  end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('28282828-2828-4282-8282-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-owner@test.local', now(), now(), now()),
  ('28282828-2828-4282-8282-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-sales@test.local', now(), now(), now()),
  ('28282828-2828-4282-8282-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-purchase@test.local', now(), now(), now()),
  ('28282828-2828-4282-8282-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-viewer@test.local', now(), now(), now()),
  ('28282828-2828-4282-8282-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-none@test.local', now(), now(), now()),
  ('28282828-2828-4282-8282-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'permissions-broad@test.local', now(), now(), now());

insert into public.companies (id, name)
values ('28282828-2828-4282-8282-0000000000a1', 'شركة اختبار صلاحيات الواجهة');

insert into public.profiles (id, company_id, access_role) values
  ('28282828-2828-4282-8282-000000000001', '28282828-2828-4282-8282-0000000000a1', 'owner'),
  ('28282828-2828-4282-8282-000000000002', '28282828-2828-4282-8282-0000000000a1', 'employee'),
  ('28282828-2828-4282-8282-000000000003', '28282828-2828-4282-8282-0000000000a1', 'employee'),
  ('28282828-2828-4282-8282-000000000004', '28282828-2828-4282-8282-0000000000a1', 'employee'),
  ('28282828-2828-4282-8282-000000000005', '28282828-2828-4282-8282-0000000000a1', 'employee'),
  ('28282828-2828-4282-8282-000000000006', '28282828-2828-4282-8282-0000000000a1', 'employee');

insert into public.user_permissions (company_id, user_id, permission_key) values
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000002', 'goods.sale.view'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000002', 'goods.sale.create'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000003', 'goods.purchase.view'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000003', 'goods.purchase.create'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000004', 'money.in.view'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000006', 'goods.view'),
  ('28282828-2828-4282-8282-0000000000a1', '28282828-2828-4282-8282-000000000006', 'goods.create');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000002"}', true);
do $$ begin
  perform public.test_expect(public.has_permission('goods.sale.view'), 'sales employee can view sales', null);
  perform public.test_expect(public.has_permission('goods.sale.create'), 'sales employee can create sales', null);
  perform public.test_expect(not public.has_permission('goods.purchase.view'), 'sales employee cannot view purchases', null);
  perform public.test_expect(not public.has_permission('goods.purchase.create'), 'sales employee cannot create purchases', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000003"}', true);
do $$ begin
  perform public.test_expect(public.has_permission('goods.purchase.view'), 'purchase employee can view purchases', null);
  perform public.test_expect(not public.has_permission('goods.sale.view'), 'purchase employee cannot view sales', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000004"}', true);
do $$ begin
  perform public.test_expect(public.has_permission('money.in.view'), 'view-only employee can view receipts', null);
  perform public.test_expect(not public.has_permission('money.in.create') and not public.has_permission('money.in.edit') and not public.has_permission('money.in.delete'), 'view-only employee cannot change receipts', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000005"}', true);
do $$ begin
  perform public.test_expect(not public.has_permission('goods.sale.view') and not public.has_permission('money.in.view'), 'employee without permissions is denied', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000006"}', true);
do $$ begin
  perform public.test_expect(public.has_permission('goods.sale.view') and public.has_permission('goods.purchase.create'), 'broad goods permissions retain granular compatibility', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"28282828-2828-4282-8282-000000000001"}', true);
do $$ begin
  perform public.test_expect(public.has_permission('goods.sale.delete') and public.has_permission('money.out.edit'), 'owner retains all access', null);
end $$;

rollback;

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('15151515-1515-4515-8515-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'receipt-signs@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('15151515-1515-4515-8515-0000000000a1', 'شركة اختبار أثر الإيصالات');
insert into public.profiles (id, company_id)
values ('15151515-1515-4515-8515-000000000001', '15151515-1515-4515-8515-0000000000a1');
insert into public.accounts (id, company_id, name, kind) values
  ('15151515-1515-4515-8515-0000000000b1', '15151515-1515-4515-8515-0000000000a1', 'عميل الإشارات', 'customer'),
  ('15151515-1515-4515-8515-0000000000b2', '15151515-1515-4515-8515-0000000000a1', 'مورد الإشارات', 'supplier');
insert into public.cash_boxes (id, company_id, name)
values ('15151515-1515-4515-8515-0000000000c1', '15151515-1515-4515-8515-0000000000a1', 'خزنة الإشارات');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15151515-1515-4515-8515-000000000001"}', true);

do $$
begin
  perform public.create_free_receipt('15151515-1515-4515-8515-0000000000b1', '15151515-1515-4515-8515-0000000000c1', current_date, 100, null, 'استلام من عميل', 'in');
  perform public.test_expect((select balance = -100 from public.v_account_balances where id = '15151515-1515-4515-8515-0000000000b1'),
    'customer receipt reduces customer balance');

  perform public.create_free_receipt('15151515-1515-4515-8515-0000000000b1', '15151515-1515-4515-8515-0000000000c1', current_date, 40, null, 'صرف لعميل', 'out');
  perform public.test_expect((select balance = -60 from public.v_account_balances where id = '15151515-1515-4515-8515-0000000000b1'),
    'customer payment increases customer balance');

  perform public.create_free_receipt('15151515-1515-4515-8515-0000000000b2', '15151515-1515-4515-8515-0000000000c1', current_date, 100, null, 'استلام من مورد', 'in');
  perform public.test_expect((select balance = 100 from public.v_account_balances where id = '15151515-1515-4515-8515-0000000000b2'),
    'supplier receipt increases supplier balance');

  perform public.create_free_receipt('15151515-1515-4515-8515-0000000000b2', '15151515-1515-4515-8515-0000000000c1', current_date, 40, null, 'صرف لمورد', 'out');
  perform public.test_expect((select balance = 60 from public.v_account_balances where id = '15151515-1515-4515-8515-0000000000b2'),
    'supplier payment reduces supplier balance');
end;
$$;

rollback;

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('17171717-1717-4717-8717-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opening@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('17171717-1717-4717-8717-0000000000a1', 'شركة أرصدة افتتاحية'),
  ('17171717-1717-4717-8717-0000000000a2', 'شركة أخرى');
insert into public.profiles (id, company_id)
values ('17171717-1717-4717-8717-000000000001', '17171717-1717-4717-8717-0000000000a1');
insert into public.cash_boxes (id, company_id, name, is_primary, opening_balance)
values ('17171717-1717-4717-8717-0000000000b1', '17171717-1717-4717-8717-0000000000a2', 'خزنة الشركة الأخرى', true, 75);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17171717-1717-4717-8717-000000000001"}', true);

do $$
declare
  v_cash_box_id uuid;
begin
  v_cash_box_id := public.create_cash_box_with_opening_balance_and_notes('خزنة الاختبار', 123.45678, 'رصيد عند بدء الاستخدام');
  perform public.test_expect(
    (select opening_balance = 123.4568 and notes = 'رصيد عند بدء الاستخدام' and not is_primary
     from public.cash_boxes where id = v_cash_box_id),
    'cash box is created with rounded opening balance and notes'
  );
  perform public.test_expect(
    (select count(*) = 0 from public.cash_boxes where company_id = '17171717-1717-4717-8717-0000000000a2'),
    'user cannot read another company cash boxes'
  );
end;
$$;

rollback;

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

create or replace function public.test_change_item_serial(p_item_id uuid, p_number integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.items set serial_number = p_number where id = p_item_id;
end;
$$;
grant execute on function public.test_change_item_serial(uuid, integer) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('16161616-1616-4616-8616-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'numbers@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('16161616-1616-4616-8616-0000000000a1', 'شركة الأرقام'),
  ('16161616-1616-4616-8616-0000000000a2', 'شركة أخرى');
insert into public.profiles (id, company_id)
values ('16161616-1616-4616-8616-000000000001', '16161616-1616-4616-8616-0000000000a1');

insert into public.accounts (company_id, name, kind) values
  ('16161616-1616-4616-8616-0000000000a1', 'عميل أول', 'customer'),
  ('16161616-1616-4616-8616-0000000000a1', 'مورد أول', 'supplier'),
  ('16161616-1616-4616-8616-0000000000a2', 'حساب شركة أخرى', 'customer');
insert into public.items (company_id, name) values
  ('16161616-1616-4616-8616-0000000000a1', 'صنف أول'),
  ('16161616-1616-4616-8616-0000000000a2', 'صنف شركة أخرى');
insert into public.warehouses (company_id, name) values
  ('16161616-1616-4616-8616-0000000000a1', 'مخزن أول'),
  ('16161616-1616-4616-8616-0000000000a2', 'مخزن شركة أخرى');
insert into public.cash_boxes (company_id, name) values
  ('16161616-1616-4616-8616-0000000000a1', 'خزنة أولى'),
  ('16161616-1616-4616-8616-0000000000a2', 'خزنة شركة أخرى');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16161616-1616-4616-8616-000000000001"}', true);

do $$
declare
  v_item_id uuid;
  v_new_account_id uuid;
  v_new_supplier_id uuid;
  v_new_item_id uuid;
  v_new_cash_box_id uuid;
  v_failed boolean := false;
begin
  perform public.test_expect(
    (select count(*) = 2 and min(serial_number) = 1 and max(serial_number) = 1
     from public.accounts where company_id = public.current_company_id() and system_key is null),
    'customer and supplier account sequences both start at one'
  );
  perform public.test_expect(
    (select count(*) = 0 from public.accounts where company_id = '16161616-1616-4616-8616-0000000000a2'),
    'company A cannot read company B accounts'
  );
  perform public.test_expect(
    (select serial_number = 1 from public.items where company_id = public.current_company_id()),
    'items receive a number'
  );
  perform public.test_expect(
    (select serial_number = 1 from public.warehouses where company_id = public.current_company_id()),
    'warehouses receive a number'
  );
  perform public.test_expect(
    (select serial_number = 1 from public.cash_boxes where company_id = public.current_company_id()),
    'cash boxes receive a number'
  );
  perform public.test_expect(
    (select count(*) = 0 from public.entity_number_sequences where company_id = '16161616-1616-4616-8616-0000000000a2'),
    'company A cannot read company B number sequences'
  );
  perform public.test_expect(
    (select count(*) = 0 from public.v_account_balances where company_id = '16161616-1616-4616-8616-0000000000a2'),
    'company A cannot read company B accounts through the balance view'
  );

  select id into v_item_id from public.items where company_id = public.current_company_id();
  begin
    perform public.test_change_item_serial(v_item_id, 99);
  exception when check_violation then
    v_failed := sqlerrm = 'entity_number_immutable';
  end;
  perform public.test_expect(v_failed, 'entity serial number cannot be changed');

  v_new_account_id := public.save_account(null, 'عميل جديد', 'customer', null, true, 0);
  perform public.test_expect(
    (select serial_number = 2 from public.accounts where id = v_new_account_id),
    'new customers continue the customer sequence'
  );
  v_new_supplier_id := public.save_account(null, 'مورد جديد', 'supplier', null, true, 0);
  perform public.test_expect(
    (select serial_number = 2 from public.accounts where id = v_new_supplier_id),
    'new suppliers continue the supplier sequence'
  );
  v_new_item_id := public.create_item_with_opening_stock(
    'صنف جديد', 'قطعة', 0, 0, true, null, 0, 0
  );
  perform public.test_expect(
    (select serial_number = 2 from public.items where id = v_new_item_id),
    'new items continue the company sequence'
  );
  v_new_cash_box_id := public.create_cash_box_with_opening_balance_and_notes('خزنة جديدة', 0, null);
  perform public.test_expect(
    (select serial_number = 2 from public.cash_boxes where id = v_new_cash_box_id),
    'new cash boxes continue the company sequence'
  );
end;
$$;

rollback;

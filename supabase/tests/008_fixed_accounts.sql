-- الحسابات الثابتة الافتراضية وإلزام الدفع الكامل عند استخدامها.
begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('dddddddd-dddd-4ddd-8ddd-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixed@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('dddddddd-dddd-4ddd-8ddd-0000000000f1', 'شركة الحسابات الثابتة');
insert into public.profiles (id, company_id, full_name)
values ('dddddddd-dddd-4ddd-8ddd-000000000001', 'dddddddd-dddd-4ddd-8ddd-0000000000f1', 'مستخدم');
insert into public.warehouses (id, company_id, name)
values ('dddddddd-dddd-4ddd-8ddd-0000000000a1', 'dddddddd-dddd-4ddd-8ddd-0000000000f1', 'مخزن');
insert into public.cash_boxes (id, company_id, name)
values ('dddddddd-dddd-4ddd-8ddd-0000000000b1', 'dddddddd-dddd-4ddd-8ddd-0000000000f1', 'خزنة');
insert into public.items (id, company_id, name, sale_price, purchase_price)
values ('dddddddd-dddd-4ddd-8ddd-0000000000e1', 'dddddddd-dddd-4ddd-8ddd-0000000000f1', 'صنف', 25, 25);
insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values ('dddddddd-dddd-4ddd-8ddd-0000000000f1', 'dddddddd-dddd-4ddd-8ddd-0000000000a1', 'dddddddd-dddd-4ddd-8ddd-0000000000e1', 10, 25);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000001"}', true);

do $$
declare
  v_cash_customer uuid;
  v_cash_supplier uuid;
  v_waste uuid;
  v_id uuid;
  v_ok boolean;
begin
  select id into v_cash_customer from public.accounts where system_key = 'cash_customer';
  select id into v_cash_supplier from public.accounts where system_key = 'cash_supplier';
  select id into v_waste from public.accounts where system_key = 'waste';
  perform public.test_expect(v_cash_customer is not null and v_cash_supplier is not null and v_waste is not null, 'three fixed accounts exist');
  perform public.test_expect((select kind from public.accounts where id = v_cash_customer) = 'customer', 'cash customer kind');
  perform public.test_expect((select kind from public.accounts where id = v_cash_supplier) = 'supplier', 'cash supplier kind');
  perform public.test_expect((select kind from public.accounts where id = v_waste) = 'waste', 'waste kind');

  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', v_cash_customer, 'dddddddd-dddd-4ddd-8ddd-0000000000a1', current_date, 0, null,
      '[{"item_id":"dddddddd-dddd-4ddd-8ddd-0000000000e1","qty":2,"unit_price":25}]'::jsonb
    );
  exception when others then v_ok := sqlerrm = 'cash_account_requires_full_payment';
  end;
  perform public.test_expect(v_ok, 'reject unpaid cash sale');

  v_id := public.create_invoice(
    'sale', v_cash_customer, 'dddddddd-dddd-4ddd-8ddd-0000000000a1', current_date, 50, null,
    '[{"item_id":"dddddddd-dddd-4ddd-8ddd-0000000000e1","qty":2,"unit_price":25}]'::jsonb
  );
  perform public.test_expect((select account_id from public.invoices where id = v_id) = v_cash_customer, 'cash sale uses selected default account');
  perform public.test_expect((select balance from public.v_account_balances where id = v_cash_customer) = 0, 'cash sale leaves zero account balance');

  v_ok := false;
  begin
    perform public.update_invoice(
      v_id, v_cash_customer, 'dddddddd-dddd-4ddd-8ddd-0000000000a1', current_date, 49, null,
      '[{"item_id":"dddddddd-dddd-4ddd-8ddd-0000000000e1","qty":2,"unit_price":25}]'::jsonb
    );
  exception when others then v_ok := sqlerrm = 'cash_account_requires_full_payment';
  end;
  perform public.test_expect(v_ok, 'reject editing a cash sale to partial payment');

  v_id := public.create_invoice(
    'purchase', v_cash_supplier, 'dddddddd-dddd-4ddd-8ddd-0000000000a1', current_date, 50, null,
    '[{"item_id":"dddddddd-dddd-4ddd-8ddd-0000000000e1","qty":2,"unit_price":25}]'::jsonb
  );
  perform public.test_expect((select balance from public.v_account_balances where id = v_cash_supplier) = 0, 'cash purchase leaves zero account balance');

  v_ok := false;
  begin
    perform public.create_invoice(
      'purchase_return', v_cash_supplier, 'dddddddd-dddd-4ddd-8ddd-0000000000a1', current_date, 25, null,
      '[{"item_id":"dddddddd-dddd-4ddd-8ddd-0000000000e1","qty":2,"unit_price":25}]'::jsonb
    );
  exception when others then v_ok := sqlerrm = 'cash_account_requires_full_payment';
  end;
  perform public.test_expect(v_ok, 'reject partially refunded cash purchase return');

  v_ok := false;
  begin
    update public.accounts set name = 'اسم آخر' where id = v_waste;
  exception when others then v_ok := sqlerrm = 'system_account_protected';
  end;
  perform public.test_expect(v_ok, 'fixed account cannot be renamed');
end $$;

rollback;
select 'PASS 008_fixed_accounts' as result;

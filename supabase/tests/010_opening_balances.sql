begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('12121212-1212-4212-8212-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opening-a@test.local', now(), now(), now()),
  ('12121212-1212-4212-8212-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opening-b@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('12121212-1212-4212-8212-0000000000a1', 'شركة رصيد افتتاحي أ'),
  ('12121212-1212-4212-8212-0000000000a2', 'شركة رصيد افتتاحي ب');
insert into public.profiles (id, company_id) values
  ('12121212-1212-4212-8212-000000000001', '12121212-1212-4212-8212-0000000000a1'),
  ('12121212-1212-4212-8212-000000000002', '12121212-1212-4212-8212-0000000000a2');
insert into public.warehouses (id, company_id, name) values
  ('12121212-1212-4212-8212-0000000000b1', '12121212-1212-4212-8212-0000000000a1', 'مخزن البداية أ'),
  ('12121212-1212-4212-8212-0000000000b2', '12121212-1212-4212-8212-0000000000a2', 'مخزن البداية ب');
insert into public.cash_boxes (id, company_id, name) values
  ('12121212-1212-4212-8212-0000000000c1', '12121212-1212-4212-8212-0000000000a1', 'خزنة البداية أ'),
  ('12121212-1212-4212-8212-0000000000c2', '12121212-1212-4212-8212-0000000000a2', 'خزنة البداية ب');
insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('12121212-1212-4212-8212-0000000000d1', '12121212-1212-4212-8212-0000000000a1', 'صنف البداية أ', 50, 20),
  ('12121212-1212-4212-8212-0000000000d2', '12121212-1212-4212-8212-0000000000a2', 'صنف البداية ب', 50, 30);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12121212-1212-4212-8212-000000000001"}', true);

do $$
declare
  v_customer uuid;
  v_supplier uuid;
  v_invoice uuid;
  v_receipt uuid;
  v_failed boolean;
begin
  v_customer := public.save_account(null, 'عميل افتتاحي', 'customer', null, true, 1000);
  v_supplier := public.save_account(null, 'مورد افتتاحي', 'supplier', null, true, -1000);
  perform public.test_expect((select balance from public.v_account_balances where id = v_customer) = 1000, 'customer opening balance is included');
  perform public.test_expect((select opening_balance from public.v_account_balances where id = v_supplier) = -1000, 'supplier accepts signed opening balance');

  perform public.save_opening_balances(
    '[{"cash_box_id":"12121212-1212-4212-8212-0000000000c1","opening_balance":100}]'::jsonb,
    '[{"warehouse_id":"12121212-1212-4212-8212-0000000000b1","item_id":"12121212-1212-4212-8212-0000000000d1","opening_qty":10,"unit_cost":20}]'::jsonb
  );
  perform public.test_expect((select balance from public.v_cash_box_balances where id = '12121212-1212-4212-8212-0000000000c1') = 100, 'cashbox opening amount is included');
  perform public.test_expect((select qty from public.item_stock where item_id = '12121212-1212-4212-8212-0000000000d1') = 10, 'opening stock quantity is applied');
  perform public.test_expect((select avg_cost from public.item_stock where item_id = '12121212-1212-4212-8212-0000000000d1') = 20, 'opening stock cost initializes moving average');

  v_receipt := public.create_free_receipt(v_customer, '12121212-1212-4212-8212-0000000000c1', current_date, 10, null, null, 'in');
  perform public.save_opening_balances(
    '[{"cash_box_id":"12121212-1212-4212-8212-0000000000c1","opening_balance":120}]'::jsonb,
    '[{"warehouse_id":"12121212-1212-4212-8212-0000000000b1","item_id":"12121212-1212-4212-8212-0000000000d1","opening_qty":10,"unit_cost":20}]'::jsonb
  );
  perform public.test_expect((select balance from public.v_cash_box_balances where id = '12121212-1212-4212-8212-0000000000c1') = 130, 'cashbox correction is recorded without replacing receipt');
  perform public.test_expect((select balance from public.v_account_balances where id = v_customer) = 990, 'account receipts remain separate from its opening balance');

  v_invoice := public.create_invoice('sale', v_customer, '12121212-1212-4212-8212-0000000000b1', current_date, 0, null,
    '[{"item_id":"12121212-1212-4212-8212-0000000000d1","qty":2,"unit_price":50}]'::jsonb);
  perform public.save_opening_balances(
    '[{"cash_box_id":"12121212-1212-4212-8212-0000000000c1","opening_balance":120}]'::jsonb,
    '[{"warehouse_id":"12121212-1212-4212-8212-0000000000b1","item_id":"12121212-1212-4212-8212-0000000000d1","opening_qty":12,"unit_cost":20}]'::jsonb
  );
  perform public.test_expect((select qty from public.item_stock where item_id = '12121212-1212-4212-8212-0000000000d1') = 10, 'stock correction applies only the requested quantity difference');
  perform public.test_expect((select unit_cost from public.v_invoice_items where invoice_id = v_invoice) = 20, 'stock correction preserves posted invoice cost');

  v_failed := false;
  begin
    perform public.save_opening_balances(
      '[]'::jsonb,
      '[{"warehouse_id":"12121212-1212-4212-8212-0000000000b1","item_id":"12121212-1212-4212-8212-0000000000d1","opening_qty":12,"unit_cost":21}]'::jsonb
    );
  exception when others then
    v_failed := sqlerrm = 'opening_stock_cost_locked';
  end;
  perform public.test_expect(v_failed, 'opening unit cost is locked after later stock activity');
  perform public.test_expect((select count(*) from public.opening_balance_adjustments where company_id = public.current_company_id()) = 1, 'cash correction is audited');
  perform public.test_expect((select count(*) from public.stock_opening_adjustments where company_id = public.current_company_id()) = 1, 'stock correction is audited');
  perform public.test_expect(v_receipt is not null, 'receipt remains present');
end $$;

select set_config('request.jwt.claims', '{"sub":"12121212-1212-4212-8212-000000000002"}', true);
do $$
begin
  perform public.test_expect((select count(*) from public.v_account_balances where name = 'عميل افتتاحي') = 0, 'company B cannot see company A account opening balances');
  perform public.test_expect((select count(*) from public.v_stock_opening_balances where item_name = 'صنف البداية أ') = 0, 'company B cannot see company A stock openings');
  perform public.test_expect((select count(*) from public.opening_balance_adjustments where company_id = '12121212-1212-4212-8212-0000000000a1') = 0, 'company B cannot read company A adjustment rows');
end $$;

reset role;
rollback;
select 'PASS 010_opening_balances' as result;

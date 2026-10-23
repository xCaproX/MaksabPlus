begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;
create or replace function public.test_mark_later_transfer(p_transfer_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.warehouse_transfers set created_at = created_at + interval '1 second' where id = p_transfer_id
$$;
grant execute on function public.test_mark_later_transfer(uuid) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('18181818-1818-4818-8818-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'transfer@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('18181818-1818-4818-8818-0000000000a1', 'شركة اختبار التحويل'),
  ('18181818-1818-4818-8818-0000000000a2', 'شركة أخرى');
insert into public.profiles (id, company_id)
values ('18181818-1818-4818-8818-000000000001', '18181818-1818-4818-8818-0000000000a1');
insert into public.warehouses (id, company_id, name, is_primary) values
  ('18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000a1', 'مصدر', true),
  ('18181818-1818-4818-8818-0000000000b2', '18181818-1818-4818-8818-0000000000a1', 'وجهة', false),
  ('18181818-1818-4818-8818-0000000000b3', '18181818-1818-4818-8818-0000000000a2', 'مخزن شركة أخرى', true),
  ('18181818-1818-4818-8818-0000000000b4', '18181818-1818-4818-8818-0000000000a2', 'مخزن شركة أخرى 2', false);
insert into public.cash_boxes (id, company_id, name, is_primary, opening_balance) values
  ('18181818-1818-4818-8818-0000000000c1', '18181818-1818-4818-8818-0000000000a1', 'خزنة مصدر', true, 100),
  ('18181818-1818-4818-8818-0000000000c2', '18181818-1818-4818-8818-0000000000a1', 'خزنة وجهة', false, 20),
  ('18181818-1818-4818-8818-0000000000c3', '18181818-1818-4818-8818-0000000000a2', 'خزنة شركة أخرى', true, 0),
  ('18181818-1818-4818-8818-0000000000c4', '18181818-1818-4818-8818-0000000000a2', 'خزنة شركة أخرى 2', false, 0);
insert into public.items (id, company_id, name, purchase_price) values
  ('18181818-1818-4818-8818-0000000000d1', '18181818-1818-4818-8818-0000000000a1', 'صنف التحويل', 5);
insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost) values
  ('18181818-1818-4818-8818-0000000000a1', '18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000d1', 10, 5),
  ('18181818-1818-4818-8818-0000000000a1', '18181818-1818-4818-8818-0000000000b2', '18181818-1818-4818-8818-0000000000d1', 2, 7);
insert into public.accounts (id, company_id, name, kind, opening_balance) values
  ('18181818-1818-4818-8818-0000000000e1', '18181818-1818-4818-8818-0000000000a1', 'مورد لا يتأثر', 'supplier', 50);
insert into public.warehouse_transfers(company_id, number, source_warehouse_id, destination_warehouse_id)
values ('18181818-1818-4818-8818-0000000000a2', 'WTR-OTHER-1', '18181818-1818-4818-8818-0000000000b3', '18181818-1818-4818-8818-0000000000b4');
insert into public.cash_box_transfers(company_id, number, source_cash_box_id, destination_cash_box_id, amount)
values ('18181818-1818-4818-8818-0000000000a2', 'CBT-OTHER-1', '18181818-1818-4818-8818-0000000000c3', '18181818-1818-4818-8818-0000000000c4', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"18181818-1818-4818-8818-000000000001"}', true);

do $$
declare
  v_warehouse_transfer uuid;
  v_later_transfer uuid;
  v_cash_transfer uuid;
  v_failed boolean;
  v_account_balance numeric(18,4);
begin
  select balance into v_account_balance from public.v_account_balances where id = '18181818-1818-4818-8818-0000000000e1';
  v_warehouse_transfer := public.create_warehouse_transfer(
    '18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000b2', current_date, null,
    '[{"item_id":"18181818-1818-4818-8818-0000000000d1","qty":4}]'::jsonb
  );
  perform public.test_expect((select qty = 6 and avg_cost = 5 from public.item_stock where warehouse_id = '18181818-1818-4818-8818-0000000000b1' and item_id = '18181818-1818-4818-8818-0000000000d1'),
    'warehouse transfer reduces source and keeps its average cost');
  perform public.test_expect((select qty = 6 and avg_cost = 5.6667 from public.item_stock where warehouse_id = '18181818-1818-4818-8818-0000000000b2' and item_id = '18181818-1818-4818-8818-0000000000d1'),
    'warehouse transfer increases destination and blends its average cost');

  v_failed := false;
  begin
    perform public.create_warehouse_transfer(
      '18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000b2', current_date, null,
      '[{"item_id":"18181818-1818-4818-8818-0000000000d1","qty":99}]'::jsonb
    );
  exception when others then v_failed := sqlerrm = 'insufficient_stock';
  end;
  perform public.test_expect(v_failed, 'warehouse transfer cannot exceed available quantity');

  perform public.update_warehouse_transfer(v_warehouse_transfer,
    '18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000b2', current_date, 'تعديل',
    '[{"item_id":"18181818-1818-4818-8818-0000000000d1","qty":3}]'::jsonb);
  perform public.test_expect((select qty = 7 from public.item_stock where warehouse_id = '18181818-1818-4818-8818-0000000000b1' and item_id = '18181818-1818-4818-8818-0000000000d1'),
    'editing warehouse transfer reverses old movement before applying new quantity');
  v_later_transfer := public.create_warehouse_transfer(
    '18181818-1818-4818-8818-0000000000b1', '18181818-1818-4818-8818-0000000000b2', current_date, null,
    '[{"item_id":"18181818-1818-4818-8818-0000000000d1","qty":1}]'::jsonb
  );
  perform public.test_mark_later_transfer(v_later_transfer);
  v_failed := false;
  begin
    perform public.delete_warehouse_transfer(v_warehouse_transfer);
  exception when others then v_failed := sqlerrm = 'transfer_has_later_movements';
  end;
  perform public.test_expect(v_failed, 'warehouse transfer cannot be reversed after later item movements');
  perform public.delete_warehouse_transfer(v_later_transfer);
  perform public.delete_warehouse_transfer(v_warehouse_transfer);
  perform public.test_expect((select qty = 10 from public.item_stock where warehouse_id = '18181818-1818-4818-8818-0000000000b1' and item_id = '18181818-1818-4818-8818-0000000000d1'),
    'deleting warehouse transfer reverses stock movement');
  perform public.restore_warehouse_transfer(v_warehouse_transfer);
  perform public.test_expect((select qty = 7 from public.item_stock where warehouse_id = '18181818-1818-4818-8818-0000000000b1' and item_id = '18181818-1818-4818-8818-0000000000d1'),
    'restoring warehouse transfer reapplies stock movement');
  v_failed := false;
  begin
    perform public.delete_warehouse('18181818-1818-4818-8818-0000000000b2');
  exception when others then v_failed := sqlerrm = 'warehouse_has_transfers';
  end;
  perform public.test_expect(v_failed, 'warehouse with transfer history cannot be deleted');

  v_cash_transfer := public.create_cash_box_transfer(
    '18181818-1818-4818-8818-0000000000c1', '18181818-1818-4818-8818-0000000000c2', current_date, 25, null);
  perform public.test_expect((select balance = 75 from public.v_cash_box_balances where id = '18181818-1818-4818-8818-0000000000c1'),
    'cash transfer reduces source balance');
  perform public.test_expect((select balance = 45 from public.v_cash_box_balances where id = '18181818-1818-4818-8818-0000000000c2'),
    'cash transfer increases destination balance');
  perform public.test_expect((select sum(balance) = 120 from public.v_cash_box_balances where id in ('18181818-1818-4818-8818-0000000000c1','18181818-1818-4818-8818-0000000000c2')),
    'cash transfer leaves total cash unchanged');
  perform public.test_expect((select balance = v_account_balance from public.v_account_balances where id = '18181818-1818-4818-8818-0000000000e1'),
    'internal transfers do not affect supplier balances');

  v_failed := false;
  begin
    perform public.create_cash_box_transfer(
      '18181818-1818-4818-8818-0000000000c1', '18181818-1818-4818-8818-0000000000c2', current_date, 100, null);
  exception when others then v_failed := sqlerrm = 'insufficient_cash_box_balance';
  end;
  perform public.test_expect(v_failed, 'cash transfer cannot overdraw source box');

  perform public.update_cash_box_transfer(v_cash_transfer,
    '18181818-1818-4818-8818-0000000000c1', '18181818-1818-4818-8818-0000000000c2', current_date, 30, 'تعديل');
  perform public.test_expect((select balance = 70 from public.v_cash_box_balances where id = '18181818-1818-4818-8818-0000000000c1'),
    'editing cash transfer updates source balance');
  perform public.delete_cash_box_transfer(v_cash_transfer);
  perform public.test_expect((select balance = 100 from public.v_cash_box_balances where id = '18181818-1818-4818-8818-0000000000c1'),
    'deleting cash transfer reverses its balance effect');
  perform public.restore_cash_box_transfer(v_cash_transfer);
  perform public.test_expect((select balance = 70 from public.v_cash_box_balances where id = '18181818-1818-4818-8818-0000000000c1'),
    'restoring cash transfer reapplies its balance effect');
  v_failed := false;
  begin
    perform public.delete_cash_box('18181818-1818-4818-8818-0000000000c2');
  exception when others then v_failed := sqlerrm = 'cash_box_has_transfers';
  end;
  perform public.test_expect(v_failed, 'cash box with transfer history cannot be deleted');

  perform public.test_expect((select count(*) = 0 from public.warehouse_transfers where company_id = '18181818-1818-4818-8818-0000000000a2'),
    'company A cannot read company B warehouse transfers');
  perform public.test_expect((select count(*) = 0 from public.cash_box_transfers where company_id = '18181818-1818-4818-8818-0000000000a2'),
    'company A cannot read company B cash box transfers');
end;
$$;

rollback;

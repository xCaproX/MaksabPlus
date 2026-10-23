-- المتوسط المتحرك، تكلفة أسطر البيع/الهالك، ومنع المخزون السالب.
begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('eeeeeeee-eeee-4eee-8eee-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cost@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('eeeeeeee-eeee-4eee-8eee-0000000000f1', 'شركة التكلفة');
insert into public.profiles (id, company_id, full_name)
values ('eeeeeeee-eeee-4eee-8eee-000000000001', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'مستخدم');
insert into public.warehouses (id, company_id, name)
values ('eeeeeeee-eeee-4eee-8eee-0000000000a1', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'مخزن');
insert into public.cash_boxes (id, company_id, name)
values ('eeeeeeee-eeee-4eee-8eee-0000000000b1', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'خزنة');
insert into public.accounts (id, company_id, name, kind)
values ('eeeeeeee-eeee-4eee-8eee-0000000000c1', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'عميل', 'customer'),
       ('eeeeeeee-eeee-4eee-8eee-0000000000d1', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'مورد', 'supplier');
insert into public.items (id, company_id, name, sale_price, purchase_price)
values ('eeeeeeee-eeee-4eee-8eee-0000000000e1', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'صنف', 100, 50),
       ('eeeeeeee-eeee-4eee-8eee-0000000000e2', 'eeeeeeee-eeee-4eee-8eee-0000000000f1', 'صنف تعديل شراء', 100, 10);
insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values ('eeeeeeee-eeee-4eee-8eee-0000000000f1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1', 'eeeeeeee-eeee-4eee-8eee-0000000000e1', 10, 50);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-4eee-8eee-000000000001"}', true);

do $$
declare
  v_purchase uuid;
  v_sale uuid;
  v_waste uuid;
  v_return uuid;
  v_purchase_edit uuid;
  v_ok boolean;
  v_waste_account uuid;
begin
  -- تعديل كمية شراء بعد بيع جزء منها يطبق الفرق مباشرة ولا يرفض بسبب رصيد مؤقت سالب.
  v_purchase_edit := public.create_invoice(
    'purchase', 'eeeeeeee-eeee-4eee-8eee-0000000000d1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e2","qty":10,"unit_price":10}]'::jsonb
  );
  perform public.create_invoice(
    'sale', 'eeeeeeee-eeee-4eee-8eee-0000000000c1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e2","qty":5,"unit_price":100}]'::jsonb
  );
  perform public.update_invoice(v_purchase_edit, 'eeeeeeee-eeee-4eee-8eee-0000000000d1',
    'eeeeeeee-eeee-4eee-8eee-0000000000a1', current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e2","qty":5,"unit_price":10}]'::jsonb);
  perform public.test_expect((select qty from public.item_stock where item_id = 'eeeeeeee-eeee-4eee-8eee-0000000000e2') = 0, 'purchase edit applies net quantity change after a sale');

  v_purchase := public.create_invoice(
    'purchase', 'eeeeeeee-eeee-4eee-8eee-0000000000d1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e1","qty":10,"unit_price":70}]'::jsonb
  );
  perform public.test_expect((select avg_cost from public.item_stock where item_id = 'eeeeeeee-eeee-4eee-8eee-0000000000e1') = 60, 'purchase recalculates weighted average 50 -> 60');
  perform public.test_expect((select unit_cost from public.invoice_items where invoice_id = v_purchase) = 70, 'purchase line records supplier unit cost');

  v_sale := public.create_invoice(
    'sale', 'eeeeeeee-eeee-4eee-8eee-0000000000c1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );
  perform public.test_expect((select unit_cost from public.invoice_items where invoice_id = v_sale) = 60, 'sale snapshots current average cost');
  perform public.test_expect((select profit_total from public.v_invoice_list where id = v_sale) = 120, 'sale profit = 300 - 180');

  select id into v_waste_account from public.accounts where system_key = 'waste';
  v_waste := public.create_invoice(
    'waste', v_waste_account, 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e1","qty":2,"unit_price":0}]'::jsonb
  );
  perform public.test_expect((select total from public.invoices where id = v_waste) = 0, 'waste invoice has no financial total');
  perform public.test_expect((select cost_total from public.v_invoice_list where id = v_waste) = 120, 'waste loss equals inventory cost');
  perform public.test_expect((select balance from public.v_account_balances where id = v_waste_account) = 0, 'waste does not affect account balance');
  perform public.test_expect((select count(*) from public.receipts where invoice_id = v_waste) = 0, 'waste creates no receipt');

  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', 'eeeeeeee-eeee-4eee-8eee-0000000000c1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
      current_date, 0, null,
      '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e1","qty":16,"unit_price":100}]'::jsonb
    );
  exception when others then v_ok := sqlerrm = 'insufficient_stock';
  end;
  perform public.test_expect(v_ok, 'reject sale exceeding available stock');
  perform public.test_expect((select qty from public.item_stock where item_id = 'eeeeeeee-eeee-4eee-8eee-0000000000e1') = 15, 'failed sale leaves stock unchanged');

  v_return := public.create_invoice(
    'sale_return', 'eeeeeeee-eeee-4eee-8eee-0000000000c1', 'eeeeeeee-eeee-4eee-8eee-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"eeeeeeee-eeee-4eee-8eee-0000000000e1","qty":1,"unit_price":100}]'::jsonb
  );
  perform public.test_expect((select unit_cost from public.invoice_items where invoice_id = v_return) = 60, 'unlinked sales return uses current average cost');
  perform public.test_expect((select profit_total from public.v_invoice_list where id = v_return) = -40, 'sales return reverses 40 of profit');

  perform public.delete_invoice(v_waste);
  perform public.test_expect((select qty from public.item_stock where item_id = 'eeeeeeee-eeee-4eee-8eee-0000000000e1') = 18, 'deleting waste reverses quantity');
  perform public.restore_invoice(v_waste);
  perform public.test_expect((select qty from public.item_stock where item_id = 'eeeeeeee-eeee-4eee-8eee-0000000000e1') = 16, 'restoring waste reapplies quantity');
end $$;

rollback;
select 'PASS 009_moving_average_cost' as result;

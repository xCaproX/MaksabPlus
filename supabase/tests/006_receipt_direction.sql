-- =====================================================================
-- 006_receipt_direction.sql
-- اتجاه الإيصال (استلام/صرف) مستقل عن نوع الحساب:
--   - يمكن استلام من عميل أو مورد، وصرف لعميل أو مورد.
--   - الخزنة تتحرك حسب الاتجاه فقط، ورصيد الحساب ينقص في الحالتين.
--   - ترقيم منفصل: RCP للاستلام و PAY للصرف.
--   - إيصال الفاتورة يأخذ الاتجاه من نوع الفاتورة.
-- =====================================================================
begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, '');
  end if;
end;
$$;

grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'j@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'شركة ي');

insert into public.profiles (id, company_id, full_name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'مستخدم ي');

insert into public.warehouses (id, company_id, name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000a1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'مخزن ي');

insert into public.cash_boxes (id, company_id, name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'خزنة ي');

insert into public.accounts (id, company_id, name, kind) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'عميل ي', 'customer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'مورد ي', 'supplier');

insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000e1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'صنف ي', 100, 60);

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-0000000000f1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000a1', 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000e1', 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-000000000001"}', true);

-- ---------------------------------------------------------------------
-- (1) الإيصالات الحرة: الاتجاه من المستخدم والنوع من الحساب مستقل
-- ---------------------------------------------------------------------
do $$
declare
  v_in_supplier uuid;
  v_out_customer uuid;
  v_in_customer uuid;
  v_out_supplier uuid;
  v_ok boolean;
begin
  -- استلام من مورد
  v_in_supplier := public.create_free_receipt(
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
    current_date, 100, 'استلام من مورد', null, 'in'
  );

  perform public.test_expect(
    (select number from public.receipts where id = v_in_supplier) = 'RCP-000001',
    'in from supplier: RCP series'
  );
  perform public.test_expect(
    (select direction from public.receipts where id = v_in_supplier) = 'in',
    'in from supplier: direction in'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 100,
    'in from supplier: cash +100'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1') = -100,
    'in from supplier: supplier balance -100'
  );

  -- صرف لعميل
  v_out_customer := public.create_free_receipt(
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
    current_date, 40, 'صرف لعميل', null, 'out'
  );

  perform public.test_expect(
    (select number from public.receipts where id = v_out_customer) = 'PAY-000001',
    'out to customer: PAY series'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 60,
    'out to customer: cash 100 - 40'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1') = -40,
    'out to customer: customer balance -40'
  );

  -- استلام من عميل
  v_in_customer := public.create_free_receipt(
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
    current_date, 30, 'استلام من عميل', null, 'in'
  );

  perform public.test_expect(
    (select number from public.receipts where id = v_in_customer) = 'RCP-000002',
    'in from customer: next RCP'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 90,
    'in from customer: cash 60 + 30'
  );

  -- صرف لمورد
  v_out_supplier := public.create_free_receipt(
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
    current_date, 20, 'صرف لمورد', null, 'out'
  );

  perform public.test_expect(
    (select number from public.receipts where id = v_out_supplier) = 'PAY-000002',
    'out to supplier: next PAY'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 70,
    'out to supplier: cash 90 - 20'
  );

  -- تعديل الإيصال لا يغيّر اتجاهه ولا رقمه
  perform public.update_free_receipt(
    v_in_supplier,
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
    current_date, 110, 'استلام معدّل', null
  );

  perform public.test_expect(
    (select direction from public.receipts where id = v_in_supplier) = 'in',
    'edit: direction kept'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_in_supplier) = 'RCP-000001',
    'edit: number kept'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 80,
    'edit: cash 80'
  );

  -- اتجاه غير صحيح
  v_ok := false;
  begin
    perform public.create_free_receipt(
      'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1',
      'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1',
      current_date, 10, null, null, 'x'
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_direction');
  end;
  perform public.test_expect(v_ok, 'invalid direction rejected');
end $$;

-- ---------------------------------------------------------------------
-- (2) إيصال الفاتورة: الاتجاه من نوع الفاتورة والترقيم من سلسلته
-- ---------------------------------------------------------------------
do $$
declare
  v_sale uuid;
  v_purchase uuid;
  v_sale_receipt uuid;
  v_purchase_receipt uuid;
begin
  v_sale := public.create_invoice(
    'sale',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000a1',
    current_date, 50, null,
    '[{"item_id":"bbbbbbbb-bbbb-4bbb-8bbb-0000000000e1","qty":1,"unit_price":50}]'::jsonb
  );
  select id into v_sale_receipt from public.receipts where invoice_id = v_sale;

  perform public.test_expect(
    (select direction from public.receipts where id = v_sale_receipt) = 'in',
    'sale invoice: receipt in'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_sale_receipt) = 'RCP-000003',
    'sale invoice: RCP series'
  );

  v_purchase := public.create_invoice(
    'purchase',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1',
    'bbbbbbbb-bbbb-4bbb-8bbb-0000000000a1',
    current_date, 60, null,
    '[{"item_id":"bbbbbbbb-bbbb-4bbb-8bbb-0000000000e1","qty":1,"unit_price":60}]'::jsonb
  );
  select id into v_purchase_receipt from public.receipts where invoice_id = v_purchase;

  perform public.test_expect(
    (select direction from public.receipts where id = v_purchase_receipt) = 'out',
    'purchase invoice: receipt out'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_purchase_receipt) = 'PAY-000003',
    'purchase invoice: PAY series'
  );

  -- الخزنة: 80 + 50 - 60 = 70
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000b1') = 70,
    'cash after invoices'
  );

  -- الأرصدة: العميل 50 - (40 + 30 + 50) = -70 / المورد 60 - (110 + 20 + 60) = -130
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c1') = -70,
    'customer balance -70'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000d1') = -130,
    'supplier balance -130'
  );

  -- عرض الاتجاه في القائمة
  perform public.test_expect(
    (select count(*) from public.v_receipt_list where direction = 'in') = 3,
    'list: three in receipts'
  );
  perform public.test_expect(
    (select count(*) from public.v_receipt_list where direction = 'out') = 3,
    'list: three out receipts'
  );
end $$;

rollback;

select 'PASS 006_receipt_direction' as result;

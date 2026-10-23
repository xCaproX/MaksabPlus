-- =====================================================================
-- 001_invoice_logic.sql
-- يختبر: حساب الإجمالي، الإيصال التلقائي، المخزون، أرصدة الحسابات
-- والخزن، التعديل، الحذف، ورفض المدخلات غير الصحيحة.
-- التشغيل: من SQL Editor كامل، أو `npm run test:db` محليًا.
-- كل شيء داخل transaction ويُرجع للخلف في النهاية.
-- =====================================================================
begin;

-- دالة مساعدة للاختبارات
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

-- ---------------------------------------------------------------------
-- بيانات الاختبار
-- ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', now(), now(), now()),
  ('22222222-2222-4222-8222-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('11111111-1111-4111-8111-0000000000f1', 'شركة أ'),
  ('22222222-2222-4222-8222-0000000000f2', 'شركة ب');

insert into public.profiles (id, company_id, full_name) values
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-0000000000f1', 'مستخدم أ'),
  ('22222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-0000000000f2', 'مستخدم ب');

insert into public.warehouses (id, company_id, name) values
  ('11111111-1111-4111-8111-0000000000a1', '11111111-1111-4111-8111-0000000000f1', 'مخزن أ'),
  ('11111111-1111-4111-8111-0000000000a9', '11111111-1111-4111-8111-0000000000f1', 'مخزن أ - فرعي'),
  ('22222222-2222-4222-8222-0000000000a2', '22222222-2222-4222-8222-0000000000f2', 'مخزن ب');

insert into public.cash_boxes (id, company_id, name) values
  ('11111111-1111-4111-8111-0000000000b1', '11111111-1111-4111-8111-0000000000f1', 'خزنة أ'),
  ('22222222-2222-4222-8222-0000000000b2', '22222222-2222-4222-8222-0000000000f2', 'خزنة ب');

insert into public.accounts (id, company_id, name, kind) values
  ('11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000f1', 'عميل أ', 'customer'),
  ('11111111-1111-4111-8111-0000000000d1', '11111111-1111-4111-8111-0000000000f1', 'مورد أ', 'supplier'),
  ('22222222-2222-4222-8222-0000000000c2', '22222222-2222-4222-8222-0000000000f2', 'عميل ب', 'customer');

insert into public.items (id, company_id, name, unit, sale_price, purchase_price) values
  ('11111111-1111-4111-8111-0000000000e1', '11111111-1111-4111-8111-0000000000f1', 'صنف أ', 'قطعة', 100, 60),
  ('22222222-2222-4222-8222-0000000000e2', '22222222-2222-4222-8222-0000000000f2', 'صنف ب', 'قطعة', 100, 60);

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('11111111-1111-4111-8111-0000000000f1', '11111111-1111-4111-8111-0000000000a1', '11111111-1111-4111-8111-0000000000e1', 10);

-- ---------------------------------------------------------------------
-- (1) فاتورة مبيعات: 2 × 100 = 200، مدفوع 50
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-000000000001"}', true);

do $$
declare
  v_id uuid;
begin
  v_id := public.create_invoice(
    'sale',
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    50,
    'فاتورة اختبار',
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":2,"unit_price":100}]'::jsonb
  );

  perform public.test_expect((select total from public.invoices where id = v_id) = 200, 'sale: total = 200');
  perform public.test_expect((select subtotal from public.invoices where id = v_id) = 200, 'sale: subtotal = 200');
  perform public.test_expect((select paid from public.invoices where id = v_id) = 50, 'sale: paid = 50');
  perform public.test_expect((select number from public.invoices where id = v_id) = 'SAL-000001', 'sale: auto number');
  perform public.test_expect((select line_total from public.invoice_items where invoice_id = v_id) = 200, 'sale: line_total = 200');
  perform public.test_expect((select count(*) from public.receipts where invoice_id = v_id) = 1, 'sale: one auto receipt');
  perform public.test_expect((select amount from public.receipts where invoice_id = v_id) = 50, 'sale: receipt amount = 50');
  perform public.test_expect((select number from public.receipts where invoice_id = v_id) = 'RCP-000001', 'sale: receipt number');
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 8,
    'sale: stock 10 -> 8'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 150,
    'sale: customer balance = 150'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = 50,
    'sale: cash = +50'
  );
end $$;

-- ---------------------------------------------------------------------
-- (2) فاتورة مشتريات: 5 × 60 = 300، مدفوع 100
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  v_id := public.create_invoice(
    'purchase',
    '11111111-1111-4111-8111-0000000000d1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    100,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":5,"unit_price":60}]'::jsonb
  );

  perform public.test_expect((select total from public.invoices where id = v_id) = 300, 'purchase: total = 300');
  perform public.test_expect((select number from public.invoices where id = v_id) = 'PUR-000001', 'purchase: auto number');
  perform public.test_expect((select amount from public.receipts where invoice_id = v_id) = 100, 'purchase: receipt 100');
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 13,
    'purchase: stock 8 -> 13'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000d1') = 200,
    'purchase: supplier balance = 200'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = -50,
    'purchase: cash = -50'
  );
end $$;

-- ---------------------------------------------------------------------
-- (3) تعديل فاتورة المبيعات: 3 × 100 = 300، مدفوع 200
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SAL-000001';

  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    200,
    'معدلة',
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect((select total from public.invoices where id = v_id) = 300, 'update: total = 300');
  perform public.test_expect((select paid from public.invoices where id = v_id) = 200, 'update: paid = 200');
  perform public.test_expect((select count(*) from public.invoice_items where invoice_id = v_id) = 1, 'update: lines replaced');
  perform public.test_expect((select count(*) from public.receipts where invoice_id = v_id) = 1, 'update: still one receipt');
  perform public.test_expect((select amount from public.receipts where invoice_id = v_id) = 200, 'update: receipt 200');
  perform public.test_expect((select number from public.receipts where invoice_id = v_id) = 'RCP-000001', 'update: receipt number kept');
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 12,
    'update: stock = 12'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 100,
    'update: customer balance = 100'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = 100,
    'update: cash = 100'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4) تعديل المدفوع إلى صفر => الإيصال يُحذف
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SAL-000001';

  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    0,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect(
    (select count(*) from public.receipts where invoice_id = v_id and deleted_at is null) = 0,
    'paid=0: receipt hidden'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where invoice_id = v_id) is not null,
    'paid=0: receipt kept for restore'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 300,
    'paid=0: customer balance = 300'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = -100,
    'paid=0: cash = -100'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4.2) إضافة دفعة لفاتورة كانت بدون إيصال => إيصال جديد
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SAL-000001';

  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    50,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect(
    (select count(*) from public.receipts where invoice_id = v_id and deleted_at is null) = 1,
    '0 -> 50: receipt restored'
  );
  perform public.test_expect(
    (select number from public.receipts where invoice_id = v_id) = 'RCP-000001',
    '0 -> 50: receipt number kept'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = -50,
    '0 -> 50: cash = -50'
  );

  -- رجوع إلى صفر
  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    0,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect(
    (select count(*) from public.receipts where invoice_id = v_id and deleted_at is null) = 0,
    'back to 0: receipt hidden again'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4.5) نقل الفاتورة لمخزن آخر => المخزون يتحرك بين المخازن
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SAL-000001';

  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a9',
    current_date,
    0,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 15,
    'move: old warehouse 15'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a9' and item_id = '11111111-1111-4111-8111-0000000000e1') = -3,
    'move: new warehouse -3 (negative allowed)'
  );

  -- رجوع للمخزن الأول
  perform public.update_invoice(
    v_id,
    '11111111-1111-4111-8111-0000000000c1',
    '11111111-1111-4111-8111-0000000000a1',
    current_date,
    0,
    null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":3,"unit_price":100}]'::jsonb
  );

  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 12,
    'move back: 12'
  );
end $$;

-- ---------------------------------------------------------------------
-- (5) رفض المدخلات غير الصحيحة
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_ok boolean;
begin
  select id into v_id from public.invoices where number = 'SAL-000001';

  -- مدفوع أكبر من الإجمالي
  v_ok := false;
  begin
    perform public.update_invoice(
      v_id, '11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000a1',
      current_date, 500, null,
      '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":1,"unit_price":100}]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'paid_exceeds_total');
  end;
  perform public.test_expect(v_ok, 'rejects paid > total');

  -- فاتورة بلا سطور
  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', '11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000a1',
      current_date, 0, null, '[]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'invoice_has_no_lines');
  end;
  perform public.test_expect(v_ok, 'rejects empty lines');

  -- كمية صفر
  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', '11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000a1',
      current_date, 0, null,
      '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":0,"unit_price":10}]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_line_qty');
  end;
  perform public.test_expect(v_ok, 'rejects zero qty');
end $$;

-- ---------------------------------------------------------------------
-- (6) حذف فاتورة المشتريات => المخزون والأرصدة ترجع
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'PUR-000001';

  perform public.delete_invoice(v_id);

  perform public.test_expect(
    (select deleted_at from public.invoices where id = v_id) is not null,
    'delete: invoice soft deleted'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where invoice_id = v_id) is not null,
    'delete: linked receipt soft deleted'
  );
  perform public.test_expect(
    (select count(*) from public.invoice_items where invoice_id = v_id) = 1,
    'delete: lines kept for restore'
  );
  perform public.test_expect(
    (select count(*) from public.v_invoice_list where id = v_id and deleted_at is null) = 0,
    'delete: excluded from list filter'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 7,
    'delete: stock back to 7'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000d1') = 0,
    'delete: supplier balance = 0'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = 0,
    'delete: cash = 0'
  );

  -- حذف فاتورة المبيعات => المخزون يرجع 10
  select id into v_id from public.invoices where number = 'SAL-000001';
  perform public.delete_invoice(v_id);
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 10,
    'delete: stock back to 10'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 0,
    'delete: customer balance = 0'
  );
end $$;

-- ---------------------------------------------------------------------
-- (7) نوع الحساب مستقل عن نوع الفاتورة
--     بيع لمورد + شراء من عميل
-- ---------------------------------------------------------------------
do $$
declare
  v_sale uuid;
  v_purchase uuid;
begin
  -- بيع لمورد (الحساب d1 مورد)
  v_sale := public.create_invoice(
    'sale', '11111111-1111-4111-8111-0000000000d1', '11111111-1111-4111-8111-0000000000a1',
    current_date, 20, null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":2,"unit_price":50}]'::jsonb
  );

  perform public.test_expect(
    (select number from public.invoices where id = v_sale) = 'SAL-000002',
    'sale to supplier: created'
  );
  perform public.test_expect(
    (select account_kind from public.v_invoice_list where id = v_sale) = 'supplier',
    'sale to supplier: account_kind supplier'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000d1') = 80,
    'sale to supplier: balance 100 - 20'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = 20,
    'sale to supplier: cash +20 (direction from invoice)'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 8,
    'sale to supplier: stock -2'
  );

  -- شراء من عميل (الحساب c1 عميل)
  v_purchase := public.create_invoice(
    'purchase', '11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":1,"unit_price":30}]'::jsonb
  );

  perform public.test_expect(
    (select account_kind from public.v_invoice_list where id = v_purchase) = 'customer',
    'purchase from customer: account_kind customer'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 30,
    'purchase from customer: balance 30'
  );
  perform public.test_expect(
    (select count(*) from public.receipts where invoice_id = v_purchase) = 0,
    'purchase from customer: no receipt (paid 0)'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = '11111111-1111-4111-8111-0000000000a1' and item_id = '11111111-1111-4111-8111-0000000000e1') = 9,
    'purchase from customer: stock +1'
  );

  -- تعديل البيع ليصبح لعميل: الرصيد ينتقل من المورد للعميل
  perform public.update_invoice(
    v_sale, '11111111-1111-4111-8111-0000000000c1', '11111111-1111-4111-8111-0000000000a1',
    current_date, 20, null,
    '[{"item_id":"11111111-1111-4111-8111-0000000000e1","qty":2,"unit_price":50}]'::jsonb
  );

  perform public.test_expect(
    (select account_kind from public.v_invoice_list where id = v_sale) = 'customer',
    'update to customer: account_kind customer'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000d1') = 0,
    'update to customer: supplier balance 0'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '11111111-1111-4111-8111-0000000000c1') = 110,
    'update to customer: customer balance 100 - 20 + 30'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '11111111-1111-4111-8111-0000000000b1') = 20,
    'update to customer: cash unchanged 20'
  );
end $$;

rollback;

select 'PASS 001_invoice_logic' as result;

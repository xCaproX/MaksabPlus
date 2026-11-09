-- =====================================================================
-- 063_core_engine_hardening.sql
-- اختبار شامل لحزمة تحصين المحرك المالي والمحاسبي والتزامني:
-- 1. توحيد توقيت القاهرة cairo_today() عند تمرير NULL.
-- 2. منع السحب على المكشوف في الخزينة (سندات صرف، فواتير شراء، حذف إيصالات القبض).
-- 3. حماية تكلفة المخزون لفواتير الشراء بعد حدوث مبيعات لاحقة والسماح بتعديل الملاحظات فقط.
-- 4. منع تكرار احتساب تسويات رصيد أول المدة في إعادة المطابقة.
-- 5. مطابقة محاكاة الحسابات calculate_expected_account_balance مع المقاصة.
-- 6. حصر صلاحية reconcile_item_stock بالمالك فقط.
-- 7. حجب الفواتير ذات التواريخ المستقبلية من لوحة التحكم.
-- =====================================================================

begin;

-- إنشاء شركة ومستخدمين
insert into public.companies (id, name) values ('c0000000-0000-0000-0000-000000000063', 'شركة التحصين الهندسي');
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000063', 'owner63@test.com'),
  ('e0000000-0000-0000-0000-000000000064', 'emp63@test.com');

insert into public.profiles (id, company_id, access_role, full_name) values
  ('e0000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000063', 'owner', 'مالك الشركة'),
  ('e0000000-0000-0000-0000-000000000064', 'c0000000-0000-0000-0000-000000000063', 'employee', 'موظف مبيعات');

-- منح الموظف صلاحيات الفواتير والمقبوضات
insert into public.user_permissions (company_id, user_id, permission_key) values
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.sale.view'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.sale.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.sale.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.sale.delete'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.purchase.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.purchase.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.purchase.delete'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.in.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.in.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.in.delete'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.out.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.out.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.out.delete'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.delete'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.warehouse_transfer.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'goods.warehouse_transfer.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.cash_box_transfer.create'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'money.cash_box_transfer.edit'),
  ('c0000000-0000-0000-0000-000000000063', 'e0000000-0000-0000-0000-000000000064', 'management.edit');

-- إنشاء بيانات رئيسية
insert into public.warehouses (id, company_id, name, is_primary) values
  ('d0000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000063', 'المخزن الرئيسي', true),
  ('d0000000-0000-0000-0000-000000000064', 'c0000000-0000-0000-0000-000000000063', 'المخزن الفرعي', false);

insert into public.cash_boxes (id, company_id, name, is_primary, current_balance) values
  ('b0000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000063', 'الخزينة الرئيسية', true, 1000),
  ('b0000000-0000-0000-0000-000000000064', 'c0000000-0000-0000-0000-000000000063', 'خزينة الفرع', false, 0);

insert into public.accounts (id, company_id, name, kind, system_key) values
  ('a0000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000063', 'شركة الأمل للتوريدات', 'supplier', null),
  ('a0000000-0000-0000-0000-000000000064', 'c0000000-0000-0000-0000-000000000063', 'مؤسسة النور للتجارة', 'customer', null);

insert into public.items (id, company_id, name, unit, sale_price, purchase_price) values
  ('f0000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000063', 'شاي العروسة 250جم', 'علبة', 60, 50),
  ('f0000000-0000-0000-0000-000000000064', 'c0000000-0000-0000-0000-000000000063', 'سكر أبيض 1كجم', 'كجم', 35, 30);

-- تعيين هوية المالك
set local role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000063';

-- ---------------------------------------------------------------------
-- اختبار 1: توحيد توقيت القاهرة عند تمرير NULL في التاريخ
-- ---------------------------------------------------------------------
do $$
declare
  v_inv_id uuid;
  v_rec_id uuid;
  v_trf_id uuid;
  v_cb_trf_id uuid;
  v_date date;
begin
  -- 1. فاتورة بتاريخ NULL
  v_inv_id := public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000063',
    'd0000000-0000-0000-0000-000000000063',
    null,
    0,
    'شراء تجريبي بدون تاريخ',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000063', 'qty', 10, 'unit_price', 50))
  );
  select invoice_date into v_date from public.invoices where id = v_inv_id;
  assert v_date = public.cairo_today(), 'invoice_date should match cairo_today()';

  -- 2. إيصال بتاريخ NULL
  v_rec_id := public.create_free_receipt(
    'a0000000-0000-0000-0000-000000000064',
    'b0000000-0000-0000-0000-000000000063',
    null,
    200,
    'تحصيل دفعة',
    'سند قبض',
    'in'
  );
  select receipt_date into v_date from public.receipts where id = v_rec_id;
  assert v_date = public.cairo_today(), 'receipt_date should match cairo_today()';

  -- 3. تحويل مخزني بتاريخ NULL
  v_trf_id := public.create_warehouse_transfer(
    'd0000000-0000-0000-0000-000000000063',
    'd0000000-0000-0000-0000-000000000064',
    null,
    'تحويل تجريبي',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000063', 'qty', 2))
  );
  select transfer_date into v_date from public.warehouse_transfers where id = v_trf_id;
  assert v_date = public.cairo_today(), 'transfer_date should match cairo_today()';

  -- 4. تحويل خزن بتاريخ NULL
  v_cb_trf_id := public.create_cash_box_transfer(
    'b0000000-0000-0000-0000-000000000063',
    'b0000000-0000-0000-0000-000000000064',
    null,
    100,
    'تحويل خزن تجريبي'
  );
  select transfer_date into v_date from public.cash_box_transfers where id = v_cb_trf_id;
  assert v_date = public.cairo_today(), 'cash_box transfer_date should match cairo_today()';
end;
$$;

-- ---------------------------------------------------------------------
-- اختبار 2: منع السحب على المكشوف في الخزينة
-- ---------------------------------------------------------------------
do $$
declare
  v_err boolean := false;
  v_rec_id uuid;
begin
  -- رصيد الخزينة الرئيسية حالياً = 1000 + 200 (قبض) - 100 (تحويل) = 1100 ج.م
  -- محاولة صرف 1500 ج.م بسند صرف حر -> يجب أن تفشل بـ insufficient_cash_box_balance
  begin
    perform public.create_free_receipt(
      'a0000000-0000-0000-0000-000000000063',
      'b0000000-0000-0000-0000-000000000063',
      null,
      1500,
      'محاولة صرف أكبر من الرصيد',
      'سند صرف',
      'out'
    );
  exception
    when others then
      if sqlerrm = 'insufficient_cash_box_balance' then v_err := true; end if;
  end;
  assert v_err, 'create_free_receipt should fail on overdraft';

  -- محاولة شراء نقدي بـ 2000 ج.م بمدفوع 1500 كاش من الخزينة -> يجب أن تفشل
  v_err := false;
  begin
    perform public.create_invoice_with_cash_box(
      'purchase',
      'a0000000-0000-0000-0000-000000000063',
      'd0000000-0000-0000-0000-000000000063',
      null,
      1500,
      'شراء كاش فوق الرصيد',
      jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 50, 'unit_price', 30)),
      'b0000000-0000-0000-0000-000000000063'
    );
  exception
    when others then
      if sqlerrm = 'insufficient_cash_box_balance' then v_err := true; end if;
  end;
  assert v_err, 'create_invoice with cash_box should fail on overdraft';

  -- تجربة حذف إيصال قبض يتسبب في جعل رصيد الخزينة سالباً
  -- الخزينة الفرعية بها 100 ج.م فقط من التحويل. نقبض فيها 500 ج.م (تصبح 600)، ثم نصرف 550 ج.م (تصبح 50).
  -- الآن لو حاولنا حذف إيصال القبض (500)، الرصيد سيصبح 50 - 500 = -450 -> يجب أن ترفض
  v_rec_id := public.create_free_receipt(
    'a0000000-0000-0000-0000-000000000064',
    'b0000000-0000-0000-0000-000000000064',
    null,
    500,
    'قبض 500',
    'سند قبض',
    'in'
  );
  perform public.create_free_receipt(
    'a0000000-0000-0000-0000-000000000063',
    'b0000000-0000-0000-0000-000000000064',
    null,
    550,
    'صرف 550',
    'سند صرف',
    'out'
  );

  v_err := false;
  begin
    perform public.delete_free_receipt(v_rec_id);
  exception
    when others then
      if sqlerrm = 'insufficient_cash_box_balance' then v_err := true; end if;
  end;
  assert v_err, 'delete_free_receipt should fail if cash_box balance would become negative';
end;
$$;

-- ---------------------------------------------------------------------
-- اختبار 3: حماية تكلفة المخزون لفواتير الشراء بعد حدوث مبيعات لاحقة
-- ---------------------------------------------------------------------
do $$
declare
  v_pur_id uuid;
  v_sale_id uuid;
  v_err boolean := false;
begin
  -- 1. تسجيل فاتورة شراء لـ 10 وحدات من الصنف f0000000-0000-0000-0000-000000000064 بسعر 30
  v_pur_id := public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000063',
    'd0000000-0000-0000-0000-000000000063',
    public.cairo_today(),
    0,
    'فاتورة شراء أصلية',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 10, 'unit_price', 30))
  );

  -- 2. تسجيل فاتورة بيع لاحقة لـ 3 وحدات من نفس الصنف
  v_sale_id := public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000064',
    'd0000000-0000-0000-0000-000000000063',
    public.cairo_today(),
    0,
    'فاتورة بيع لاحقة',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 3, 'unit_price', 35))
  );

  -- 3. محاولة حذف فاتورة الشراء -> يجب أن ترفض
  begin
    perform public.delete_invoice(v_pur_id);
  exception
    when others then
      if sqlerrm = 'cannot_delete_purchase_with_subsequent_sales' then v_err := true; end if;
  end;
  assert v_err, 'delete_invoice should fail on purchase with subsequent sales';

  -- 4. محاولة تعديل كمية أو سعر فاتورة الشراء -> يجب أن ترفض
  v_err := false;
  begin
    perform public.update_invoice(
      v_pur_id,
      'a0000000-0000-0000-0000-000000000063',
      'd0000000-0000-0000-0000-000000000063',
      public.cairo_today(),
      0,
      'محاولة تغيير الكمية',
      jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 15, 'unit_price', 30))
    );
  exception
    when others then
      if sqlerrm = 'cannot_modify_purchase_items_with_subsequent_sales' then v_err := true; end if;
  end;
  assert v_err, 'update_invoice should fail to modify items/qty on purchase with subsequent sales';

  -- 5. تعديل الملاحظات فقط على نفس الفاتورة -> يجب أن ينجح تماماً!
  perform public.update_invoice(
    v_pur_id,
    'a0000000-0000-0000-0000-000000000063',
    'd0000000-0000-0000-0000-000000000063',
    public.cairo_today(),
    0,
    'تعديل الملاحظات مسموح به',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 10, 'unit_price', 30))
  );
  assert (select notes from public.invoices where id = v_pur_id) = 'تعديل الملاحظات مسموح به', 'Notes should be updated';
end;
$$;

-- ---------------------------------------------------------------------
-- اختبار 4: تصحيح تسويات رصيد أول المدة للمخزون ومنع تكرار الاحتساب
-- ---------------------------------------------------------------------
do $$
declare
  v_qty numeric(18,4);
  v_disc_cnt integer;
begin
  -- 1. تسجيل رصيد افتتاحي 10 وحدات لصنف جديد في المخزن الفرعي
  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'warehouse_id', 'd0000000-0000-0000-0000-000000000064',
      'item_id', 'f0000000-0000-0000-0000-000000000064',
      'opening_qty', 10,
      'unit_cost', 30
    ))
  );

  -- 2. تسجيل حركة شراء 5 وحدات -> المخزون يصبح 15
  perform public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000063',
    'd0000000-0000-0000-0000-000000000064',
    public.cairo_today(),
    0,
    'شراء إضافي 5 وحدات',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 5, 'unit_price', 30))
  );

  -- 3. تعديل الرصيد الافتتاحي من 10 إلى 12 وحدات (+2)
  -- المخزون الفعلي يجب أن يصبح 15 + 2 = 17
  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'warehouse_id', 'd0000000-0000-0000-0000-000000000064',
      'item_id', 'f0000000-0000-0000-0000-000000000064',
      'opening_qty', 12,
      'unit_cost', 30
    ))
  );

  select qty into v_qty from public.item_stock
  where warehouse_id = 'd0000000-0000-0000-0000-000000000064' and item_id = 'f0000000-0000-0000-0000-000000000064';
  assert v_qty = 17, 'Actual stock should be 17';

  -- 4. تشغيل إعادة المطابقة والتأكد من عدم وجود أي فروقات أو تضخيم للمخزون إلى 19!
  perform public.reconcile_item_stock();

  select qty into v_qty from public.item_stock
  where warehouse_id = 'd0000000-0000-0000-0000-000000000064' and item_id = 'f0000000-0000-0000-0000-000000000064';
  assert v_qty = 17, 'Actual stock should remain 17 after reconciliation';
end;
$$;

-- ---------------------------------------------------------------------
-- اختبار 5: مطابقة محاكاة الحسابات calculate_expected_account_balance مع المقاصة
-- ---------------------------------------------------------------------
reset role;
do $$
declare
  v_expected numeric(18,4);
  v_synced numeric(18,4);
begin
  -- حساب عميل تمت عليه مبيعات ومشتريات ومقبوضات
  select balance into v_synced from public.v_account_balances where id = 'a0000000-0000-0000-0000-000000000064';
  v_expected := public.calculate_expected_account_balance('a0000000-0000-0000-0000-000000000064');
  assert v_expected = v_synced, 'Simulation balance should strictly match sync_account_balance';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000063"}', true);

-- ---------------------------------------------------------------------
-- اختبار 6: حصر صلاحية reconcile_item_stock بالمالك ومنع الموظف
-- ---------------------------------------------------------------------
do $$
declare
  v_err boolean := false;
begin
  -- التبديل للموظف
  set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000064';

  begin
    perform public.reconcile_item_stock();
  exception
    when sqlstate '42501' then v_err := true;
  end;
  assert v_err, 'reconcile_item_stock should fail with 42501 for non-owner employee';

  -- إعادة المالك
  set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000063';
  perform public.reconcile_item_stock();
end;
$$;

-- ---------------------------------------------------------------------
-- اختبار 7: استبعاد الفواتير ذات التواريخ المستقبلية من لوحة التحكم
-- ---------------------------------------------------------------------
do $$
declare
  v_summary jsonb;
  v_today_sales_before numeric(18,4);
  v_today_sales_after numeric(18,4);
  v_month_sales_before numeric(18,4);
  v_month_sales_after numeric(18,4);
begin
  v_summary := public.get_home_dashboard_summary();
  v_today_sales_before := coalesce((v_summary->'sales'->>'today')::numeric, 0);
  v_month_sales_before := coalesce((v_summary->'sales'->>'month')::numeric, 0);

  -- إنشاء فاتورة مبيعات بتاريخ مستقبلي (بعد 10 أيام)
  perform public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000064',
    'd0000000-0000-0000-0000-000000000064',
    public.cairo_today() + 10,
    0,
    'فاتورة مبيعات مستقبلية',
    jsonb_build_array(jsonb_build_object('item_id', 'f0000000-0000-0000-0000-000000000064', 'qty', 1, 'unit_price', 35))
  );

  v_summary := public.get_home_dashboard_summary();
  v_today_sales_after := coalesce((v_summary->'sales'->>'today')::numeric, 0);
  v_month_sales_after := coalesce((v_summary->'sales'->>'month')::numeric, 0);

  assert v_today_sales_after = v_today_sales_before, 'Future invoice must not change today_sales';
  assert v_month_sales_after = v_month_sales_before, 'Future invoice must not change month_sales';
end;
$$;

rollback;

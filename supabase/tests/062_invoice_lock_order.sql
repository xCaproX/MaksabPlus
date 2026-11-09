-- =====================================================================
-- 062_invoice_lock_order.sql
-- التحقق من ترتيب أقفال الأصناف تصاعدياً في دوال الفواتير لمنع الـ Deadlock
-- والتحقق من سلامة العمليات وعزل الشركات والصلاحيات
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '62626262-6262-4262-8262-0000000000a1';
  v_comp_b uuid := '62626262-6262-4262-8262-0000000000b1';
  v_owner_a uuid := '62626262-6262-4262-8262-000000000001';
  v_owner_b uuid := '62626262-6262-4262-8262-000000000002';

  v_customer_a uuid;
  v_wh_a uuid;
  v_item_1 uuid;
  v_item_2 uuid;
  v_cash_box_a uuid;
  v_inv_id uuid;
  v_stock_1 numeric;
  v_stock_2 numeric;
begin
  -- 1) فحص أمان الدوال (سحب الصلاحيات من public و anon)
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_invoice', 'update_invoice', 'delete_invoice', 'restore_invoice')
      and grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Security violation: invoice write RPCs must revoke execute from public and anon';
  end if;

  -- 2) إعداد المستخدمين والشركات
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_lock_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_lock_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة اختبار ترتيب أقفال الفواتير أ'),
    (v_comp_b, 'شركة اختبار ترتيب أقفال الفواتير ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, access_role, full_name, is_active)
  values
    (v_owner_a, v_comp_a, 'owner', 'مدير الشركة أ', true),
    (v_owner_b, v_comp_b, 'owner', 'مدير الشركة ب', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = 'owner', is_active = true;

  -- 3) إعداد البيانات الأساسية للشركة أ
  insert into public.warehouses (company_id, name, is_active)
  values (v_comp_a, 'مخزن رئيسي أ', true)
  returning id into v_wh_a;

  insert into public.cash_boxes (company_id, name, is_active)
  values (v_comp_a, 'خزينة رئيسية أ', true)
  returning id into v_cash_box_a;

  insert into public.accounts (company_id, name, kind, is_active)
  values (v_comp_a, 'عميل تجريبي أ', 'customer', true)
  returning id into v_customer_a;

  -- إنشاء صنفين بمعرفات متعمدة للتأكد من اختلاف الترتيب
  v_item_1 := '62626262-6262-4262-8262-000000000099'; -- معرف كبير
  v_item_2 := '62626262-6262-4262-8262-000000000011'; -- معرف صغير

  insert into public.items (id, company_id, name, code, sale_price, is_active)
  values
    (v_item_1, v_comp_a, 'صنف ب 99', 'ITM-99', 100, true),
    (v_item_2, v_comp_a, 'صنف أ 11', 'ITM-11', 50, true);

  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
  values
    (v_comp_a, v_wh_a, v_item_1, 100, 70),
    (v_comp_a, v_wh_a, v_item_2, 100, 30);

  -- 4) تسجيل الدخول كمدير الشركة أ
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- 5) إنشاء فاتورة مبيعات مع إرسال البنود بترتيب معكوس (المعرف الكبير أولاً)
  v_inv_id := public.create_invoice_with_cash_box(
    'sale',
    v_customer_a,
    v_wh_a,
    current_date,
    150,
    'فاتورة ترتيب أقفال',
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_1, 'qty', 1, 'unit_price', 100),
      jsonb_build_object('item_id', v_item_2, 'qty', 1, 'unit_price', 50)
    ),
    v_cash_box_a
  );

  if v_inv_id is null then
    raise exception 'Failed to create invoice with ordered lines';
  end if;

  -- التأكد من خصم المخزون بشكل دقيق
  select qty into v_stock_1 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_1;
  select qty into v_stock_2 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_2;

  if v_stock_1 <> 99 or v_stock_2 <> 99 then
    raise exception 'Stock movement did not deduct correctly: item_1=%, item_2=%', v_stock_1, v_stock_2;
  end if;

  -- 6) تعديل الفاتورة مع تغيير الكميات
  perform public.update_invoice_with_cash_box(
    v_inv_id,
    v_customer_a,
    v_wh_a,
    current_date,
    250,
    'فاتورة معدلة',
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_1, 'qty', 2, 'unit_price', 100),
      jsonb_build_object('item_id', v_item_2, 'qty', 1, 'unit_price', 50)
    ),
    v_cash_box_a
  );

  select qty into v_stock_1 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_1;
  if v_stock_1 <> 98 then
    raise exception 'Updated invoice stock delta mismatch: item_1=%', v_stock_1;
  end if;

  -- 7) حذف الفاتورة واستعادتها للتأكد من ترتيب الأقفال
  perform public.delete_invoice(v_inv_id);
  select qty into v_stock_1 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_1;
  select qty into v_stock_2 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_2;
  if v_stock_1 <> 100 or v_stock_2 <> 100 then
    raise exception 'Delete invoice did not restore stock properly';
  end if;

  perform public.restore_invoice(v_inv_id);
  select qty into v_stock_1 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_1;
  select qty into v_stock_2 from public.item_stock where warehouse_id = v_wh_a and item_id = v_item_2;
  if v_stock_1 <> 98 or v_stock_2 <> 99 then
    raise exception 'Restore invoice did not deduct stock properly';
  end if;

  -- 8) عزل الشركات: مستخدم الشركة ب لا يمكنه تعديل أو حذف فاتورة الشركة أ
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);

  begin
    perform public.update_invoice_with_cash_box(
      v_inv_id,
      v_customer_a,
      v_wh_a,
      current_date,
      0,
      'تعديل خبيث من ب',
      jsonb_build_array(jsonb_build_object('item_id', v_item_1, 'qty', 1, 'unit_price', 100)),
      null
    );
    raise exception 'Security breach: Company B was able to update Company A invoice';
  exception when invalid_parameter_value then
    -- invoice_not_found (22023) expected
    null;
  end;

  begin
    perform public.delete_invoice(v_inv_id);
    raise exception 'Security breach: Company B was able to delete Company A invoice';
  exception when invalid_parameter_value then
    null;
  end;

end $$;

rollback;

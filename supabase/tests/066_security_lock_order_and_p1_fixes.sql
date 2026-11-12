-- =====================================================================
-- 066_security_lock_order_and_p1_fixes.sql
-- اختبارات المرحلة 4:
-- 1. منع استعادة فاتورة شراء محذوفة بعد حدوث حركات خروج لاحقة على أصنافها.
-- 2. منع تغيير تاريخ فاتورة شراء عليها حركات خروج لاحقة (أو إرجاعها للخلف عبر حركة خروج).
-- 3. منع تسريب purchase_price عبر الاستعلام المباشر لجدول items أو عبر filter_master_item_rows
--    للكاشير/أمين المخزن/المشاهد، ومنع تعديل purchase_price من غير المصرح لهم.
-- 4. رفض الخزنة الوجهة غير النشطة في update_free_receipt (في اتجاهي مقارنة UUID) و create_cash_box_transfer.
-- 5. استبعاد الفواتير والإيصالات المستقبلية (> cairo_today()) من لوحة التحكم والرسوم البيانية.
-- 6. سلامة عزل الشركات ومنع دور anon.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '66666666-6666-4666-8666-0000000000a1';
  v_comp_b uuid := '66666666-6666-4666-8666-0000000000b1';
  v_owner_a uuid := '66666666-6666-4666-8666-000000000001';
  v_emp_a   uuid := '66666666-6666-4666-8666-000000000002';
  v_owner_b uuid := '66666666-6666-4666-8666-000000000003';

  v_wh_1 uuid;
  v_wh_2 uuid;
  v_box_low uuid := '66666666-6666-4666-8666-000000000011';
  v_box_high uuid := '66666666-6666-4666-8666-000000000099';
  v_box_inactive uuid := '66666666-6666-4666-8666-000000000022';
  v_cus_a uuid;
  v_sup_a uuid;
  v_item_a uuid;
  v_pur_id uuid;
  v_pur_id2 uuid;
  v_rcp_id uuid;
  v_trf_id uuid;
  v_summary jsonb;
  v_charts jsonb;
  v_masked_price numeric;
  v_visible_price numeric;
  v_denied boolean;
begin
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner66a@test.local'),
    (v_emp_a,   'authenticated', 'authenticated', 'emp66a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner66b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة المرحلة 4 أ'),
    (v_comp_b, 'شركة المرحلة 4 ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_emp_a,   v_comp_a, 'موظف أ', 'employee', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        access_role = excluded.access_role,
        is_active = true;

  insert into public.cash_boxes (id, company_id, name, is_primary, is_active, opening_balance, current_balance)
  values
    (v_box_low,      v_comp_a, 'خزنة صغرى', true,  true,  2000, 2000),
    (v_box_high,     v_comp_a, 'خزنة كبرى', false, true,  2000, 2000),
    (v_box_inactive, v_comp_a, 'خزنة موقوفة', false, false, 500, 500);

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_wh_1 := public.create_warehouse('مخزن 66 أ1', null);
  v_wh_2 := public.create_warehouse('مخزن 66 أ2', null);
  v_cus_a := public.save_account_with_notes(null, 'عميل 66', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 66', 'supplier', null, true, 0, null);
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 66', 'قطعة', 150, 95, true, v_wh_1, 10, 80, null, 'ITM-66'
  );

  -- -------------------------------------------------------------------
  -- 1) منع استعادة فاتورة شراء محذوفة بعد حدوث حركة خروج لاحقة
  -- -------------------------------------------------------------------
  v_pur_id := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-10-01'::date, 0, 'شراء أول',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 10, 'unit_price', 120)),
    v_box_low
  );

  -- حذف فاتورة الشراء قبل وجود مبيعات لاحقة (مسموح)
  perform public.delete_invoice(v_pur_id);

  -- تسجيل حركة بيع لاحقة (من الرصيد الافتتاحي) بعد تاريخ فاتورة الشراء المحذوفة
  perform public.create_invoice(
    'sale', v_cus_a, v_wh_1, '2026-10-02'::date, 150, 'بيع 1',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 150)),
    v_box_low
  );

  -- محاولة استعادة فاتورة الشراء القديمة يجب أن تُرفض
  v_denied := false;
  begin
    perform public.restore_invoice(v_pur_id);
  exception when others then
    if sqlerrm = 'cannot_restore_purchase_with_subsequent_sales' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected restore_invoice on purchase with subsequent sale to be rejected';
  end if;

  -- -------------------------------------------------------------------
  -- 2) منع تغيير تاريخ فاتورة شراء عليها حركات خروج لاحقة
  -- -------------------------------------------------------------------
  v_pur_id2 := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-10-03'::date, 100, 'شراء ثانٍ',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 5, 'unit_price', 110)),
    v_box_low
  );
  perform public.create_invoice(
    'sale', v_cus_a, v_wh_1, '2026-10-04'::date, 0, 'بيع لاحق',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 150)),
    v_box_low
  );

  -- محاولة تأخير تاريخ الشراء إلى 2026-10-05 لتجاوز فحص الحركات اللاحقة يجب أن تُرفض
  v_denied := false;
  begin
    perform public.update_invoice(
      v_pur_id2, v_sup_a, v_wh_1, '2026-10-05'::date, 100, 'تغيير تاريخ',
      jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 5, 'unit_price', 110)),
      v_box_low
    );
  exception when others then
    if sqlerrm = 'cannot_modify_purchase_date_with_subsequent_sales' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected update_invoice changing purchase invoice_date with later sale to fail';
  end if;

  -- مع بقاء نفس التاريخ يُسمح بتعديل الملاحظات/الخزنة
  perform public.update_invoice(
    v_pur_id2, v_sup_a, v_wh_1, '2026-10-03'::date, 100, 'ملاحظة محدثة',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 5, 'unit_price', 110)),
    v_box_high
  );

  -- -------------------------------------------------------------------
  -- 3) حماية purchase_price في items و Views و filter_master_item_rows
  -- -------------------------------------------------------------------
  -- موظف كاشير/مخزن لديه data.items.view + data.items.edit + goods.sale.create فقط (بدون مشتريات أو أرباح)
  perform public.set_user_permissions(
    v_emp_a,
    array['data.items.view', 'data.items.edit', 'goods.sale.view', 'goods.sale.create', 'balances.items.view']
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  -- أ) الاستعلام المباشر لعمود purchase_price من جدول items يجب أن يفشل
  v_denied := false;
  begin
    execute format('select purchase_price from public.items where id = %L', v_item_a);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Direct SELECT on items.purchase_price must fail for authenticated users';
  end if;

  -- ب) الـ Views والدوال ترجع purchase_price = NULL للكاشير/أمين المخزن
  select purchase_price into v_masked_price from public.v_warehouse_items where item_id = v_item_a and warehouse_id = v_wh_1;
  if v_masked_price is not null then
    raise exception 'v_warehouse_items leaked purchase_price=% to cashier/warehouse role', v_masked_price;
  end if;

  select purchase_price into v_masked_price from public.v_item_stock where id = v_item_a;
  if v_masked_price is not null then
    raise exception 'v_item_stock leaked purchase_price=% to cashier/warehouse role', v_masked_price;
  end if;

  select purchase_price into v_masked_price from public.filter_master_item_rows('{}'::jsonb, null) where id = v_item_a;
  if v_masked_price is not null then
    raise exception 'filter_master_item_rows leaked purchase_price=% to data.items.view role', v_masked_price;
  end if;

  -- ج) محاولة التخمين عبر فلترة purchase_price في filter_master_item_rows أو KPIs يجب أن تُرفض
  v_denied := false;
  begin
    perform * from public.filter_master_item_rows('{"purchase_price":"95"}'::jsonb, null);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected filtering on purchase_price to be denied without purchase/profit permission';
  end if;

  v_denied := false;
  begin
    perform public.get_master_items_kpis_columns('{"purchase_price":"95"}'::jsonb, null, 'all');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected KPI filtering on purchase_price to be denied without purchase/profit permission';
  end if;

  -- د) محاولة تعديل purchase_price مباشرة عبر UPDATE items يجب أن تُرفض بينما تعديل sale_price مسموح
  v_denied := false;
  begin
    update public.items set purchase_price = 1 where id = v_item_a;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected direct UPDATE of purchase_price on items to fail for data.items.edit without purchase/profit permission';
  end if;

  update public.items set sale_price = 160 where id = v_item_a;

  -- هـ) موظف لديه goods.purchase.view يرى purchase_price بشكل طبيعي
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.set_user_permissions(v_emp_a, array['data.items.view', 'goods.purchase.view']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  select purchase_price into v_visible_price from public.v_item_stock where id = v_item_a;
  if v_visible_price <> 95 then
    raise exception 'Expected goods.purchase.view employee to see purchase_price 95, got %', v_visible_price;
  end if;

  -- -------------------------------------------------------------------
  -- 4) رفض الخزنة غير النشطة في update_free_receipt (في كلا الاتجاهين) و create_cash_box_transfer
  -- -------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  -- هنا v_box_high (...0099) > v_box_inactive (...0022)، وهي الحالة التي كانت تُخفي خطأ FOUND
  v_rcp_id := public.create_free_receipt(v_cus_a, v_box_high, public.cairo_today(), 100, null, null, 'in');
  v_denied := false;
  begin
    perform public.update_free_receipt(v_rcp_id, v_cus_a, v_box_inactive, public.cairo_today(), 100, null, null);
  exception when others then
    if sqlerrm = 'invalid_cash_box' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected update_free_receipt to reject inactive destination cash box when old > new';
  end if;

  -- و create_cash_box_transfer إلى خزنة غير نشطة يجب أن يُرفض أيضاً
  v_denied := false;
  begin
    perform public.create_cash_box_transfer(v_box_high, v_box_inactive, public.cairo_today(), 100, null);
  exception when others then
    if sqlerrm = 'invalid_cash_box' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected create_cash_box_transfer to reject inactive destination cash box';
  end if;

  -- -------------------------------------------------------------------
  -- 5) استبعاد المستندات ذات التواريخ المستقبلية من لوحة التحكم والرسوم البيانية
  -- -------------------------------------------------------------------
  perform public.create_invoice(
    'sale', v_cus_a, v_wh_1, public.cairo_today(), 200, 'بيع اليوم',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 200)),
    v_box_low
  );
  perform public.create_invoice(
    'sale', v_cus_a, v_wh_1, public.cairo_today() + 3, 500, 'بيع مستقبلي',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 250)),
    v_box_low
  );
  perform public.create_free_receipt(v_cus_a, v_box_low, public.cairo_today() + 3, 777, 'تحصيل مستقبلي', null, 'in');

  v_summary := public.get_home_dashboard_summary();
  v_charts := public.get_home_dashboard_charts(30);

  if (v_summary->'sales'->>'month')::numeric <> 200 then
    raise exception 'Expected month sales to exclude future invoice (should be 200), got %', v_summary->'sales'->>'month';
  end if;
  if (v_summary->'collections'->>'today')::numeric <> 300 then
    raise exception 'Expected today collections to exclude future receipt (should be 300), got %', v_summary->'collections'->>'today';
  end if;
  if ((v_charts->'sales_distribution'->>'cash_sales')::numeric + (v_charts->'sales_distribution'->>'credit_sales')::numeric) <> 200 then
    raise exception 'Expected chart sales_distribution to exclude future invoice, got %', v_charts->'sales_distribution';
  end if;

  -- -------------------------------------------------------------------
  -- 6) التحويلات المخزنية بالأقفال الموحدة (إنشاء، تعديل، حذف، استعادة)
  -- -------------------------------------------------------------------
  v_trf_id := public.create_warehouse_transfer(
    v_wh_1, v_wh_2, public.cairo_today(), 'تحويل 1',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 3))
  );
  perform public.update_warehouse_transfer(
    v_trf_id, v_wh_1, v_wh_2, public.cairo_today(), 'تحويل 1 معدل',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2))
  );
  perform public.delete_warehouse_transfer(v_trf_id);
  perform public.restore_warehouse_transfer(v_trf_id);

  if (select qty from public.item_stock where warehouse_id = v_wh_2 and item_id = v_item_a) <> 2 then
    raise exception 'Expected destination stock 2 after transfer restore';
  end if;

  -- -------------------------------------------------------------------
  -- 7) عزل الشركات ودور anon
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  if public.read_protected_purchase_price(v_item_a) is not null then
    raise exception 'Company B must not read Company A purchase_price';
  end if;

  set local role anon;
  v_denied := false;
  begin
    perform public.read_protected_purchase_price(v_item_a);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'anon must not execute read_protected_purchase_price';
  end if;
end $$;

rollback;

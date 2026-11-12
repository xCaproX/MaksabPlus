-- =====================================================================
-- 069_cross_trading_returns_and_decimal_edges.sql
-- اختبارات المرحلة 4:
-- 1. التبادل التجاري المركب (Cross-Trading) للعميل والمورد مع المرتجعات وتعديل/حذف/استعادة الفواتير
--    ومطابقة الكشوف ونتيجة run_comprehensive_reconciliation.
-- 2. الحالات الحدية للكميات العشرية (0.3333, 0.5833, 0.0001) في الفواتير والتحويلات المخزنية
--    وتعديل الفواتير والمطابقة الشاملة، ورفض الكمية الصفرية أو السالبة.
-- 3. عزل الشركات (A/B) ومنع دور anon.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '69696969-6969-4696-8696-0000000000a1';
  v_comp_b uuid := '69696969-6969-4696-8696-0000000000b1';
  v_owner_a uuid := '69696969-6969-4696-8696-000000000001';
  v_owner_b uuid := '69696969-6969-4696-8696-000000000002';

  v_wh_1 uuid;
  v_wh_2 uuid;
  v_cb_a uuid;
  v_cus_ct uuid;
  v_sup_ct uuid;

  v_item_ct uuid;
  v_item_dec uuid;
  v_item_dec_edit uuid;

  v_pur_from_cus uuid;
  v_sale_ret_cus uuid;
  v_pur_dec_edit uuid;

  v_bal numeric(18,4);
  v_stmt_bal numeric(18,4);
  v_qty numeric(18,4);
  v_avg numeric(18,4);
  v_rec jsonb;
  v_err boolean;
begin
  if has_function_privilege('anon', 'public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb, uuid)', 'execute')
     or has_function_privilege('anon', 'public.create_warehouse_transfer(uuid, uuid, date, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.get_account_statement(uuid, date, date)', 'execute') then
    raise exception 'RPCs must not be executable by anon';
  end if;

  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner69a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner69b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة المرحلة 4 أ'),
    (v_comp_b, 'شركة المرحلة 4 ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك 69 أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك 69 ب', 'owner', true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        access_role = excluded.access_role,
        is_active = true;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_wh_1 := public.create_warehouse('مخزن 69 رئيسي', null);
  v_wh_2 := public.create_warehouse('مخزن 69 فرعي', null);
  v_cb_a := public.create_cash_box_with_opening_balance_and_notes('خزنة 69', 10000, null);
  v_cus_ct := public.save_account_with_notes(null, 'عميل مقاصة مركبة', 'customer', null, true, 500, null);
  v_sup_ct := public.save_account_with_notes(null, 'مورد مقاصة مركبة', 'supplier', null, true, 1000, null);

  v_item_ct := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف مقاصة', 'قطعة', 100, 50, true, v_wh_1, 50, 50, null, 'ITM-69-CT'
  );
  v_item_dec := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف عشري', 'كجم', 60, 30, true, v_wh_1, 0, 0, null, 'ITM-69-DEC'
  );
  v_item_dec_edit := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف عشري للتعديل', 'كجم', 60, 30, true, v_wh_1, 0, 0, null, 'ITM-69-DECE'
  );

  -- -------------------------------------------------------------------
  -- 1) التبادل التجاري المركب للعميل: بيع + شراء + مرتجع شراء + تعديل شراء + مرتجع بيع + حذف/استعادة
  -- -------------------------------------------------------------------
  -- أ) بيع للعميل: 1000 مدفوع 200 => الرصيد = 500 + 800 = 1300
  perform public.create_invoice(
    'sale', v_cus_ct, v_wh_1, '2026-11-01'::date, 200, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 10, 'unit_price', 100)),
    v_cb_a
  );

  -- ب) شراء من العميل: 600 مدفوع 100 => الرصيد = 1300 - 500 = 800
  v_pur_from_cus := public.create_invoice(
    'purchase', v_cus_ct, v_wh_1, '2026-11-02'::date, 100, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 12, 'unit_price', 50)),
    v_cb_a
  );

  -- ج) مرتجع شراء للعميل: 200 مدفوع 50 (استرداد نقدي) => يزيد رصيد العميل +150 => 950
  -- (يستخدم صنفاً بلا خروج لاحق للشراء، أو لاحقاً نعدل فاتورة الشراء قبل استخدام أصناف مرتبطة بغيره — لذا نربط مرتجع الشراء بعد تعديل الشراء، أو نستخدم v_item_dec_edit)
  -- أولاً نختبر تعديل فاتورة الشراء من العميل قبل أي خروج على تاريخها (تعديل الإجمالي من 600 إلى 400، مدفوع 100 => الرصيد = 800 + 200 = 1000)
  perform public.update_invoice(
    v_pur_from_cus, v_cus_ct, v_wh_1, '2026-11-02'::date, 100, 'تعديل شراء من عميل',
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 8, 'unit_price', 50)),
    v_cb_a
  );
  select current_balance into v_bal from public.accounts where id = v_cus_ct;
  if v_bal <> 1000 then
    raise exception 'Expected customer cross-trade balance 1000 after purchase update, got %', v_bal;
  end if;

  -- د) الآن مرتجع شراء للعميل: 200 مدفوع 50 => صافي +150 => الرصيد = 1150
  perform public.create_invoice(
    'purchase_return', v_cus_ct, v_wh_1, '2026-11-03'::date, 50, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 4, 'unit_price', 50)),
    v_cb_a
  );

  -- هـ) مرتجع بيع من العميل: 300 مدفوع 50 => صافي -250 => الرصيد = 900
  v_sale_ret_cus := public.create_invoice(
    'sale_return', v_cus_ct, v_wh_1, '2026-11-04'::date, 50, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 3, 'unit_price', 100)),
    v_cb_a
  );

  select current_balance into v_bal from public.accounts where id = v_cus_ct;
  if v_bal <> 900 then
    raise exception 'Expected customer cross-trade balance 900 after returns, got %', v_bal;
  end if;

  -- حذف مرتجع البيع ثم استعادته
  perform public.delete_invoice(v_sale_ret_cus);
  select current_balance into v_bal from public.accounts where id = v_cus_ct;
  if v_bal <> 1150 then
    raise exception 'Expected customer cross-trade balance 1150 after deleting sale_return, got %', v_bal;
  end if;

  perform public.restore_invoice(v_sale_ret_cus);
  select current_balance into v_bal from public.accounts where id = v_cus_ct;
  if v_bal <> 900 then
    raise exception 'Expected customer cross-trade balance 900 after restoring sale_return, got %', v_bal;
  end if;

  select running_balance into v_stmt_bal
  from public.get_account_statement(v_cus_ct, '2026-11-01'::date, '2026-11-30'::date)
  order by transaction_date desc, running_balance asc
  limit 1;
  -- التحقق من آخر صف في كشف حساب العميل
  select running_balance into v_stmt_bal
  from (
    select running_balance, row_number() over () as rn
    from public.get_account_statement(v_cus_ct, '2026-11-01'::date, '2026-11-30'::date)
  ) s
  order by rn desc limit 1;
  if v_stmt_bal <> 900 then
    raise exception 'Expected customer statement closing balance 900, got %', v_stmt_bal;
  end if;

  -- -------------------------------------------------------------------
  -- 2) التبادل التجاري المركب للمورد: افتتاحي 1000 + شراء (2000/500) + بيع (900/200) + مرتجع بيع (300/0) = 2100
  -- -------------------------------------------------------------------
  perform public.create_invoice(
    'purchase', v_sup_ct, v_wh_1, '2026-11-01'::date, 500, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 40, 'unit_price', 50)),
    v_cb_a
  );
  perform public.create_invoice(
    'sale', v_sup_ct, v_wh_1, '2026-11-02'::date, 200, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 9, 'unit_price', 100)),
    v_cb_a
  );
  perform public.create_invoice(
    'sale_return', v_sup_ct, v_wh_1, '2026-11-03'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_ct, 'qty', 3, 'unit_price', 100)),
    v_cb_a
  );

  select current_balance into v_bal from public.accounts where id = v_sup_ct;
  if v_bal <> 2100 then
    raise exception 'Expected supplier cross-trade balance 2100, got %', v_bal;
  end if;

  select running_balance into v_stmt_bal
  from (
    select running_balance, row_number() over () as rn
    from public.get_account_statement(v_sup_ct, '2026-11-01'::date, '2026-11-30'::date)
  ) s
  order by rn desc limit 1;
  if v_stmt_bal <> 2100 then
    raise exception 'Expected supplier statement closing balance 2100, got %', v_stmt_bal;
  end if;

  -- -------------------------------------------------------------------
  -- 3) الحالات الحدية للكميات العشرية في الفواتير والتحويلات المخزنية
  -- -------------------------------------------------------------------
  perform public.create_invoice(
    'purchase', v_sup_ct, v_wh_1, '2026-11-05'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 0.3333, 'unit_price', 30)),
    v_cb_a
  );
  perform public.create_invoice(
    'purchase', v_sup_ct, v_wh_1, '2026-11-05'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 1.2500, 'unit_price', 40)),
    v_cb_a
  );

  select current_qty, unit_cost into v_qty, v_avg
  from public.v_warehouse_items where warehouse_id = v_wh_1 and item_id = v_item_dec;
  if v_qty <> 1.5833 or v_avg <> 37.8949 then
    raise exception 'Expected WH1 qty 1.5833 and avg_cost 37.8949, got qty=%, avg=%', v_qty, v_avg;
  end if;

  -- تحويل مخزني عشري 0.5833 => يتبقى 1.0000 في WH1 و 0.5833 في WH2
  perform public.create_warehouse_transfer(
    v_wh_1, v_wh_2, '2026-11-06'::date, 'تحويل كمية عشرية',
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 0.5833))
  );

  select current_qty into v_qty from public.v_warehouse_items where warehouse_id = v_wh_1 and item_id = v_item_dec;
  if v_qty <> 1.0000 then
    raise exception 'Expected WH1 qty 1.0000 after decimal transfer, got %', v_qty;
  end if;

  -- بيع عشري حتى آخر 0.0001
  perform public.create_invoice(
    'sale', v_cus_ct, v_wh_2, '2026-11-07'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 0.5832, 'unit_price', 60)),
    v_cb_a
  );

  v_err := false;
  begin
    perform public.create_invoice(
      'sale', v_cus_ct, v_wh_2, '2026-11-07'::date, 0, null,
      jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 0.0002, 'unit_price', 60)),
      v_cb_a
    );
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected sale of 0.0002 when only 0.0001 remains to fail';
  end if;

  perform public.create_invoice(
    'sale', v_cus_ct, v_wh_2, '2026-11-07'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec, 'qty', 0.0001, 'unit_price', 60)),
    v_cb_a
  );

  select current_qty into v_qty from public.v_warehouse_items where warehouse_id = v_wh_2 and item_id = v_item_dec;
  if v_qty <> 0 then
    raise exception 'Expected WH2 qty 0 after exhausting exact 0.0001 remainder, got %', v_qty;
  end if;

  -- تعديل كمية عشرية في فاتورة شراء 0.3333 -> 0.5000
  v_pur_dec_edit := public.create_invoice(
    'purchase', v_sup_ct, v_wh_1, '2026-11-07'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec_edit, 'qty', 0.3333, 'unit_price', 30)),
    v_cb_a
  );
  perform public.update_invoice(
    v_pur_dec_edit, v_sup_ct, v_wh_1, '2026-11-07'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_dec_edit, 'qty', 0.5000, 'unit_price', 30)),
    v_cb_a
  );
  select current_qty into v_qty from public.v_warehouse_items where warehouse_id = v_wh_1 and item_id = v_item_dec_edit;
  if v_qty <> 0.5000 then
    raise exception 'Expected decimal qty 0.5000 after update_invoice, got %', v_qty;
  end if;

  -- رفض كمية تحويل صفرية أو سالبة
  v_err := false;
  begin
    perform public.create_warehouse_transfer(
      v_wh_1, v_wh_2, '2026-11-07'::date, null,
      jsonb_build_array(jsonb_build_object('item_id', v_item_dec_edit, 'qty', 0))
    );
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected zero-qty warehouse transfer to fail';
  end if;

  -- مطابقة شاملة نظيفة بعد كل عمليات المقاصة والكميات العشرية
  v_rec := public.run_comprehensive_reconciliation('simulation', 'تحقق نهاية المرحلة 4');
  if coalesce((v_rec->>'discrepancies_count')::integer, -1) <> 0 or v_rec->>'status' <> 'clean' then
    raise exception 'Expected clean comprehensive reconciliation after cross-trading & decimal ops, got %', v_rec;
  end if;

  -- -------------------------------------------------------------------
  -- 4) عزل شركة B عن كشوف ومستندات شركة A
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  v_err := false;
  begin
    perform * from public.get_account_statement(v_cus_ct, '2026-11-01'::date, '2026-11-30'::date);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Company B must not access Company A cross-trading account statement';
  end if;
end $$;

rollback;

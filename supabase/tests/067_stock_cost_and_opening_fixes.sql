-- =====================================================================
-- 067_stock_cost_and_opening_fixes.sql
-- اختبارات المرحلة 1:
-- 1. عدم مسح avg_cost في المخزن الفرعي عند حفظ save_opening_balances بكمية 0.
-- 2. تحديث avg_cost بدقة عند تقليل كمية فاتورة شراء أو إزالة صنف منها.
-- 3. نجاح حذف فاتورة شراء رغم انحراف تقريب الكسور العشرية (1 @ 1 ثم 2 @ 0)،
--    مع استمرار رفض التكلفة السالبة الحقيقية.
-- 4. منع تعديل/حذف فاتورة الشراء إذا وُجدت حركة خروج لاحقة أُنشئت بعدها حتى لو بتاريخ أقدم.
-- 5. عزل الشركات (A/B) ومنع دور anon وتقييد الدوال المساعدة الداخلية.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '67676767-6767-4676-8676-0000000000a1';
  v_comp_b uuid := '67676767-6767-4676-8676-0000000000b1';
  v_owner_a uuid := '67676767-6767-4676-8676-000000000001';
  v_owner_b uuid := '67676767-6767-4676-8676-000000000002';

  v_wh_1 uuid;
  v_wh_2 uuid;
  v_cb_a uuid;
  v_cus_a uuid;
  v_sup_a uuid;

  v_item_1 uuid;
  v_item_2 uuid;
  v_item_2b uuid;
  v_item_3 uuid;
  v_item_4 uuid;

  v_pur_2 uuid;
  v_pur_3 uuid;
  v_pur_4 uuid;
  v_avg numeric(18,4);
  v_qty numeric(18,4);
  v_denied boolean;
begin
  -- التحقق من سحب الدوال المساعدة الداخلية عن authenticated و anon
  if has_function_privilege('authenticated', 'public.apply_stock_movement(uuid, uuid, uuid, numeric, numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.purchase_invoice_has_later_outflow(uuid)', 'execute') then
    raise exception 'Internal stock helpers must remain revoked from authenticated';
  end if;

  if has_function_privilege('anon', 'public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid)', 'execute')
     or has_function_privilege('anon', 'public.save_opening_balances(jsonb, jsonb)', 'execute') then
    raise exception 'Invoice/opening RPCs must not be executable by anon';
  end if;

  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner67a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner67b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة المرحلة 1 أ'),
    (v_comp_b, 'شركة المرحلة 1 ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        access_role = excluded.access_role,
        is_active = true;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_wh_1 := public.create_warehouse('مخزن 67 رئيسي', null);
  v_wh_2 := public.create_warehouse('مخزن 67 فرعي', null);
  v_cb_a := public.create_cash_box_with_opening_balance_and_notes('خزنة 67', 5000, null);
  v_cus_a := public.save_account_with_notes(null, 'عميل 67', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 67', 'supplier', null, true, 0, null);

  -- -------------------------------------------------------------------
  -- 1) حفظ الافتتاحيات بكمية 0 في مخزن فرعي لا يمسح avg_cost الفعلي
  -- -------------------------------------------------------------------
  v_item_1 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 1', 'قطعة', 200, 90, true, v_wh_1, 10, 80, null, 'ITM-67-1'
  );
  perform public.create_invoice(
    'purchase', v_sup_a, v_wh_2, '2026-11-01'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_1, 'qty', 10, 'unit_price', 150)),
    v_cb_a
  );
  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('warehouse_id', v_wh_2, 'item_id', v_item_1, 'opening_qty', 0, 'unit_cost', 90))
  );
  v_avg := public.read_protected_cost('stock', v_item_1, v_wh_2);
  if v_avg <> 150 then
    raise exception 'Expected WH2 avg_cost to remain 150 after zero-qty opening save, got %', v_avg;
  end if;

  -- -------------------------------------------------------------------
  -- 2) تقليل كمية فاتورة شراء أو حذف صنف منها يعيد حساب avg_cost بدقة
  -- -------------------------------------------------------------------
  v_item_2 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 2', 'قطعة', 300, 100, true, v_wh_1, 0, 0, null, 'ITM-67-2'
  );
  v_item_2b := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 2 ب', 'قطعة', 300, 50, true, v_wh_1, 0, 0, null, 'ITM-67-2B'
  );
  perform public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-01'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_2, 'qty', 10, 'unit_price', 100)),
    v_cb_a
  );
  v_pur_2 := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-02'::date, 0, null,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_2, 'qty', 10, 'unit_price', 200),
      jsonb_build_object('item_id', v_item_2b, 'qty', 5, 'unit_price', 50)
    ),
    v_cb_a
  );
  -- تقليل كمية صنف 2 من 10 إلى 2 بنفس السعر 200 => (10*100 + 2*200)/12 = 116.6667
  perform public.update_invoice(
    v_pur_2, v_sup_a, v_wh_1, '2026-11-02'::date, 0, null,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_2, 'qty', 2, 'unit_price', 200),
      jsonb_build_object('item_id', v_item_2b, 'qty', 5, 'unit_price', 50)
    ),
    v_cb_a
  );
  v_avg := public.read_protected_cost('stock', v_item_2, v_wh_1);
  if v_avg <> 116.6667 then
    raise exception 'Expected avg_cost 116.6667 after reducing purchase qty, got %', v_avg;
  end if;

  -- حذف صنف 2 بالكامل من فاتورة الشراء الثانية => يعود المتوسط إلى 100.0000
  perform public.update_invoice(
    v_pur_2, v_sup_a, v_wh_1, '2026-11-02'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_2b, 'qty', 5, 'unit_price', 50)),
    v_cb_a
  );
  v_avg := public.read_protected_cost('stock', v_item_2, v_wh_1);
  if v_avg <> 100 then
    raise exception 'Expected avg_cost 100 after removing item from purchase invoice, got %', v_avg;
  end if;

  -- -------------------------------------------------------------------
  -- 3) حذف فاتورة شراء رغم انحراف تقريب الكسور (1 @ 1 ثم 2 @ 0)
  -- -------------------------------------------------------------------
  v_item_3 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 3', 'قطعة', 10, 1, true, v_wh_1, 0, 0, null, 'ITM-67-3'
  );
  v_pur_3 := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-01'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_3, 'qty', 1, 'unit_price', 1)),
    v_cb_a
  );
  perform public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-02'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_3, 'qty', 2, 'unit_price', 0)),
    v_cb_a
  );
  perform public.delete_invoice(v_pur_3);

  select current_qty into v_qty from public.v_warehouse_items where warehouse_id = v_wh_1 and item_id = v_item_3;
  v_avg := public.read_protected_cost('stock', v_item_3, v_wh_1);
  if v_qty <> 2 or v_avg <> 0 then
    raise exception 'Expected qty=2 and avg_cost=0 after rounding-safe purchase delete, got qty=%, avg=%', v_qty, v_avg;
  end if;

  -- -------------------------------------------------------------------
  -- 4) منع تعديل/حذف فاتورة شراء بعد بيع لاحق أُنشئ بتاريخ أقدم
  -- -------------------------------------------------------------------
  v_item_4 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 4', 'قطعة', 200, 100, true, v_wh_1, 5, 100, null, 'ITM-67-4'
  );
  v_pur_4 := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-10'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_4, 'qty', 10, 'unit_price', 100)),
    v_cb_a
  );
  perform public.create_invoice(
    'sale', v_cus_a, v_wh_1, '2026-11-05'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_4, 'qty', 5, 'unit_price', 200)),
    v_cb_a
  );

  v_denied := false;
  begin
    perform public.update_invoice(
      v_pur_4, v_sup_a, v_wh_1, '2026-11-10'::date, 0, null,
      jsonb_build_array(jsonb_build_object('item_id', v_item_4, 'qty', 10, 'unit_price', 10)),
      v_cb_a
    );
  exception when others then
    if sqlerrm = 'cannot_modify_purchase_items_with_subsequent_sales' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected backdated sale created after purchase to lock purchase item/price edits';
  end if;

  v_denied := false;
  begin
    perform public.delete_invoice(v_pur_4);
  exception when others then
    if sqlerrm = 'cannot_delete_purchase_with_subsequent_sales' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Expected backdated sale created after purchase to lock purchase delete';
  end if;

  -- -------------------------------------------------------------------
  -- 5) عزل الشركات (B لا يعدل فواتير A) ومنع anon
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  v_denied := false;
  begin
    perform public.update_invoice(
      v_pur_2, v_sup_a, v_wh_1, '2026-11-02'::date, 0, null,
      jsonb_build_array(jsonb_build_object('item_id', v_item_2b, 'qty', 5, 'unit_price', 50)),
      v_cb_a
    );
  exception when others then
    if sqlerrm = 'invoice_not_found' then
      v_denied := true;
    end if;
  end;
  if not v_denied then
    raise exception 'Company B must not modify Company A invoice';
  end if;

  set local role anon;
  v_denied := false;
  begin
    perform public.save_opening_balances('[]'::jsonb, '[]'::jsonb);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'anon must not execute save_opening_balances';
  end if;
end $$;

rollback;

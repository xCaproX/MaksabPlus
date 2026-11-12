-- =====================================================================
-- 068_reconciliation_statements_locks_and_cashbox.sql
-- اختبارات المرحلة 2:
-- 1. شمول الأصناف والمخازن المعطلة ذات الأرصدة/الحركات في run_comprehensive_reconciliation.
-- 2. رفض الرصيد الافتتاحي السالب للخزن في الإنشاء وفي save_opening_balances.
-- 3. توحيد توقيت Africa/Cairo (مثال 22:30 UTC = 00:30 Cairo اليوم التالي) في الكشوف الثلاثة.
-- 4. فحص warehouse_transfer_has_later_movement مع stock_opening_balances
--    و v_stock_opening_balances.cost_locked مع المحذوف والتحويلات.
-- 5. منع restore_invoice على حساب أو مخزن أو صنف معطل.
-- 6. شمول الخزن والحسابات المعطلة ذات الأرصدة في get_home_dashboard_summary.
-- 7. عزل شركة A/B ومنع دور anon وتقييد الدوال المساعدة الداخلية.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '68686868-6868-4686-8686-0000000000a1';
  v_comp_b uuid := '68686868-6868-4686-8686-0000000000b1';
  v_owner_a uuid := '68686868-6868-4686-8686-000000000001';
  v_owner_b uuid := '68686868-6868-4686-8686-000000000002';

  v_wh_1 uuid;
  v_wh_2 uuid;
  v_wh_tmp uuid;
  v_cb_a uuid;
  v_cb_tz uuid;
  v_cb_inact uuid;

  v_cus_a uuid;
  v_cus_tz uuid;
  v_cus_inact uuid;
  v_sup_a uuid;
  v_sup_inact uuid;

  v_item_1 uuid;
  v_item_2 uuid;
  v_item_3 uuid;
  v_item_tz uuid;
  v_item_act uuid;

  v_tr_1 uuid;
  v_sale_inv uuid;
  v_pur_tmp uuid;

  v_rec jsonb;
  v_summary jsonb;
  v_cost_locked boolean;
  v_cnt integer;
  v_qty numeric(18,4);
  v_err boolean;
begin
  -- 0) التحقق من صلاحيات anon و authenticated على الدوال الداخلية والحساسة
  if has_function_privilege('anon', 'public.run_comprehensive_reconciliation(text, text)', 'execute')
     or has_function_privilege('anon', 'public.create_cash_box_with_opening_balance_and_notes(text, numeric, text)', 'execute')
     or has_function_privilege('anon', 'public.save_opening_balances(jsonb, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.restore_invoice(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_home_dashboard_summary()', 'execute')
     or has_function_privilege('anon', 'public.get_account_statement(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_cash_box_statement(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_item_movement_statement(uuid, uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid)', 'execute') then
    raise exception 'RPCs must not be executable by anon';
  end if;

  if has_function_privilege('authenticated', 'public.warehouse_transfer_has_later_movement(uuid)', 'execute') then
    raise exception 'warehouse_transfer_has_later_movement must remain revoked from authenticated';
  end if;

  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner68a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner68b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة المرحلة 2 أ'),
    (v_comp_b, 'شركة المرحلة 2 ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك 68 أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك 68 ب', 'owner', true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        access_role = excluded.access_role,
        is_active = true;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_wh_1 := public.create_warehouse('مخزن 68 رئيسي', null);
  v_wh_2 := public.create_warehouse('مخزن 68 للمطابقة', null);
  v_wh_tmp := public.create_warehouse('مخزن 68 مؤقت', null);
  v_cb_a := public.create_cash_box_with_opening_balance_and_notes('خزنة 68', 5000, null);
  v_cus_a := public.save_account_with_notes(null, 'عميل 68', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 68', 'supplier', null, true, 0, null);

  -- -------------------------------------------------------------------
  -- 1) منع الرصيد الافتتاحي السالب للخزن عند الإنشاء وعند التعديل
  -- -------------------------------------------------------------------
  v_err := false;
  begin
    perform public.create_cash_box_with_opening_balance_and_notes('خزنة سالبة', -10, null);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected create_cash_box_with_opening_balance_and_notes to reject negative opening balance';
  end if;

  v_err := false;
  begin
    perform public.save_opening_balances(
      jsonb_build_array(jsonb_build_object('cash_box_id', v_cb_a, 'opening_balance', -5)),
      '[]'::jsonb
    );
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected save_opening_balances to reject negative cash_box opening_balance';
  end if;

  -- -------------------------------------------------------------------
  -- 2) شمول الأصناف المعطلة ذات الأرصدة/الحركات في run_comprehensive_reconciliation
  -- -------------------------------------------------------------------
  v_item_1 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف معطل للمطابقة', 'قطعة', 100, 50, true, v_wh_2, 10, 50, null, 'ITM-68-1'
  );
  -- افتعال انحراف يدوي في item_stock ثم تعطيل الصنف
  reset role;
  perform public.apply_stock_movement(v_comp_a, v_wh_2, v_item_1, 89, null);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  perform public.delete_item(v_item_1); -- يحوله إلى is_active = false لوجود رصيد

  v_rec := public.run_comprehensive_reconciliation('simulation', 'اختبار فحص معطل');
  if coalesce((v_rec->>'discrepancies_count')::integer, 0) < 1 then
    raise exception 'Expected simulation reconciliation to detect drift on inactive item, got %', v_rec;
  end if;

  v_rec := public.run_comprehensive_reconciliation('reconcile', 'اختبار تصحيح معطل');
  select qty into v_qty from public.item_stock where warehouse_id = v_wh_2 and item_id = v_item_1;
  if v_qty <> 10 then
    raise exception 'Expected reconcile to restore inactive item qty to 10, got %', v_qty;
  end if;

  -- -------------------------------------------------------------------
  -- 3) توقيت Africa/Cairo في الكشوف الثلاثة (22:30 UTC يوم 15 = 00:30 Cairo يوم 16)
  -- -------------------------------------------------------------------
  v_cb_tz := public.create_cash_box_with_opening_balance_and_notes('خزنة توقيت', 100, null);
  v_cus_tz := public.save_account_with_notes(null, 'عميل توقيت', 'customer', null, true, 100, null);
  v_item_tz := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف توقيت', 'قطعة', 50, 20, true, v_wh_1, 5, 20, null, 'ITM-68-TZ'
  );

  -- إيجاد حركة فعلية لكي ينشئ التعديل سطر تسوية في *_adjustments
  perform public.create_free_receipt(v_cus_tz, v_cb_tz, '2026-01-10'::date, 50, null, 'حركة سابقة', 'in');
  perform public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-01-10'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_tz, 'qty', 2, 'unit_price', 20)),
    v_cb_a
  );

  perform public.save_account_opening_balances(
    jsonb_build_array(jsonb_build_object('account_id', v_cus_tz, 'opening_balance', 175))
  );
  perform public.save_opening_balances(
    jsonb_build_array(jsonb_build_object('cash_box_id', v_cb_tz, 'opening_balance', 250)),
    jsonb_build_array(jsonb_build_object('warehouse_id', v_wh_1, 'item_id', v_item_tz, 'opening_qty', 8, 'unit_cost', 20))
  );

  reset role;
  update public.opening_balance_adjustments
  set created_at = '2026-01-15 22:30:00+00'::timestamptz
  where company_id = v_comp_a;

  update public.stock_opening_adjustments
  set created_at = '2026-01-15 22:30:00+00'::timestamptz
  where company_id = v_comp_a;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  select count(*) into v_cnt
  from public.get_account_statement(v_cus_tz, '2026-01-16'::date, '2026-01-16'::date)
  where row_type = 'movement' and transaction_date = '2026-01-16'::date;
  if v_cnt <> 1 then
    raise exception 'Expected 1 account adjustment row on Cairo date 2026-01-16, got %', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.get_cash_box_statement(v_cb_tz, '2026-01-16'::date, '2026-01-16'::date)
  where row_type = 'movement' and transaction_date = '2026-01-16'::date;
  if v_cnt <> 1 then
    raise exception 'Expected 1 cash box adjustment row on Cairo date 2026-01-16, got %', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.get_item_movement_statement(v_item_tz, v_wh_1, '2026-01-16'::date, '2026-01-16'::date)
  where row_type = 'movement' and transaction_date = '2026-01-16'::date;
  if v_cnt <> 1 then
    raise exception 'Expected 1 item adjustment row on Cairo date 2026-01-16, got %', v_cnt;
  end if;

  -- -------------------------------------------------------------------
  -- 4) التحقق من warehouse_transfer_has_later_movement و cost_locked
  -- -------------------------------------------------------------------
  v_item_2 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف تحويل 68', 'قطعة', 100, 40, true, v_wh_1, 10, 40, null, 'ITM-68-2'
  );
  v_tr_1 := public.create_warehouse_transfer(
    v_wh_1, v_wh_tmp, '2026-11-05'::date, 'تحويل قديم',
    jsonb_build_array(jsonb_build_object('item_id', v_item_2, 'qty', 4))
  );
  reset role;
  update public.warehouse_transfers
  set created_at = now() - interval '10 minutes'
  where id = v_tr_1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('warehouse_id', v_wh_tmp, 'item_id', v_item_2, 'opening_qty', 2, 'unit_cost', 40))
  );

  v_err := false;
  begin
    perform public.delete_warehouse_transfer(v_tr_1);
  exception when others then
    if sqlerrm like '%transfer_has_later_movements%' then
      v_err := true;
    else
      raise;
    end if;
  end;
  if not v_err then
    raise exception 'Expected delete_warehouse_transfer to fail when later stock_opening_balances exists';
  end if;

  -- v_stock_opening_balances.cost_locked: فاتورة محذوفة لا تقفل التكلفة، بينما التحويل النشط يقفلها
  v_item_3 := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف قفل تكلفة', 'قطعة', 80, 25, true, v_wh_1, 5, 25, null, 'ITM-68-3'
  );
  v_sale_inv := public.create_invoice(
    'sale', v_cus_a, v_wh_1, '2026-11-06'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_3, 'qty', 1, 'unit_price', 80)),
    v_cb_a
  );
  perform public.delete_invoice(v_sale_inv);

  select cost_locked into v_cost_locked
  from public.v_stock_opening_balances
  where item_id = v_item_3 and warehouse_id = v_wh_1;
  if v_cost_locked is true then
    raise exception 'Expected cost_locked to be false when only deleted invoice exists';
  end if;

  perform public.create_warehouse_transfer(
    v_wh_1, v_wh_tmp, '2026-11-06'::date, 'تحويل يقفل التكلفة',
    jsonb_build_array(jsonb_build_object('item_id', v_item_3, 'qty', 1))
  );

  select cost_locked into v_cost_locked
  from public.v_stock_opening_balances
  where item_id = v_item_3 and warehouse_id = v_wh_1;
  if v_cost_locked is not true then
    raise exception 'Expected cost_locked to be true when active warehouse transfer exists';
  end if;

  -- -------------------------------------------------------------------
  -- 5) منع restore_invoice على حساب أو مخزن أو صنف معطل
  -- -------------------------------------------------------------------
  v_item_act := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف استعادة', 'قطعة', 100, 40, true, v_wh_tmp, 0, 0, null, 'ITM-68-REST'
  );
  -- استخدام مخزن فارغ (الرصيد 0 بعد الحذف) حتى يُسمح بتعطيله ثم اختبار منعه عند الاستعادة
  reset role;
  -- تعطيل الرصيد الافتتاحي أو البدء بفاتورة شراء على v_wh_tmp بدون افتتاحي (qty تصبح 0 عند الحذف)
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_pur_tmp := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, '2026-11-07'::date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_act, 'qty', 2, 'unit_price', 40)),
    v_cb_a
  );
  perform public.delete_invoice(v_pur_tmp);

  -- تعطيل الحساب
  reset role;
  update public.accounts set is_active = false where id = v_sup_a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_err := false;
  begin
    perform public.restore_invoice(v_pur_tmp);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected restore_invoice to fail when account is inactive';
  end if;

  -- تفعيل الحساب وتعطيل المخزن (بإنشاء مخزن جديد صفري المخزون للفاتورة المحذوفة)
  reset role;
  update public.accounts set is_active = true where id = v_sup_a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  declare
    v_wh_empty uuid := public.create_warehouse('مخزن 68 فارغ للاستعادة', null);
    v_pur_empty uuid;
  begin
    v_pur_empty := public.create_invoice(
      'purchase', v_sup_a, v_wh_empty, '2026-11-07'::date, 0, null,
      jsonb_build_array(jsonb_build_object('item_id', v_item_act, 'qty', 3, 'unit_price', 40)),
      v_cb_a
    );
    perform public.delete_invoice(v_pur_empty);

    reset role;
    update public.warehouses set is_active = false where id = v_wh_empty;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

    v_err := false;
    begin
      perform public.restore_invoice(v_pur_empty);
    exception when sqlstate '22023' then
      v_err := true;
    end;
    if not v_err then
      raise exception 'Expected restore_invoice to fail when warehouse is inactive';
    end if;
  end;

  -- تعطيل الصنف
  reset role;
  update public.items set is_active = false where id = v_item_act;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_err := false;
  begin
    perform public.restore_invoice(v_pur_tmp);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected restore_invoice to fail when line item is inactive';
  end if;

  -- تفعيل الصنف -> نجاح الاستعادة
  reset role;
  update public.items set is_active = true where id = v_item_act;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.restore_invoice(v_pur_tmp);

  -- -------------------------------------------------------------------
  -- 6) شمول الحسابات والخزن المعطلة ذات الأرصدة في get_home_dashboard_summary
  -- -------------------------------------------------------------------
  v_cb_inact := public.create_cash_box_with_opening_balance_and_notes('خزنة معطلة', 500, null);
  v_cus_inact := public.save_account_with_notes(null, 'عميل معطل', 'customer', null, true, 200, null);
  v_sup_inact := public.save_account_with_notes(null, 'مورد معطل', 'supplier', null, true, 300, null);

  reset role;
  update public.cash_boxes set is_active = false where id = v_cb_inact;
  update public.accounts set is_active = false where id in (v_cus_inact, v_sup_inact);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_summary := public.get_home_dashboard_summary();
  -- خزنة 68 (5000) + خزنة توقيت (250 + 50 = 300) + خزنة معطلة (500) = 5800
  if (v_summary->>'cash_balance')::numeric < 5800 then
    raise exception 'Expected cash_balance to include inactive non-zero cash box, got %', v_summary->>'cash_balance';
  end if;
  -- عميل توقيت (125) + عميل معطل (200) >= 325
  if (v_summary->>'receivables_balance')::numeric < 325 then
    raise exception 'Expected receivables_balance to include inactive non-zero customer, got %', v_summary->>'receivables_balance';
  end if;
  -- مورد 68 (40 + 80 = 120) + مورد معطل (300) = 420
  if (v_summary->>'payables_balance')::numeric < 420 then
    raise exception 'Expected payables_balance to include inactive non-zero supplier, got %', v_summary->>'payables_balance';
  end if;

  -- -------------------------------------------------------------------
  -- 7) عزل شركة B عن بيانات ووظائف شركة A
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  v_summary := public.get_home_dashboard_summary();
  if coalesce((v_summary->>'cash_balance')::numeric, 0) <> 0
     or coalesce((v_summary->>'receivables_balance')::numeric, 0) <> 0
     or coalesce((v_summary->>'payables_balance')::numeric, 0) <> 0 then
    raise exception 'Company B must not see Company A balances in home dashboard summary: %', v_summary;
  end if;

  select count(*) into v_cnt from public.v_stock_opening_balances where company_id = v_comp_a;
  if v_cnt <> 0 then
    raise exception 'Company B must not read Company A rows from v_stock_opening_balances';
  end if;

  v_err := false;
  begin
    perform public.restore_invoice(v_pur_tmp);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected Company B restore_invoice on Company A invoice to fail';
  end if;

  v_err := false;
  begin
    perform * from public.get_account_statement(v_cus_tz, '2026-01-01'::date, '2026-12-31'::date);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected Company B get_account_statement on Company A account to fail';
  end if;

  v_err := false;
  begin
    perform * from public.get_cash_box_statement(v_cb_tz, '2026-01-01'::date, '2026-12-31'::date);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected Company B get_cash_box_statement on Company A cash box to fail';
  end if;

  v_err := false;
  begin
    perform * from public.get_item_movement_statement(v_item_tz, v_wh_1, '2026-01-01'::date, '2026-12-31'::date);
  exception when sqlstate '22023' then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Expected Company B get_item_movement_statement on Company A item/warehouse to fail';
  end if;
end $$;

rollback;

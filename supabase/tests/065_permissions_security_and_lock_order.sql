-- =====================================================================
-- 065_permissions_security_and_lock_order.sql
-- اختبارات المرحلة 3:
-- 1. قبول مفاتيح الصلاحيات بحروف كبيرة/صغيرة (cashBoxes) في set_user_permissions و has_permission.
-- 2. منع التصعيد الأفقي للصلاحيات الفرعية في البيانات الأساسية والأرصدة الافتتاحية وكشوف الحسابات.
-- 3. حفظ الأرصدة الافتتاحية للحسابات ذرياً عبر save_account_opening_balances.
-- 4. حجب purchase_price في عروض المخزون لغير المصرح لهم.
-- 5. شمول الأصناف الموقوفة في مطابقة المخزون reconcile_item_stock.
-- 6. سحب الدوال المساعدة الداخلية من authenticated وعزل الشركات ومنع anon.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '65656565-6565-4656-8656-0000000000a1';
  v_comp_b uuid := '65656565-6565-4656-8656-0000000000b1';
  v_owner_a uuid := '65656565-6565-4656-8656-000000000001';
  v_emp_a   uuid := '65656565-6565-4656-8656-000000000002';
  v_owner_b uuid := '65656565-6565-4656-8656-000000000003';

  v_wh_a uuid;
  v_box_a uuid;
  v_cus_1 uuid;
  v_cus_2 uuid;
  v_sup_1 uuid;
  v_item_a uuid;
  v_inv_a uuid;
  v_denied boolean;
  v_deleted_permanently boolean;
  v_masked_purchase numeric;
  v_visible_purchase numeric;
  v_reconciled_qty numeric;
begin
  -- 1) التحقق من سحب الدوال المساعدة الداخلية من authenticated و anon
  if has_function_privilege('authenticated', 'public.next_document_number(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.purchase_invoice_has_later_outflow(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.recalc_invoice_totals(uuid)', 'execute') then
    raise exception 'Internal helper functions must not be executable by authenticated';
  end if;

  if has_function_privilege('anon', 'public.save_account_opening_balances(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.can_view_purchase_price()', 'execute') then
    raise exception 'New functions must not be executable by anon';
  end if;

  -- 2) تجهيز الشركتين والمستخدمين
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner65a@test.local'),
    (v_emp_a,   'authenticated', 'authenticated', 'emp65a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner65b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة المرحلة 3 أ'),
    (v_comp_b, 'شركة المرحلة 3 ب')
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

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_wh_a := public.create_warehouse('مخزن 65 أ', null);
  v_box_a := public.create_cash_box_with_opening_balance_and_notes('خزنة 65 أ', 500, null);
  v_cus_1 := public.save_account_with_notes(null, 'عميل 1', 'customer', null, true, 0, null);
  v_cus_2 := public.save_account_with_notes(null, 'عميل 2', 'customer', null, true, 0, null);
  v_sup_1 := public.save_account_with_notes(null, 'مورد 1', 'supplier', null, true, 0, null);

  -- 3) اختبار قبول مفاتيح الصلاحيات بحروف كبيرة وصغيرة (cashBoxes)
  perform public.set_user_permissions(
    v_emp_a,
    array['data.cashBoxes.create', 'balances.cashBoxes.view']
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  if not public.has_permission('data.cashBoxes.create')
     or not public.has_permission('data.cash_boxes.create')
     or not public.has_permission('balances.cashBoxes.view') then
    raise exception 'Expected cashBoxes permission normalization to succeed';
  end if;

  -- يمكن للموظف إنشاء خزنة بصلاحية data.cashBoxes.create لكن لا يمكنه إنشاء مخزن أو صنف
  perform public.create_cash_box_with_opening_balance_and_notes('خزنة فرعية للموظف', 0, 'ملاحظة');

  v_denied := false;
  begin
    perform public.create_warehouse('مخزن غير مصرح', null);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected employee with only data.cashBoxes.create to be denied warehouse creation';
  end if;

  -- 4) اختبار إنشاء صنف مع ملاحظات وكود بصلاحية data.items.create فقط بدون data.items.edit
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.set_user_permissions(v_emp_a, array['data.items.create']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  v_item_a := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف موظف الإدخال', 'قطعة', 150, 95, true, v_wh_a, 10, 95, 'ملاحظات الإنشاء', 'EMP-CODE-65'
  );
  if v_item_a is null then
    raise exception 'Expected create_item_with_opening_stock_and_notes_and_code to succeed with data.items.create';
  end if;

  -- 5) اختبار حجب purchase_price في v_warehouse_items و v_stock_opening_balances و v_item_stock لغير المصرح لهم
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.set_user_permissions(v_emp_a, array['balances.items.view', 'management.items.view', 'goods.sale.view']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  select purchase_price into v_masked_purchase
  from public.v_warehouse_items
  where item_id = v_item_a and warehouse_id = v_wh_a;

  if v_masked_purchase is not null then
    raise exception 'Expected purchase_price to be masked in v_warehouse_items for sales/stock viewer, got %', v_masked_purchase;
  end if;

  select purchase_price into v_masked_purchase
  from public.v_stock_opening_balances
  where item_id = v_item_a and warehouse_id = v_wh_a;

  if v_masked_purchase is not null then
    raise exception 'Expected purchase_price to be masked in v_stock_opening_balances, got %', v_masked_purchase;
  end if;

  -- عند منح صلاحية المشتريات أو بيانات الأصناف يظهر purchase_price
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.set_user_permissions(v_emp_a, array['balances.items.view', 'goods.purchase.create']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  select purchase_price into v_visible_purchase
  from public.v_warehouse_items
  where item_id = v_item_a and warehouse_id = v_wh_a;

  if v_visible_purchase <> 95 then
    raise exception 'Expected purchase_price 95 for purchase creator, got %', v_visible_purchase;
  end if;

  -- 6) اختبار save_account_opening_balances والصلاحيات الفرعية للأرصدة الافتتاحية
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  perform public.set_user_permissions(v_emp_a, array['management.customers.edit']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  perform public.save_account_opening_balances(
    jsonb_build_array(
      jsonb_build_object('account_id', v_cus_1, 'opening_balance', 300),
      jsonb_build_object('account_id', v_cus_2, 'opening_balance', -150)
    )
  );

  if (select current_balance from public.accounts where id = v_cus_1) <> 300
     or (select current_balance from public.accounts where id = v_cus_2) <> -150 then
    raise exception 'Expected save_account_opening_balances to update both customers atomically';
  end if;

  -- لا يمكن لمن يملك management.customers.edit فقط تعديل رصيد افتتاحي لمورد
  v_denied := false;
  begin
    perform public.save_account_opening_balances(
      jsonb_build_array(jsonb_build_object('account_id', v_sup_1, 'opening_balance', 400))
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected employee with only management.customers.edit to be denied supplier opening balance edit';
  end if;

  -- ولا يمكنه تعديل رصيد افتتاحي لخزنة عبر save_opening_balances
  v_denied := false;
  begin
    perform public.save_opening_balances(
      jsonb_build_array(jsonb_build_object('cash_box_id', v_box_a, 'opening_balance', 900)),
      '[]'::jsonb
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected employee with only management.customers.edit to be denied cash box opening balance edit';
  end if;

  -- 7) اختبار حذف (تعطيل) حساب عليه فواتير بصلاحية data.customers.delete فقط بدون data.customers.edit
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  v_inv_a := public.create_invoice(
    'sale', v_cus_1, v_wh_a, current_date, 0, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 150)),
    v_box_a
  );

  perform public.set_user_permissions(v_emp_a, array['data.customers.delete']);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a)::text, true);

  v_deleted_permanently := public.delete_account(v_cus_1);
  if v_deleted_permanently is not false
     or (select is_active from public.accounts where id = v_cus_1) is not false then
    raise exception 'Expected delete_account by delete-only employee to soft-deactivate customer with invoices';
  end if;

  -- ولا يمكنه حذف مورد بصلاحية data.customers.delete فقط
  v_denied := false;
  begin
    perform public.delete_account(v_sup_1);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Expected employee with only data.customers.delete to be denied supplier deletion';
  end if;

  -- 8) اختبار reconcile_item_stock لصنف موقوف (is_active = false)
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  -- تعطيل الصنف بعد وجود فاتورة عليه ثم إحداث انحراف يدوي في item_stock
  perform public.delete_item(v_item_a);
  update public.item_stock set qty = 999 where item_id = v_item_a and warehouse_id = v_wh_a;

  perform public.reconcile_item_stock(v_comp_a);

  select qty into v_reconciled_qty
  from public.item_stock
  where item_id = v_item_a and warehouse_id = v_wh_a;

  if v_reconciled_qty <> 8 then
    raise exception 'Expected deactivated item stock to be reconciled to 8 (10 opening - 2 sold), got %', v_reconciled_qty;
  end if;

  -- 9) اختبار عزل الشركات ومنع anon
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  v_denied := false;
  begin
    perform public.save_account_opening_balances(
      jsonb_build_array(jsonb_build_object('account_id', v_cus_1, 'opening_balance', 5000))
    );
  exception when invalid_parameter_value then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Company B must not be able to update Company A account opening balance';
  end if;

  set local role anon;
  v_denied := false;
  begin
    perform public.save_account_opening_balances('[]'::jsonb);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Anon must not be able to call save_account_opening_balances';
  end if;
end $$;

rollback;

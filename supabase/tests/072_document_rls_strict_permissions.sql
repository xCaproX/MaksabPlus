-- =====================================================================
-- 072_document_rls_strict_permissions.sql
-- اختبارات الهجرة 0086 (SEC-01 & SEC-02):
-- 1. موظف بصلاحية balances.customers.view فقط لا يرى الفواتير أو الإيصالات أو التحويلات عبر العروض المباشرة.
-- 2. موظف بصلاحية goods.sale.view فقط لا يرى فواتير الشراء أو تحويلات المخازن أو الإيصالات الحرة.
-- 3. موظف بصلاحية goods.sale.view يظل قادراً على قراءة v_invoice_list الخاصة بالمبيعات مع الإيصال المرتبط بها.
-- 4. موظف بصلاحية money.in.view فقط لا يرى إيصالات الصرف أو تحويلات الخزن.
-- 5. استمرار عمل RPCs الكشوف والأرصدة للموظف صاحب balances.customers.view.
-- 6. عزل الشركة ب ومنع الدور anon عن كافة العروض والدوال.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '72727272-7272-4727-8727-0000000000a1';
  v_comp_b uuid := '72727272-7272-4727-8727-0000000000b1';
  v_owner_a uuid := '72727272-7272-4727-8727-000000000001';
  v_owner_b uuid := '72727272-7272-4727-8727-000000000002';
  v_emp_a uuid := '72727272-7272-4727-8727-000000000003';

  v_wh_1 uuid := '72727272-7272-4727-8727-000000000011';
  v_wh_2 uuid;
  v_box_1 uuid := '72727272-7272-4727-8727-000000000021';
  v_box_2 uuid;
  v_item_a uuid;
  v_cust_a uuid;
  v_sup_a uuid;

  v_sale_id uuid;
  v_purch_id uuid;
  v_rcp_in uuid;
  v_rcp_out uuid;
  v_wtrf_id uuid;
  v_ctrf_id uuid;

  v_cnt integer;
  v_rcp_num text;
begin
  insert into public.companies (id, name) values (v_comp_a, 'شركة أ 72'), (v_comp_b, 'شركة ب 72');
  insert into auth.users (id, aud, role, email) values
    (v_owner_a, 'authenticated', 'authenticated', 'owner72a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner72b@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp72a@test.local');

  insert into public.profiles (id, company_id, full_name, access_role, is_active) values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true),
    (v_emp_a, v_comp_a, 'موظف أ', 'employee', true);

  insert into public.warehouses (id, company_id, name, is_primary, is_active) values (v_wh_1, v_comp_a, 'رئيسي', true, true);
  insert into public.cash_boxes (id, company_id, name, is_primary, is_active) values (v_box_1, v_comp_a, 'خزنة رئيسية', true, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_wh_2 := public.create_warehouse('فرعي', null);
  v_box_2 := public.create_cash_box_with_opening_balance_and_notes('فرعية', 0, null);
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code('صنف 72', 'قطعة', 100, 60, true, v_wh_1, 20, 60, null, 'ITM-72');
  v_cust_a := public.save_account_with_notes(null, 'عميل 72', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 72', 'supplier', null, true, 0, null);

  v_sale_id := public.create_invoice_with_cash_box(
    'sale', v_cust_a, v_wh_1, current_date, 50, 'مبيعات 72',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 100)),
    v_box_1
  );
  v_purch_id := public.create_invoice_with_cash_box(
    'purchase', v_sup_a, v_wh_1, current_date, 20, 'مشتريات 72',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 60)),
    v_box_1
  );
  v_rcp_in := public.create_free_receipt(v_cust_a, v_box_1, current_date, 30, 'قبض 72', null, 'in');
  v_rcp_out := public.create_free_receipt(v_sup_a, v_box_1, current_date, 15, 'صرف 72', null, 'out');
  v_wtrf_id := public.create_warehouse_transfer(
    v_wh_1, v_wh_2, current_date, 'تحويل مخزني 72',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1))
  );
  v_ctrf_id := public.create_cash_box_transfer(v_box_1, v_box_2, current_date, 10, 'تحويل خزنة 72');

  -- 1) موظف بصلاحية balances.customers.view + management.customers.view فقط
  perform public.set_user_permissions(v_emp_a, array['balances.customers.view', 'management.customers.view']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_cnt from public.v_invoice_list;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: balances.customers.view read % invoices', v_cnt; end if;

  select count(*) into v_cnt from public.v_invoice_items;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: balances.customers.view read % invoice_items', v_cnt; end if;

  select count(*) into v_cnt from public.v_receipt_list;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: balances.customers.view read % receipts', v_cnt; end if;

  select count(*) into v_cnt from public.v_warehouse_transfer_list;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: balances.customers.view read % warehouse transfers', v_cnt; end if;

  select count(*) into v_cnt from public.v_warehouse_transfer_items;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: balances.customers.view read % warehouse transfer items', v_cnt; end if;

  select count(*) into v_cnt from public.v_cash_box_transfer_list;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: balances.customers.view read % cash box transfers', v_cnt; end if;

  -- دوال الأرصدة والكشوف (SECURITY DEFINER) تظل تعمل لصاحب balances.customers.view
  select count(*) into v_cnt from public.v_account_balances where id = v_cust_a;
  if v_cnt <> 1 then raise exception 'regression: balances.customers.view lost v_account_balances'; end if;

  select count(*) into v_cnt from public.get_account_statement(v_cust_a, public.cairo_today() - 1, public.cairo_today() + 1);
  if v_cnt < 1 then raise exception 'regression: balances.customers.view lost get_account_statement'; end if;

  -- 2) موظف بصلاحية goods.sale.view فقط: يرى فاتورة البيع وإيصالها المرتبط فقط، ولا يرى الشراء أو التحويلات أو الإيصالات الحرة
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_user_permissions(v_emp_a, array['goods.sale.view']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*), max(receipt_number) into v_cnt, v_rcp_num from public.v_invoice_list;
  if v_cnt <> 1 or v_rcp_num is null then
    raise exception 'regression: goods.sale.view expected 1 sale invoice with receipt_number, got count=% rcp=%', v_cnt, v_rcp_num;
  end if;

  select count(*) into v_cnt from public.v_invoice_list where id = v_purch_id;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: goods.sale.view saw purchase invoice'; end if;

  select count(*) into v_cnt from public.v_invoice_items where invoice_id = v_purch_id;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: goods.sale.view saw purchase invoice_items'; end if;

  select count(*) into v_cnt from public.v_warehouse_transfer_list;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: goods.sale.view saw % warehouse transfers', v_cnt; end if;

  select count(*) into v_cnt from public.v_warehouse_transfer_items;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: goods.sale.view saw % warehouse transfer items', v_cnt; end if;

  select count(*) into v_cnt from public.v_receipt_list where id in (v_rcp_in, v_rcp_out);
  if v_cnt <> 0 then raise exception 'SEC-01 fail: goods.sale.view saw free receipts'; end if;

  -- 3) موظف بصلاحية money.in.view فقط: يرى إيصالات القبض فقط ولا يرى الصرف أو تحويلات الخزن
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_user_permissions(v_emp_a, array['money.in.view']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_cnt from public.v_receipt_list where id = v_rcp_in;
  if v_cnt <> 1 then raise exception 'regression: money.in.view missed in receipt'; end if;

  select count(*) into v_cnt from public.v_receipt_list where id = v_rcp_out;
  if v_cnt <> 0 then raise exception 'SEC-01 fail: money.in.view saw out receipt'; end if;

  select count(*) into v_cnt from public.v_cash_box_transfer_list;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: money.in.view saw % cash box transfers', v_cnt; end if;

  -- 4) موظف التحويلات يرى نوع التحويل المصرح له به فقط
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_user_permissions(v_emp_a, array['goods.warehouse_transfer.view']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_cnt from public.v_warehouse_transfer_list where id = v_wtrf_id;
  if v_cnt <> 1 then raise exception 'regression: warehouse_transfer.view missed transfer'; end if;

  select count(*) into v_cnt from public.v_cash_box_transfer_list;
  if v_cnt <> 0 then raise exception 'SEC-02 fail: warehouse_transfer.view saw cash box transfer'; end if;

  -- 5) عزل الشركة ب ومنع الدور anon
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_cnt from public.v_invoice_list where id in (v_sale_id, v_purch_id);
  if v_cnt <> 0 then raise exception 'Tenant B read A invoices'; end if;

  select count(*) into v_cnt from public.v_warehouse_transfer_list where id = v_wtrf_id;
  if v_cnt <> 0 then raise exception 'Tenant B read A warehouse transfer'; end if;

  select count(*) into v_cnt from public.v_cash_box_transfer_list where id = v_ctrf_id;
  if v_cnt <> 0 then raise exception 'Tenant B read A cash box transfer'; end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  begin
    perform 1 from public.v_invoice_list;
    raise exception 'anon read v_invoice_list';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.v_warehouse_transfer_list;
    raise exception 'anon read v_warehouse_transfer_list';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.v_cash_box_transfer_list;
    raise exception 'anon read v_cash_box_transfer_list';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

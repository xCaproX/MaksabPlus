-- =====================================================================
-- 073_document_detail_and_statement_links.sql
-- اختبارات الهجرة 0087 (T-09b):
-- 1. صلاحيات وعزل get_document_detail (الشركة ب + anon + خطأ الصلاحيات + الحذف + إخفاء الربح).
-- 2. عودة doc_id و doc_kind بدقة من كشوف الحساب والخزنة وحركة الصنف.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '73737373-7373-4737-8737-0000000000a1';
  v_comp_b uuid := '73737373-7373-4737-8737-0000000000b1';
  v_owner_a uuid := '73737373-7373-4737-8737-000000000001';
  v_owner_b uuid := '73737373-7373-4737-8737-000000000002';
  v_emp_a uuid := '73737373-7373-4737-8737-000000000003';

  v_wh_1 uuid := '73737373-7373-4737-8737-000000000011';
  v_wh_2 uuid;
  v_box_1 uuid := '73737373-7373-4737-8737-000000000021';
  v_box_2 uuid;
  v_item_a uuid;
  v_cust_a uuid;
  v_sup_a uuid;

  v_sale_id uuid;
  v_sale_del_id uuid;
  v_purch_id uuid;
  v_ret_id uuid;
  v_rcp_linked uuid;
  v_rcp_free uuid;
  v_wtrf_id uuid;
  v_ctrf_id uuid;

  v_res jsonb;
  v_doc_cnt integer;
  v_kind text;
  v_opening_doc_id uuid;
begin
  if has_function_privilege('anon', 'public.get_document_detail(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_account_statement(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_cash_box_statement(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_item_movement_statement(uuid, uuid, date, date)', 'execute') then
    raise exception 'anon must not execute get_document_detail or statement functions';
  end if;

  insert into public.companies (id, name) values (v_comp_a, 'شركة أ 73'), (v_comp_b, 'شركة ب 73');
  insert into auth.users (id, aud, role, email) values
    (v_owner_a, 'authenticated', 'authenticated', 'owner73a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner73b@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp73a@test.local');

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
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code('صنف 73', 'قطعة', 100, 60, true, v_wh_1, 30, 60, null, 'ITM-73');
  v_cust_a := public.save_account_with_notes(null, 'عميل 73', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 73', 'supplier', null, true, 0, null);

  v_sale_id := public.create_invoice_with_cash_box(
    'sale', v_cust_a, v_wh_1, current_date, 40, 'بيع 73',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 100)),
    v_box_1
  );
  select id into v_rcp_linked from public.receipts where invoice_id = v_sale_id limit 1;

  v_sale_del_id := public.create_invoice_with_cash_box(
    'sale', v_cust_a, v_wh_1, current_date, 0, 'بيع محذوف 73',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 100)),
    null
  );
  perform public.delete_invoice(v_sale_del_id);

  v_purch_id := public.create_invoice_with_cash_box(
    'purchase', v_sup_a, v_wh_1, current_date, 20, 'شراء 73',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2, 'unit_price', 60)),
    v_box_1
  );
  v_ret_id := public.create_invoice_with_cash_box(
    'sale_return', v_cust_a, v_wh_1, current_date, 0, 'مرتجع 73',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1, 'unit_price', 100)),
    null
  );
  v_rcp_free := public.create_free_receipt(v_cust_a, v_box_1, current_date, 25, 'قبض 73', null, 'in');
  v_wtrf_id := public.create_warehouse_transfer(
    v_wh_1, v_wh_2, current_date, 'تحويل مخزن 73',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1))
  );
  v_ctrf_id := public.create_cash_box_transfer(v_box_1, v_box_2, current_date, 15, 'تحويل خزنة 73');

  -- التحقق من المالك على كافة النطاقات وكشوف الحساب
  v_res := public.get_document_detail('invoice', v_sale_id);
  if (v_res->>'status') <> 'ok' or (v_res->'doc'->>'profit_total') is null or jsonb_array_length(v_res->'lines') <> 1 then
    raise exception 'owner get_document_detail(invoice) failed: %', v_res;
  end if;

  v_res := public.get_document_detail('receipt', v_rcp_free);
  if (v_res->>'status') <> 'ok' or (v_res->'doc'->>'id')::uuid <> v_rcp_free then
    raise exception 'owner get_document_detail(receipt) failed: %', v_res;
  end if;

  v_res := public.get_document_detail('warehouse_transfer', v_wtrf_id);
  if (v_res->>'status') <> 'ok' or jsonb_array_length(v_res->'lines') <> 1 then
    raise exception 'owner get_document_detail(warehouse_transfer) failed: %', v_res;
  end if;

  v_res := public.get_document_detail('cash_box_transfer', v_ctrf_id);
  if (v_res->>'status') <> 'ok' or (v_res->'doc'->>'id')::uuid <> v_ctrf_id then
    raise exception 'owner get_document_detail(cash_box_transfer) failed: %', v_res;
  end if;

  -- التحقق من doc_id و doc_kind في الكشوف الثلاثة
  select doc_id into v_opening_doc_id
  from public.get_account_statement(v_cust_a, public.cairo_today() - 1, public.cairo_today() + 1)
  where row_type = 'opening'
  limit 1;
  if v_opening_doc_id is not null then
    raise exception 'opening statement row must keep doc_id null';
  end if;

  select doc_kind into v_kind
  from public.get_account_statement(v_cust_a, public.cairo_today() - 1, public.cairo_today() + 1)
  where doc_id = v_ret_id;
  if v_kind <> 'sale_return' then
    raise exception 'expected sale_return doc_kind for %, got %', v_ret_id, v_kind;
  end if;

  select count(*) into v_doc_cnt
  from public.get_cash_box_statement(v_box_1, public.cairo_today() - 1, public.cairo_today() + 1)
  where doc_id = v_ctrf_id and doc_kind = 'cash_box_transfer';
  if v_doc_cnt <> 1 then
    raise exception 'expected cash_box_transfer link in get_cash_box_statement, got %', v_doc_cnt;
  end if;

  select count(*) into v_doc_cnt
  from public.get_item_movement_statement(v_item_a, v_wh_1, public.cairo_today() - 1, public.cairo_today() + 1)
  where doc_id = v_wtrf_id and doc_kind = 'warehouse_transfer';
  if v_doc_cnt <> 1 then
    raise exception 'expected warehouse_transfer link in get_item_movement_statement, got %', v_doc_cnt;
  end if;

  -- موظف بصلاحية goods.sale.view فقط: يرى البيع النشط بدون تكلفة/ربح، ويرفض الشراء والايصال المرتبط والمحذوف والتحويلات
  perform public.set_user_permissions(v_emp_a, array['goods.sale.view']);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.get_document_detail('invoice', v_sale_id);
  if (v_res->>'status') <> 'ok' or (v_res->'doc'->>'profit_total') is not null or (v_res->'doc'->>'cost_total') is not null then
    raise exception 'employee must see ok sale invoice without profit/cost, got: %', v_res;
  end if;

  if (public.get_document_detail('invoice', v_purch_id)->>'status') <> 'forbidden' then
    raise exception 'goods.sale.view employee must get forbidden on purchase invoice';
  end if;

  if (public.get_document_detail('receipt', v_rcp_linked)->>'status') <> 'forbidden' then
    raise exception 'SEC-F3: goods.sale.view without money.in.view must get forbidden on receipt detail';
  end if;

  if (public.get_document_detail('invoice', v_sale_del_id)->>'status') <> 'deleted_forbidden' then
    raise exception 'employee without goods.sale.delete must get deleted_forbidden';
  end if;

  -- منح صلاحية حذف البيع يسمح بفتح الفاتورة المحذوفة
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_user_permissions(v_emp_a, array['goods.sale.view', 'goods.sale.delete']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (public.get_document_detail('invoice', v_sale_del_id)->>'status') <> 'ok' then
    raise exception 'employee with goods.sale.delete must open deleted sale';
  end if;

  -- عزل الشركة ب الكامل
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if (public.get_document_detail('invoice', v_sale_id)->>'status') <> 'not_found'
     or (public.get_document_detail('receipt', v_rcp_free)->>'status') <> 'not_found'
     or (public.get_document_detail('warehouse_transfer', v_wtrf_id)->>'status') <> 'not_found'
     or (public.get_document_detail('cash_box_transfer', v_ctrf_id)->>'status') <> 'not_found' then
    raise exception 'company B owner must receive not_found for company A documents';
  end if;
end $$;

rollback;

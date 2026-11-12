-- =====================================================================
-- 071_security_and_transfer_restore_fixes.sql
-- اختبارات الهجرة 0085:
-- 1. منع restore_warehouse_transfer عند تعطيل أحد أصناف التحويل.
-- 2. رفض فلترة purchase_price الفارغة في validate_list_columns لغير المصرح لهم.
-- 3. تقريب p_amount لـ 4 منازل قبل فحص الرصيد في الإيصالات الحرة.
-- 4. حذف الإيصالات الحرة (in/out) وعزل الشركات ومنع anon.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '71717171-7171-4717-8717-0000000000a1';
  v_comp_b uuid := '71717171-7171-4717-8717-0000000000b1';
  v_owner_a uuid := '71717171-7171-4717-8717-000000000001';
  v_owner_b uuid := '71717171-7171-4717-8717-000000000002';
  v_emp_a uuid := '71717171-7171-4717-8717-000000000003';

  v_wh_1 uuid := '71717171-7171-4717-8717-000000000011';
  v_wh_2 uuid;
  v_box_1 uuid := '71717171-7171-4717-8717-000000000021';
  v_box_inactive uuid := '71717171-7171-4717-8717-000000000022';
  v_item_a uuid;
  v_cust_a uuid;
  v_sup_a uuid;
  v_trf_id uuid;
  v_rcp_in uuid;
  v_rcp_out uuid;
  v_cnt integer;
begin
  insert into public.companies (id, name) values (v_comp_a, 'شركة أ 71'), (v_comp_b, 'شركة ب 71');
  insert into auth.users (id, aud, role, email) values
    (v_owner_a, 'authenticated', 'authenticated', 'owner71a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner71b@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp71a@test.local');

  insert into public.profiles (id, company_id, full_name, access_role, is_active) values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true),
    (v_emp_a, v_comp_a, 'موظف أ', 'employee', true);

  insert into public.user_permissions (company_id, user_id, permission_key) values
    (v_comp_a, v_emp_a, 'data.items.view');

  insert into public.warehouses (id, company_id, name, is_primary, is_active) values (v_wh_1, v_comp_a, 'الرئيسي', true, true);
  insert into public.cash_boxes (id, company_id, name, is_primary, is_active) values
    (v_box_1, v_comp_a, 'الخزنة', true, true),
    (v_box_inactive, v_comp_a, 'خزنة معطلة', false, false);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_wh_2 := public.create_warehouse('فرعي', null);
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code('صنف تحويل', 'قطعة', 50, 30, true, v_wh_1, 30, 10, null, 'ITM-71A');
  v_cust_a := public.save_account_with_notes(null, 'عميل 71', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 71', 'supplier', null, true, 0, null);

  -- 1) تحويل مخزني -> حذف -> تعطيل الصنف -> فشل الاستعادة
  v_trf_id := public.create_warehouse_transfer(
    v_wh_1, v_wh_2, current_date, null,
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 2))
  );
  perform public.delete_warehouse_transfer(v_trf_id);
  update public.items set is_active = false where id = v_item_a;

  begin
    perform public.restore_warehouse_transfer(v_trf_id);
    raise exception 'expected invalid_item when restoring transfer with inactive item';
  exception when others then
    if sqlerrm not like '%invalid_item%' then raise; end if;
  end;

  update public.items set is_active = true where id = v_item_a;
  perform public.restore_warehouse_transfer(v_trf_id);

  -- 2) تقريب p_amount لـ 4 منازل في الإيصال الحر عند رصيد 100.0000
  v_rcp_in := public.create_free_receipt(v_cust_a, v_box_1, current_date, 100.0000, 'إيداع 100', null, 'in');

  -- رفض نقل الإيصال الحر إلى خزنة معطلة في update_free_receipt
  begin
    perform public.update_free_receipt(v_rcp_in, v_cust_a, v_box_inactive, current_date, 100.0000, 'نقل لخزنة معطلة', null);
    raise exception 'expected invalid_cash_box when moving receipt to inactive cash box';
  exception when others then
    if sqlerrm not like '%invalid_cash_box%' then raise; end if;
  end;

  v_rcp_out := public.create_free_receipt(v_sup_a, v_box_1, current_date, 100.00004, 'صرف مقرب لـ 100', null, 'out');
  if (select amount from public.receipts where id = v_rcp_out) <> 100.0000 then
    raise exception 'expected rounded receipt amount 100.0000';
  end if;

  -- حذف سند الصرف ثم سند القبض
  perform public.delete_free_receipt(v_rcp_out);
  perform public.delete_free_receipt(v_rcp_in);

  -- 3) رفض فلترة purchase_price الفارغة لموظف غير مخول
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform * from public.filter_master_item_rows('{"purchase_price": ""}'::jsonb, null);
    raise exception 'expected permission_denied for empty purchase_price filter';
  exception when others then
    if sqlerrm not like '%permission_denied%' then raise; end if;
  end;

  -- 4) عزل شركة ب عن v_item_stock وعن restore_warehouse_transfer لشركة أ
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_cnt from public.v_item_stock where id = v_item_a;
  if v_cnt <> 0 then
    raise exception 'company B saw company A item in v_item_stock';
  end if;

  -- 5) منع anon من استدعاء الدوال والقراءة من v_item_stock
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;

  begin
    perform * from public.v_item_stock limit 1;
    raise exception 'anon should not read v_item_stock';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.restore_warehouse_transfer(v_trf_id);
    raise exception 'anon should not call restore_warehouse_transfer';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $$;

rollback;

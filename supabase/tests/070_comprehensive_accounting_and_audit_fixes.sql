-- =====================================================================
-- 070_comprehensive_accounting_and_audit_fixes.sql
-- اختبارات شاملة لجميع الإصلاحات المحاسبية والمنطقية والأمنية:
-- 1. تطابق إجمالي الفاتورة مع مجموع بنودها عند > 4 منازل عشرية.
-- 2. تسعير مرتجع المبيعات sale_return عند الإرجاع لمخزن فارغ بلا تكلفة.
-- 3. تسجيل فرق سعر مرتجع المشتريات في profit_total.
-- 4. منع تعديل أو حذف فاتورة شراء بعد تسجيل sale_return لاحق.
-- 5. تسوية زيادة الرصيد الافتتاحي بتكلفة الافتتاح الأصلية + تطابق cost_locked.
-- 6. منع restore_invoice و restore_receipt على حساب/خزنة معطلة، وحماية المخزن الرئيسي.
-- 7. خصم sale_return من top_items في ملخص الرئيسية والرسوم البيانية.
-- 8. اكتشاف وتصحيح فروقات إجمالي/تكلفة/ربح/مدفوع الفواتير في run_comprehensive_reconciliation.
-- 9. التحقق من عزل الشركات (شركة ب) ومنع دور anon وسحب الدوال الداخلية.
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '70707070-7070-4707-8707-0000000000a1';
  v_comp_b uuid := '70707070-7070-4707-8707-0000000000b1';
  v_owner_a uuid := '70707070-7070-4707-8707-000000000001';
  v_owner_b uuid := '70707070-7070-4707-8707-000000000002';

  v_wh_1 uuid := '70707070-7070-4707-8707-000000000011';
  v_wh_2 uuid;
  v_box_1 uuid := '70707070-7070-4707-8707-000000000021';
  v_box_2 uuid;
  v_cust_a uuid;
  v_sup_a uuid;
  v_item_a uuid;
  v_item_b uuid;

  v_inv_round uuid;
  v_pur_1 uuid;
  v_sale_1 uuid;
  v_sr_1 uuid;
  v_resale_2 uuid;
  v_pr_1 uuid;
  v_paid_inv uuid;
  v_rcp_in uuid;
  v_rec record;
  v_summary jsonb;
  v_charts jsonb;
  v_recon jsonb;
  v_cost_locked boolean;
  v_denied boolean;
begin
  -- 1) فحص أذونات الدوال الداخلية والوظائف الجديدة
  if has_function_privilege('authenticated', 'public.resolve_sale_return_unit_cost(uuid, uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.recalc_invoice_totals(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.purchase_invoice_has_later_outflow(uuid)', 'execute') then
    raise exception 'Internal helper functions must not be executable by authenticated';
  end if;

  if has_function_privilege('anon', 'public.resolve_sale_return_unit_cost(uuid, uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.run_comprehensive_reconciliation(text, text)', 'execute')
     or has_function_privilege('anon', 'public.restore_receipt(uuid)', 'execute')
     or has_function_privilege('anon', 'public.restore_invoice(uuid)', 'execute') then
    raise exception 'Functions must not be executable by anon';
  end if;

  -- 2) تجهيز الشركتين والمستخدمين
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner70a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner70b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة 70 أ'),
    (v_comp_b, 'شركة 70 ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك 70 أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك 70 ب', 'owner', true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        access_role = excluded.access_role,
        is_active = true;

  insert into public.warehouses (id, company_id, name, is_primary, is_active)
  values (v_wh_1, v_comp_a, 'المخزن الرئيسي 70', true, true);

  insert into public.cash_boxes (id, company_id, name, is_primary, is_active, opening_balance, current_balance)
  values (v_box_1, v_comp_a, 'الخزنة الرئيسية 70', true, true, 10000, 10000);

  -- التبديل إلى مالك شركة أ
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);

  -- حماية المخزن الرئيسي حتى وهو فارغ (before adding stock)
  v_denied := false;
  begin
    perform public.toggle_warehouse_active(v_wh_1);
  exception when others then
    if sqlerrm = 'primary_location_protected' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Expected primary warehouse toggle_warehouse_active to raise primary_location_protected';
  end if;

  v_wh_2 := public.create_warehouse('مخزن فرعي 70', null);
  v_box_2 := public.create_cash_box_with_opening_balance_and_notes('خزنة فرعية 70', 1000, null);
  v_cust_a := public.save_account_with_notes(null, 'عميل 70', 'customer', null, true, 0, null);
  v_sup_a := public.save_account_with_notes(null, 'مورد 70', 'supplier', null, true, 0, null);
  v_item_a := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 70 أ', 'كجم', 100, 40, true, v_wh_1, 20000, 1, null, 'ITM-70A'
  );
  v_item_b := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف 70 ب', 'قطعة', 100, 50, true, null, null, null, null, 'ITM-70B'
  );

  -- 3) اختبار تقريب البنود (> 4 منازل عشرية) وتطابق الرأس مع البنود
  v_inv_round := public.create_invoice(
    'sale', v_cust_a, v_wh_1, public.cairo_today(), 0, 'تقريب',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 10000.00004, 'unit_price', 1.00499)),
    v_box_1
  );
  select i.total,
         (select sum(ii.line_total) from public.invoice_items ii where ii.invoice_id = i.id) as sum_lines,
         i.profit_total
  into v_rec
  from public.invoices i where i.id = v_inv_round;

  if v_rec.total <> 10050.0000 or v_rec.sum_lines <> 10050.0000 or v_rec.profit_total <> 50.0000 then
    raise exception 'Expected rounded invoice total=10050, sum_lines=10050, profit=50; got total=%, sum=%, profit=%',
      v_rec.total, v_rec.sum_lines, v_rec.profit_total;
  end if;

  -- 4) اختبار خصم مرتجع المبيعات من top_items وإلغاء الكمية المرتجعة بالكامل
  perform public.create_invoice(
    'sale_return', v_cust_a, v_wh_1, public.cairo_today(), 0, 'إرجاع كامل',
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 10000, 'unit_price', 1.005)),
    v_box_1
  );
  v_summary := public.get_home_dashboard_summary();
  v_charts := public.get_home_dashboard_charts(30);
  if exists (select 1 from jsonb_array_elements(v_summary->'top_items') x where (x->>'item_id')::uuid = v_item_a) then
    raise exception 'Expected fully returned item to be excluded from summary top_items';
  end if;
  if exists (select 1 from jsonb_array_elements(v_charts->'top_items') x where (x->>'item_id')::uuid = v_item_a) then
    raise exception 'Expected fully returned item to be excluded from charts top_items';
  end if;

  -- 5) اختبار تسعير sale_return لمخزن فرعي فارغ + حماية الشراء السابق من التعديل والحذف
  v_pur_1 := public.create_invoice(
    'purchase', v_sup_a, v_wh_1, public.cairo_today() - 2, 0, 'شراء 10 بسعر 50',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 10, 'unit_price', 50)),
    v_box_1
  );
  v_sale_1 := public.create_invoice(
    'sale', v_cust_a, v_wh_1, public.cairo_today() - 1, 0, 'بيع 5 بسعر 100',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 5, 'unit_price', 100)),
    v_box_1
  );
  -- إرجاع 2 وحدة إلى المخزن الثاني الفارغ تماماً
  v_sr_1 := public.create_invoice(
    'sale_return', v_cust_a, v_wh_2, public.cairo_today(), 0, 'إرجاع لمخزن فرعي',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 2, 'unit_price', 100)),
    v_box_1
  );
  if (select unit_cost from public.invoice_items where invoice_id = v_sr_1) <> 50.0000 then
    raise exception 'Expected sale_return into empty warehouse to inherit unit_cost 50';
  end if;
  if (select profit_total from public.invoices where id = v_sr_1) <> -100.0000 then
    raise exception 'Expected sale_return profit_total -100, got %',
      (select profit_total from public.invoices where id = v_sr_1);
  end if;
  if (select public.read_protected_cost('stock', v_item_b, v_wh_2)) <> 50.0000 then
    raise exception 'Expected wh2 avg_cost to be initialized to 50 on sale_return';
  end if;

  v_resale_2 := public.create_invoice(
    'sale', v_cust_a, v_wh_2, public.cairo_today(), 0, 'إعادة بيع من الفرعي',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 2, 'unit_price', 100)),
    v_box_1
  );
  if (select profit_total from public.invoices where id = v_resale_2) <> 100.0000 then
    raise exception 'Expected resale from wh2 profit_total 100 (not 200), got %',
      (select profit_total from public.invoices where id = v_resale_2);
  end if;

  -- اختبار منع تعديل/حذف فاتورة شراء عندما يكون المستند اللاحق فقط sale_return على نفس المخزن
  declare
    v_pur_sr uuid;
  begin
    v_pur_sr := public.create_invoice(
      'purchase', v_sup_a, v_wh_2, public.cairo_today() - 2, 0, 'شراء على الفرعي',
      jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 4, 'unit_price', 60)),
      v_box_1
    );
    perform public.create_invoice(
      'sale_return', v_cust_a, v_wh_2, public.cairo_today() - 1, 0, 'مرتجع لاحق للشراء',
      jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 1, 'unit_price', 100)),
      v_box_1
    );

    v_denied := false;
    begin
      perform public.update_invoice(
        v_pur_sr, v_sup_a, v_wh_2, public.cairo_today() - 2, 0, 'تعديل سعر ممنوع',
        jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 4, 'unit_price', 80)),
        v_box_1
      );
    exception when others then
      if sqlerrm = 'cannot_modify_purchase_items_with_subsequent_sales' then v_denied := true; end if;
    end;
    if not v_denied then
      raise exception 'Expected update_invoice on purchase with subsequent sale_return to be rejected';
    end if;

    v_denied := false;
    begin
      perform public.delete_invoice(v_pur_sr);
    exception when others then
      if sqlerrm = 'cannot_delete_purchase_with_subsequent_sales' then v_denied := true; end if;
    end;
    if not v_denied then
      raise exception 'Expected delete_invoice on purchase with subsequent sale_return to be rejected';
    end if;
  end;

  -- 6) اختبار فرق السعر في purchase_return في profit_total
  perform public.create_invoice(
    'purchase', v_sup_a, v_wh_1, public.cairo_today(), 0, 'شراء 5 بسعر 70',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 5, 'unit_price', 70)),
    v_box_1
  );
  -- المخزن الأول به: 5@50 + 5@70 = 10@60
  v_pr_1 := public.create_invoice(
    'purchase_return', v_sup_a, v_wh_1, public.cairo_today(), 0, 'مرتجع بسعر 70',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 5, 'unit_price', 70)),
    v_box_1
  );
  -- line_total = 350, cost = 5*60 = 300 => profit_total = +50
  if (select profit_total from public.invoices where id = v_pr_1) <> 50.0000 then
    raise exception 'Expected purchase_return variance profit_total 50, got %',
      (select profit_total from public.invoices where id = v_pr_1);
  end if;

  -- 7) اختبار تكلفة تعديل الافتتاحية وتطابق v_stock_opening_balances.cost_locked حتى مع أقدمية الفاتورة
  -- v_item_b لديه فواتير على wh_1 مسبقاً، نضيف الآن رصيداً افتتاحياً على wh_1
  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('warehouse_id', v_wh_1, 'item_id', v_item_b, 'opening_qty', 10, 'unit_cost', 50))
  );
  -- يجب أن يظهر cost_locked = true فوراً في العرض حتى لو كانت الفاتورة أسبق من صف الافتتاحية
  update public.stock_opening_balances set created_at = now() + interval '1 hour'
  where company_id = v_comp_a and warehouse_id = v_wh_1 and item_id = v_item_b;

  select cost_locked into v_cost_locked
  from public.v_stock_opening_balances
  where warehouse_id = v_wh_1 and item_id = v_item_b;
  if v_cost_locked is not true then
    raise exception 'Expected v_stock_opening_balances.cost_locked = true regardless of created_at order';
  end if;

  -- تصحيح الكمية الافتتاحية +2 يجب أن يسجل في stock_opening_adjustments بتكلفة 50 الأصلية لا بمتوسط 60
  perform public.save_opening_balances(
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('warehouse_id', v_wh_1, 'item_id', v_item_b, 'opening_qty', 12, 'unit_cost', 50))
  );
  if (select unit_cost from public.stock_opening_adjustments
      where company_id = v_comp_a and warehouse_id = v_wh_1 and item_id = v_item_b
      order by created_at desc limit 1) <> 50.0000 then
    raise exception 'Expected stock_opening_adjustments.unit_cost to equal opening unit_cost 50';
  end if;

  -- 8) اختبار منع استعادة فاتورة مدفوعة أو إيصال على خزنة/حساب معطل
  v_paid_inv := public.create_invoice(
    'sale', v_cust_a, v_wh_1, public.cairo_today(), 100, 'فاتورة مدفوعة',
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 1, 'unit_price', 100)),
    v_box_2
  );
  v_rcp_in := public.create_free_receipt(v_cust_a, v_box_2, public.cairo_today(), 50, null, 'سند قبض', 'in');
  perform public.delete_invoice(v_paid_inv);
  perform public.delete_free_receipt(v_rcp_in);
  perform public.toggle_cash_box_active(v_box_2);

  v_denied := false;
  begin
    perform public.restore_invoice(v_paid_inv);
  exception when others then
    if sqlerrm = 'invalid_cash_box' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Expected restore_invoice on inactive cash_box to fail with invalid_cash_box';
  end if;

  v_denied := false;
  begin
    perform public.restore_receipt(v_rcp_in);
  exception when others then
    if sqlerrm = 'invalid_cash_box' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Expected restore_receipt (in) on inactive cash_box to fail with invalid_cash_box';
  end if;

  perform public.toggle_cash_box_active(v_box_2);
  perform public.save_account(v_cust_a, 'عميل 70', 'customer', null, false, 0);

  v_denied := false;
  begin
    perform public.restore_receipt(v_rcp_in);
  exception when others then
    if sqlerrm = 'invalid_account' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Expected restore_receipt on inactive account to fail with invalid_account';
  end if;
  perform public.save_account(v_cust_a, 'عميل 70', 'customer', null, true, 0);

  -- 9) اختبار اكتشاف وتصحيح اختلال رأس الفاتورة في run_comprehensive_reconciliation
  update public.invoices set total = total + 15, profit_total = profit_total + 15
  where id = v_sale_1 and company_id = v_comp_a;

  v_recon := public.run_comprehensive_reconciliation('simulation', 'رصد انحراف الفاتورة');
  if (v_recon->>'discrepancies_count')::int < 2
     or not exists (
       select 1 from jsonb_array_elements(v_recon->'discrepancies') d
       where d->>'entity_category' = 'invoice_total' and (d->>'entity_id')::uuid = v_sale_1
     ) then
    raise exception 'Expected reconciliation simulation to detect invoice_total discrepancy, got %', v_recon;
  end if;

  v_recon := public.run_comprehensive_reconciliation('reconcile', 'تصحيح انحراف الفاتورة');
  if (select total from public.invoices where id = v_sale_1) <> 500.0000 then
    raise exception 'Expected reconciliation reconcile mode to restore invoice total to 500';
  end if;
  if (public.run_comprehensive_reconciliation('simulation', 'تحقق نظافة بعد الإصلاح')->>'discrepancies_count')::int <> 0 then
    raise exception 'Expected clean reconciliation right after reconcile';
  end if;

  -- 10) فحص العزل للشركة ب ورفض anon
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);

  v_denied := false;
  begin
    perform public.toggle_warehouse_active(v_wh_1);
  exception when others then
    if sqlerrm = 'warehouse_not_found' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Company B must not toggle Company A warehouse';
  end if;

  v_denied := false;
  begin
    perform public.restore_receipt(v_rcp_in);
  exception when others then
    if sqlerrm = 'receipt_not_found' then v_denied := true; end if;
  end;
  if not v_denied then
    raise exception 'Company B must not restore Company A receipt';
  end if;

  if exists (select 1 from public.v_stock_opening_balances where company_id = v_comp_a) then
    raise exception 'Company B must not see Company A v_stock_opening_balances';
  end if;
end;
$$;

rollback;
select 'PASS 070_comprehensive_accounting_and_audit_fixes' as result;

begin;

-- =====================================================================
-- 040_home_dashboard_summary.sql
-- اختبارات التحقق من صحة بيانات وأمان وصلاحيات get_home_dashboard_summary
-- =====================================================================

do $$
declare
  v_comp_a uuid := '66666666-6666-4666-8666-0000000000a1';
  v_comp_b uuid := '66666666-6666-4666-8666-0000000000b1';
  v_owner_a uuid := '66666666-6666-4666-8666-000000000001';
  v_emp_a uuid := '66666666-6666-4666-8666-000000000002';
  v_owner_b uuid := '66666666-6666-4666-8666-000000000003';

  v_wh_a uuid;
  v_cb_a uuid;
  v_cust_a uuid;
  v_supp_a uuid;
  v_item_a uuid;
  v_inv_a uuid;

  v_summary jsonb;
  v_failed boolean := false;
begin
  -- إعداد المستخدمين والشركات
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_dash_a@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp_dash_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_dash_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة أ للشاشة الرئيسية'),
    (v_comp_b, 'شركة ب للشاشة الرئيسية')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_emp_a, v_comp_a, 'موظف أ محدود', 'employee', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- 1) فحص أذونات التنفيذ: anon و public يجب أن تكون مسحوبة
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'get_home_dashboard_summary'
      and grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Expected get_home_dashboard_summary to have execute revoked from public and anon';
  end if;

  -- 2) إعداد بيانات شركة أ
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  insert into public.warehouses (company_id, name, is_active)
  values (v_comp_a, 'مخزن رئيسي أ', true)
  returning id into v_wh_a;

  insert into public.cash_boxes (company_id, name, is_active, opening_balance)
  values (v_comp_a, 'خزينة رئيسية أ', true, 5000.0000)
  returning id into v_cb_a;

  insert into public.accounts (company_id, name, kind, is_active, opening_balance)
  values (v_comp_a, 'عميل تجريبي أ', 'customer', true, 1200.0000)
  returning id into v_cust_a;

  insert into public.accounts (company_id, name, kind, is_active, opening_balance)
  values (v_comp_a, 'مورد تجريبي أ', 'supplier', true, 800.0000)
  returning id into v_supp_a;

  insert into public.items (company_id, name, unit, sale_price, purchase_price, is_active)
  values (v_comp_a, 'صنف بيبسي', 'قطعة', 10.0000, 7.0000, true)
  returning id into v_item_a;

  insert into public.item_stock (company_id, warehouse_id, item_id, qty)
  values (v_comp_a, v_wh_a, v_item_a, 3.0000); -- رصيد منخفض <= 5

  -- فاتورة بيع لشركة أ اليوم
  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, cost_total, profit_total)
  values (v_comp_a, 'sale', 'SAL-DASH-1', current_date, v_cust_a, v_wh_a, 100.0000, 100.0000, 100.0000, 70.0000, 30.0000)
  returning id into v_inv_a;

  insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
  values (v_comp_a, v_inv_a, v_item_a, 10.0000, 10.0000, 7.0000);

  -- 3) استدعاء الدالة بحساب مالك شركة أ
  v_summary := public.get_home_dashboard_summary();

  if (v_summary->'sales'->>'today')::numeric <> 100.0000 then
    raise exception 'Expected today sales 100, got %', v_summary->'sales'->>'today';
  end if;

  if (v_summary->>'cash_balance')::numeric <> 5000.0000 then
    raise exception 'Expected cash balance 5000, got %', v_summary->>'cash_balance';
  end if;

  if (v_summary->>'receivables_balance')::numeric <> 1300.0000 then
    raise exception 'Expected receivables balance 1300, got %', v_summary->>'receivables_balance';
  end if;

  if (v_summary->>'payables_balance')::numeric <> 800.0000 then
    raise exception 'Expected payables balance 800, got %', v_summary->>'payables_balance';
  end if;

  if jsonb_array_length(v_summary->'top_items') <> 1 then
    raise exception 'Expected 1 top item, got %', jsonb_array_length(v_summary->'top_items');
  end if;

  if jsonb_array_length(v_summary->'top_customers') <> 1 then
    raise exception 'Expected 1 top customer, got %', jsonb_array_length(v_summary->'top_customers');
  end if;

  if jsonb_array_length(v_summary->'low_stock_items') <> 1 then
    raise exception 'Expected 1 low stock item, got %', jsonb_array_length(v_summary->'low_stock_items');
  end if;

  -- 4) عزل الشركات (Tenant Isolation): مالك شركة ب يجب ألا يرى أي بيانات لشركة أ
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  v_summary := public.get_home_dashboard_summary();

  if (v_summary->'sales'->>'today')::numeric <> 0.0000
     or (v_summary->>'cash_balance')::numeric <> 0.0000
     or jsonb_array_length(v_summary->'top_items') <> 0 then
    raise exception 'Tenant leak: Company B saw data from Company A: %', v_summary;
  end if;

  -- 5) الصلاحيات المقيدة (موظف أ بدون أي أذونات)
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  v_summary := public.get_home_dashboard_summary();

  if jsonb_typeof(v_summary->'sales') <> 'null'
     or jsonb_typeof(v_summary->'cash_balance') <> 'null'
     or jsonb_typeof(v_summary->'top_items') <> 'null' then
    raise exception 'Permission leak: Employee without permissions saw sensitive data: %', v_summary;
  end if;

end $$;

rollback;

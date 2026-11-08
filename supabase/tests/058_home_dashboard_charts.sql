begin;

-- =====================================================================
-- 058_home_dashboard_charts.sql
-- اختبارات التحقق من أمان وصحة دالة get_home_dashboard_charts
-- =====================================================================

do $$
declare
  v_comp_a uuid := '77777777-7777-4777-8777-0000000000a1';
  v_comp_b uuid := '77777777-7777-4777-8777-0000000000b1';
  v_owner_a uuid := '77777777-7777-4777-8777-000000000001';
  v_owner_b uuid := '77777777-7777-4777-8777-000000000002';
  v_emp_no_sales uuid := '77777777-7777-4777-8777-000000000003';

  v_wh_a uuid;
  v_cust_a uuid;
  v_supp_a uuid;
  v_item_a uuid;

  v_res_a jsonb;
  v_res_b jsonb;
  v_res_emp jsonb;
  v_daily_trend jsonb;
  v_distribution jsonb;
begin
  -- إعداد الشركات والمستخدمين
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_charts_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_charts_b@test.local'),
    (v_emp_no_sales, 'authenticated', 'authenticated', 'emp_no_sales@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة أ للرسوم البيانية'),
    (v_comp_b, 'شركة ب للرسوم البيانية')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true),
    (v_emp_no_sales, v_comp_a, 'موظف بدون مبيعات', 'employee', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- 1) فحص أمان الصلاحيات: يجب سحب الصلاحيات من public و anon
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'get_home_dashboard_charts'
      and grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Security violation: get_home_dashboard_charts must revoke execute from public and anon';
  end if;

  -- 2) إعداد بيانات شركة أ
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  insert into public.warehouses (company_id, name)
  values (v_comp_a, 'مخزن أ الرئيسي')
  returning id into v_wh_a;

  insert into public.accounts (company_id, name, kind)
  values (v_comp_a, 'عميل أ1', 'customer')
  returning id into v_cust_a;

  insert into public.accounts (company_id, name, kind)
  values (v_comp_a, 'مورد أ1', 'supplier')
  returning id into v_supp_a;

  insert into public.items (company_id, name, unit, sale_price, purchase_price)
  values (v_comp_a, 'صنف تجريبي أ', 'قطعة', 100, 70)
  returning id into v_item_a;

  -- فاتورة بيع نقدية اليوم بقيمة 500 (بتوقيت مصر)
  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid)
  values (v_comp_a, 'sale', 'INV-SALE-001', public.cairo_today(), v_cust_a, v_wh_a, 500, 500, 500);

  -- فاتورة بيع آجل أمس بقيمة 300 (مدفوع 100، متبقي 200) (بتوقيت مصر)
  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid)
  values (v_comp_a, 'sale', 'INV-SALE-002', public.cairo_today() - 1, v_cust_a, v_wh_a, 300, 300, 100);

  -- فاتورة شراء اليوم بقيمة 400 (بتوقيت مصر)
  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid)
  values (v_comp_a, 'purchase', 'INV-PUR-001', public.cairo_today(), v_supp_a, v_wh_a, 400, 400, 400);

  -- بنود الفاتورة لاختبار top_items
  insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price)
  select v_comp_a, id, v_item_a, 5, 100
  from public.invoices where number = 'INV-SALE-001';

  -- استدعاء الدالة للمالك أ لـ 7 أيام
  v_res_a := public.get_home_dashboard_charts(7);

  v_daily_trend := v_res_a->'daily_trend';
  v_distribution := v_res_a->'sales_distribution';

  if jsonb_array_length(v_daily_trend) <> 7 then
    raise exception 'Expected daily_trend to have 7 days, got %', jsonb_array_length(v_daily_trend);
  end if;

  -- التحقق من مبيعات ومشتريات اليوم (آخر عنصر)
  if (v_daily_trend->6->>'sales')::numeric <> 500 then
    raise exception 'Expected today sales to be 500, got %', (v_daily_trend->6->>'sales');
  end if;

  if (v_daily_trend->6->>'purchases')::numeric <> 400 then
    raise exception 'Expected today purchases to be 400, got %', (v_daily_trend->6->>'purchases');
  end if;

  -- التحقق من مبيعات أمس (العنصر قبل الأخير)
  if (v_daily_trend->5->>'sales')::numeric <> 300 then
    raise exception 'Expected yesterday sales to be 300, got %', (v_daily_trend->5->>'sales');
  end if;

  -- التحقق من توزيع المبيعات (نقدي = 500 + 100 = 600، آجل = 200)
  if (v_distribution->>'cash_sales')::numeric <> 600 then
    raise exception 'Expected cash_sales to be 600, got %', (v_distribution->>'cash_sales');
  end if;

  if (v_distribution->>'credit_sales')::numeric <> 200 then
    raise exception 'Expected credit_sales to be 200, got %', (v_distribution->>'credit_sales');
  end if;

  -- فحص الفترات الموسعة: 180 يوماً و 365 يوماً و طول الوقت (0)
  if jsonb_array_length((public.get_home_dashboard_charts(180))->'daily_trend') <> 180 then
    raise exception 'Expected 180 days in daily_trend';
  end if;

  if jsonb_array_length((public.get_home_dashboard_charts(365))->'daily_trend') <> 365 then
    raise exception 'Expected 365 days in daily_trend';
  end if;

  -- طول الوقت (0): يبدأ من تاريخ أول فاتورة (أمس) حتى اليوم = يومين
  if jsonb_array_length((public.get_home_dashboard_charts(0))->'daily_trend') <> 2 then
    raise exception 'Expected 2 days in daily_trend for all-time (0), got %', jsonb_array_length((public.get_home_dashboard_charts(0))->'daily_trend');
  end if;

  -- فحص top_items و top_customers
  if jsonb_array_length(v_res_a->'top_items') <> 1 then
    raise exception 'Expected 1 top item, got %', jsonb_array_length(v_res_a->'top_items');
  end if;
  if (v_res_a->'top_items'->0->>'total_qty')::numeric <> 5 then
    raise exception 'Expected top item total_qty to be 5, got %', (v_res_a->'top_items'->0->>'total_qty');
  end if;

  if jsonb_array_length(v_res_a->'top_customers') <> 1 then
    raise exception 'Expected 1 top customer, got %', jsonb_array_length(v_res_a->'top_customers');
  end if;
  if (v_res_a->'top_customers'->0->>'total_amount')::numeric <> 800 then
    raise exception 'Expected top customer total_amount to be 800, got %', (v_res_a->'top_customers'->0->>'total_amount');
  end if;

  -- 3) فحص العزل للشركة ب (Tenant Isolation): يجب أن تكون نتائج شركة ب فارغة أو أصفار
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  v_res_b := public.get_home_dashboard_charts(7);
  if (v_res_b->'sales_distribution'->>'cash_sales')::numeric <> 0 then
    raise exception 'Expected company B cash_sales to be 0, got %', (v_res_b->'sales_distribution'->>'cash_sales');
  end if;

  -- 4) فحص الموظف الذي لا يملك صلاحية المبيعات
  perform set_config('request.jwt.claim.sub', v_emp_no_sales::text, true);
  v_res_emp := public.get_home_dashboard_charts(7);
  if v_res_emp->>'sales_distribution' is not null then
    raise exception 'Expected sales_distribution to be null for employee without sales permission, got %', v_res_emp->>'sales_distribution';
  end if;
  if v_res_emp->>'top_items' is not null or v_res_emp->>'top_customers' is not null then
    raise exception 'Expected top_items and top_customers to be null for employee without sales permission';
  end if;
  if (v_res_emp->'permissions'->>'can_view_sales')::boolean <> false then
    raise exception 'Expected can_view_sales to be false for employee';
  end if;

end $$;

rollback;

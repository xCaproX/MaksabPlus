begin;

-- =====================================================================
-- 039_security_hardening.sql
-- اختبارات التحقق من إغلاق ثغرات المزامنة، حجب الأرباح، وفحص الصلاحيات
-- =====================================================================

do $$
declare
  v_comp_a uuid := '55555555-5555-4555-8555-0000000000a1';
  v_comp_b uuid := '55555555-5555-4555-8555-0000000000b1';
  v_owner_a uuid := '55555555-5555-4555-8555-000000000001';
  v_emp_a uuid := '55555555-5555-4555-8555-000000000002';
  v_owner_b uuid := '55555555-5555-4555-8555-000000000003';
  v_wh_id uuid;
  v_acc_id uuid;
  v_item_id uuid;
  v_inv_id uuid;
  v_rec record;
  v_failed boolean := false;
  v_kpis jsonb;
begin
  -- إعداد المستخدمين والشركات
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_a@test.local'),
    (v_emp_a, 'authenticated', 'authenticated', 'emp_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة أ للأمان'),
    (v_comp_b, 'شركة ب للأمان')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك شركة أ', 'owner', true),
    (v_emp_a, v_comp_a, 'موظف شركة أ', 'employee', true),
    (v_owner_b, v_comp_b, 'مالك شركة ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- 1) فحص سحب صلاحيات المزامنة المباشرة (sync_account_balance / sync_cash_box_balance)
  -- التحقق من عدم وجود صلاحية execute لـ authenticated و anon و public
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('sync_account_balance', 'sync_cash_box_balance')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'Expected sync balance functions to have direct execute revoked';
  end if;

  -- 2) إنشاء بيانات اختبار تحت شركة أ (مخزن، حساب، خزنة، صنف، فاتورة)
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  insert into public.warehouses (company_id, name, is_active)
  values (v_comp_a, 'مخزن رئيسي أ', true)
  returning id into v_wh_id;

  insert into public.cash_boxes (company_id, name, is_active)
  values (v_comp_a, 'خزينة رئيسية أ', true);

  insert into public.accounts (company_id, kind, name, is_active)
  values (v_comp_a, 'customer', 'عميل أمان أ', true)
  returning id into v_acc_id;

  insert into public.items (company_id, name, code, unit, sale_price, purchase_price, is_active)
  values (v_comp_a, 'صنف ربح أ', 'SEC-001', 'قطعة', 200, 120, true)
  returning id into v_item_id;

  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
  values (v_comp_a, v_wh_id, v_item_id, 10, 120);

  v_inv_id := public.create_invoice(
    'sale', v_acc_id, v_wh_id, current_date, 0, 'فاتورة فحص أمان',
    jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'qty', 1, 'unit_price', 200))
  );

  -- 3) فحص عزل can_view_profit():
  -- المالك يرى true
  if not public.can_view_profit() then
    raise exception 'Expected can_view_profit to return TRUE for owner';
  end if;

  -- الموظف يرى false
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  if public.can_view_profit() then
    raise exception 'Expected can_view_profit to return FALSE for employee';
  end if;

  -- 4) فحص حجب الأرباح في v_invoice_list:
  -- الموظف يرى الفاتورة لكن حقول الربح والتكلفة NULL
  select cost_total, profit_total into v_rec
  from public.v_invoice_list
  where id = v_inv_id;

  if v_rec.cost_total is not null or v_rec.profit_total is not null then
    raise exception 'Expected cost_total and profit_total to be NULL for employee, got cost=%, profit=%',
      v_rec.cost_total, v_rec.profit_total;
  end if;

  -- المالك يرى قيم الأرباح الحقيقية
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  select cost_total, profit_total into v_rec
  from public.v_invoice_list
  where id = v_inv_id;

  if v_rec.cost_total <> 120 or v_rec.profit_total <> 80 then
    raise exception 'Expected cost_total=120 and profit_total=80 for owner, got cost=%, profit=%',
      v_rec.cost_total, v_rec.profit_total;
  end if;

  -- 5) فحص دوال الـ KPIs:
  -- موظف بدون صلاحية استعراض المبيعات يُرفض بـ permission_denied (42501)
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  v_failed := false;
  begin
    perform public.get_invoice_kpis('sale');
  exception
    when sqlstate '42501' then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected get_invoice_kpis to fail with 42501 for employee without permission';
  end if;

  -- منح الموظف صلاحية goods.sale.view
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform public.set_user_permissions(v_emp_a, array['goods.sale.view']);

  -- الآن الموظف يستدعي get_invoice_kpis بنجاح لكن profit_total يكون NULL
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  v_kpis := public.get_invoice_kpis('sale');
  if v_kpis->>'profit_total' is not null then
    raise exception 'Expected profit_total in get_invoice_kpis to be NULL for employee, got %',
      v_kpis->>'profit_total';
  end if;

  -- المالك يستدعي get_invoice_kpis ويحصل على profit_total الفعلي (80)
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  v_kpis := public.get_invoice_kpis('sale');
  if (v_kpis->>'profit_total')::numeric <> 80 then
    raise exception 'Expected profit_total 80 for owner in get_invoice_kpis, got %',
      v_kpis->>'profit_total';
  end if;

  -- 6) فحص reconcile_all_balances للمالك فقط
  perform set_config('request.jwt.claim.sub', v_emp_a::text, true);
  v_failed := false;
  begin
    perform * from public.reconcile_all_balances();
  exception
    when sqlstate '42501' then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected reconcile_all_balances to fail with 42501 for non-owner';
  end if;

  -- المالك يستدعي reconcile_all_balances بنجاح
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform * from public.reconcile_all_balances();

  -- 7) فحص عزل recalc_invoice_totals ضد محاولة شركة أخرى
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  -- محاولة شركة ب إعادة احتساب فاتورة شركة أ (لا تؤثر على شركة أ)
  perform public.recalc_invoice_totals(v_inv_id);
end;
$$;

rollback;

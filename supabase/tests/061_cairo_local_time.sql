-- =====================================================================
-- 061_cairo_local_time.sql
-- التحقق من دقة توقيت القاهرة المحلي (Africa/Cairo) في دوال الإحصائيات والقيم الافتراضية
-- =====================================================================

begin;

do $$
declare
  v_comp_a uuid := '61616161-6161-4161-8161-0000000000a1';
  v_comp_b uuid := '61616161-6161-4161-8161-0000000000b1';
  v_owner_a uuid := '61616161-6161-4161-8161-000000000001';
  v_owner_b uuid := '61616161-6161-4161-8161-000000000002';

  v_customer_a uuid;
  v_wh_a uuid;
  v_item_a uuid;
  v_cash_box_a uuid;
  v_inv_id uuid;
  v_rcp_id uuid;
  v_inv_row record;
  v_rcp_row record;
  v_res_a jsonb;
  v_res_b jsonb;
begin
  -- 1) فحص أمان الدالة cairo_today
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'cairo_today'
      and grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'Security violation: cairo_today must revoke execute from public and anon';
  end if;

  if public.cairo_today() <> (now() at time zone 'Africa/Cairo')::date then
    raise exception 'cairo_today() did not match (now() at time zone ''Africa/Cairo'')::date';
  end if;

  -- 2) إعداد مستخدمين وشركات
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_cairo_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_cairo_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة اختبار توقيت القاهرة أ'),
    (v_comp_b, 'شركة اختبار توقيت القاهرة ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك القاهرة أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك القاهرة ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  insert into public.warehouses (company_id, name) values (v_comp_a, 'مخزن القاهرة') returning id into v_wh_a;
  insert into public.accounts (company_id, name, kind) values (v_comp_a, 'عميل القاهرة', 'customer') returning id into v_customer_a;
  insert into public.items (company_id, name, unit) values (v_comp_a, 'صنف القاهرة', 'قطعة') returning id into v_item_a;
  insert into public.cash_boxes (company_id, name) values (v_comp_a, 'خزينة القاهرة') returning id into v_cash_box_a;

  -- 3) فحص القيم الافتراضية للجداول (invoice_date و receipt_date)
  insert into public.invoices (company_id, account_id, warehouse_id, number, kind, total, paid)
  values (v_comp_a, v_customer_a, v_wh_a, 'INV-CAIRO-DEF', 'sale', 1000, 1000)
  returning * into v_inv_row;

  if v_inv_row.invoice_date <> public.cairo_today() then
    raise exception 'Expected default invoice_date to be cairo_today (%), got %', public.cairo_today(), v_inv_row.invoice_date;
  end if;

  insert into public.receipts (company_id, number, account_id, cash_box_id, amount, direction)
  values (v_comp_a, 'RCP-CAIRO-DEF', v_customer_a, v_cash_box_a, 500, 'in')
  returning * into v_rcp_row;

  if v_rcp_row.receipt_date <> public.cairo_today() then
    raise exception 'Expected default receipt_date to be cairo_today (%), got %', public.cairo_today(), v_rcp_row.receipt_date;
  end if;

  -- 4) إضافة فاتورة أمس بتوقيت القاهرة
  insert into public.invoices (company_id, account_id, warehouse_id, number, invoice_date, kind, total, paid)
  values (v_comp_a, v_customer_a, v_wh_a, 'INV-CAIRO-YEST', public.cairo_today() - 1, 'sale', 700, 700);

  -- 5) استدعاء get_home_dashboard_summary() وفحص المطابقة
  v_res_a := public.get_home_dashboard_summary();

  if (v_res_a->'sales'->>'today')::numeric <> 1000 then
    raise exception 'Expected cairo today sales to be 1000, got %', (v_res_a->'sales'->>'today');
  end if;

  if (v_res_a->'sales'->>'yesterday')::numeric <> 700 then
    raise exception 'Expected cairo yesterday sales to be 700, got %', (v_res_a->'sales'->>'yesterday');
  end if;

  if (v_res_a->'collections'->>'today')::numeric <> 500 then
    raise exception 'Expected cairo today collections to be 500, got %', (v_res_a->'collections'->>'today');
  end if;

  -- 6) فحص العزل لشركة ب
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  v_res_b := public.get_home_dashboard_summary();
  if (v_res_b->'sales'->>'today')::numeric <> 0 or (v_res_b->'sales'->>'yesterday')::numeric <> 0 then
    raise exception 'Tenant isolation failed in cairo test';
  end if;

  raise notice 'Test 061 (cairo_local_time) passed successfully';
end $$;

rollback;

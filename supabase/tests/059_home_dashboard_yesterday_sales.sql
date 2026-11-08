-- Test 059: Home Dashboard Yesterday Sales & Counts
begin;

do $$
declare
  v_comp_a uuid := '88888888-8888-4888-8888-0000000000a1';
  v_comp_b uuid := '88888888-8888-4888-8888-0000000000b1';
  v_owner_a uuid := '88888888-8888-4888-8888-000000000001';
  v_owner_b uuid := '88888888-8888-4888-8888-000000000002';

  v_customer_a uuid;
  v_wh_a uuid;
  v_item_a uuid;
  v_inv_today uuid;
  v_inv_yest uuid;
  v_res_a jsonb;
  v_res_b jsonb;
begin
  -- 1) Create users and companies
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_yest_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_yest_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة اختبار مبيعات الأمس أ'),
    (v_comp_b, 'شركة اختبار مبيعات الأمس ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- Authenticate as owner of company A
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- Create warehouse, customer and item
  insert into public.warehouses (company_id, name) values (v_comp_a, 'مخزن رئيسي') returning id into v_wh_a;
  insert into public.accounts (company_id, name, kind) values (v_comp_a, 'عميل أمس', 'customer') returning id into v_customer_a;
  insert into public.items (company_id, name, unit) values (v_comp_a, 'صنف أمس', 'قطعة') returning id into v_item_a;

  -- 2) Insert yesterday invoice (current_date - 1)
  insert into public.invoices (company_id, account_id, warehouse_id, number, invoice_date, kind, total, paid)
  values (v_comp_a, v_customer_a, v_wh_a, 'INV-YEST-1', current_date - 1, 'sale', 1200, 1200)
  returning id into v_inv_yest;

  insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price)
  values (v_comp_a, v_inv_yest, v_item_a, 2, 600);

  -- 3) Insert today invoice (current_date)
  insert into public.invoices (company_id, account_id, warehouse_id, number, invoice_date, kind, total, paid)
  values (v_comp_a, v_customer_a, v_wh_a, 'INV-TODAY-1', current_date, 'sale', 1500, 1500)
  returning id into v_inv_today;

  insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price)
  values (v_comp_a, v_inv_today, v_item_a, 3, 500);

  -- 4) Call get_home_dashboard_summary()
  v_res_a := public.get_home_dashboard_summary();

  -- Assert today sales and count
  if (v_res_a->'sales'->>'today')::numeric != 1500 then
    raise exception 'Expected today sales 1500, got %', v_res_a->'sales'->>'today';
  end if;

  if (v_res_a->'sales'->>'today_count')::int != 1 then
    raise exception 'Expected today count 1, got %', v_res_a->'sales'->>'today_count';
  end if;

  -- Assert yesterday sales and count
  if (v_res_a->'sales'->>'yesterday')::numeric != 1200 then
    raise exception 'Expected yesterday sales 1200, got %', v_res_a->'sales'->>'yesterday';
  end if;

  if (v_res_a->'sales'->>'yesterday_count')::int != 1 then
    raise exception 'Expected yesterday count 1, got %', v_res_a->'sales'->>'yesterday_count';
  end if;

  -- 5) Tenant isolation: user from Company B cannot see Company A's sales
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);

  v_res_b := public.get_home_dashboard_summary();

  if (v_res_b->'sales'->>'today')::numeric != 0 or (v_res_b->'sales'->>'yesterday')::numeric != 0 then
    raise exception 'Tenant leakage: Company B saw sales from Company A: %', v_res_b->'sales';
  end if;

  raise notice 'Test 059 passed successfully';
end;
$$;

rollback;

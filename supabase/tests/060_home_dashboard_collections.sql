-- Test 060: Home Dashboard Collections (Today & Yesterday) & Tenant Isolation
begin;

do $$
declare
  v_comp_a uuid := '99999999-9999-4999-8999-0000000000a1';
  v_comp_b uuid := '99999999-9999-4999-8999-0000000000b1';
  v_owner_a uuid := '99999999-9999-4999-8999-000000000001';
  v_owner_b uuid := '99999999-9999-4999-8999-000000000002';

  v_customer_a uuid;
  v_cash_box_a uuid;
  v_res_a jsonb;
  v_res_b jsonb;
begin
  -- 1) Create users and companies
  insert into auth.users (id, aud, role, email)
  values
    (v_owner_a, 'authenticated', 'authenticated', 'owner_coll_a@test.local'),
    (v_owner_b, 'authenticated', 'authenticated', 'owner_coll_b@test.local')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values
    (v_comp_a, 'شركة اختبار التحصيلات أ'),
    (v_comp_b, 'شركة اختبار التحصيلات ب')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name, access_role, is_active)
  values
    (v_owner_a, v_comp_a, 'مالك أ', 'owner', true),
    (v_owner_b, v_comp_b, 'مالك ب', 'owner', true)
  on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

  -- Authenticate as owner of company A
  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- Create customer and cash box
  insert into public.accounts (company_id, name, kind) values (v_comp_a, 'عميل تحصيلات', 'customer') returning id into v_customer_a;
  insert into public.cash_boxes (company_id, name) values (v_comp_a, 'خزينة رئيسية') returning id into v_cash_box_a;

  -- 2) Insert yesterday receipt (cairo_today - 1) direction 'in'
  insert into public.receipts (company_id, number, receipt_date, account_id, cash_box_id, amount, direction)
  values (v_comp_a, 'RCP-YEST-1', public.cairo_today() - 1, v_customer_a, v_cash_box_a, 2000, 'in');

  -- 3) Insert today receipts (cairo_today) direction 'in' (two receipts: 1500 and 3500)
  insert into public.receipts (company_id, number, receipt_date, account_id, cash_box_id, amount, direction)
  values (v_comp_a, 'RCP-TODAY-1', public.cairo_today(), v_customer_a, v_cash_box_a, 1500, 'in');

  insert into public.receipts (company_id, number, receipt_date, account_id, cash_box_id, amount, direction)
  values (v_comp_a, 'RCP-TODAY-2', public.cairo_today(), v_customer_a, v_cash_box_a, 3500, 'in');

  -- Insert a receipt with direction 'out' (should NOT be counted in collections)
  insert into public.receipts (company_id, number, receipt_date, account_id, cash_box_id, amount, direction)
  values (v_comp_a, 'RCP-TODAY-OUT', public.cairo_today(), v_customer_a, v_cash_box_a, 800, 'out');

  -- 4) Call get_home_dashboard_summary()
  v_res_a := public.get_home_dashboard_summary();

  -- Assert today collections and count (1500 + 3500 = 5000, count = 2)
  if (v_res_a->'collections'->>'today')::numeric != 5000 then
    raise exception 'Expected today collections 5000, got %', v_res_a->'collections'->>'today';
  end if;

  if (v_res_a->'collections'->>'today_count')::int != 2 then
    raise exception 'Expected today collections count 2, got %', v_res_a->'collections'->>'today_count';
  end if;

  -- Assert yesterday collections and count (2000, count = 1)
  if (v_res_a->'collections'->>'yesterday')::numeric != 2000 then
    raise exception 'Expected yesterday collections 2000, got %', v_res_a->'collections'->>'yesterday';
  end if;

  if (v_res_a->'collections'->>'yesterday_count')::int != 1 then
    raise exception 'Expected yesterday collections count 1, got %', v_res_a->'collections'->>'yesterday_count';
  end if;

  -- 5) Tenant isolation: user from Company B cannot see Company A's collections
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);

  v_res_b := public.get_home_dashboard_summary();

  if (v_res_b->'collections'->>'today')::numeric != 0 or (v_res_b->'collections'->>'yesterday')::numeric != 0 then
    raise exception 'Tenant leakage: Company B saw collections from Company A: %', v_res_b->'collections';
  end if;

  raise notice 'Test 060 passed successfully';
end;
$$;

rollback;

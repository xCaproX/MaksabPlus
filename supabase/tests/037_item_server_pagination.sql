begin;

-- 1. التحقق من وجود وسلامة فهارس تصفح الأصناف
do $$
declare
  v_idx text;
  v_expected text[] := array[
    'items_paged_name_idx',
    'items_paged_serial_idx',
    'items_paged_price_idx',
    'items_search_active_code_idx'
  ];
begin
  foreach v_idx in array v_expected loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = v_idx
    ) then
      raise exception 'Missing expected item pagination index: %', v_idx;
    end if;
  end loop;
end;
$$;

-- 2. التحقق من منع الاستدعاء دون مصادقة (Unauthenticated boundary check)
do $$
declare
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  begin
    perform public.get_master_items_kpis();
  exception
    when sqlstate '28000' then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'Expected get_master_items_kpis to fail with not_authenticated (28000)';
  end if;
end;
$$;

-- 3. التحقق من عمل دالة مؤشرات إدارة الأصناف وأرصدة المخزون
do $$
declare
  v_company_id uuid := '33333333-3333-4333-8333-0000000000f1';
  v_user_id uuid := '33333333-3333-4333-8333-000000000001';
  v_wh_id uuid;
  v_item1_id uuid;
  v_item2_id uuid;
  v_res_master jsonb;
  v_res_stock jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'item_paged_test@test.local', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_company_id, 'شركة فحص تصفح الأصناف')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name)
  values (v_user_id, v_company_id, 'مستخدم فحص الأصناف')
  on conflict (id) do update set company_id = v_company_id;

  -- محاكاة جلسة تسجيل الدخول
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- إنشاء مخزن للاختبار
  insert into public.warehouses (company_id, name, is_active)
  values (v_company_id, 'مخزن اختبار رئيسي', true)
  returning id into v_wh_id;

  -- إنشاء صنفين للاختبار
  insert into public.items (company_id, name, code, unit, sale_price, purchase_price, is_active)
  values (v_company_id, 'صنف اختبار متوفر', 'TEST-001', 'قطعة', 100, 70, true)
  returning id into v_item1_id;

  insert into public.items (company_id, name, code, unit, sale_price, purchase_price, is_active)
  values (v_company_id, 'صنف اختبار نفد', 'TEST-002', 'قطعة', 200, 150, true)
  returning id into v_item2_id;

  -- إدخال رصيد للصنف الأول فقط
  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
  values (v_company_id, v_wh_id, v_item1_id, 15, 70);

  -- اختبار مؤشرات الأصناف
  v_res_master := public.get_master_items_kpis('صنف اختبار', 'all');

  if (v_res_master->>'total_count')::int <> 2 then
    raise exception 'Expected total_count 2, got %', v_res_master->>'total_count';
  end if;

  if (v_res_master->>'active_count')::int <> 2 then
    raise exception 'Expected active_count 2, got %', v_res_master->>'active_count';
  end if;

  if (v_res_master->>'avg_price')::numeric <> 150 then
    raise exception 'Expected avg_price 150, got %', v_res_master->>'avg_price';
  end if;

  -- اختبار مؤشرات أرصدة المخزن
  v_res_stock := public.get_warehouse_stock_kpis(v_wh_id, 'صنف اختبار');

  if (v_res_stock->>'count')::int <> 2 then
    raise exception 'Expected count 2, got %', v_res_stock->>'count';
  end if;

  if (v_res_stock->>'total_qty')::numeric <> 15 then
    raise exception 'Expected total_qty 15, got %', v_res_stock->>'total_qty';
  end if;

  if (v_res_stock->>'total_val')::numeric <> 1050 then
    raise exception 'Expected total_val 1050 (15 * 70), got %', v_res_stock->>'total_val';
  end if;

  if (v_res_stock->>'out_of_stock_count')::int <> 1 then
    raise exception 'Expected out_of_stock_count 1, got %', v_res_stock->>'out_of_stock_count';
  end if;

  -- اختبار مؤشرات كل المخازن (null warehouse_id)
  v_res_stock := public.get_warehouse_stock_kpis(null, 'صنف اختبار');
  if (v_res_stock->>'count')::int <> 4 then
    raise exception 'Expected count 4 across all warehouses, got %', v_res_stock->>'count';
  end if;
end;
$$;

rollback;

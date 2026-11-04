begin;

-- 1. التحقق من وجود أعمدة cost_total و profit_total في جدول invoices
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name in ('cost_total', 'profit_total')
    having count(*) = 2
  ) then
    raise exception 'Missing expected columns cost_total or profit_total on public.invoices';
  end if;
end;
$$;

-- 2. التحقق من وجود فهارس تصفح الفواتير
do $$
declare
  v_idx text;
  v_expected text[] := array[
    'invoices_paged_date_idx',
    'invoices_paged_number_idx'
  ];
begin
  foreach v_idx in array v_expected loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = v_idx
    ) then
      raise exception 'Missing expected invoice pagination index: %', v_idx;
    end if;
  end loop;
end;
$$;

-- 3. التحقق من حساب cost_total و profit_total عند إنشاء فاتورة بيع وتعديلها
do $$
declare
  v_company_id uuid := '44444444-4444-4444-8444-0000000000f1';
  v_user_id uuid := '44444444-4444-4444-8444-000000000001';
  v_wh_id uuid;
  v_acc_id uuid;
  v_item_id uuid;
  v_inv_id uuid;
  v_rec record;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'denorm_test@test.local', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_company_id, 'شركة فحص أرباح الفواتير')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name)
  values (v_user_id, v_company_id, 'مستخدم فحص الأرباح')
  on conflict (id) do update set company_id = v_company_id;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- مخزن
  insert into public.warehouses (company_id, name, is_active)
  values (v_company_id, 'مخزن رئيسي للأرباح', true)
  returning id into v_wh_id;

  -- خزينة
  insert into public.cash_boxes (company_id, name, is_active)
  values (v_company_id, 'خزينة رئيسية للأرباح', true);

  -- حساب عميل
  insert into public.accounts (company_id, kind, name, is_active)
  values (v_company_id, 'customer', 'عميل فحص الأرباح', true)
  returning id into v_acc_id;

  -- صنف
  insert into public.items (company_id, name, code, unit, sale_price, purchase_price, is_active)
  values (v_company_id, 'صنف ذو تكلفة', 'COST-001', 'قطعة', 150, 100, true)
  returning id into v_item_id;

  -- رصيد أول مدة 10 قطع بتكلفة 100 ج
  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
  values (v_company_id, v_wh_id, v_item_id, 10, 100);

  -- إنشاء فاتورة بيع لـ 2 قطعة بسعر 150 ج.م
  -- إجمالي البيع = 300 ج.م، التكلفة = 200 ج.م (2 * 100)، الربح = 100 ج.م
  v_inv_id := public.create_invoice(
    'sale',
    v_acc_id,
    v_wh_id,
    current_date,
    300,
    'فاتورة تجربة دنورمالايز',
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_id, 'qty', 2, 'unit_price', 150)
    )
  );

  -- فحص القيم المحفوظة في جدول invoices
  select cost_total, profit_total into v_rec
  from public.invoices
  where id = v_inv_id;

  if v_rec.cost_total <> 200 then
    raise exception 'Expected cost_total 200, got %', v_rec.cost_total;
  end if;

  if v_rec.profit_total <> 100 then
    raise exception 'Expected profit_total 100, got %', v_rec.profit_total;
  end if;

  -- فحص القيم في v_invoice_list
  select cost_total, profit_total into v_rec
  from public.v_invoice_list
  where id = v_inv_id;

  if v_rec.cost_total <> 200 or v_rec.profit_total <> 100 then
    raise exception 'v_invoice_list mismatch: cost=%, profit=%', v_rec.cost_total, v_rec.profit_total;
  end if;

  -- تعديل الفاتورة لتصبح 3 قطع بسعر 160 ج.م
  -- إجمالي البيع = 480 ج.م، التكلفة = 300 ج.م (3 * 100)، الربح = 180 ج.م
  perform public.update_invoice(
    v_inv_id,
    v_acc_id,
    v_wh_id,
    current_date,
    480,
    'فاتورة معدلة',
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_id, 'qty', 3, 'unit_price', 160)
    )
  );

  select cost_total, profit_total into v_rec
  from public.invoices
  where id = v_inv_id;

  if v_rec.cost_total <> 300 then
    raise exception 'Expected updated cost_total 300, got %', v_rec.cost_total;
  end if;

  if v_rec.profit_total <> 180 then
    raise exception 'Expected updated profit_total 180, got %', v_rec.profit_total;
  end if;
end;
$$;

rollback;

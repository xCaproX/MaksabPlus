begin;

-- 1. التحقق من وجود وسلامة فهارس تصفح الحسابات
do $$
declare
  v_idx text;
  v_expected text[] := array[
    'accounts_paged_name_idx',
    'accounts_paged_serial_idx',
    'accounts_paged_balance_idx'
  ];
begin
  foreach v_idx in array v_expected loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = v_idx
    ) then
      raise exception 'Missing expected account pagination index: %', v_idx;
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
    perform public.get_account_balances_kpis('customer');
  exception
    when sqlstate '28000' then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'Expected get_account_balances_kpis to fail with not_authenticated (28000)';
  end if;
end;
$$;

-- 3. التحقق من عمل دالة مؤشرات أرصدة الحسابات ومؤشرات إدارة الحسابات لمستخدم مصرح
do $$
declare
  v_company_id uuid := '22222222-2222-4222-8222-0000000000f1';
  v_user_id uuid := '22222222-2222-4222-8222-000000000001';
  v_acc_id1 uuid;
  v_acc_id2 uuid;
  v_res_balances jsonb;
  v_res_master jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acc_paged_test@test.local', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_company_id, 'شركة فحص تصفح الحسابات')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name)
  values (v_user_id, v_company_id, 'مستخدم فحص الحسابات')
  on conflict (id) do update set company_id = v_company_id;

  -- محاكاة جلسة تسجيل الدخول
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- إنشاء عميلين للاختبار (الرصيد الافتتاحي هو مصدر الرصيد الأولي عبر المحفز)
  insert into public.accounts (company_id, kind, name, phone, opening_balance, is_active)
  values (v_company_id, 'customer', 'عميل تجريبي مدين', '01011111111', 1500, true)
  returning id into v_acc_id1;

  insert into public.accounts (company_id, kind, name, phone, opening_balance, is_active)
  values (v_company_id, 'customer', 'عميل تجريبي دائن', '01022222222', -400, false)
  returning id into v_acc_id2;

  -- حساب مؤشرات الأرصدة
  v_res_balances := public.get_account_balances_kpis('customer', 'عميل تجريبي');

  if (v_res_balances->>'count')::int <> 2 then
    raise exception 'Expected 2 matching accounts, got %', v_res_balances->>'count';
  end if;

  if (v_res_balances->>'total_debit')::numeric <> 1500 then
    raise exception 'Expected total_debit 1500, got %', v_res_balances->>'total_debit';
  end if;

  if (v_res_balances->>'total_credit')::numeric <> 400 then
    raise exception 'Expected total_credit 400, got %', v_res_balances->>'total_credit';
  end if;

  if (v_res_balances->>'net_balance')::numeric <> 1100 then
    raise exception 'Expected net_balance 1100, got %', v_res_balances->>'net_balance';
  end if;

  -- حساب مؤشرات إدارة الحسابات للنشطين
  v_res_master := public.get_master_accounts_kpis('customer', 'عميل تجريبي', 'all');

  if (v_res_master->>'total_count')::int <> 2 then
    raise exception 'Expected total_count 2, got %', v_res_master->>'total_count';
  end if;

  if (v_res_master->>'active_count')::int <> 1 then
    raise exception 'Expected active_count 1, got %', v_res_master->>'active_count';
  end if;

  if (v_res_master->>'inactive_count')::int <> 1 then
    raise exception 'Expected inactive_count 1, got %', v_res_master->>'inactive_count';
  end if;

  if (v_res_master->>'with_opening_count')::int <> 2 then
    raise exception 'Expected with_opening_count 2, got %', v_res_master->>'with_opening_count';
  end if;
end;
$$;

rollback;

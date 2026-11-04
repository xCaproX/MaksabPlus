begin;

-- 1. التحقق من وجود وسلامة فهارس التصفح بالصفحات
do $$
declare
  v_idx text;
  v_expected text[] := array[
    'invoices_paged_list_idx',
    'invoices_paged_deleted_idx',
    'receipts_paged_list_idx',
    'receipts_paged_deleted_idx',
    'warehouse_transfers_paged_list_idx',
    'warehouse_transfers_paged_deleted_idx',
    'cash_box_transfers_paged_list_idx',
    'cash_box_transfers_paged_deleted_idx'
  ];
begin
  foreach v_idx in array v_expected loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = v_idx
    ) then
      raise exception 'Missing expected pagination index: %', v_idx;
    end if;
  end loop;
end;
$$;

-- 2. التحقق من منع الاستدعاء دون مصادقة (Unauthenticated boundary check)
do $$
declare
  v_failed boolean := false;
begin
  -- تعيين البيئة دون مستخدم مسجل
  perform set_config('request.jwt.claim.sub', '', true);

  begin
    perform public.get_invoice_kpis('sale');
  exception
    when sqlstate '28000' then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'Expected get_invoice_kpis to fail with not_authenticated (28000)';
  end if;
end;
$$;

-- 3. اختبار استدعاء الدوال لمستخدم مصرح مع شركة افتراضية
do $$
declare
  v_company_id uuid := '11111111-1111-4111-8111-0000000000f1';
  v_user_id uuid := '11111111-1111-4111-8111-000000000001';
  v_inv_kpis jsonb;
  v_transfer_kpis jsonb;
  v_receipt_kpis jsonb;
  v_cash_transfer_kpis jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'paged_test@test.local', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_company_id, 'شركة اختبار مؤشرات الصفحات')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name)
  values (v_user_id, v_company_id, 'مستخدم الفحص')
  on conflict (id) do update set company_id = v_company_id;

  -- محاكاة جلسة تسجيل الدخول
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- فحص دالة فواتير المبيعات
  v_inv_kpis := public.get_invoice_kpis('sale', null, 'all', null, null, false);
  if not (v_inv_kpis ? 'total_amount' and v_inv_kpis ? 'paid_amount' and v_inv_kpis ? 'remaining_amount' and v_inv_kpis ? 'profit_total' and v_inv_kpis ? 'count') then
    raise exception 'get_invoice_kpis returned invalid JSON structure: %', v_inv_kpis;
  end if;

  -- فحص دالة تحويلات المخازن
  v_transfer_kpis := public.get_warehouse_transfer_kpis(null, null, null, false);
  if not (v_transfer_kpis ? 'total_value' and v_transfer_kpis ? 'total_qty' and v_transfer_kpis ? 'count') then
    raise exception 'get_warehouse_transfer_kpis returned invalid JSON structure: %', v_transfer_kpis;
  end if;

  -- فحص دالة الإيصالات
  v_receipt_kpis := public.get_receipt_kpis('in', null, null, null, null, false);
  if not (v_receipt_kpis ? 'total_amount' and v_receipt_kpis ? 'invoice_linked' and v_receipt_kpis ? 'count') then
    raise exception 'get_receipt_kpis returned invalid JSON structure: %', v_receipt_kpis;
  end if;

  -- فحص دالة تحويلات الخزن
  v_cash_transfer_kpis := public.get_cash_box_transfer_kpis(null, null, null, null, false);
  if not (v_cash_transfer_kpis ? 'total_amount' and v_cash_transfer_kpis ? 'count') then
    raise exception 'get_cash_box_transfer_kpis returned invalid JSON structure: %', v_cash_transfer_kpis;
  end if;
end;
$$;

rollback;

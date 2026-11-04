begin;

-- =====================================================================
-- 035_running_balances.sql
-- اختبارات التحقق من دقة وسرعة الأرصدة التراكمية (Running Balances)
-- ومطابقة الأرصدة ومنع التلاعب اليدوي وعزل الشركات
-- =====================================================================

-- 1. التحقق من وجود الأعمدة الجديدة على جداول accounts و cash_boxes
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounts' and column_name = 'current_balance'
  ) then
    raise exception 'Missing current_balance column on accounts table';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cash_boxes' and column_name = 'current_balance'
  ) then
    raise exception 'Missing current_balance column on cash_boxes table';
  end if;
end;
$$;

-- 2. إعداد شركة ومستخدم للاختبار
do $$
declare
  v_company_id uuid := '22222222-2222-4222-8222-0000000000f1';
  v_other_company_id uuid := '22222222-2222-4222-8222-0000000000f2';
  v_user_id uuid := '22222222-2222-4222-8222-000000000001';
  v_account_id uuid;
  v_cash_box_id uuid;
  v_cash_box_2_id uuid;
  v_warehouse_id uuid;
  v_item_id uuid;
  v_invoice_id uuid;
  v_receipt_id uuid;
  v_transfer_id uuid;
  v_bal numeric(18,4);
  v_disc_count integer;
  v_failed boolean := false;
begin
  -- إنشاء المستخدم والشركات
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'balance_test@test.local', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_company_id, 'شركة اختبار الأرصدة التراكمية')
  on conflict (id) do nothing;

  insert into public.companies (id, name)
  values (v_other_company_id, 'شركة أخرى للمقارنة والعزل')
  on conflict (id) do nothing;

  insert into public.profiles (id, company_id, full_name)
  values (v_user_id, v_company_id, 'مستخدم اختبار الأرصدة')
  on conflict (id) do update set company_id = v_company_id;

  -- تعيين سياق المستخدم للشركة الأولى
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- إنشاء مخزن وصنف
  insert into public.warehouses (company_id, name)
  values (v_company_id, 'مخزن الأرصدة الرئيسي')
  returning id into v_warehouse_id;

  insert into public.items (company_id, code, name, unit, sale_price, purchase_price)
  values (v_company_id, 'ITEM-BAL-01', 'صنف تجريبي للرصيد', 'قطعة', 100, 70)
  returning id into v_item_id;

  -- أ. إنشاء حساب برصيد افتتاحي 500
  insert into public.accounts (company_id, name, kind, opening_balance)
  values (v_company_id, 'عميل تجريبي للرصيد', 'customer', 500)
  returning id into v_account_id;

  -- التحقق من تهيئة الرصيد التراكمي للحساب فور الإنشاء
  select balance into v_bal from public.v_account_balances where id = v_account_id;
  if v_bal <> 500 then
    raise exception 'Account balance after creation expected 500, got %', v_bal;
  end if;

  -- ب. إنشاء خزنتين: الأولى برصيد افتتاحي 1000، والثانية برصيد 0
  insert into public.cash_boxes (company_id, name, opening_balance)
  values (v_company_id, 'خزينة تجريبية 1', 1000)
  returning id into v_cash_box_id;

  insert into public.cash_boxes (company_id, name, opening_balance)
  values (v_company_id, 'خزينة تجريبية 2', 0)
  returning id into v_cash_box_2_id;

  select balance into v_bal from public.v_cash_box_balances where id = v_cash_box_id;
  if v_bal <> 1000 then
    raise exception 'Cash box balance expected 1000, got %', v_bal;
  end if;

  -- ج. إنشاء فاتورة بيع آجل بقيمة 300
  insert into public.invoices (company_id, warehouse_id, account_id, number, invoice_date, kind, total, paid)
  values (v_company_id, v_warehouse_id, v_account_id, 'INV-BAL-001', current_date, 'sale', 300, 0)
  returning id into v_invoice_id;

  -- رصيد العميل يجب أن يصبح: 500 + 300 = 800
  select balance into v_bal from public.v_account_balances where id = v_account_id;
  if v_bal <> 800 then
    raise exception 'Account balance after sale invoice expected 800, got %', v_bal;
  end if;

  -- د. سداد إيصال استلام من العميل بقيمة 200 في الخزينة 1
  insert into public.receipts (company_id, account_id, cash_box_id, number, receipt_date, direction, amount)
  values (v_company_id, v_account_id, v_cash_box_id, 'REC-BAL-001', current_date, 'in', 200)
  returning id into v_receipt_id;

  -- رصيد العميل يجب أن يصبح: 800 - 200 = 600
  select balance into v_bal from public.v_account_balances where id = v_account_id;
  if v_bal <> 600 then
    raise exception 'Account balance after receipt expected 600, got %', v_bal;
  end if;

  -- رصيد الخزينة 1 يجب أن يصبح: 1000 + 200 = 1200
  select balance into v_bal from public.v_cash_box_balances where id = v_cash_box_id;
  if v_bal <> 1200 then
    raise exception 'Cash box balance after receipt expected 1200, got %', v_bal;
  end if;

  -- هـ. تحويل 400 من الخزينة 1 إلى الخزينة 2
  insert into public.cash_box_transfers (company_id, number, transfer_date, source_cash_box_id, destination_cash_box_id, amount)
  values (v_company_id, 'TR-BAL-001', current_date, v_cash_box_id, v_cash_box_2_id, 400)
  returning id into v_transfer_id;

  -- رصيد الخزينة 1: 1200 - 400 = 800
  select balance into v_bal from public.v_cash_box_balances where id = v_cash_box_id;
  if v_bal <> 800 then
    raise exception 'Cash box 1 balance after transfer expected 800, got %', v_bal;
  end if;

  -- رصيد الخزينة 2: 0 + 400 = 400
  select balance into v_bal from public.v_cash_box_balances where id = v_cash_box_2_id;
  if v_bal <> 400 then
    raise exception 'Cash box 2 balance after transfer expected 400, got %', v_bal;
  end if;

  -- و. اختبار الحذف المؤقت (Soft Delete) للفاتورة: يجب استبعادها فورًا من الرصيد
  update public.invoices set deleted_at = now() where id = v_invoice_id;

  -- رصيد العميل يجب أن يصبح: 500 (افتتاحي) - 200 (إيصال) = 300
  select balance into v_bal from public.v_account_balances where id = v_account_id;
  if v_bal <> 300 then
    raise exception 'Account balance after soft-deleting invoice expected 300, got %', v_bal;
  end if;

  -- استعادة الفاتورة
  update public.invoices set deleted_at = null where id = v_invoice_id;
  select balance into v_bal from public.v_account_balances where id = v_account_id;
  if v_bal <> 600 then
    raise exception 'Account balance after restoring invoice expected 600, got %', v_bal;
  end if;

  -- ز. اختبار الحماية من التعديل اليدوي للرصيد
  update public.accounts set current_balance = 99999 where id = v_account_id;
  select current_balance into v_bal from public.accounts where id = v_account_id;
  if v_bal = 99999 then
    raise exception 'Protection trigger failed! Account balance was overwritten manually to 99999';
  end if;
  if v_bal <> 600 then
    raise exception 'Account balance protection expected to retain 600, got %', v_bal;
  end if;

  -- ح. اختبار دالة المطابقة والتدقيق: يجب أن تعيد 0 فروقات
  select count(*) into v_disc_count from public.reconcile_all_balances();
  if v_disc_count <> 0 then
    raise exception 'Reconciliation expected 0 discrepancies, found %', v_disc_count;
  end if;

  -- ط. اختبار عزل الشركات: محاولة مطابقة شركة أخرى يجب أن تفشل بخطأ unauthorized_company (42501)
  begin
    perform public.reconcile_all_balances(v_other_company_id);
  exception
    when sqlstate '42501' then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'Expected reconcile_all_balances for other company to fail with 42501';
  end if;

end;
$$;

rollback;

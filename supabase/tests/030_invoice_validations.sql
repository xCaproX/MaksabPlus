-- ============================================================================
-- اختبارات 030: التحقق من قواعد الأعمال لفواتير المبيعات وحركات المخزون والعميل النقدي
-- 1. حقل الكمية لا يقبل أقل من 1 ولا يقبل كمية أكبر من المتاح
-- 2. حظر بيع صنف رصيده المتاح 0
-- 3. المدفوع لا يتجاوز الإجمالي ولا يقل عن الصفر
-- 4. العميل النقدي يلزم سداد كامل قيمة الفاتورة
-- 5. عزل الشركات (RLS)
-- ============================================================================

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;

-- Setup Company A
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('30303030-3030-4030-8030-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'valid_a@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('30303030-3030-4030-8030-0000000000a1', 'شركة التحقق أ');
insert into public.profiles (id, company_id, full_name, access_role)
values ('30303030-3030-4030-8030-000000000001', '30303030-3030-4030-8030-0000000000a1', 'مستخدم أ', 'owner');
insert into public.warehouses (id, company_id, name)
values ('30303030-3030-4030-8030-0000000000b1', '30303030-3030-4030-8030-0000000000a1', 'مخزن رئيسي أ');
insert into public.cash_boxes (id, company_id, name)
values ('30303030-3030-4030-8030-0000000000c1', '30303030-3030-4030-8030-0000000000a1', 'خزينة أ');

-- Items in Company A
insert into public.items (id, company_id, name, sale_price, purchase_price)
values
  ('30303030-3030-4030-8030-0000000000e1', '30303030-3030-4030-8030-0000000000a1', 'صنف متاح رصيد 5', 50, 30),
  ('30303030-3030-4030-8030-0000000000e2', '30303030-3030-4030-8030-0000000000a1', 'صنف رصيده صفر', 100, 70);

insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values
  ('30303030-3030-4030-8030-0000000000a1', '30303030-3030-4030-8030-0000000000b1', '30303030-3030-4030-8030-0000000000e1', 5, 30),
  ('30303030-3030-4030-8030-0000000000a1', '30303030-3030-4030-8030-0000000000b1', '30303030-3030-4030-8030-0000000000e2', 0, 70);

-- Regular Customer in Company A
insert into public.accounts (id, company_id, name, kind)
values ('30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000a1', 'عميل آجل معتمد', 'customer');

-- Setup Company B (for RLS check)
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('30303030-3030-4030-8030-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'valid_b@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('30303030-3030-4030-8030-0000000000f2', 'شركة ب');
insert into public.profiles (id, company_id, full_name, access_role)
values ('30303030-3030-4030-8030-000000000002', '30303030-3030-4030-8030-0000000000f2', 'مستخدم ب', 'owner');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30303030-3030-4030-8030-000000000001"}', true);

do $$
declare
  v_cash_customer uuid;
  v_invoice uuid;
  v_err text;
begin
  select id into v_cash_customer
  from public.accounts
  where company_id = '30303030-3030-4030-8030-0000000000a1' and system_key = 'cash_customer';

  -- 1. رفض كمية أقل من 1 (مثلاً 0 أو كسر أقل من 1)
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', '30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000b1',
      current_date, 0, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":0.5,"unit_price":50}]'::jsonb
    );
    raise exception 'should have failed on qty < 1';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'invalid_line_qty', 'reject line qty < 1', v_err);

  -- 2. رفض اختيار وبيع صنف رصيده المتاح 0 بالمخزن
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', '30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000b1',
      current_date, 0, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e2","qty":1,"unit_price":100}]'::jsonb
    );
    raise exception 'should have failed on zero stock item';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'insufficient_stock', 'reject item with 0 available stock', v_err);

  -- 3. رفض كمية أكبر من المتاح (المتاح 5 والمطلوب 6)
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', '30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000b1',
      current_date, 0, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":6,"unit_price":50}]'::jsonb
    );
    raise exception 'should have failed on qty > available';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'insufficient_stock', 'reject qty > available stock', v_err);

  -- 4. رفض مدفوع أكبر من إجمالي الفاتورة
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', '30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000b1',
      current_date, 200, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":2,"unit_price":50}]'::jsonb
    );
    raise exception 'should have failed on paid > total';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'paid_exceeds_total', 'reject paid > total', v_err);

  -- 5. رفض مدفوع أقل من الصفر
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', '30303030-3030-4030-8030-0000000000d1', '30303030-3030-4030-8030-0000000000b1',
      current_date, -10, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":2,"unit_price":50}]'::jsonb
    );
    raise exception 'should have failed on paid < 0';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'invalid_paid', 'reject paid < 0', v_err);

  -- 6. رفض سداد جزئي أو عدم سداد للعميل النقدي (إجمالي 100 ومدفوع 0)
  v_err := '';
  begin
    perform public.create_invoice(
      'sale', v_cash_customer, '30303030-3030-4030-8030-0000000000b1',
      current_date, 0, null,
      '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":2,"unit_price":50}]'::jsonb
    );
    raise exception 'should have failed on cash customer paid < total';
  exception when others then
    v_err := sqlerrm;
  end;
  perform public.test_expect(v_err = 'cash_account_requires_full_payment', 'reject cash customer paid < total', v_err);

  -- 7. نجاح إنشاء فاتورة لعميل نقدي بالسداد الكامل (2 * 50 = 100 ومدفوع 100)
  v_invoice := public.create_invoice(
    'sale', v_cash_customer, '30303030-3030-4030-8030-0000000000b1',
    current_date, 100, null,
    '[{"item_id":"30303030-3030-4030-8030-0000000000e1","qty":2,"unit_price":50}]'::jsonb
  );
  perform public.test_expect(v_invoice is not null, 'successful cash customer full payment sale');
  -- التحقق من خصم المخزون ليصبح 3
  perform public.test_expect(
    (select qty from public.item_stock where item_id = '30303030-3030-4030-8030-0000000000e1') = 3,
    'stock decremented accurately from 5 to 3'
  );
  -- رصيد العميل النقدي يظل صفر
  perform public.test_expect(
    (select balance from public.v_account_balances where id = v_cash_customer) = 0,
    'cash customer balance remains zero'
  );
end;
$$;

-- 8. اختبار عزل الشركات (RLS Isolation)
select set_config('request.jwt.claims', '{"sub":"30303030-3030-4030-8030-000000000002"}', true);

do $$
declare
  v_count integer;
begin
  -- مستخدم شركة ب لا يرى فواتير شركة أ
  select count(*) into v_count from public.invoices where company_id = '30303030-3030-4030-8030-0000000000a1';
  perform public.test_expect(v_count = 0, 'company B cannot see company A invoices');
end;
$$;

rollback;

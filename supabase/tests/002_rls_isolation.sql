-- =====================================================================
-- 002_rls_isolation.sql
-- يختبر عزل الشركات: مستخدم شركة أ لا يرى/يعدّل/يحذف بيانات شركة ب،
-- ولا يستطيع إنشاء مستندات على حسابات أو مخازن شركة أخرى.
-- =====================================================================
begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, '');
  end if;
end;
$$;

grant execute on function public.test_expect(boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- بيانات الاختبار
-- ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('33333333-3333-4333-8333-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a2@test.local', now(), now(), now()),
  ('44444444-4444-4444-8444-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b2@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('33333333-3333-4333-8333-0000000000f1', 'شركة أ'),
  ('44444444-4444-4444-8444-0000000000f2', 'شركة ب');

insert into public.profiles (id, company_id, full_name) values
  ('33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-0000000000f1', 'مستخدم أ'),
  ('44444444-4444-4444-8444-000000000002', '44444444-4444-4444-8444-0000000000f2', 'مستخدم ب');

insert into public.warehouses (id, company_id, name) values
  ('33333333-3333-4333-8333-0000000000a1', '33333333-3333-4333-8333-0000000000f1', 'مخزن أ'),
  ('44444444-4444-4444-8444-0000000000a2', '44444444-4444-4444-8444-0000000000f2', 'مخزن ب');

insert into public.cash_boxes (id, company_id, name) values
  ('33333333-3333-4333-8333-0000000000b1', '33333333-3333-4333-8333-0000000000f1', 'خزنة أ'),
  ('44444444-4444-4444-8444-0000000000b2', '44444444-4444-4444-8444-0000000000f2', 'خزنة ب');

insert into public.accounts (id, company_id, name, kind) values
  ('33333333-3333-4333-8333-0000000000c1', '33333333-3333-4333-8333-0000000000f1', 'عميل أ', 'customer'),
  ('33333333-3333-4333-8333-0000000000d1', '33333333-3333-4333-8333-0000000000f1', 'مورد أ', 'supplier'),
  ('44444444-4444-4444-8444-0000000000c2', '44444444-4444-4444-8444-0000000000f2', 'عميل ب', 'customer');

insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('33333333-3333-4333-8333-0000000000e1', '33333333-3333-4333-8333-0000000000f1', 'صنف أ', 100, 60),
  ('44444444-4444-4444-8444-0000000000e2', '44444444-4444-4444-8444-0000000000f2', 'صنف ب', 50, 30);

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('33333333-3333-4333-8333-0000000000f1', '33333333-3333-4333-8333-0000000000a1', '33333333-3333-4333-8333-0000000000e1', 10);

-- ---------------------------------------------------------------------
-- (1) شركة أ تعمل فاتورة
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-000000000001"}', true);

do $$
declare
  v_id uuid;
begin
  v_id := public.create_invoice(
    'sale',
    '33333333-3333-4333-8333-0000000000c1',
    '33333333-3333-4333-8333-0000000000a1',
    current_date, 40, null,
    '[{"item_id":"33333333-3333-4333-8333-0000000000e1","qty":1,"unit_price":100}]'::jsonb
  );
  perform public.test_expect(v_id is not null, 'A: invoice created');
end $$;

-- ---------------------------------------------------------------------
-- (2) شركة ب تعمل فاتورتها
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-000000000002"}', true);

do $$
declare
  v_id uuid;
begin
  v_id := public.create_invoice(
    'sale',
    '44444444-4444-4444-8444-0000000000c2',
    '44444444-4444-4444-8444-0000000000a2',
    current_date, 20, null,
    '[{"item_id":"44444444-4444-4444-8444-0000000000e2","qty":2,"unit_price":50}]'::jsonb
  );

  perform public.test_expect((select count(*) from public.invoices) = 1, 'B: sees only its invoice');
  perform public.test_expect((select number from public.invoices where id = v_id) = 'SAL-000001', 'B: own numbering per company');

  perform set_config('test.b_invoice', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------
-- (3) رجوع لشركة أ: لا يرى بيانات ب
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-000000000001"}', true);

do $$
declare
  v_b_invoice uuid;
  v_rows integer;
  v_ok boolean;
begin
  v_b_invoice := current_setting('test.b_invoice')::uuid;
  perform public.test_expect((select count(*) from public.invoices) = 1, 'A: sees only its invoice');
  perform public.test_expect((select count(*) from public.receipts) = 1, 'A: sees only its receipt');
  perform public.test_expect((select count(*) from public.invoice_items) = 1, 'A: sees only its lines');
  perform public.test_expect((select count(*) from public.accounts) = 2, 'A: sees only its accounts');
  perform public.test_expect((select count(*) from public.items) = 1, 'A: sees only its items');
  perform public.test_expect((select count(*) from public.item_stock) = 1, 'A: sees only its stock');
  perform public.test_expect((select count(*) from public.v_account_balances) = 2, 'A: balances view filtered by company');
  perform public.test_expect((select count(*) from public.v_invoice_list) = 1, 'A: invoice list filtered by company');
  perform public.test_expect((select count(*) from public.invoices where id = v_b_invoice) = 0, 'A: cannot read B invoice by id');

  -- محاولة كتابة صف لشركة ب
  v_ok := false;
  begin
    insert into public.accounts (company_id, name, kind)
    values ('44444444-4444-4444-8444-0000000000f2', 'اختراق', 'customer');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform public.test_expect(v_ok, 'A: cannot insert row for company B');

  -- محاولة تعديل فاتورة ب
  update public.invoices set notes = 'hacked' where id = v_b_invoice;
  get diagnostics v_rows = row_count;
  perform public.test_expect(v_rows = 0, 'A: cannot update B invoice');

  -- محاولة حذف فاتورة ب
  v_ok := false;
  begin
    perform public.delete_invoice(v_b_invoice);
  exception when others then
    v_ok := (sqlerrm = 'invoice_not_found');
  end;
  perform public.test_expect(v_ok, 'A: cannot delete B invoice');

  -- استخدام حساب ب في فاتورة
  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', '44444444-4444-4444-8444-0000000000c2', '33333333-3333-4333-8333-0000000000a1',
      current_date, 0, null,
      '[{"item_id":"33333333-3333-4333-8333-0000000000e1","qty":1,"unit_price":10}]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_account');
  end;
  perform public.test_expect(v_ok, 'A: cannot use B account');

  -- استخدام مخزن ب في فاتورة
  v_ok := false;
  begin
    perform public.create_invoice(
      'sale', '33333333-3333-4333-8333-0000000000c1', '44444444-4444-4444-8444-0000000000a2',
      current_date, 0, null,
      '[{"item_id":"33333333-3333-4333-8333-0000000000e1","qty":1,"unit_price":10}]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_warehouse');
  end;
  perform public.test_expect(v_ok, 'A: cannot use B warehouse');

  perform public.test_expect(
    (select qty from public.item_stock where item_id = '33333333-3333-4333-8333-0000000000e1') = 9,
    'A: stock 10 -> 9'
  );
end $$;

rollback;

select 'PASS 002_rls_isolation' as result;

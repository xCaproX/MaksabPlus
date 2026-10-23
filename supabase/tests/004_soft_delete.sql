-- =====================================================================
-- 004_soft_delete.sql
-- يختبر الحذف السوفت للفواتير والإيصالات:
--   - الاستثناء من الأرصدة والخزنة والقوائم (مع بقاء الصف).
--   - عكس المخزون عند الحذف وإعادة تطبيقه عند الاستعادة.
--   - إيصال الفاتورة يُحذف ويُستعاد معها، ورقمه لا يتغير.
--   - فاتورة مدفوعها = 0 لا يُستعاد لها إيصال.
--   - منع تعديل فاتورة محذوفة، ومنع التكرار أو الاستعادة بلا حذف.
--   - عزل الشركات في الحذف والاستعادة.
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
  ('77777777-7777-4777-8777-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@test.local', now(), now(), now()),
  ('88888888-8888-4888-8888-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('77777777-7777-4777-8777-0000000000f1', 'شركة هـ'),
  ('88888888-8888-4888-8888-0000000000f2', 'شركة و');

insert into public.profiles (id, company_id, full_name) values
  ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-0000000000f1', 'مستخدم هـ'),
  ('88888888-8888-4888-8888-000000000002', '88888888-8888-4888-8888-0000000000f2', 'مستخدم و');

insert into public.warehouses (id, company_id, name) values
  ('77777777-7777-4777-8777-0000000000a1', '77777777-7777-4777-8777-0000000000f1', 'مخزن هـ'),
  ('88888888-8888-4888-8888-0000000000a2', '88888888-8888-4888-8888-0000000000f2', 'مخزن و');

insert into public.cash_boxes (id, company_id, name) values
  ('77777777-7777-4777-8777-0000000000b1', '77777777-7777-4777-8777-0000000000f1', 'خزنة هـ'),
  ('88888888-8888-4888-8888-0000000000b2', '88888888-8888-4888-8888-0000000000f2', 'خزنة و');

insert into public.accounts (id, company_id, name, kind) values
  ('77777777-7777-4777-8777-0000000000c1', '77777777-7777-4777-8777-0000000000f1', 'عميل هـ', 'customer'),
  ('88888888-8888-4888-8888-0000000000c2', '88888888-8888-4888-8888-0000000000f2', 'عميل و', 'customer');

insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('77777777-7777-4777-8777-0000000000e1', '77777777-7777-4777-8777-0000000000f1', 'صنف هـ', 100, 60);

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('77777777-7777-4777-8777-0000000000f1', '77777777-7777-4777-8777-0000000000a1', '77777777-7777-4777-8777-0000000000e1', 10);

-- مستندات شركة و (محذوفة مسبقًا) لاختبار العزل
insert into public.invoices
  (id, company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, deleted_at)
values
  ('88888888-8888-4888-8888-000000000011', '88888888-8888-4888-8888-0000000000f2',
   'sale', 'SAL-000001', current_date,
   '88888888-8888-4888-8888-0000000000c2', '88888888-8888-4888-8888-0000000000a2',
   100, 100, 0, now());

insert into public.receipts
  (id, company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, deleted_at, direction)
values
  ('88888888-8888-4888-8888-000000000022', '88888888-8888-4888-8888-0000000000f2',
   null, 'RCP-000001', current_date,
   '88888888-8888-4888-8888-0000000000c2', '88888888-8888-4888-8888-0000000000b2',
   10, now(), 'in');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-000000000001"}', true);

-- ---------------------------------------------------------------------
-- (1) فاتورة نشطة: الأرصدة ثم حذف سوفت ثم استعادة
-- ---------------------------------------------------------------------
do $$
declare
  v_invoice uuid;
  v_receipt uuid;
  v_ok boolean;
begin
  v_invoice := public.create_invoice(
    'sale',
    '77777777-7777-4777-8777-0000000000c1',
    '77777777-7777-4777-8777-0000000000a1',
    current_date, 50, 'فاتورة أ',
    '[{"item_id":"77777777-7777-4777-8777-0000000000e1","qty":2,"unit_price":100}]'::jsonb
  );

  select id into v_receipt from public.receipts where invoice_id = v_invoice;

  perform public.test_expect(
    (select deleted_at from public.invoices where id = v_invoice) is null,
    'new: invoice active'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_receipt) = 'RCP-000001',
    'new: receipt number'
  );
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 8,
    'new: stock 10 - 2'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 150,
    'new: balance = 200 - 50'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 50,
    'new: cash 50'
  );

  -- حذف سوفت
  perform public.delete_invoice(v_invoice);

  perform public.test_expect(
    (select deleted_at from public.invoices where id = v_invoice) is not null,
    'delete: invoice soft deleted'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_receipt) is not null,
    'delete: linked receipt soft deleted'
  );
  perform public.test_expect(
    (select count(*) from public.invoice_items where invoice_id = v_invoice) = 1,
    'delete: lines kept'
  );
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 10,
    'delete: stock back to 10'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 0,
    'delete: balance 0'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 0,
    'delete: cash 0'
  );
  perform public.test_expect(
    (select count(*) from public.v_invoice_list
      where id = v_invoice and deleted_at is null) = 0,
    'delete: excluded from active list'
  );

  -- تعديل فاتورة محذوفة مرفوض
  v_ok := false;
  begin
    perform public.update_invoice(
      v_invoice,
      '77777777-7777-4777-8777-0000000000c1',
      '77777777-7777-4777-8777-0000000000a1',
      current_date, 50, null,
      '[{"item_id":"77777777-7777-4777-8777-0000000000e1","qty":2,"unit_price":100}]'::jsonb
    );
  exception when others then
    v_ok := (sqlerrm = 'invoice_deleted');
  end;
  perform public.test_expect(v_ok, 'delete: edit rejected');

  -- استعادة
  perform public.restore_invoice(v_invoice);

  perform public.test_expect(
    (select deleted_at from public.invoices where id = v_invoice) is null,
    'restore: invoice active'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_receipt) is null,
    'restore: receipt active'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_receipt) = 'RCP-000001',
    'restore: receipt number unchanged'
  );
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 8,
    'restore: stock 8 again'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 150,
    'restore: balance 150'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 50,
    'restore: cash 50'
  );

  -- استعادة مستند غير محذوف
  v_ok := false;
  begin
    perform public.restore_invoice(v_invoice);
  exception when others then
    v_ok := (sqlerrm = 'invoice_not_deleted');
  end;
  perform public.test_expect(v_ok, 'restore: already active rejected');

  -- حذف مرتين
  perform public.delete_invoice(v_invoice);
  v_ok := false;
  begin
    perform public.delete_invoice(v_invoice);
  exception when others then
    v_ok := (sqlerrm = 'invoice_already_deleted');
  end;
  perform public.test_expect(v_ok, 'delete: twice rejected');
  perform public.restore_invoice(v_invoice);
end $$;

-- ---------------------------------------------------------------------
-- (2) الإيصال الحر: حذف سوفت واستعادة (مع البيان)
-- ---------------------------------------------------------------------
do $$
declare
  v_free uuid;
  v_ok boolean;
begin
  v_free := public.create_free_receipt(
    '77777777-7777-4777-8777-0000000000c1',
    '77777777-7777-4777-8777-0000000000b1',
    current_date, 30, 'ملاحظة حرة', 'دفعة نقدية', 'in'
  );

  perform public.test_expect(
    (select number from public.receipts where id = v_free) = 'RCP-000002',
    'free: number RCP-000002'
  );
  perform public.test_expect(
    (select statement from public.v_receipt_list where id = v_free) = 'دفعة نقدية',
    'free: statement'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 80,
    'free: cash 80'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 120,
    'free: balance 120'
  );

  perform public.delete_free_receipt(v_free);

  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_free) is not null,
    'free: soft deleted'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 50,
    'free delete: cash 50'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 150,
    'free delete: balance 150'
  );

  perform public.restore_receipt(v_free);

  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_free) is null,
    'free: restored'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 80,
    'free restore: cash 80'
  );

  v_ok := false;
  begin
    perform public.restore_receipt(v_free);
  exception when others then
    v_ok := (sqlerrm = 'receipt_not_deleted');
  end;
  perform public.test_expect(v_ok, 'free restore: already active rejected');

  perform public.delete_free_receipt(v_free);
  v_ok := false;
  begin
    perform public.delete_free_receipt(v_free);
  exception when others then
    v_ok := (sqlerrm = 'receipt_already_deleted');
  end;
  perform public.test_expect(v_ok, 'free delete: twice rejected');
  perform public.restore_receipt(v_free);
end $$;

-- ---------------------------------------------------------------------
-- (3) تنظيف السيناريو السابق: فاتورة مدفوعها صفر لا يُستعاد إيصالها
-- ---------------------------------------------------------------------
do $$
declare
  v_invoice uuid;
  v_free uuid;
  v_invoice2 uuid;
  v_receipt2 uuid;
begin
  select id into v_invoice from public.invoices where number = 'SAL-000001';
  select id into v_free from public.receipts where number = 'RCP-000002';

  perform public.delete_invoice(v_invoice);
  perform public.delete_free_receipt(v_free);

  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 10,
    'cleanup: stock 10'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 0,
    'cleanup: balance 0'
  );

  -- فاتورة جديدة مدفوعة 50 ثم صفر
  v_invoice2 := public.create_invoice(
    'sale',
    '77777777-7777-4777-8777-0000000000c1',
    '77777777-7777-4777-8777-0000000000a1',
    current_date, 50, null,
    '[{"item_id":"77777777-7777-4777-8777-0000000000e1","qty":1,"unit_price":200}]'::jsonb
  );
  select id into v_receipt2 from public.receipts where invoice_id = v_invoice2;

  perform public.test_expect(
    (select number from public.receipts where id = v_receipt2) = 'RCP-000003',
    'paid0: receipt RCP-000003'
  );
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 9,
    'paid0: stock 9'
  );

  perform public.update_invoice(
    v_invoice2,
    '77777777-7777-4777-8777-0000000000c1',
    '77777777-7777-4777-8777-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"77777777-7777-4777-8777-0000000000e1","qty":1,"unit_price":200}]'::jsonb
  );

  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_receipt2) is not null,
    'paid0: receipt hidden'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '77777777-7777-4777-8777-0000000000c1') = 200,
    'paid0: balance 200'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 0,
    'paid0: cash 0'
  );

  -- حذف فاتورة مدفوعها صفر ثم استعادتها
  perform public.delete_invoice(v_invoice2);
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 10,
    'paid0 delete: stock 10'
  );

  perform public.restore_invoice(v_invoice2);
  perform public.test_expect(
    (select deleted_at from public.invoices where id = v_invoice2) is null,
    'paid0 restore: invoice active'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_receipt2) is not null,
    'paid0 restore: receipt stays hidden'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 0,
    'paid0 restore: cash still 0'
  );
  perform public.test_expect(
    (select qty from public.item_stock
      where warehouse_id = '77777777-7777-4777-8777-0000000000a1'
        and item_id = '77777777-7777-4777-8777-0000000000e1') = 9,
    'paid0 restore: stock 9'
  );

  -- رد الدفعة => نفس الإيصال يرجع
  perform public.update_invoice(
    v_invoice2,
    '77777777-7777-4777-8777-0000000000c1',
    '77777777-7777-4777-8777-0000000000a1',
    current_date, 50, null,
    '[{"item_id":"77777777-7777-4777-8777-0000000000e1","qty":1,"unit_price":200}]'::jsonb
  );

  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_receipt2) is null,
    'paid back: receipt restored'
  );
  perform public.test_expect(
    (select number from public.receipts where id = v_receipt2) = 'RCP-000003',
    'paid back: same number'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '77777777-7777-4777-8777-0000000000b1') = 50,
    'paid back: cash 50'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4) عزل الشركات: لا حذف ولا استعادة لمستندات شركة أخرى
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  v_ok := false;
  begin
    perform public.restore_invoice('88888888-8888-4888-8888-000000000011');
  exception when others then
    v_ok := (sqlerrm = 'invoice_not_found');
  end;
  perform public.test_expect(v_ok, 'RLS: restore company B invoice rejected');

  v_ok := false;
  begin
    perform public.delete_invoice('88888888-8888-4888-8888-000000000011');
  exception when others then
    v_ok := (sqlerrm = 'invoice_not_found');
  end;
  perform public.test_expect(v_ok, 'RLS: delete company B invoice rejected');

  v_ok := false;
  begin
    perform public.restore_receipt('88888888-8888-4888-8888-000000000022');
  exception when others then
    v_ok := (sqlerrm = 'receipt_not_found');
  end;
  perform public.test_expect(v_ok, 'RLS: restore company B receipt rejected');
end $$;

reset role;

-- مستندات شركة و لم تتغير
do $$
begin
  perform public.test_expect(
    (select deleted_at from public.invoices where id = '88888888-8888-4888-8888-000000000011') is not null,
    'RLS: company B invoice untouched'
  );
  perform public.test_expect(
    (select deleted_at from public.receipts where id = '88888888-8888-4888-8888-000000000022') is not null,
    'RLS: company B receipt untouched'
  );
end $$;

rollback;

select 'PASS 004_soft_delete' as result;

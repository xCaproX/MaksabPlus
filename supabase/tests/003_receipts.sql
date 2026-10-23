-- =====================================================================
-- 003_receipts.sql
-- يختبر: الإيصال الحر (إضافة/تعديل/حذف)، قفل الإيصال المرتبط بالفاتورة،
-- اتجاه الخزنة حسب نوع الحساب، الترقيم المشترك، عزل الشركات،
-- وحماية تغيير نوع الحساب بعد وجود مستندات.
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
  ('55555555-5555-4555-8555-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', now(), now(), now()),
  ('66666666-6666-4666-8666-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('55555555-5555-4555-8555-0000000000f1', 'شركة ج'),
  ('66666666-6666-4666-8666-0000000000f2', 'شركة د');

insert into public.profiles (id, company_id, full_name) values
  ('55555555-5555-4555-8555-000000000001', '55555555-5555-4555-8555-0000000000f1', 'مستخدم ج'),
  ('66666666-6666-4666-8666-000000000002', '66666666-6666-4666-8666-0000000000f2', 'مستخدم د');

insert into public.warehouses (id, company_id, name) values
  ('55555555-5555-4555-8555-0000000000a1', '55555555-5555-4555-8555-0000000000f1', 'مخزن ج');

insert into public.cash_boxes (id, company_id, name) values
  ('55555555-5555-4555-8555-0000000000b1', '55555555-5555-4555-8555-0000000000f1', 'خزنة ج'),
  ('66666666-6666-4666-8666-0000000000b2', '66666666-6666-4666-8666-0000000000f2', 'خزنة د');

insert into public.accounts (id, company_id, name, kind) values
  ('55555555-5555-4555-8555-0000000000c1', '55555555-5555-4555-8555-0000000000f1', 'عميل ج', 'customer'),
  ('55555555-5555-4555-8555-0000000000d1', '55555555-5555-4555-8555-0000000000f1', 'مورد ج', 'supplier'),
  ('55555555-5555-4555-8555-0000000000c9', '55555555-5555-4555-8555-0000000000f1', 'حساب بلا مستندات', 'customer'),
  ('66666666-6666-4666-8666-0000000000c2', '66666666-6666-4666-8666-0000000000f2', 'عميل د', 'customer');

insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('55555555-5555-4555-8555-0000000000e1', '55555555-5555-4555-8555-0000000000f1', 'صنف ج', 100, 60);

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('55555555-5555-4555-8555-0000000000f1', '55555555-5555-4555-8555-0000000000a1', '55555555-5555-4555-8555-0000000000e1', 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-000000000001"}', true);

-- ---------------------------------------------------------------------
-- (1) إيصال حر: إضافة => تعديل => حذف
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  v_id := public.create_free_receipt(
    '55555555-5555-4555-8555-0000000000c1',
    '55555555-5555-4555-8555-0000000000b1',
    current_date,
    100,
    'تحصيل حر',
    'دفعة تحت الحساب',
    'in'
  );

  perform public.test_expect((select count(*) from public.receipts where id = v_id) = 1, 'free: created');
  perform public.test_expect((select number from public.receipts where id = v_id) = 'RCP-000001', 'free: number');
  perform public.test_expect((select invoice_id from public.receipts where id = v_id) is null, 'free: no invoice');
  perform public.test_expect((select is_free from public.v_receipt_list where id = v_id), 'free: list view marks free');
  perform public.test_expect(
    (select statement from public.v_receipt_list where id = v_id) = 'دفعة تحت الحساب',
    'free: statement = description'
  );
  perform public.test_expect(
    (select notes from public.v_receipt_list where id = v_id) = 'تحصيل حر',
    'free: notes kept separate'
  );
  perform public.test_expect(
    (select direction from public.v_receipt_list where id = v_id) = 'in',
    'free: direction in'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '55555555-5555-4555-8555-0000000000b1') = 100,
    'free: cash +100 (customer)'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '55555555-5555-4555-8555-0000000000c1') = -100,
    'free: customer balance -100'
  );

  perform public.update_free_receipt(
    v_id,
    '55555555-5555-4555-8555-0000000000c1',
    '55555555-5555-4555-8555-0000000000b1',
    current_date,
    150,
    'معدّل',
    'بيان معدّل'
  );

  perform public.test_expect((select amount from public.receipts where id = v_id) = 150, 'free: updated to 150');
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '55555555-5555-4555-8555-0000000000b1') = 150,
    'free: cash 150 after edit'
  );

  perform public.delete_free_receipt(v_id);

  perform public.test_expect(
    (select deleted_at from public.receipts where id = v_id) is not null,
    'free: soft deleted'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '55555555-5555-4555-8555-0000000000b1') = 0,
    'free: cash 0 after delete'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '55555555-5555-4555-8555-0000000000c1') = 0,
    'free: balance 0 after delete'
  );
end $$;

-- ---------------------------------------------------------------------
-- (2) الإيصال المرتبط بفاتورة: محمي من التعديل والحذف
-- ---------------------------------------------------------------------
do $$
declare
  v_invoice uuid;
  v_receipt uuid;
  v_rows integer;
  v_ok boolean;
begin
  v_invoice := public.create_invoice(
    'sale',
    '55555555-5555-4555-8555-0000000000c1',
    '55555555-5555-4555-8555-0000000000a1',
    current_date, 50, null,
    '[{"item_id":"55555555-5555-4555-8555-0000000000e1","qty":2,"unit_price":100}]'::jsonb
  );

  select id into v_receipt from public.receipts where invoice_id = v_invoice;

  perform public.test_expect(v_receipt is not null, 'linked: auto receipt exists');
  perform public.test_expect((select is_free from public.v_receipt_list where id = v_receipt) = false, 'linked: list view marks linked');
  perform public.test_expect((select invoice_number from public.v_receipt_list where id = v_receipt) = 'SAL-000001', 'linked: invoice number exposed');
  perform public.test_expect(
    (select statement from public.v_receipt_list where id = v_receipt) = 'فاتورة SAL-000001',
    'linked: statement = invoice number'
  );
  perform public.test_expect((select number from public.receipts where id = v_receipt) = 'RCP-000002', 'linked: in series');
  perform public.test_expect(
    (select direction from public.receipts where id = v_receipt) = 'in',
    'linked sale: direction in'
  );

  v_ok := false;
  begin
    perform public.update_free_receipt(
      v_receipt,
      '55555555-5555-4555-8555-0000000000c1',
      '55555555-5555-4555-8555-0000000000b1',
      current_date, 10, null, null
    );
  exception when others then
    v_ok := (sqlerrm = 'receipt_linked_immutable');
  end;
  perform public.test_expect(v_ok, 'linked: function update rejected');

  v_ok := false;
  begin
    perform public.delete_free_receipt(v_receipt);
  exception when others then
    v_ok := (sqlerrm = 'receipt_linked_immutable');
  end;
  perform public.test_expect(v_ok, 'linked: function delete rejected');

  update public.receipts set amount = 1 where id = v_receipt;
  get diagnostics v_rows = row_count;
  perform public.test_expect(v_rows = 0, 'linked: direct update blocked by RLS');

  delete from public.receipts where id = v_receipt;
  get diagnostics v_rows = row_count;
  perform public.test_expect(v_rows = 0, 'linked: direct delete blocked by RLS');

  perform public.test_expect((select amount from public.receipts where id = v_receipt) = 50, 'linked: amount unchanged');
end $$;

-- ---------------------------------------------------------------------
-- (3) إيصال حر لمورد => صرف من الخزنة
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  v_id := public.create_free_receipt(
    '55555555-5555-4555-8555-0000000000d1',
    '55555555-5555-4555-8555-0000000000b1',
    current_date, 40, null, null, 'out'
  );

  perform public.test_expect((select number from public.receipts where id = v_id) = 'PAY-000001', 'supplier free: out series');
  perform public.test_expect(
    (select direction from public.receipts where id = v_id) = 'out',
    'supplier free: direction out'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '55555555-5555-4555-8555-0000000000b1') = 10,
    'supplier free: cash = 50 - 40 = 10'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = '55555555-5555-4555-8555-0000000000d1') = -40,
    'supplier free: balance -40'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4) عزل الشركات + حماية تغيير نوع الحساب
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  v_ok := false;
  begin
    perform public.create_free_receipt(
      '66666666-6666-4666-8666-0000000000c2',
      '55555555-5555-4555-8555-0000000000b1',
      current_date, 10, null, null, 'in'
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_account');
  end;
  perform public.test_expect(v_ok, 'RLS: cannot use company B account');

  v_ok := false;
  begin
    perform public.create_free_receipt(
      '55555555-5555-4555-8555-0000000000c1',
      '66666666-6666-4666-8666-0000000000b2',
      current_date, 10, null, null, 'in'
    );
  exception when others then
    v_ok := (sqlerrm = 'invalid_cash_box');
  end;
  perform public.test_expect(v_ok, 'RLS: cannot use company B cash box');

  v_ok := false;
  begin
    update public.accounts set kind = 'supplier'
    where id = '55555555-5555-4555-8555-0000000000c1';
  exception when others then
    v_ok := (sqlerrm = 'account_has_documents');
  end;
  perform public.test_expect(v_ok, 'guard: cannot change kind of account with documents');

  update public.accounts set kind = 'supplier'
  where id = '55555555-5555-4555-8555-0000000000c9';
  perform public.test_expect(
    (select kind from public.accounts where id = '55555555-5555-4555-8555-0000000000c9') = 'supplier',
    'guard: kind change allowed without documents'
  );

  perform public.test_expect(
    (select has_documents from public.v_account_balances
      where id = '55555555-5555-4555-8555-0000000000c1'),
    'view: account with documents flagged'
  );
  perform public.test_expect(
    (select has_documents from public.v_account_balances
      where id = '55555555-5555-4555-8555-0000000000c9') = false,
    'view: account without documents not flagged'
  );
end $$;

-- ---------------------------------------------------------------------
-- (5) حذف الفاتورة يحذف إيصالها المرتبط (cascade رغم سياسة RLS)
-- ---------------------------------------------------------------------
do $$
declare
  v_invoice uuid;
begin
  select id into v_invoice from public.invoices where number = 'SAL-000001';
  perform public.delete_invoice(v_invoice);

  perform public.test_expect(
    (select deleted_at from public.receipts where invoice_id = v_invoice) is not null,
    'cascade: linked receipt soft deleted with invoice'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = '55555555-5555-4555-8555-0000000000b1') = -40,
    'cascade: cash = -40 (supplier free only)'
  );
end $$;

rollback;

select 'PASS 003_receipts' as result;

-- =====================================================================
-- 007_returns.sql
-- مرتجع مبيعات (sale_return) ومرتجع مشتريات (purchase_return):
--   - مرتجع مبيعات: مخزون +، رصيد الحساب −، والمسترد إيصال صرف (out).
--   - مرتجع مشتريات: مخزون −، رصيد الحساب −، والمسترد إيصال استلام (in).
--   - المسترد يعكس أثر المرتجع: balance = (فواتير − مرتجعات) − (مدفوع − مسترد).
--   - ترقيم منفصل: SRT / PRT.
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

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('cccccccc-cccc-4ccc-8ccc-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'k@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000f1', 'شركة ك');

insert into public.profiles (id, company_id, full_name) values
  ('cccccccc-cccc-4ccc-8ccc-000000000001', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'مستخدم ك');

insert into public.warehouses (id, company_id, name) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000a1', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'مخزن ك');

insert into public.cash_boxes (id, company_id, name) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000b1', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'خزنة ك');

insert into public.accounts (id, company_id, name, kind) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'عميل ك', 'customer'),
  ('cccccccc-cccc-4ccc-8ccc-0000000000d1', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'مورد ك', 'supplier');

insert into public.items (id, company_id, name, sale_price, purchase_price) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000e1', 'cccccccc-cccc-4ccc-8ccc-0000000000f1', 'صنف ك', 10, 10);

insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost) values
  ('cccccccc-cccc-4ccc-8ccc-0000000000f1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1', 'cccccccc-cccc-4ccc-8ccc-0000000000e1', 100, 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-000000000001"}', true);

-- ---------------------------------------------------------------------
-- (1) مرتجع مبيعات: مخزون +، رصيد العميل −، والمسترد صرف
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_receipt uuid;
begin
  v_id := public.create_invoice(
    'sale_return', 'cccccccc-cccc-4ccc-8ccc-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1',
    current_date, 20, null,
    '[{"item_id":"cccccccc-cccc-4ccc-8ccc-0000000000e1","qty":5,"unit_price":10}]'::jsonb
  );

  perform public.test_expect(
    (select number from public.invoices where id = v_id) = 'SRT-000001',
    'sale return: SRT numbering'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 105,
    'sale return: stock 100 + 5'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = -30,
    'sale return: customer balance -50 + 20 = -30'
  );

  select id into v_receipt from public.receipts where invoice_id = v_id;
  perform public.test_expect(
    (select number from public.receipts where id = v_receipt) = 'PAY-000001',
    'sale return: refund in PAY series'
  );
  perform public.test_expect(
    (select direction from public.receipts where id = v_receipt) = 'out',
    'sale return: refund direction out'
  );
  perform public.test_expect(
    (select statement from public.v_receipt_list where id = v_receipt) = 'مرتجع SRT-000001',
    'sale return: receipt statement'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = -20,
    'sale return: cash -20'
  );
end $$;

-- ---------------------------------------------------------------------
-- (2) مرتجع مشتريات: مخزون −، رصيد المورد −، والمسترد استلام
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_receipt uuid;
begin
  v_id := public.create_invoice(
    'purchase_return', 'cccccccc-cccc-4ccc-8ccc-0000000000d1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1',
    current_date, 10, null,
    '[{"item_id":"cccccccc-cccc-4ccc-8ccc-0000000000e1","qty":3,"unit_price":10}]'::jsonb
  );

  perform public.test_expect(
    (select number from public.invoices where id = v_id) = 'PRT-000001',
    'purchase return: PRT numbering'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 102,
    'purchase return: stock 105 - 3'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000d1') = -20,
    'purchase return: supplier balance -30 + 10 = -20'
  );

  select id into v_receipt from public.receipts where invoice_id = v_id;
  perform public.test_expect(
    (select number from public.receipts where id = v_receipt) = 'RCP-000001',
    'purchase return: refund in RCP series'
  );
  perform public.test_expect(
    (select direction from public.receipts where id = v_receipt) = 'in',
    'purchase return: refund direction in'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = -10,
    'purchase return: cash -20 + 10 = -10'
  );
end $$;

-- ---------------------------------------------------------------------
-- (3) فاتورة بيع عادية + مرتجع => الصافي صحيح
-- ---------------------------------------------------------------------
do $$
declare
  v_sale uuid;
begin
  v_sale := public.create_invoice(
    'sale', 'cccccccc-cccc-4ccc-8ccc-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1',
    current_date, 40, null,
    '[{"item_id":"cccccccc-cccc-4ccc-8ccc-0000000000e1","qty":10,"unit_price":10}]'::jsonb
  );

  perform public.test_expect(
    (select number from public.invoices where id = v_sale) = 'SAL-000001',
    'sale: SAL numbering'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 92,
    'sale: stock 102 - 10'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = 30,
    'sale + return: 100 - 50 - (40 - 20) = 30'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = 30,
    'sale + return: cash -20 + 10 + 40 = 30'
  );
end $$;

-- ---------------------------------------------------------------------
-- (4) تعديل المرتجع: المخزون والرصيد والمسترد يتحدثوا
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SRT-000001';

  perform public.update_invoice(
    v_id, 'cccccccc-cccc-4ccc-8ccc-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1',
    current_date, 5, null,
    '[{"item_id":"cccccccc-cccc-4ccc-8ccc-0000000000e1","qty":2,"unit_price":10}]'::jsonb
  );

  perform public.test_expect(
    (select total from public.invoices where id = v_id) = 20,
    'edit return: total 20'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 89,
    'edit return: stock 92 - 5 + 2'
  );
  perform public.test_expect(
    (select amount from public.receipts where invoice_id = v_id) = 5,
    'edit return: refund updated to 5'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = 45,
    'edit return: balance 100 - 20 - (40 - 5) = 45'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = 45,
    'edit return: cash 40 - 5 + 10 = 45'
  );
end $$;

-- ---------------------------------------------------------------------
-- (5) حذف/استعادة المرتجع
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.invoices where number = 'SRT-000001';
  perform public.delete_invoice(v_id);

  perform public.test_expect(
    (select deleted_at from public.receipts where invoice_id = v_id) is not null,
    'delete return: receipt soft deleted'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 87,
    'delete return: stock 89 - 2'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = 60,
    'delete return: balance 100 - 40'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = 50,
    'delete return: cash 40 + 10'
  );

  perform public.restore_invoice(v_id);

  perform public.test_expect(
    (select deleted_at from public.receipts where invoice_id = v_id) is null,
    'restore return: receipt restored'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 89,
    'restore return: stock back to 89'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = 45,
    'restore return: balance back to 45'
  );
end $$;

-- ---------------------------------------------------------------------
-- (6) مرتجع بدون مسترد => بدون إيصال
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  v_id := public.create_invoice(
    'sale_return', 'cccccccc-cccc-4ccc-8ccc-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"cccccccc-cccc-4ccc-8ccc-0000000000e1","qty":1,"unit_price":10}]'::jsonb
  );

  perform public.test_expect(
    (select number from public.invoices where id = v_id) = 'SRT-000002',
    'return without refund: SRT-000002'
  );
  perform public.test_expect(
    (select count(*) from public.receipts where invoice_id = v_id) = 0,
    'return without refund: no receipt'
  );
  perform public.test_expect(
    (select qty from public.item_stock where warehouse_id = 'cccccccc-cccc-4ccc-8ccc-0000000000a1' and item_id = 'cccccccc-cccc-4ccc-8ccc-0000000000e1') = 90,
    'return without refund: stock +1'
  );
  perform public.test_expect(
    (select balance from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1') = 35,
    'return without refund: balance 100 - 30 - 35 = 35'
  );
  perform public.test_expect(
    (select balance from public.v_cash_box_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000b1') = 45,
    'return without refund: cash unchanged'
  );
  perform public.test_expect(
    (select has_documents from public.v_account_balances where id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1'),
    'return counts as document'
  );
end $$;

rollback;

select 'PASS 007_returns' as result;

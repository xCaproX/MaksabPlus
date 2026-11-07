begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

-- Setup test company and owner
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('57575757-5757-4757-8757-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cross-trading@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('57575757-5757-4757-8757-0000000000f1', 'شركة المقاصة والتعاملات المزدوجة');

insert into public.profiles (id, company_id, full_name, access_role, is_active)
values ('57575757-5757-4757-8757-000000000001', '57575757-5757-4757-8757-0000000000f1', 'مدير المقاصة', 'owner', true);

insert into public.warehouses (id, company_id, name) values
  ('57575757-5757-4757-8757-0000000000a1', '57575757-5757-4757-8757-0000000000f1', 'مخزن رئيسي');

insert into public.cash_boxes (id, company_id, name) values
  ('57575757-5757-4757-8757-0000000000a2', '57575757-5757-4757-8757-0000000000f1', 'خزنة رئيسية');

insert into public.items (id, company_id, name, unit) values
  ('57575757-5757-4757-8757-0000000000a3', '57575757-5757-4757-8757-0000000000f1', 'صنف تجريبي', 'قطعة');

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('57575757-5757-4757-8757-0000000000f1', '57575757-5757-4757-8757-0000000000a1', '57575757-5757-4757-8757-0000000000a3', 100);

-- 1. المورد: نبدأ برصيد 0
insert into public.accounts (id, company_id, name, kind, opening_balance) values
  ('57575757-5757-4757-8757-0000000000a4', '57575757-5757-4757-8757-0000000000f1', 'مورد متعامل كعميل', 'supplier', 0);

-- 2. العميل: نبدأ برصيد 0
insert into public.accounts (id, company_id, name, kind, opening_balance) values
  ('57575757-5757-4757-8757-0000000000a5', '57575757-5757-4757-8757-0000000000f1', 'عميل متعامل كمورد', 'customer', 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '57575757-5757-4757-8757-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"57575757-5757-4757-8757-000000000001"}', true);

-- أ) شراء من المورد بـ 5,000 ج.م على الحساب
select public.create_invoice(
  'purchase',
  '57575757-5757-4757-8757-0000000000a4',
  '57575757-5757-4757-8757-0000000000a1',
  current_date - 1,
  0,
  'شراء بضاعة من المورد',
  jsonb_build_array(jsonb_build_object('item_id', '57575757-5757-4757-8757-0000000000a3'::uuid, 'qty', 10, 'unit_price', 500))
);

-- تحقق: رصيد المورد أصبح 5,000 ج.م مستحقات له
select public.test_expect(
  (select current_balance = 5000 from public.accounts where id = '57575757-5757-4757-8757-0000000000a4'),
  'supplier balance after purchase is 5000'
);

-- ب) بيع لنفس المورد بضاعة بـ 1,000 ج.م على الحساب (فاتورة مبيعات)
select public.create_invoice(
  'sale',
  '57575757-5757-4757-8757-0000000000a4',
  '57575757-5757-4757-8757-0000000000a1',
  current_date,
  0,
  'بيع بضاعة للمورد بالمقاصة',
  jsonb_build_array(jsonb_build_object('item_id', '57575757-5757-4757-8757-0000000000a3'::uuid, 'qty', 2, 'unit_price', 500))
);

-- تحقق: رصيد المورد انخفض إلى 4,000 ج.م (مقاصة سليمة 100%)
select public.test_expect(
  (select current_balance = 4000 from public.accounts where id = '57575757-5757-4757-8757-0000000000a4'),
  'supplier balance after sale is reduced to 4000 (offset)'
);

-- ج) بيع لعميل بضاعة بـ 3,000 ج.م على الحساب
select public.create_invoice(
  'sale',
  '57575757-5757-4757-8757-0000000000a5',
  '57575757-5757-4757-8757-0000000000a1',
  current_date - 1,
  0,
  'بيع للعميل',
  jsonb_build_array(jsonb_build_object('item_id', '57575757-5757-4757-8757-0000000000a3'::uuid, 'qty', 6, 'unit_price', 500))
);

-- تحقق: رصيد العميل أصبح 3,000 ج.م مديونية عليه
select public.test_expect(
  (select current_balance = 3000 from public.accounts where id = '57575757-5757-4757-8757-0000000000a5'),
  'customer balance after sale is 3000'
);

-- د) شراء بضاعة من نفس العميل بـ 1,000 ج.م على الحساب (فاتورة مشتريات)
select public.create_invoice(
  'purchase',
  '57575757-5757-4757-8757-0000000000a5',
  '57575757-5757-4757-8757-0000000000a1',
  current_date,
  0,
  'شراء بضاعة من العميل بالمقاصة',
  jsonb_build_array(jsonb_build_object('item_id', '57575757-5757-4757-8757-0000000000a3'::uuid, 'qty', 2, 'unit_price', 500))
);

-- تحقق: رصيد مديونية العميل انخفض إلى 2,000 ج.م (مقاصة سليمة 100%)
select public.test_expect(
  (select current_balance = 2000 from public.accounts where id = '57575757-5757-4757-8757-0000000000a5'),
  'customer balance after purchase is reduced to 2000 (offset)'
);

-- هـ) كشف حساب المورد يعرض الرصيد النهائي 4,000 ج.م وإجمالي المدين والدائن بدقة
select public.test_expect(
  (select total_debit = 1000 and total_credit = 5000
   from public.get_account_statement('57575757-5757-4757-8757-0000000000a4', current_date - 2, current_date + 1)
   limit 1),
  'supplier statement shows debit 1000 and credit 5000'
);

select public.test_expect(
  (select running_balance = 4000
   from public.get_account_statement('57575757-5757-4757-8757-0000000000a4', current_date - 2, current_date + 1)
   where invoice_number = (select number from public.invoices where account_id = '57575757-5757-4757-8757-0000000000a4' and kind = 'sale')),
  'supplier statement shows 4000 running balance after sale invoice'
);

-- و) كشف حساب العميل يعرض الرصيد النهائي 2,000 ج.م وإجمالي المدين والدائن بدقة
select public.test_expect(
  (select total_debit = 3000 and total_credit = 1000
   from public.get_account_statement('57575757-5757-4757-8757-0000000000a5', current_date - 2, current_date + 1)
   limit 1),
  'customer statement shows debit 3000 and credit 1000'
);

select public.test_expect(
  (select running_balance = 2000
   from public.get_account_statement('57575757-5757-4757-8757-0000000000a5', current_date - 2, current_date + 1)
   where invoice_number = (select number from public.invoices where account_id = '57575757-5757-4757-8757-0000000000a5' and kind = 'purchase')),
  'customer statement shows 2000 running balance after purchase invoice'
);

rollback;

select 'PASS 057_cross_trading_balances' as result;

-- =====================================================================
-- 005_master_data_delete.sql
-- حذف الحسابات والأصناف:
--   - بلا مستندات => حذف نهائي (true).
--   - عليها أي فاتورة/إيصال (حتى محذوفة سوفت) => تعطيل فقط (false).
--   - عزل الشركات.
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
  ('99999999-9999-4999-8999-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g@test.local', now(), now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('99999999-9999-4999-8999-0000000000f1', 'شركة ز'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'شركة ح');

insert into public.profiles (id, company_id, full_name) values
  ('99999999-9999-4999-8999-000000000001', '99999999-9999-4999-8999-0000000000f1', 'مستخدم ز'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'مستخدم ح');

insert into public.warehouses (id, company_id, name) values
  ('99999999-9999-4999-8999-0000000000a1', '99999999-9999-4999-8999-0000000000f1', 'مخزن ز'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'مخزن ح');

insert into public.cash_boxes (id, company_id, name) values
  ('99999999-9999-4999-8999-0000000000b1', '99999999-9999-4999-8999-0000000000f1', 'خزنة ز'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-0000000000b2', 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'خزنة ح');

insert into public.accounts (id, company_id, name, kind) values
  ('99999999-9999-4999-8999-0000000000c1', '99999999-9999-4999-8999-0000000000f1', 'عميل بفاتورة', 'customer'),
  ('99999999-9999-4999-8999-0000000000c2', '99999999-9999-4999-8999-0000000000f1', 'عميل بلا مستندات', 'customer'),
  ('99999999-9999-4999-8999-0000000000c3', '99999999-9999-4999-8999-0000000000f1', 'عميل بإيصال فقط', 'customer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2', 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'عميل ح', 'customer');

insert into public.items (id, company_id, name) values
  ('99999999-9999-4999-8999-0000000000e1', '99999999-9999-4999-8999-0000000000f1', 'صنف مستخدم'),
  ('99999999-9999-4999-8999-0000000000e2', '99999999-9999-4999-8999-0000000000f1', 'صنف بمخزون'),
  ('99999999-9999-4999-8999-0000000000e3', '99999999-9999-4999-8999-0000000000f1', 'صنف بلا حركة'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-0000000000e2', 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2', 'صنف ح');

insert into public.item_stock (company_id, warehouse_id, item_id, qty) values
  ('99999999-9999-4999-8999-0000000000f1', '99999999-9999-4999-8999-0000000000a1', '99999999-9999-4999-8999-0000000000e1', 10),
  ('99999999-9999-4999-8999-0000000000f1', '99999999-9999-4999-8999-0000000000a1', '99999999-9999-4999-8999-0000000000e2', 5);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-000000000001"}', true);

do $$
declare
  v_invoice uuid;
  v_free uuid;
  v_hard boolean;
  v_ok boolean;
begin
  -- فاتورة على العميل c1 والصنف e1
  v_invoice := public.create_invoice(
    'sale',
    '99999999-9999-4999-8999-0000000000c1',
    '99999999-9999-4999-8999-0000000000a1',
    current_date, 0, null,
    '[{"item_id":"99999999-9999-4999-8999-0000000000e1","qty":1,"unit_price":100}]'::jsonb
  );

  -- حتى بعد الحذف السوفت، المستند يمنع الحذف النهائي
  perform public.delete_invoice(v_invoice);

  v_hard := public.delete_account('99999999-9999-4999-8999-0000000000c1');
  perform public.test_expect(v_hard = false, 'account with (soft deleted) invoice: deactivated');
  perform public.test_expect(
    (select is_active from public.accounts where id = '99999999-9999-4999-8999-0000000000c1') = false,
    'account with invoice: is_active false'
  );
  perform public.test_expect(
    (select count(*) from public.accounts where id = '99999999-9999-4999-8999-0000000000c1') = 1,
    'account with invoice: still exists'
  );

  v_hard := public.delete_item('99999999-9999-4999-8999-0000000000e1');
  perform public.test_expect(v_hard = false, 'item used by invoice: deactivated');
  perform public.test_expect(
    (select is_active from public.items where id = '99999999-9999-4999-8999-0000000000e1') = false,
    'used item: is_active false'
  );

  -- عميل بإيصال حر فقط
  v_free := public.create_free_receipt(
    '99999999-9999-4999-8999-0000000000c3',
    '99999999-9999-4999-8999-0000000000b1',
    current_date, 10, null, null, 'in'
  );

  v_hard := public.delete_account('99999999-9999-4999-8999-0000000000c3');
  perform public.test_expect(v_hard = false, 'account with receipt only: deactivated');
  perform public.test_expect(
    (select is_active from public.accounts where id = '99999999-9999-4999-8999-0000000000c3') = false,
    'account with receipt: is_active false'
  );

  -- حساب بلا أي مستندات => حذف نهائي
  v_hard := public.delete_account('99999999-9999-4999-8999-0000000000c2');
  perform public.test_expect(v_hard = true, 'account without documents: hard deleted');
  perform public.test_expect(
    (select count(*) from public.accounts where id = '99999999-9999-4999-8999-0000000000c2') = 0,
    'account without documents: gone'
  );

  -- صنف بمخزون فقط (بلا فواتير) => حذف نهائي + حذف صف المخزون
  v_hard := public.delete_item('99999999-9999-4999-8999-0000000000e2');
  perform public.test_expect(v_hard = true, 'item with stock only: hard deleted');
  perform public.test_expect(
    (select count(*) from public.items where id = '99999999-9999-4999-8999-0000000000e2') = 0,
    'item with stock only: gone'
  );
  perform public.test_expect(
    (select count(*) from public.item_stock where item_id = '99999999-9999-4999-8999-0000000000e2') = 0,
    'item with stock only: stock row removed'
  );

  v_hard := public.delete_item('99999999-9999-4999-8999-0000000000e3');
  perform public.test_expect(v_hard = true, 'unused item: hard deleted');

  -- عزل الشركات
  v_ok := false;
  begin
    perform public.delete_account('aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2');
  exception when others then
    v_ok := (sqlerrm = 'account_not_found');
  end;
  perform public.test_expect(v_ok, 'RLS: cannot delete company B account');

  v_ok := false;
  begin
    perform public.delete_item('aaaaaaaa-aaaa-4aaa-8aaa-0000000000e2');
  exception when others then
    v_ok := (sqlerrm = 'item_not_found');
  end;
  perform public.test_expect(v_ok, 'RLS: cannot delete company B item');

  -- الإيصال الحر ما زال موجودًا (لم يُحذف مع الحساب المعطّل)
  perform public.test_expect(
    (select count(*) from public.receipts where id = v_free) = 1,
    'receipt kept when account deactivated'
  );
end $$;

reset role;

do $$
begin
  perform public.test_expect(
    (select count(*) from public.accounts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2') = 1,
    'RLS: company B account untouched'
  );
  perform public.test_expect(
    (select is_active from public.accounts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2') = true,
    'RLS: company B account still active'
  );
  perform public.test_expect(
    (select count(*) from public.items where id = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000e2') = 1,
    'RLS: company B item untouched'
  );
end $$;

rollback;

select 'PASS 005_master_data_delete' as result;

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('17171717-1717-4717-8717-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'delete-locations@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('17171717-1717-4717-8717-0000000000a1', 'شركة اختبار حذف المواقع');
insert into public.profiles (id, company_id)
values ('17171717-1717-4717-8717-000000000001', '17171717-1717-4717-8717-0000000000a1');
insert into public.warehouses (id, company_id, name, is_primary) values
  ('17171717-1717-4717-8717-0000000000b1', '17171717-1717-4717-8717-0000000000a1', 'المخزن الرئيسي للاختبار', true),
  ('17171717-1717-4717-8717-0000000000b2', '17171717-1717-4717-8717-0000000000a1', 'مخزن قابل للحذف', false),
  ('17171717-1717-4717-8717-0000000000b3', '17171717-1717-4717-8717-0000000000a1', 'مخزن له فاتورة', false);
insert into public.cash_boxes (id, company_id, name, is_primary) values
  ('17171717-1717-4717-8717-0000000000c1', '17171717-1717-4717-8717-0000000000a1', 'الخزنة الرئيسية للاختبار', true),
  ('17171717-1717-4717-8717-0000000000c2', '17171717-1717-4717-8717-0000000000a1', 'خزنة قابلة للحذف', false),
  ('17171717-1717-4717-8717-0000000000c3', '17171717-1717-4717-8717-0000000000a1', 'خزنة لها إيصال', false);
insert into public.accounts (id, company_id, name, kind)
values ('17171717-1717-4717-8717-0000000000d1', '17171717-1717-4717-8717-0000000000a1', 'مورد الاختبار', 'supplier');
insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid)
values ('17171717-1717-4717-8717-0000000000a1', 'purchase', 'PUR-TEST-DELETE-1', current_date,
  '17171717-1717-4717-8717-0000000000d1', '17171717-1717-4717-8717-0000000000b3', 0, 0, 0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17171717-1717-4717-8717-000000000001"}', true);

do $$
declare
  v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.delete_warehouse('17171717-1717-4717-8717-0000000000b1');
  exception when others then v_failed := sqlerrm = 'primary_location_protected';
  end;
  perform public.test_expect(v_failed, 'primary warehouse cannot be deleted');

  v_failed := false;
  begin
    update public.warehouses set is_primary = false where id = '17171717-1717-4717-8717-0000000000b1';
  exception when others then v_failed := sqlerrm = 'primary_location_protected';
  end;
  perform public.test_expect(v_failed, 'primary marker cannot be removed');

  v_failed := false;
  begin
    perform public.delete_warehouse('17171717-1717-4717-8717-0000000000b3');
  exception when others then v_failed := sqlerrm = 'warehouse_has_documents';
  end;
  perform public.test_expect(v_failed, 'warehouse with invoice cannot be deleted');

  perform public.delete_warehouse('17171717-1717-4717-8717-0000000000b2');
  perform public.test_expect(not exists (select 1 from public.warehouses where id = '17171717-1717-4717-8717-0000000000b2'),
    'unused non-primary warehouse can be deleted');

  v_failed := false;
  begin
    perform public.delete_cash_box('17171717-1717-4717-8717-0000000000c1');
  exception when others then v_failed := sqlerrm = 'primary_location_protected';
  end;
  perform public.test_expect(v_failed, 'primary cash box cannot be deleted');

  insert into public.receipts (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, direction)
  values ('17171717-1717-4717-8717-0000000000a1', null, 'RCP-TEST-DELETE-1', current_date,
    '17171717-1717-4717-8717-0000000000d1', '17171717-1717-4717-8717-0000000000c3', 1, 'in');

  v_failed := false;
  begin
    perform public.delete_cash_box('17171717-1717-4717-8717-0000000000c3');
  exception when others then v_failed := sqlerrm = 'cash_box_has_documents';
  end;
  perform public.test_expect(v_failed, 'cash box with receipt cannot be deleted');

  perform public.delete_cash_box('17171717-1717-4717-8717-0000000000c2');
  perform public.test_expect(not exists (select 1 from public.cash_boxes where id = '17171717-1717-4717-8717-0000000000c2'),
    'unused non-primary cash box can be deleted');
end;
$$;

rollback;

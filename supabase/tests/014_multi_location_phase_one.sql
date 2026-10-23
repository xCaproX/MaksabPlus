begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('16161616-1616-4616-8616-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-location@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('16161616-1616-4616-8616-0000000000a1', 'شركة اختبار تعدد المواقع');
insert into public.profiles (id, company_id)
values ('16161616-1616-4616-8616-000000000001', '16161616-1616-4616-8616-0000000000a1');
insert into public.warehouses (id, company_id, name) values
  ('16161616-1616-4616-8616-0000000000b1', '16161616-1616-4616-8616-0000000000a1', 'مخزن الحركة'),
  ('16161616-1616-4616-8616-0000000000b2', '16161616-1616-4616-8616-0000000000a1', 'مخزن فارغ');
insert into public.cash_boxes (id, company_id, name) values
  ('16161616-1616-4616-8616-0000000000c1', '16161616-1616-4616-8616-0000000000a1', 'خزنة أولى'),
  ('16161616-1616-4616-8616-0000000000c2', '16161616-1616-4616-8616-0000000000a1', 'خزنة ثانية');
insert into public.accounts (id, company_id, name, kind) values
  ('16161616-1616-4616-8616-0000000000d1', '16161616-1616-4616-8616-0000000000a1', 'مورد اختبار المواقع', 'supplier');
insert into public.items (id, company_id, name, purchase_price) values
  ('16161616-1616-4616-8616-0000000000e1', '16161616-1616-4616-8616-0000000000a1', 'صنف اختبار المواقع', 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16161616-1616-4616-8616-000000000001"}', true);

do $$
declare
  v_invoice uuid;
  v_failed boolean := false;
begin
  v_invoice := public.create_invoice_with_cash_box(
    'purchase', '16161616-1616-4616-8616-0000000000d1', '16161616-1616-4616-8616-0000000000b1',
    current_date, 10, null,
    '[{"item_id":"16161616-1616-4616-8616-0000000000e1","qty":2,"unit_price":10}]'::jsonb,
    '16161616-1616-4616-8616-0000000000c2'
  );
  perform public.test_expect((select cash_box_id = '16161616-1616-4616-8616-0000000000c2' from public.receipts where invoice_id = v_invoice),
    'invoice payment is posted to selected cash box');

  perform public.update_invoice_with_cash_box(
    v_invoice, '16161616-1616-4616-8616-0000000000d1', '16161616-1616-4616-8616-0000000000b1',
    current_date, 5, null,
    '[{"item_id":"16161616-1616-4616-8616-0000000000e1","qty":2,"unit_price":10}]'::jsonb,
    '16161616-1616-4616-8616-0000000000c1'
  );
  perform public.test_expect((select cash_box_id = '16161616-1616-4616-8616-0000000000c1' and amount = 5
    from public.receipts where invoice_id = v_invoice), 'editing invoice updates linked cash box and amount atomically');

  perform public.test_expect((select qty = 2 from public.item_stock
    where warehouse_id = '16161616-1616-4616-8616-0000000000b1' and item_id = '16161616-1616-4616-8616-0000000000e1'),
    'invoice stock remains attached to selected warehouse');

  begin
    update public.warehouses set is_active = false where id = '16161616-1616-4616-8616-0000000000b1';
  exception when others then v_failed := sqlerrm = 'warehouse_has_stock';
  end;
  perform public.test_expect(v_failed, 'warehouse with stock cannot be deactivated');
  perform public.test_expect((select is_active from public.warehouses where id = '16161616-1616-4616-8616-0000000000b1'),
    'failed warehouse deactivation leaves it active');

  update public.warehouses set is_active = false where id = '16161616-1616-4616-8616-0000000000b2';
  perform public.test_expect(not (select is_active from public.warehouses where id = '16161616-1616-4616-8616-0000000000b2'),
    'empty warehouse can be deactivated');
end;
$$;

rollback;

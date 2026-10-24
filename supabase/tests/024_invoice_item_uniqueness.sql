begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, '');
  end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('24242424-2424-4424-8424-242424242401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'duplicate-items@test.local', now(), now(), now());
insert into public.companies (id, name)
values ('24242424-2424-4424-8424-2424242424a1', 'شركة اختبار تكرار الأصناف');
insert into public.profiles (id, company_id, full_name)
values ('24242424-2424-4424-8424-242424242401', '24242424-2424-4424-8424-2424242424a1', 'مستخدم الاختبار');
insert into public.warehouses (id, company_id, name)
values ('24242424-2424-4424-8424-2424242424b1', '24242424-2424-4424-8424-2424242424a1', 'مخزن الاختبار');
insert into public.accounts (id, company_id, name, kind)
values ('24242424-2424-4424-8424-2424242424c1', '24242424-2424-4424-8424-2424242424a1', 'مورد الاختبار', 'supplier');
insert into public.items (id, company_id, name, code, unit, sale_price, purchase_price)
values ('24242424-2424-4424-8424-2424242424d1', '24242424-2424-4424-8424-2424242424a1', 'صنف الاختبار', 'DUP-001', 'قطعة', 5, 3);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"24242424-2424-4424-8424-242424242401"}', true);

do $$
declare
  v_invoice uuid;
  v_error text;
  v_stock numeric(18,4);
begin
  begin
    perform public.create_invoice(
      'purchase',
      '24242424-2424-4424-8424-2424242424c1',
      '24242424-2424-4424-8424-2424242424b1',
      current_date,
      0,
      null,
      '[{"item_id":"24242424-2424-4424-8424-2424242424d1","qty":1,"unit_price":3},{"item_id":"24242424-2424-4424-8424-2424242424d1","qty":2,"unit_price":3}]'::jsonb
    );
  exception when others then
    v_error := sqlerrm;
  end;
  perform public.test_expect(v_error = 'invoice_item_duplicate', 'create rejects repeated item lines');
  perform public.test_expect(not exists (
    select 1 from public.invoices where company_id = '24242424-2424-4424-8424-2424242424a1'
  ), 'rejected creation leaves no invoice');

  v_invoice := public.create_invoice(
    'purchase',
    '24242424-2424-4424-8424-2424242424c1',
    '24242424-2424-4424-8424-2424242424b1',
    current_date,
    0,
    null,
    '[{"item_id":"24242424-2424-4424-8424-2424242424d1","qty":2,"unit_price":3}]'::jsonb
  );

  v_error := null;
  begin
    perform public.update_invoice(
      v_invoice,
      '24242424-2424-4424-8424-2424242424c1',
      '24242424-2424-4424-8424-2424242424b1',
      current_date,
      0,
      null,
      '[{"item_id":"24242424-2424-4424-8424-2424242424d1","qty":1,"unit_price":3},{"item_id":"24242424-2424-4424-8424-2424242424d1","qty":1,"unit_price":3}]'::jsonb
    );
  exception when others then
    v_error := sqlerrm;
  end;
  perform public.test_expect(v_error = 'invoice_item_duplicate', 'update rejects repeated item lines');
  perform public.test_expect((select count(*) = 1 from public.invoice_items where invoice_id = v_invoice),
    'rejected update preserves original invoice lines');
  select qty into v_stock from public.item_stock
  where warehouse_id = '24242424-2424-4424-8424-2424242424b1'
    and item_id = '24242424-2424-4424-8424-2424242424d1';
  perform public.test_expect(v_stock = 2, 'rejected update rolls back stock changes');
end;
$$;

rollback;

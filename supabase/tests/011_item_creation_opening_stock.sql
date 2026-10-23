begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('13131313-1313-4313-8313-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'item-opening-a@test.local', now(), now(), now()),
  ('13131313-1313-4313-8313-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'item-opening-b@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('13131313-1313-4313-8313-0000000000a1', 'شركة إنشاء الصنف أ'),
  ('13131313-1313-4313-8313-0000000000a2', 'شركة إنشاء الصنف ب');
insert into public.profiles (id, company_id) values
  ('13131313-1313-4313-8313-000000000001', '13131313-1313-4313-8313-0000000000a1'),
  ('13131313-1313-4313-8313-000000000002', '13131313-1313-4313-8313-0000000000a2');
insert into public.warehouses (id, company_id, name) values
  ('13131313-1313-4313-8313-0000000000b1', '13131313-1313-4313-8313-0000000000a1', 'مخزن إنشاء الصنف أ'),
  ('13131313-1313-4313-8313-0000000000b2', '13131313-1313-4313-8313-0000000000a2', 'مخزن إنشاء الصنف ب');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"13131313-1313-4313-8313-000000000001"}', true);

do $$
declare
  v_item uuid;
  v_failed boolean := false;
begin
  v_item := public.create_item_with_opening_stock('صنف برصيد بداية', 'علبة', 40, 25, true,
    '13131313-1313-4313-8313-0000000000b1', 12, 18.5);
  perform public.test_expect((select qty = 12 and avg_cost = 18.5 from public.item_stock where item_id = v_item),
    'item is created with opening stock and unit cost');
  perform public.test_expect((select opening_qty = 12 and unit_cost = 18.5 from public.stock_opening_balances where item_id = v_item),
    'opening stock is recorded for later reconciliation');
  perform public.test_expect((select name = 'صنف برصيد بداية' and unit = 'علبة' from public.items where id = v_item),
    'item details are saved');

  begin
    perform public.create_item_with_opening_stock('يجب ألا يحفظ', 'قطعة', 0, 0, true,
      '13131313-1313-4313-8313-0000000000b2', 1, 1);
  exception when others then
    v_failed := sqlerrm = 'invalid_warehouse';
  end;
  perform public.test_expect(v_failed, 'another company warehouse is rejected');
  perform public.test_expect(not exists (select 1 from public.items where name = 'يجب ألا يحفظ'),
    'failed cross-company creation leaves no partial item');

  v_item := public.create_item_with_opening_stock('صنف بلا كمية', 'قطعة', 0, 0, true, null, 0, 0);
  perform public.test_expect(exists (select 1 from public.items where id = v_item), 'zero opening quantity needs no warehouse');
end;
$$;

rollback;

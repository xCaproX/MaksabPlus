begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, '');
  end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('27272727-2727-4272-8272-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-security-a@test.local', now(), now(), now()),
  ('27272727-2727-4272-8272-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-security-b@test.local', now(), now(), now());

insert into public.companies (id, name) values
  ('27272727-2727-4272-8272-0000000000a1', 'شركة أمان أ'),
  ('27272727-2727-4272-8272-0000000000a2', 'شركة أمان ب');

insert into public.profiles (id, company_id, access_role) values
  ('27272727-2727-4272-8272-000000000001', '27272727-2727-4272-8272-0000000000a1', 'owner'),
  ('27272727-2727-4272-8272-000000000002', '27272727-2727-4272-8272-0000000000a2', 'owner');

insert into public.warehouses (id, company_id, name, is_active, is_primary) values
  ('27272727-2727-4272-8272-000000000101', '27272727-2727-4272-8272-0000000000a1', 'مخزن أمان أ', true, true),
  ('27272727-2727-4272-8272-000000000102', '27272727-2727-4272-8272-0000000000a2', 'مخزن أمان ب', true, true);

insert into public.items (id, company_id, name, is_active, purchase_price, sale_price) values
  ('27272727-2727-4272-8272-000000000201', '27272727-2727-4272-8272-0000000000a1', 'صنف أمان أ', true, 10, 20),
  ('27272727-2727-4272-8272-000000000202', '27272727-2727-4272-8272-0000000000a2', 'صنف أمان ب', true, 15, 30);

insert into public.stock_opening_balances (company_id, warehouse_id, item_id, opening_qty, unit_cost)
values ('27272727-2727-4272-8272-0000000000a1', '27272727-2727-4272-8272-000000000101', '27272727-2727-4272-8272-000000000201', 50, 10);

insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values ('27272727-2727-4272-8272-0000000000a1', '27272727-2727-4272-8272-000000000101', '27272727-2727-4272-8272-000000000201', 0, 0);

-- Company B starts deliberately out of sync. A successful cross-tenant exploit
-- would reconcile this row to zero because it has no ledger movements.
insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values (
  '27272727-2727-4272-8272-0000000000a2',
  '27272727-2727-4272-8272-000000000102',
  '27272727-2727-4272-8272-000000000202',
  777,
  15
)
on conflict (warehouse_id, item_id) do update set qty = 777, avg_cost = 15;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"27272727-2727-4272-8272-000000000001"}', true);

-- The authenticated Company A owner can still use the compatible API for A.
select public.reconcile_item_stock('27272727-2727-4272-8272-0000000000a1');

do $$
begin
  perform public.test_expect(
    (select qty = 50 from public.item_stock
      where warehouse_id = '27272727-2727-4272-8272-000000000101'
        and item_id = '27272727-2727-4272-8272-000000000201')::boolean,
    'Company A can reconcile its own stock through the compatible company argument'::text,
    null::text
  );
end;
$$;

-- Supplying Company B's UUID must fail before the SECURITY DEFINER implementation runs.
do $$
begin
  begin
    perform public.reconcile_item_stock('27272727-2727-4272-8272-0000000000a2');
    raise exception 'TEST FAILED [cross-tenant reconciliation was accepted]';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Inspect with the bypass-RLS test role to prove B's actual row was not changed.
set local role service_role;
do $$
begin
  perform public.test_expect(
    (select qty = 777 from public.item_stock
      where company_id = '27272727-2727-4272-8272-0000000000a2'
        and warehouse_id = '27272727-2727-4272-8272-000000000102'
        and item_id = '27272727-2727-4272-8272-000000000202')::boolean,
    'rejected Company A request leaves Company B stock unchanged'::text,
    null::text
  );
end;
$$;

do $$
begin
  perform public.test_expect(
    (not has_function_privilege('anon', 'public.reconcile_item_stock(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.reconcile_item_stock_internal(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.reconcile_item_stock_internal(uuid)', 'execute'))::boolean,
    'only authenticated callers can invoke the tenant-scoped RPC; the internal path is not callable'::text,
    null::text
  );
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.reconcile_item_stock('27272727-2727-4272-8272-0000000000a2');
    raise exception 'TEST FAILED [anonymous reconciliation was accepted]';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;

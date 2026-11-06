-- @fixture document_boundaries
-- Both tenants own items AND warehouses: an empty second tenant would miss
-- foreign warehouse metadata attached to an otherwise correctly scoped item.
insert into auth.users(id,email)
values ('55555555-5555-4555-8555-000000000004','warehouse-employee-b@test.local');
insert into public.profiles(id,company_id,access_role)
values ('55555555-5555-4555-8555-000000000004','55555555-5555-4555-8555-0000000000b1','employee');

insert into public.warehouses(id,company_id,name,notes,is_active)
values ('55555555-5555-4555-8555-000000000042','55555555-5555-4555-8555-0000000000a1',
        'Inactive A','private warehouse A',false);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array['balances.items.view']);

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
insert into public.warehouses(id,company_id,name,notes,is_active) values
 ('55555555-5555-4555-8555-000000000040','55555555-5555-4555-8555-0000000000b1',
  'Warehouse B','private warehouse B',true),
 ('55555555-5555-4555-8555-000000000041','55555555-5555-4555-8555-0000000000b1',
  'Inactive B','private inactive warehouse B',false);
select set_config('test.warehouse.item_b',public.create_item_with_opening_stock(
 'Tenant B item','piece',80,40,true,'55555555-5555-4555-8555-000000000040',7,40)::text,true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000004',array['balances.items.view']);

set local role authenticated;
do $test$
declare
 v_user uuid;
 v_company uuid;
 v_expected_count integer;
 v_expected_qty numeric;
 v_expected_cost numeric;
 v_foreign_warehouse uuid;
 v_foreign_search text;
 v_kpis jsonb;
 v_legacy jsonb;
begin
 foreach v_user in array array[
  '55555555-5555-4555-8555-000000000001'::uuid,
  '55555555-5555-4555-8555-000000000002'::uuid,
  '55555555-5555-4555-8555-000000000003'::uuid,
  '55555555-5555-4555-8555-000000000004'::uuid
 ] loop
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  v_company:=public.current_company_id();
  if v_company='55555555-5555-4555-8555-0000000000a1' then
   v_expected_count:=2; v_expected_qty:=21; v_expected_cost:=2520;
   v_foreign_warehouse:='55555555-5555-4555-8555-000000000040';
   v_foreign_search:='Tenant B item';
  else
   v_expected_count:=1; v_expected_qty:=7; v_expected_cost:=280;
   v_foreign_warehouse:='55555555-5555-4555-8555-000000000010';
   v_foreign_search:='Boundary item';
  end if;

  perform public.test_boundary_expect(not exists(
   select 1 from public.filter_warehouse_item_rows('{}') v
   where v.company_id<>v_company or v.warehouse_id not in (
    select w.id from public.warehouses w where w.company_id=v_company and w.is_active
   )
  ),'warehouse RPC must not attach foreign or inactive warehouse metadata');
  perform public.test_boundary_expect(
   (select count(*) from public.filter_warehouse_item_rows('{}'))=v_expected_count,
   'RPC keeps every own active warehouse, including zero-stock rows');
  perform public.test_boundary_expect(
   (select count(*) from public.v_warehouse_items)=v_expected_count,
   'security-invoker view and guarded RPC return the same own warehouses');
  perform public.test_boundary_expect(not exists(
   select 1 from public.filter_warehouse_item_rows('{}',v_foreign_search)
  ),'foreign item search returns no rows');

  v_kpis:=public.get_warehouse_stock_kpis_columns('{}');
  v_legacy:=public.get_warehouse_stock_kpis();
  perform public.test_boundary_expect(v_kpis=v_legacy,'legacy and column KPI paths stay aligned');
  perform public.test_boundary_expect((v_kpis->>'count')::int=v_expected_count
   and (v_kpis->>'total_qty')::numeric=v_expected_qty
   and (v_kpis->>'out_of_stock_count')::int=v_expected_count-1,
   'stock totals/counts exclude other companies and retain own quantities');
  v_kpis:=public.get_warehouse_stock_kpis_columns('{}',v_foreign_warehouse);
  perform public.test_boundary_expect((v_kpis->>'count')::int=0
   and (v_kpis->>'total_qty')::numeric=0,
   'a supplied foreign warehouse cannot return rows or affect totals');

  if public.is_company_owner() then
   v_kpis:=public.get_warehouse_stock_kpis_columns('{}');
   perform public.test_boundary_expect((v_kpis->>'total_val')::numeric=v_expected_cost,
    'owner stock valuation remains unchanged');
   begin
    perform public.update_warehouse(v_foreign_warehouse,'not allowed','must not write');
    raise exception 'cross_company_warehouse_write_allowed';
   exception when invalid_parameter_value then
    if sqlerrm<>'warehouse_not_found' then raise; end if;
   end;
  else
   perform public.test_boundary_expect(not exists(
    select 1 from public.filter_warehouse_item_rows('{}') where unit_cost is not null
   ),'employee still cannot read protected stock cost');
   v_kpis:=public.get_warehouse_stock_kpis_columns('{}');
   perform public.test_boundary_expect(v_kpis->>'total_val' is null,
    'employee stock valuation remains masked in the database');
  end if;
 end loop;
end $test$;

-- Existing permission checks remain mandatory after changing the shared view.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002','{}');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.test_boundary_denied('select * from public.filter_warehouse_item_rows(''{}'')');
select public.test_boundary_denied('select public.get_warehouse_stock_kpis_columns(''{}'')');
select public.test_boundary_denied('select public.get_warehouse_stock_kpis()');

set local role anon;
select public.test_boundary_denied('select * from public.v_warehouse_items');
select public.test_boundary_denied('select * from public.filter_warehouse_item_rows(''{}'')');
select public.test_boundary_denied('select public.get_warehouse_stock_kpis_columns(''{}'')');
select public.test_boundary_denied('select public.get_warehouse_stock_kpis()');
reset role;

do $test$
begin
 perform public.test_boundary_expect((select reloptions @> array['security_invoker=true']
  from pg_class where oid='public.v_warehouse_items'::regclass),'view stays security invoker');
 perform public.test_boundary_expect(not exists(
  select 1 from public.v_warehouse_items v join public.warehouses w on w.id=v.warehouse_id
  where v.company_id<>w.company_id
 ),'view is tenant-consistent even in privileged aggregate/RPC contexts');
 perform public.test_boundary_expect((select notes='private warehouse B'
  from public.warehouses where id='55555555-5555-4555-8555-000000000040'),
  'tenant A could not write tenant B warehouse');
 perform public.test_boundary_expect((select name='Warehouse A'
  from public.warehouses where id='55555555-5555-4555-8555-000000000010'),
  'tenant B could not write tenant A warehouse');
end $test$;
select 'PASS 052_warehouse_item_tenant_isolation (two owners, two employees, anon, rows, KPIs, costs, writes)' as result;
rollback;

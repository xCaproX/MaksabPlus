-- @fixture document_boundaries
select set_config('test.cost.sale', public.create_invoice('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,0,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',200)))::text,true);
select set_config('test.cost.transfer', public.create_warehouse_transfer(
 '55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',current_date,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)))::text,true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.sale.view','goods.warehouse_transfer.view','balances.items.view','management.items.view']);
set local role authenticated;
select public.test_boundary_denied('select cost_total,profit_total from public.invoices');
-- Owners retain the exact cost and profit through guarded views.
select public.test_boundary_expect((select cost_total=120 and profit_total=80 from public.v_invoice_list
 where id=current_setting('test.cost.sale')::uuid),'owner sees exact invoice cost and profit');
select public.test_boundary_expect((select unit_cost=120 from public.v_invoice_items
 where invoice_id=current_setting('test.cost.sale')::uuid),'owner sees exact line cost');
select public.test_boundary_expect((select total_value=120 from public.v_warehouse_transfer_list
 where id=current_setting('test.cost.transfer')::uuid),'owner sees transfer valuation');
select public.test_boundary_expect(public.read_protected_cost('stock',current_setting('test.boundary.item')::uuid,
 '55555555-5555-4555-8555-000000000010')=120,'owner sees stock average cost');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.test_boundary_expect((select cost_total is null and profit_total is null from public.v_invoice_list
 where id=current_setting('test.cost.sale')::uuid),'employee invoice costs masked');
select public.test_boundary_expect((select unit_cost is null and line_cost is null and line_profit is null
 from public.v_invoice_items where invoice_id=current_setting('test.cost.sale')::uuid),'employee line costs masked');
select public.test_boundary_expect(not exists(select 1 from public.v_warehouse_items where unit_cost is not null),
 'employee cannot read warehouse accounting cost or fallback');
select public.test_boundary_expect(not exists(select 1 from public.v_stock_opening_balances where unit_cost is not null),
 'employee cannot read opening cost or fallback');
select public.test_boundary_expect(not exists(select 1 from public.v_warehouse_transfer_items where unit_cost is not null),
 'employee transfer costs masked');
select public.test_boundary_expect(not exists(select 1 from public.v_warehouse_transfer_list where total_value is not null),
 'employee transfer valuation masked');
select public.test_boundary_expect(public.get_warehouse_stock_kpis(null,null)->>'total_val' is null,
 'employee stock KPI valuation masked');
select public.test_boundary_expect(public.get_warehouse_transfer_kpis()->>'total_value' is null,
 'employee transfer KPI valuation masked');
-- Exercise SELECT * just like the master-data provider and document lists.
select * from public.v_invoice_list;
select * from public.v_invoice_items;
select * from public.v_warehouse_items;
select * from public.v_stock_opening_balances;
select * from public.v_warehouse_transfer_list;
select * from public.v_warehouse_transfer_items;
select public.test_boundary_denied('select cost_total,profit_total from public.invoices');
select public.test_boundary_denied('select unit_cost from public.invoice_items');
select public.test_boundary_denied('select avg_cost from public.item_stock');
select public.test_boundary_denied('select unit_cost from public.warehouse_transfer_items');
select public.test_boundary_denied('select unit_cost from public.stock_opening_balances');
select public.test_boundary_denied('select unit_cost from public.stock_opening_adjustments');
select public.test_boundary_denied('select row_to_json(i) from public.invoices i');
select public.test_boundary_denied('select to_jsonb(s) from public.item_stock s');
select public.test_boundary_expect(public.read_protected_cost('invoice_cost',current_setting('test.cost.sale')::uuid) is null,
 'employee cannot bypass view with cost helper');

reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',
 array['management.items.view','management.items.edit']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.save_opening_balances('[]',jsonb_build_array(jsonb_build_object(
 'warehouse_id','55555555-5555-4555-8555-000000000010','item_id',current_setting('test.boundary.item'),
 'opening_qty',22,'unit_cost',null)));
select public.test_boundary_expect((select qty=21 from public.item_stock
 where item_id=current_setting('test.boundary.item')::uuid
 and warehouse_id='55555555-5555-4555-8555-000000000010'),'quantity-only editor can correct opening quantity');
select public.test_boundary_denied('select public.save_opening_balances(''[]'',''[{"warehouse_id":
 "55555555-5555-4555-8555-000000000010","item_id":"' || current_setting('test.boundary.item') || '",
 "opening_qty":22,"unit_cost":0}]'')');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.test_boundary_expect(public.read_protected_cost('opening',current_setting('test.boundary.item')::uuid,
 '55555555-5555-4555-8555-000000000010')=120,'quantity-only correction preserves opening cost');
select public.test_boundary_expect(public.read_protected_cost('stock',current_setting('test.boundary.item')::uuid,
 '55555555-5555-4555-8555-000000000010')=120,'quantity-only correction preserves average cost');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
select public.test_boundary_expect(public.read_protected_cost('invoice_cost',current_setting('test.cost.sale')::uuid) is null,
 'company B cannot read A cost via helper');
select public.test_boundary_expect(public.read_protected_cost('invoice_line',
 (select id from public.invoice_items limit 1)) is null,'company B cannot read A line cost');
select public.test_boundary_expect(not exists(select 1 from public.v_invoice_list),'company B views exclude A');
select public.test_boundary_expect(public.read_protected_cost('stock',current_setting('test.boundary.item')::uuid,
 '55555555-5555-4555-8555-000000000010') is null,'company B cannot read A stock cost');
set local role anon;
select public.test_boundary_denied('select public.read_protected_cost(''invoice_cost'','''
 || current_setting('test.cost.sale') || ''')');
select public.test_boundary_denied('select cost_total from public.invoices');
select public.test_boundary_denied('select * from public.v_warehouse_transfer_items');
rollback;

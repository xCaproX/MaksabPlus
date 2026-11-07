-- @fixture document_boundaries
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',
 array['goods.sale.view','goods.sale.create']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);

-- A create-only cashier needs neither data.edit nor goods.sale.edit.
select set_config('test.boundary.sale', public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,0,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',200)),null)::text,true);
select public.test_boundary_expect((select balance=80 from public.v_account_balances
 where id='55555555-5555-4555-8555-000000000030'),'automatic balance sync works without data.edit');
select public.test_boundary_expect(not exists(select 1 from public.invoices
 where id=current_setting('test.boundary.purchase')::uuid),'sales-only user cannot read purchase');
select public.test_boundary_denied('update public.item_stock set qty=999');
select public.test_boundary_denied('insert into public.item_stock(company_id,warehouse_id,item_id,qty) values
 (''55555555-5555-4555-8555-0000000000a1'',''55555555-5555-4555-8555-000000000011'','''
 || current_setting('test.boundary.item') || ''',999)');
select public.test_boundary_denied('delete from public.item_stock');
select public.test_boundary_denied('select public.apply_stock_movement(''55555555-5555-4555-8555-0000000000a1'',
 ''55555555-5555-4555-8555-000000000010'',''' || current_setting('test.boundary.item') || ''',999,0)');
select public.test_boundary_denied('update public.invoices set total=1');
select public.test_boundary_denied('select public.recalc_invoice_totals(''' || current_setting('test.boundary.sale') || ''')');
select public.test_boundary_denied('select public.sync_invoice_receipt(''' || current_setting('test.boundary.sale') || ''')');
select public.test_boundary_denied('select public.delete_invoice(''' || current_setting('test.boundary.sale') || ''')');
select public.test_boundary_denied('select public.create_invoice(''purchase'',
 ''55555555-5555-4555-8555-000000000030'',''55555555-5555-4555-8555-000000000010'',
 current_date,0,null,''[{"item_id":"' || current_setting('test.boundary.item') || '","qty":1,"unit_price":120}]'')');

reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.sale.view','goods.sale.create','goods.sale.edit','goods.sale.delete',
 'money.in.view','money.in.create','money.in.edit','money.in.delete']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.update_invoice_with_cash_box(current_setting('test.boundary.sale')::uuid,
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,100,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',2,'unit_price',200)),'55555555-5555-4555-8555-000000000020');
select public.test_boundary_expect((select balance=180 from public.v_account_balances
 where id='55555555-5555-4555-8555-000000000030'),'edited invoice balance is correct');
select public.test_boundary_expect((select balance=100 from public.v_cash_box_balances
 where id='55555555-5555-4555-8555-000000000020'),'linked receipt synchronizes cash without data.edit');
select public.delete_invoice(current_setting('test.boundary.sale')::uuid);
select public.test_boundary_expect((select qty=21 from public.item_stock
 where item_id=current_setting('test.boundary.item')::uuid),'delete restores stock');
select public.restore_invoice(current_setting('test.boundary.sale')::uuid);
select public.test_boundary_expect((select qty=19 from public.item_stock
 where item_id=current_setting('test.boundary.item')::uuid),'restore consumes stock once');
select public.test_boundary_denied('select public.delete_invoice(''' || current_setting('test.boundary.purchase') || ''')');
select public.test_boundary_denied('select public.create_cash_box_transfer(
 ''55555555-5555-4555-8555-000000000020'',''55555555-5555-4555-8555-000000000021'',current_date,1,null)');
select public.test_boundary_denied('select public.create_warehouse_transfer(
 ''55555555-5555-4555-8555-000000000010'',''55555555-5555-4555-8555-000000000011'',current_date,null,''[]'')');
select public.test_boundary_denied('select public.create_free_receipt(
 ''55555555-5555-4555-8555-000000000030'',''55555555-5555-4555-8555-000000000020'',current_date,1,null,null,''out'')');
select set_config('test.boundary.receipt', public.create_free_receipt(
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000020',
 current_date,10,null,null,'in')::text,true);
select public.update_free_receipt(current_setting('test.boundary.receipt')::uuid,
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000020',current_date,15,null,null);
select public.delete_free_receipt(current_setting('test.boundary.receipt')::uuid);
select public.restore_receipt(current_setting('test.boundary.receipt')::uuid);
select public.test_boundary_expect((select balance=165 from public.v_account_balances
 where id='55555555-5555-4555-8555-000000000030'),'receipt lifecycle balance is correct');

-- Sibling transfer/return workflows use their own granular grants and keep
-- working without data.edit, management.edit, or another document's grants.
reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.warehouse_transfer.view','goods.warehouse_transfer.create',
 'goods.warehouse_transfer.edit','goods.warehouse_transfer.delete',
 'money.cash_box_transfer.view','money.cash_box_transfer.create',
 'money.cash_box_transfer.edit','money.cash_box_transfer.delete',
 'goods.sale_return.create','goods.purchase_return.create','goods.waste.create']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select set_config('test.boundary.transfer',public.create_warehouse_transfer(
 '55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',current_date,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',2)))::text,true);
select public.update_warehouse_transfer(current_setting('test.boundary.transfer')::uuid,
 '55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',current_date,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',3)));
select public.delete_warehouse_transfer(current_setting('test.boundary.transfer')::uuid);
select public.restore_warehouse_transfer(current_setting('test.boundary.transfer')::uuid);
select set_config('test.boundary.cash_transfer',public.create_cash_box_transfer(
 '55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,10,null)::text,true);
select public.update_cash_box_transfer(current_setting('test.boundary.cash_transfer')::uuid,
 '55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,20,null);
select public.delete_cash_box_transfer(current_setting('test.boundary.cash_transfer')::uuid);
select public.restore_cash_box_transfer(current_setting('test.boundary.cash_transfer')::uuid);
select public.test_boundary_expect((select balance=95 from public.v_cash_box_balances
 where id='55555555-5555-4555-8555-000000000020'),'cash transfer lifecycle preserves source balance');
select public.test_boundary_expect((select balance=20 from public.v_cash_box_balances
 where id='55555555-5555-4555-8555-000000000021'),'cash transfer lifecycle preserves destination balance');
select public.create_invoice('sale_return',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1,'unit_price',200)));
select public.create_invoice('purchase_return',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1,'unit_price',120)));
select public.create_invoice('waste',
 (select id from public.accounts where system_key='waste'),
 '55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1,'unit_price',0)));
select public.test_boundary_expect((select qty=15 from public.item_stock
 where item_id=current_setting('test.boundary.item')::uuid
 and warehouse_id='55555555-5555-4555-8555-000000000010'),'transfer and return lifecycle stock reconciles');

-- Company B cannot mutate A through the now SECURITY DEFINER entry points.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $$ begin
  begin
    perform public.delete_invoice(current_setting('test.boundary.sale')::uuid);
    raise exception 'company B deleted A invoice';
  exception when invalid_parameter_value then null;
  end;
end $$;
select public.test_boundary_expect(not exists(select 1 from public.invoices),'company B cannot read A invoices');
select public.test_boundary_denied('update public.item_stock set qty=999');
set local role anon;
select public.test_boundary_denied('select * from public.invoices');
select public.test_boundary_denied('select public.delete_invoice(''' || current_setting('test.boundary.sale') || ''')');
select public.test_boundary_denied('select public.apply_stock_movement(null,null,null,1,0)');
rollback;

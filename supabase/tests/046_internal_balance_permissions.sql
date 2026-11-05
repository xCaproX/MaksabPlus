-- @fixture document_boundaries
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',
 array['goods.sale.view','goods.sale.create','goods.sale.edit','money.in.view']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,10,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',200)),'55555555-5555-4555-8555-000000000020');
select public.test_boundary_expect((select balance=310 from public.v_account_balances
 where id='55555555-5555-4555-8555-000000000030'),'invoice balance sync does not require data.edit');
select public.test_boundary_expect((select balance=10 from public.v_cash_box_balances
 where id='55555555-5555-4555-8555-000000000020'),'receipt balance sync does not require data.edit');
select public.test_boundary_denied('update public.accounts set name=''unauthorized change''
 where id=''55555555-5555-4555-8555-000000000030''');
select public.test_boundary_denied('update public.cash_boxes set name=''unauthorized change''
 where id=''55555555-5555-4555-8555-000000000020''');
rollback;

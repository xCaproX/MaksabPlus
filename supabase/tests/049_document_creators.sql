-- @fixture document_boundaries
update public.profiles set full_name='مدير المستندات'
 where id='55555555-5555-4555-8555-000000000001';
update public.profiles set full_name='منشئ المستند'
 where id='55555555-5555-4555-8555-000000000002';
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.sale.view','goods.sale.create','money.in.view','money.in.create',
 'goods.warehouse_transfer.view','goods.warehouse_transfer.create',
 'money.cash_box_transfer.view','money.cash_box_transfer.create']);

-- Simulate an unattributed historical/imported record. Never trust a supplied
-- creator name when a trusted maintenance session has no authenticated user.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);
with legacy as (
 insert into public.invoices(company_id,kind,number,invoice_date,account_id,warehouse_id,total,paid,created_by_name)
 values('55555555-5555-4555-8555-0000000000a1','sale','SAL-LEGACY',current_date,
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',0,0,'اسم مزور') returning id
) select set_config('test.creator.legacy',id::text,true) from legacy;

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
set local role authenticated;
select set_config('test.creator.invoice',public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,10,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',200)),'55555555-5555-4555-8555-000000000020')::text,true);
select set_config('test.creator.receipt',public.create_free_receipt(
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000020',current_date,5,'استلام تجريبي',null,'in')::text,true);
select set_config('test.creator.warehouse',public.create_warehouse_transfer(
 '55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',current_date,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)))::text,true);
select set_config('test.creator.cash',public.create_cash_box_transfer(
 '55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,3,null)::text,true);

select public.test_boundary_expect((select created_by_name='منشئ المستند' from public.v_invoice_list
 where id=current_setting('test.creator.invoice')::uuid),'invoice creator captured from session');
select public.test_boundary_expect((select created_by_name='منشئ المستند' from public.v_receipt_list
 where invoice_id=current_setting('test.creator.invoice')::uuid),'automatic linked receipt captures creator');
select public.test_boundary_expect((select created_by_name='منشئ المستند' from public.v_receipt_list
 where id=current_setting('test.creator.receipt')::uuid),'free receipt creator captured');
select public.test_boundary_expect((select created_by_name='منشئ المستند' from public.v_warehouse_transfer_list
 where id=current_setting('test.creator.warehouse')::uuid),'warehouse transfer creator captured');
select public.test_boundary_expect((select created_by_name='منشئ المستند' from public.v_cash_box_transfer_list
 where id=current_setting('test.creator.cash')::uuid),'cash transfer creator captured');
select public.test_boundary_denied('select public.stamp_document_creator()');
select public.test_boundary_denied('update public.invoices set created_by_name=''اسم مزور''');
select public.test_boundary_denied('update public.receipts set created_by_name=''اسم مزور''');
select public.test_boundary_denied('update public.warehouse_transfers set created_by_name=''اسم مزور''');
select public.test_boundary_denied('update public.cash_box_transfers set created_by_name=''اسم مزور''');

-- Even an internal privileged write with a spoofed name cannot change the
-- snapshot. Renaming the user also leaves existing documents unchanged.
reset role;
update public.profiles set full_name='اسم المستخدم الجديد'
 where id='55555555-5555-4555-8555-000000000002';
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
update public.invoices set notes='تعديل لاحق',created_by_name='اسم مزور'
 where id in(current_setting('test.creator.invoice')::uuid,current_setting('test.creator.legacy')::uuid);
update public.receipts set notes='تعديل لاحق',created_by_name='اسم مزور'
 where id=current_setting('test.creator.receipt')::uuid or invoice_id=current_setting('test.creator.invoice')::uuid;
update public.warehouse_transfers set notes='تعديل لاحق',created_by_name='اسم مزور'
 where id=current_setting('test.creator.warehouse')::uuid;
update public.cash_box_transfers set notes='تعديل لاحق',created_by_name='اسم مزور'
 where id=current_setting('test.creator.cash')::uuid;
set local role authenticated;
select public.test_boundary_expect((select created_by_name is null from public.v_invoice_list
 where id=current_setting('test.creator.legacy')::uuid),'editing legacy document does not invent a creator');
do $$
declare v_case record;
begin
 for v_case in select * from (values
  ('v_invoice_list','test.creator.invoice'),('v_receipt_list','test.creator.receipt'),
  ('v_warehouse_transfer_list','test.creator.warehouse'),('v_cash_box_transfer_list','test.creator.cash')
 ) as cases(view_name,setting_name) loop
  execute format('select public.test_boundary_expect((select created_by_name=''منشئ المستند'' from public.%I
   where id=current_setting(%L)::uuid),''creator stays immutable after another user edits'')',v_case.view_name,v_case.setting_name);
 end loop;
end $$;

-- Another permitted reader can see the author on a document without gaining
-- permission to enumerate profiles or raw protected accounting costs.
select set_config('test.creator.owner_sale',public.create_invoice('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,0,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',200)))::text,true);
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.test_boundary_expect((select created_by_name='مدير المستندات' and cost_total is null and profit_total is null
 from public.v_invoice_list where id=current_setting('test.creator.owner_sale')::uuid),'employee sees creator while costs stay masked');
select public.test_boundary_expect(not exists(select 1 from public.profiles
 where id='55555555-5555-4555-8555-000000000001'),'profile list permission is not widened');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $$
declare v_view text; v_count bigint;
begin
 foreach v_view in array array['v_invoice_list','v_receipt_list','v_warehouse_transfer_list','v_cash_box_transfer_list'] loop
  execute format('select count(*) from public.%I where company_id=%L',v_view,'55555555-5555-4555-8555-0000000000a1') into v_count;
  if v_count<>0 then raise exception 'Company B read company A creator metadata: %',v_view; end if;
 end loop;
end $$;
select public.test_boundary_denied('update public.invoices set created_by_name=''غير مسموح''');
set local role anon;
select public.test_boundary_denied('select public.stamp_document_creator()');
select public.test_boundary_denied('select created_by_name from public.v_invoice_list');
select public.test_boundary_denied('select created_by_name from public.v_receipt_list');
select public.test_boundary_denied('select created_by_name from public.v_warehouse_transfer_list');
select public.test_boundary_denied('select created_by_name from public.v_cash_box_transfer_list');

reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
do $$ begin
 begin
  insert into public.invoices(company_id,kind,number,account_id,warehouse_id,total,paid,created_by_name)
  values('55555555-5555-4555-8555-0000000000b1','sale','FORBIDDEN-CREATOR',
   '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',0,0,'اسم مزور');
  raise exception 'Creator trigger accepted another company';
 exception when insufficient_privilege then null; end;
end $$;
select public.test_boundary_expect((select prosecdef and proconfig @> array['search_path=public']
 from pg_proc where oid='public.stamp_document_creator()'::regprocedure),'trigger function is hardened');
select public.test_boundary_expect(not has_function_privilege('authenticated','public.stamp_document_creator()','execute')
 and not has_function_privilege('anon','public.stamp_document_creator()','execute'),'trigger cannot be invoked by clients');
rollback;

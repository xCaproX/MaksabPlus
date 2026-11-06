-- @fixture document_boundaries
update public.profiles set full_name='منشئ, (تجريبي) 50%_' where id='55555555-5555-4555-8555-000000000001';
update public.accounts set phone='01012345678',notes='عميل الاختبار' where id='55555555-5555-4555-8555-000000000030';
do $test$
begin
 for n in 1..25 loop
  perform public.create_invoice_with_cash_box('sale',
   '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,
   case when n%2=0 then 2.5 else 0 end,'بحث, (حرفي) 50%_',
   jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',0.1,'unit_price',100)),
   '55555555-5555-4555-8555-000000000020');
 end loop;
end $test$;
update public.invoices set created_at='2026-11-05T10:21:35Z' where kind='sale';
select public.create_warehouse_transfer('55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',
 current_date,'اختبار',jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)));
select public.create_cash_box_transfer('55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,2.5,'اختبار');

select public.run_comprehensive_reconciliation('simulation','فحص, (حرفي) 50%_');

select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.sale.view','money.in.view','goods.warehouse_transfer.view','money.cash_box_transfer.view',
 'data.customers.view','data.items.view','balances.customers.view','balances.items.view']);
set local role authenticated;
do $test$
declare n int; k jsonb; f jsonb; x record;
begin
 f:='{"total":"10.0000","account":"010123","account_kind":"customer","warehouse_id":"55555555-5555-4555-8555-000000000010",
 "created_time":"12:21","notes":", (حرفي) 50%_","created_by_name":"منشئ, (تجريبي) 50%_"}';
 select count(*) into n from public.filter_invoice_rows(f,'50%_','sale');
 if n<>25 then raise exception 'AND / phone / literal / Cairo minute failed: %',n; end if;
 k:=public.get_invoice_kpis_columns(f,'sale','50%_');
 if (k->>'count')::int<>25 or (k->>'total_amount')::numeric<>250 or (k->>'paid_amount')::numeric<>30 or (k->>'remaining_amount')::numeric<>220 then
  raise exception 'Full-dataset aggregate mismatch: %',k;
 end if;
 select count(*) into n from (select * from public.filter_invoice_rows(f,'50%_','sale') limit 20) page;
 if n<>20 then raise exception 'Pagination setup failed'; end if;
 select count(*) into n from public.filter_invoice_rows('{"paid":"0","payment_status":"unpaid"}',null,'sale');
 if n<>13 then raise exception 'Zero equality failed'; end if;
 select count(*) into n from public.filter_invoice_rows('{"paid":"2.5","payment_status":"partial"}',null,'sale');
 if n<>12 then raise exception 'Decimal/status equality failed'; end if;
 select count(*) into n from public.filter_invoice_rows('{"total":"10.01"}',null,'sale');
 if n<>0 then raise exception 'Numeric search used partial/rounded match'; end if;
 select count(*) into n from public.filter_invoice_rows(jsonb_build_object('invoice_date',current_date::text),null,'sale');
 if n<>25 then raise exception 'Exact date failed'; end if;
 select count(*) into n from public.filter_invoice_rows('{"created_time":"12:22"}',null,'sale');
 if n<>0 then raise exception 'Time filtering failed'; end if;
 select count(*) into n from public.filter_invoice_rows(f,'no such search','sale');
 if n<>0 then raise exception 'Global search did not combine with columns'; end if;
 if (public.get_invoice_kpis_columns(f,'sale',null,'paid')->>'count')::int<>0 then raise exception 'Upper status bypassed'; end if;
 if (public.get_invoice_kpis_columns(f,'sale',null,'all',(current_date-2)::text,(current_date-1)::text)->>'count')::int<>0 then raise exception 'Upper date bypassed'; end if;
 select * into x from public.filter_invoice_rows('{}',null,'sale') limit 1;
 select count(*) into n from public.filter_invoice_rows(jsonb_build_object('number',x.number),null,'sale');
 if n<>1 then raise exception 'Invoice text number match failed'; end if;
 if public.get_invoice_kpis_columns('{}','sale')<>public.get_invoice_kpis('sale') then raise exception 'Legacy aggregate compatibility'; end if;

 select count(*) into n from public.filter_receipt_rows('{"amount":"2.5","account":"010123","receipt_type":"linked"}',null,'in');
 if n<>12 or (public.get_receipt_kpis_columns('{"amount":"2.5"}','in')->>'count')::int<>12 then raise exception 'Receipt parity'; end if;
 select count(*) into n from public.filter_warehouse_transfer_rows('{"source_warehouse_id":"55555555-5555-4555-8555-000000000010","destination_warehouse_id":"55555555-5555-4555-8555-000000000011","total_qty":"1"}');
 if n<>1 or (public.get_warehouse_transfer_kpis_columns('{"total_qty":"1"}')->>'count')::int<>1 then raise exception 'Stock transfer parity'; end if;
 select count(*) into n from public.filter_cash_transfer_rows('{"source_cash_box_id":"55555555-5555-4555-8555-000000000020","amount":"2.5"}');
 if n<>1 or (public.get_cash_box_transfer_kpis_columns('{"amount":"2.5"}')->>'count')::int<>1 then raise exception 'Cash transfer parity'; end if;
 select count(*) into n from public.filter_master_account_rows('{"phone":"010123"}',null,'customer');
 if n<>1 or (public.get_master_accounts_kpis_columns('{"phone":"010123"}','customer')->>'total_count')::int<>1 then raise exception 'Master accounts parity'; end if;
 select count(*) into n from public.filter_master_item_rows('{"sale_price":"200","unit":"piece"}');
 if n<>1 or (public.get_master_items_kpis_columns('{"sale_price":"200"}')->>'total_count')::int<>1 then raise exception 'Master items parity'; end if;
 select count(*) into n from public.filter_account_balance_rows('{"phone":"010123"}',null,'customer');
 if n<>1 or (public.get_account_balances_kpis_columns('{"phone":"010123"}','customer')->>'count')::int<>1 then raise exception 'Account balances parity'; end if;
 select count(*) into n from public.filter_warehouse_item_rows('{"item_name":"Boundary"}');
 if n=0 or (public.get_warehouse_stock_kpis_columns('{"item_name":"Boundary"}')->>'count')::int<>n then raise exception 'Stock balances parity'; end if;
 select count(*) into n from public.filter_reconciliation_rows('{"mode":"simulation","notes":"50%_"}');
 if n<>1 or (public.get_reconciliation_log_kpis_columns('{"mode":"simulation","notes":"50%_"}')->>'count')::int<>1 then raise exception 'Reconciliation parity'; end if;
 if (public.get_reconciliation_log_kpis_columns('{"mode":"simulation"}',null,'reconcile')->>'count')::int<>0 then raise exception 'Reconciliation upper filter conjunction'; end if;
 select count(*) into n from public.list_creator_filter_options('invoice','sale','50%_');
 if n<>1 then raise exception 'Creator option literal query'; end if;
end $test$;

-- Bad keys and malformed values are rejected rather than broadening the query.
do $test$
begin
 begin
  perform public.filter_invoice_rows('{"total":"not-a-number"}');
  raise exception 'Malformed number accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.filter_invoice_rows('{"created_time":"25:10"}');
  raise exception 'Malformed time accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.filter_invoice_rows('{"profit_total":"0"}');
  raise exception 'Unknown or protected field accepted';
 exception when invalid_parameter_value then null; end;
end $test$;

-- Permission checks, protected-cost masks and filter inference protection.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.test_boundary_expect(not exists(select 1 from public.filter_invoice_rows('{}',null,'sale') where cost_total is not null or profit_total is not null),'employee cost mask');
select public.test_boundary_expect(not exists(select 1 from public.filter_warehouse_transfer_rows('{}') where total_value is not null),'employee transfer cost mask');
select public.test_boundary_expect(not exists(select 1 from public.filter_warehouse_item_rows('{}') where unit_cost is not null),'employee stock cost mask');
select public.test_boundary_denied('select * from public.filter_warehouse_transfer_rows(''{"total_value":"120"}'')');
select public.test_boundary_denied('select * from public.filter_invoice_rows(''{}'',null,''purchase'')');
select public.test_boundary_denied('select * from public.filter_receipt_rows(''{}'',null,''out'')');
select public.test_boundary_denied('select * from public.filter_master_account_rows(''{}'',null,''supplier'')');
select public.test_boundary_denied('select * from public.filter_account_balance_rows(''{}'',null,''supplier'')');
select public.test_boundary_denied('select * from public.filter_reconciliation_rows(''{}'')');
select public.test_boundary_denied('select public.get_reconciliation_log_kpis_columns(''{}'')');
select public.test_boundary_denied('select * from public.list_creator_filter_options(''invoice'',''purchase'')');
select public.test_boundary_denied('select public.matches_list_columns(''invoice'',''{}'',''{}'')');
select public.test_boundary_denied('select public.list_column_schema(''invoice'')');
select public.test_boundary_denied('select public.list_column_value(''{}'',''{}'')');
select public.test_boundary_denied('select public.validate_list_columns(''invoice'',''{}'')');
select public.test_boundary_denied('select public.matches_list_search(''invoice'',''{}'',null)');
select public.test_boundary_denied('select public.get_warehouse_transfer_kpis_columns(''{"total_value":"120"}'')');

-- A second tenant cannot read or infer tenant A via rows, totals or options.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $test$
declare rpc text; n int;
begin
 foreach rpc in array array['invoice','receipt','warehouse_transfer','cash_transfer','master_account','master_item','account_balance','warehouse_item','reconciliation'] loop
  execute format('select count(*) from public.%I(''{}'')','filter_'||rpc||'_rows') into n;
  if n<>0 then raise exception 'Tenant leak: %',rpc; end if;
 end loop;
 if (public.get_invoice_kpis_columns('{"notes":"50%_"}','sale')->>'count')::int<>0 then raise exception 'Tenant KPI leak'; end if;

 if (public.get_receipt_kpis_columns('{}','in')->>'count')::int<>0
  or (public.get_warehouse_transfer_kpis_columns('{}')->>'count')::int<>0
  or (public.get_cash_box_transfer_kpis_columns('{}')->>'count')::int<>0
  or (public.get_master_accounts_kpis_columns('{}','customer')->>'total_count')::int<>0
  or (public.get_master_items_kpis_columns('{}')->>'total_count')::int<>0
  or (public.get_account_balances_kpis_columns('{}','customer')->>'count')::int<>0
  or (public.get_warehouse_stock_kpis_columns('{}')->>'count')::int<>0
  or (public.get_reconciliation_log_kpis_columns('{}')->>'count')::int<>0 then raise exception 'Cross-company summary leak'; end if;
 select count(*) into n from public.list_creator_filter_options('invoice','sale','منشئ');
 if n<>0 then raise exception 'Creator tenant leak'; end if;
end $test$;
set local role anon;
do $test$
declare p record;
begin
 for p in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'filter_%_rows' or proname like '%_kpis_columns' or proname='list_creator_filter_options'
 or proname in ('list_column_schema','list_column_value','validate_list_columns','matches_list_columns','matches_list_search')) loop
  if has_function_privilege('anon',p.signature,'execute') then raise exception 'Anon can call %',p.signature; end if;
 end loop;
end $test$;
select public.test_boundary_denied('select * from public.filter_invoice_rows(''{}'')');
reset role;
-- Validate all new definer entry points have explicit search_path and all helpers
-- remain unavailable to authenticated clients.
do $test$
declare p record;
begin
 for p in select oid::regprocedure signature,prosecdef,proconfig,proname from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'filter_%_rows' or proname like '%_kpis_columns' or proname='list_creator_filter_options') loop
  if not p.prosecdef or not p.proconfig @> array['search_path=public'] then raise exception 'Definer boundary missing: %',p.signature; end if;
 end loop;
end $test$;
rollback;

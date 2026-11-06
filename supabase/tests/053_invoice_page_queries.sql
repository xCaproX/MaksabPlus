-- @fixture document_boundaries
update public.profiles set full_name='منشئ, (تجريبي) 50%_' where id='55555555-5555-4555-8555-000000000001';
update public.accounts set phone='01012345678' where id='55555555-5555-4555-8555-000000000030';
select set_config('test.invoice.second_account',public.save_account_with_notes(
 null,'عميل آخر','customer','01999999999',true,0,null)::text,true);
do $seed$
declare n int; q numeric; price numeric; paid numeric;
begin
 for n in 1..40 loop
  if n=21 then update public.profiles set full_name='مستخدم آخر' where id=auth.uid(); end if;
  q:=case when n%7=0 then 0.2 else 0.1 end; price:=100+(n%3)*10;
  paid:=case when n%6=0 then round(q*price,2) when n%2=0 then 2.5 else 0 end;
  perform public.create_invoice_with_cash_box('sale',
   case when n%5=0 then current_setting('test.invoice.second_account')::uuid else '55555555-5555-4555-8555-000000000030'::uuid end,
   '55555555-5555-4555-8555-000000000010',case when n<=25 then current_date else current_date-30 end,
   paid,'بحث, (حرفي) 50%_',jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',q,'unit_price',price)),
   '55555555-5555-4555-8555-000000000020');
 end loop;
end $seed$;
select public.create_invoice('sale_return','55555555-5555-4555-8555-000000000030',
 '55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',0.1,'unit_price',100)));
select public.create_invoice('purchase_return','55555555-5555-4555-8555-000000000030',
 '55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',0.1,'unit_price',100)));
select public.create_invoice('waste',(select id from public.accounts where company_id=public.current_company_id() and system_key='waste'),
 '55555555-5555-4555-8555-000000000010',current_date,0,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',0.1,'unit_price',0)));
update public.invoices set created_at='2026-11-05T10:21:35Z' where kind='sale';

-- The reference deliberately uses the original generic schema comparators,
-- not filter_invoice_rows (which now shares the compiled predicate).
do $test$
declare
 f jsonb; term text; expected jsonb; actual jsonb; sample record;
 sort text; field text; direction text; ordering text; all_rows jsonb:='[]'; v_kind text;
 offset_rows int; v_from date; v_to date;
begin
 foreach v_kind in array array['sale','purchase','sale_return','purchase_return','waste'] loop
  select coalesce(jsonb_agg(to_jsonb(v) order by v.number),'[]'::jsonb) into expected
   from public.v_invoice_list v where v.company_id=public.current_company_id() and v.kind=v_kind and v.deleted_at is null;
  actual:=public.get_invoice_page('{}',v_kind,null,null,null,false,'number-asc',0,500);
  if actual->'rows'<>expected or (actual->>'total_count')::int<>jsonb_array_length(expected) then
   raise exception 'Sibling invoice kind page mismatch: %',v_kind;
  end if;
 end loop;
 select * into sample from public.v_invoice_list where company_id=public.current_company_id() and kind='sale' order by number limit 1;
 for f in select value from jsonb_array_elements(jsonb_build_array(
  '{}'::jsonb, jsonb_build_object('number',sample.number),
  jsonb_build_object('invoice_date',current_date::text),jsonb_build_object('created_time','12:21'),
  jsonb_build_object('created_time','12:22'),jsonb_build_object('warehouse_id',sample.warehouse_id),
  jsonb_build_object('warehouse_id','not-a-uuid'),jsonb_build_object('account_kind','customer'),
  jsonb_build_object('account_kind','missing'),jsonb_build_object('account','010123'),
  jsonb_build_object('account','عميل آخر'),jsonb_build_object('total',sample.total),
  jsonb_build_object('paid','0'),jsonb_build_object('remaining','7.5'),
  jsonb_build_object('payment_status','paid'),jsonb_build_object('payment_status','partial'),
  jsonb_build_object('payment_status','unpaid'),jsonb_build_object('notes',', (حرفي) 50%_'),
  jsonb_build_object('created_by_name','منشئ, (تجريبي) 50%_'),jsonb_build_object('created_by_name','غير مسجل'),
  jsonb_build_object('notes',null,'paid',''),
  jsonb_build_object('warehouse_id',sample.warehouse_id,'account','010123','payment_status','unpaid')
 )) loop
  foreach term in array array[null,'50%_','010123','غير مسجل',''' ) or true --','no match'] loop
   select coalesce(jsonb_agg(to_jsonb(v) order by v.number),'[]'::jsonb) into expected
   from public.v_invoice_list v where v.company_id=public.current_company_id() and v.kind='sale' and v.deleted_at is null
    and public.matches_list_columns('invoice',to_jsonb(v),f) and public.matches_list_search('invoice',to_jsonb(v),term);
   actual:=public.get_invoice_page(f,'sale',term,null,null,false,'number-asc',0,500);
   if actual->'rows'<>expected or (actual->>'total_count')::int<>jsonb_array_length(expected) then
    raise exception 'Page/reference filter mismatch for % / %',f,term;
   end if;
  end loop;
 end loop;

 foreach sort in array array['date-asc','date-desc','number-asc','number-desc','account-asc','account-desc',
   'total-asc','total-desc','remaining-asc','remaining-desc','unsupported-asc'] loop
  field:=split_part(sort,'-',1);
  direction:=case when field in ('date','number','account','total','remaining') and split_part(sort,'-',2)='asc' then ' asc' else ' desc' end;
  ordering:=case field when 'number' then 'v.number' when 'account' then 'v.account_name'
   when 'total' then 'v.total' when 'remaining' then 'v.remaining' else 'v.invoice_date' end||direction;
  if field<>'number' then ordering:=ordering||',v.number'||direction; end if;
  execute 'select jsonb_agg(to_jsonb(v) order by '||ordering||') from public.v_invoice_list v
   where v.company_id=public.current_company_id() and v.kind=''sale'' and v.deleted_at is null'
   into expected;
  actual:=public.get_invoice_page('{}','sale',null,null,null,false,sort,7,9);
  select jsonb_agg(value order by n) into expected from jsonb_array_elements(expected) with ordinality x(value,n) where n>7 and n<=16;
  if actual->'rows'<>expected or (actual->>'total_count')::int<>40 then raise exception 'Sort/offset mismatch: %',sort; end if;
 end loop;

 for offset_rows in 0..5 loop
  actual:=public.get_invoice_page('{}','sale',null,null,null,false,'number-asc',offset_rows*7,7);
  if (actual->>'total_count')::int<>40 then raise exception 'Count was reduced to the page length'; end if;
  all_rows:=all_rows||(actual->'rows');
 end loop;
 select jsonb_agg(to_jsonb(v) order by v.number) into expected from public.v_invoice_list v
  where v.company_id=public.current_company_id() and v.kind='sale' and v.deleted_at is null;
 if all_rows<>expected then raise exception 'Complete paginated export lost, repeated or reordered invoices'; end if;
 actual:=public.get_invoice_page('{}','sale',null,null,null,false,'number-asc',500,20);
 if actual->'rows'<>'[]'::jsonb or (actual->>'total_count')::int<>40 then raise exception 'Empty later page lost full count'; end if;

 actual:=public.get_invoice_page('{}','sale',null,current_date,current_date);
 if (actual->>'total_count')::int<>25 or jsonb_array_length(actual->'rows')<>20 then raise exception 'Inclusive period/page mismatch'; end if;
 actual:=public.get_invoice_page('{}','sale',null,current_date+1,current_date-1);
 if (actual->>'total_count')::int<>0 or actual->'rows'<>'[]'::jsonb then raise exception 'Inverted period should match no rows'; end if;

 -- Soft-deleted records must be selected before counting/paging as well.
 update public.invoices set deleted_at=now() where id=sample.id;
 actual:=public.get_invoice_page('{}','sale');
 if (actual->>'total_count')::int<>39 then raise exception 'Deleted invoice included'; end if;
 actual:=public.get_invoice_page('{}','sale',null,null,null,true);
 if (actual->>'total_count')::int<>1 or actual->'rows'->0->>'id'<>sample.id::text then raise exception 'Deleted-only page mismatch'; end if;
end $test$;

select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array['goods.sale.view']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
do $test$
declare page jsonb;
begin
 page:=public.get_invoice_page('{}','sale');
 if jsonb_array_length(page->'rows')<>20 or exists(
  select 1 from jsonb_array_elements(page->'rows') r where r->>'cost_total' is not null or r->>'profit_total' is not null
 ) then raise exception 'Employee page or protected cost mask failed'; end if;
end $test$;
select public.test_boundary_denied('select public.get_invoice_page(''{}'',''purchase'')');
select public.test_boundary_denied('select public.invoice_list_predicate(''{}'',null)');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $test$
declare page jsonb;
begin
 page:=public.get_invoice_page('{}','sale');
 if (page->>'total_count')::int<>0 or page->'rows'<>'[]'::jsonb then raise exception 'Company B read company A page/count'; end if;
end $test$;
set local role anon;
select public.test_boundary_denied('select public.get_invoice_page(''{}'')');
select public.test_boundary_denied('select public.invoice_list_predicate(''{}'',null)');
reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);

do $test$
declare bad jsonb; lim int;
begin
 foreach bad in array array['{"profit_total":"0"}'::jsonb,'{"total":"bad"}'::jsonb,
  '{"created_time":"25:10"}'::jsonb,'{"unknown":"x"}'::jsonb,'{"notes":{"x":1}}'::jsonb] loop
  begin perform public.get_invoice_page(bad); raise exception 'Invalid filter accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 foreach lim in array array[0,-1,501] loop
  begin perform public.get_invoice_page(p_limit=>lim); raise exception 'Invalid page limit accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 begin perform public.get_invoice_page(p_offset=>-1); raise exception 'Negative offset accepted';
 exception when invalid_parameter_value then null; end;
 if not exists(select 1 from pg_proc where oid='public.get_invoice_page(jsonb,text,text,date,date,boolean,text,integer,integer)'::regprocedure
  and prosecdef and proconfig @> array['search_path=public']) then raise exception 'Page definer search_path missing'; end if;
end $test$;

-- Fail if either counting or ID selection evaluates protected cost for an
-- invoice outside the selected page. The replacement exists only in this
-- rolled-back test transaction; the production cost reader is never changed.
create table public.test_invoice_page_cost_ids(id uuid primary key);
insert into public.test_invoice_page_cost_ids select id from public.v_invoice_list
 where company_id=public.current_company_id() and kind='sale' and deleted_at is null order by number limit 2;
do $test$
declare definition text; instrumented text; page jsonb;
begin
 definition:=pg_get_functiondef('public.read_protected_cost(text,uuid,uuid)'::regprocedure);
 instrumented:=replace(definition,E'begin\n',E'begin\n if p_source in (''invoice_cost'',''invoice_profit'') and not exists(select 1 from public.test_invoice_page_cost_ids where id=p_row_id) then raise exception ''cost_evaluated_before_pagination''; end if;\n');
 if instrumented=definition then raise exception 'Could not install cost evaluation probe'; end if;
 execute instrumented;
 begin
  perform 1 from public.filter_invoice_rows('{}',null,'sale') limit 2;
  raise exception 'Legacy outer LIMIT did not reproduce early cost evaluation';
 exception when others then
  if sqlerrm<>'cost_evaluated_before_pagination' then raise; end if;
 end;
 page:=public.get_invoice_page('{}','sale',null,null,null,false,'number-asc',0,2);
 if jsonb_array_length(page->'rows')<>2 or (page->>'total_count')::int<>39 then raise exception 'Cost probe page/count mismatch'; end if;
 execute definition;
end $test$;
select 'PASS 053_invoice_page_queries (filter parity, ordering, export, late costs, permissions, tenant and anon)' as result;
rollback;

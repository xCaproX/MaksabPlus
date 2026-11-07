-- @fixture document_boundaries
select public.create_free_receipt('55555555-5555-4555-8555-000000000030',
 '55555555-5555-4555-8555-000000000020', current_date, 50, 'literal 50%_', 'deposit', 'in');
select public.create_free_receipt('55555555-5555-4555-8555-000000000030',
 '55555555-5555-4555-8555-000000000020', current_date, 7, 'literal 50%_', 'payment', 'out');
select public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,2.5,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',0.1,'unit_price',100)),
 '55555555-5555-4555-8555-000000000020');
select public.create_warehouse_transfer('55555555-5555-4555-8555-000000000010',
 '55555555-5555-4555-8555-000000000011', current_date, 'literal 50%_',
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)));
select public.create_cash_box_transfer('55555555-5555-4555-8555-000000000020',
 '55555555-5555-4555-8555-000000000021', current_date, 2.5, 'literal 50%_');

do $test$
declare
  c record; expected jsonb; actual jsonb; all_rows jsonb; n integer;
begin
  for c in select * from (values
    ('receipt','in','filter_receipt_rows','receipt_date','amount-asc','amount asc, number asc','{}'::jsonb,null::text),
    ('receipt','in','filter_receipt_rows','receipt_date','date-desc','receipt_date desc, number desc','{"receipt_type":"linked"}',null),
    ('receipt','in','filter_receipt_rows','receipt_date','date-desc','receipt_date desc, number desc','{"receipt_type":"free"}','50%_'),
    ('receipt','out','filter_receipt_rows','receipt_date','account-asc','account_name asc, number asc','{"statement":"payment"}',null),
    ('warehouse_transfer','','filter_warehouse_transfer_rows','transfer_date','total-asc','total_value asc, number asc','{"line_count":"1","total_qty":"1"}',null),
    ('warehouse_transfer','','filter_warehouse_transfer_rows','transfer_date','account-asc','transfer_date desc, number desc','{"source_warehouse_id":"55555555-5555-4555-8555-000000000010"}',null),
    ('cash_transfer','','filter_cash_transfer_rows','transfer_date','amount-desc','amount desc, number desc','{"destination_cash_box_id":"55555555-5555-4555-8555-000000000021"}','50%_')
  ) as cases(scope,kind,rpc,date_column,sort,ordering,filters,term)
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(v) order by %s), ''[]'') from public.%I($1,$2%s) v
      where v.deleted_at is null and v.%I = current_date',
      c.ordering,c.rpc,case when c.scope='receipt' then ',$3' else '' end,c.date_column)
      into expected using c.filters,c.term,c.kind;
    n := jsonb_array_length(expected);
    if n=0 then raise exception 'Empty reference for % %',c.scope,c.filters; end if;
    all_rows := '[]';
    for i in 0..n loop
      actual := public.get_document_page(c.scope,c.filters,c.kind,c.term,current_date,current_date,false,c.sort,i,1);
      if (actual->>'total_count')::integer<>n or jsonb_array_length(actual->'rows')<>(case when i<n then 1 else 0 end) then
        raise exception 'Page count/range mismatch for %',c.scope;
      end if;
      all_rows := all_rows || (actual->'rows');
    end loop;
    if all_rows<>expected then raise exception 'Legacy result/order mismatch for %',c.scope; end if;
  end loop;

  update public.cash_box_transfers set deleted_at=now() where company_id=public.current_company_id();
  actual := public.get_document_page('cash_transfer',p_show_deleted=>true);
  if (actual->>'total_count')::integer<>1
    or (public.get_document_page('cash_transfer')->>'total_count')::integer<>0 then
    raise exception 'Deleted page mismatch';
  end if;
end $test$;

select public.set_user_permissions('55555555-5555-4555-8555-000000000002',
 array['money.in.view','goods.warehouse_transfer.view']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
do $test$
declare result jsonb;
begin
  result := public.get_document_page('warehouse_transfer',p_sort_order=>'total-asc');
  if (result->>'total_count')::integer<>1 or result->'rows'->0->>'total_value' is not null then
    raise exception 'Transfer cost mask failed';
  end if;
end $test$;
select public.test_boundary_denied('select public.get_document_page(''warehouse_transfer'',''{"total_value":"120"}'')');
select public.test_boundary_denied('select public.get_document_page(''receipt'',p_kind=>''out'')');
select public.test_boundary_denied('select public.get_document_page(''cash_transfer'')');
select public.test_boundary_denied('select public.document_list_predicate(''receipt'',''{}'')');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $test$
declare scope text; result jsonb;
begin
  foreach scope in array array['receipt','warehouse_transfer','cash_transfer'] loop
    result := public.get_document_page(scope,p_kind=>'in',p_show_deleted=>(scope='cash_transfer'));
    if result <> '{"rows":[],"total_count":0}'::jsonb then raise exception 'Foreign documents in %',scope; end if;
  end loop;
end $test$;
set local role anon;
select public.test_boundary_denied('select public.get_document_page(''receipt'',p_kind=>''in'')');
select public.test_boundary_denied('select public.get_document_page(''warehouse_transfer'')');
select public.test_boundary_denied('select public.get_document_page(''cash_transfer'')');
select public.test_boundary_denied('select public.document_list_predicate(''receipt'',''{}'')');
rollback;

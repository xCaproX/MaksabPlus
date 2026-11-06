-- @fixture document_boundaries
update public.profiles set full_name='منشئ, (تجريبي) 50%_'
 where id='55555555-5555-4555-8555-000000000001';
select public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,10,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1,'unit_price',200)),
 '55555555-5555-4555-8555-000000000020');
select public.create_warehouse_transfer('55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',
 current_date,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)));
select public.create_cash_box_transfer('55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,2,null);

-- Another author ensures that % and _ cannot widen the search to all documents.
update public.profiles set full_name='مستخدم آخر' where id='55555555-5555-4555-8555-000000000001';
select public.create_invoice_with_cash_box('sale',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',current_date,20,null,
 jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1,'unit_price',300)),
 '55555555-5555-4555-8555-000000000020');
select public.create_warehouse_transfer('55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-000000000011',
 current_date,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),'qty',1)));
select public.create_cash_box_transfer('55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-000000000021',current_date,3,null);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002',array[
 'goods.sale.view','money.in.view','goods.warehouse_transfer.view','money.cash_box_transfer.view']);
set local role authenticated;
do $$
declare term text; summary jsonb; v_view text; actual_count bigint;
begin
 foreach term in array array['منشئ','منشئ, (تجريبي) 50%_','50%_','%','_'] loop
  foreach v_view in array array['v_invoice_list','v_receipt_list','v_warehouse_transfer_list','v_cash_box_transfer_list'] loop
   execute format('select count(*) from public.%I where strpos(created_by_name,$1)>0',v_view) into actual_count using term;
   if actual_count<>1 then raise exception 'Expected one creator match in %',v_view; end if;
  end loop;
  summary := public.get_invoice_kpis('sale',term);
  if (summary->>'count')::int<>1 or (summary->>'total_amount')::numeric<>200
   or (summary->>'paid_amount')::numeric<>10 or (summary->>'remaining_amount')::numeric<>190 then
   raise exception 'Invoice creator search mismatch: %',summary;
  end if;
  summary := public.get_receipt_kpis('in',null,term);
  if (summary->>'count')::int<>1 or (summary->>'total_amount')::numeric<>10 then raise exception 'Receipt creator search mismatch'; end if;
  summary := public.get_warehouse_transfer_kpis(term);
  if (summary->>'count')::int<>1 or (summary->>'total_qty')::numeric<>1 then raise exception 'Warehouse creator search mismatch'; end if;
  summary := public.get_cash_box_transfer_kpis(null,term);
  if (summary->>'count')::int<>1 or (summary->>'total_amount')::numeric<>2 then raise exception 'Cash creator search mismatch'; end if;
 end loop;
 if (public.get_invoice_kpis('sale','منشئ','all',(current_date-2)::text,(current_date-1)::text)->>'count')::int<>0 then
  raise exception 'Creator search bypassed date filtering';
 end if;
end $$;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.test_boundary_expect(public.get_invoice_kpis('sale','منشئ')->>'profit_total' is null,'creator search does not expose profit');
select public.test_boundary_expect(public.get_warehouse_transfer_kpis('منشئ')->>'total_value' is null,'creator search does not expose cost');
select public.test_boundary_denied('select public.get_invoice_kpis(''purchase'',''منشئ'')');
select public.test_boundary_denied('select public.get_receipt_kpis(''out'',null,''منشئ'')');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
select public.test_boundary_expect((public.get_invoice_kpis('sale','منشئ')->>'count')::int=0,'company B invoice search isolated');
select public.test_boundary_expect((public.get_receipt_kpis('in',null,'منشئ')->>'count')::int=0,'company B receipt search isolated');
select public.test_boundary_expect((public.get_warehouse_transfer_kpis('منشئ')->>'count')::int=0,'company B stock transfer search isolated');
select public.test_boundary_expect((public.get_cash_box_transfer_kpis(null,'منشئ')->>'count')::int=0,'company B cash transfer search isolated');
set local role anon;
select public.test_boundary_denied('select public.get_invoice_kpis(''sale'',''منشئ'')');
select public.test_boundary_denied('select public.get_receipt_kpis(''in'',null,''منشئ'')');
select public.test_boundary_denied('select public.get_warehouse_transfer_kpis(''منشئ'')');
select public.test_boundary_denied('select public.get_cash_box_transfer_kpis(null,''منشئ'')');
rollback;

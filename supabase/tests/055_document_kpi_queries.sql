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
  result jsonb;
  expected jsonb;
  filters jsonb := '{"payment_status":"partial"}';
  from_date text := current_date::text;
begin
  select jsonb_build_object('total_amount',sum((r->>'total')::numeric),
    'paid_amount',sum((r->>'paid')::numeric), 'remaining_amount',sum((r->>'remaining')::numeric),
    'profit_total',sum((r->>'profit_total')::numeric),'count',count(*))
  into expected from jsonb_array_elements(
    public.get_document_page('invoice',filters,'sale',p_date_from=>current_date,p_date_to=>current_date)->'rows') r;
  result := public.get_invoice_kpis_columns(filters,'sale',p_status=>'partial',p_date_from=>from_date,p_date_to=>from_date);
  if (expected->>'count')::int<>1 or result<>expected then
    raise exception 'Invoice KPI mismatch: % vs %', result,expected;
  end if;
  if (public.get_invoice_kpis_columns(filters,'sale',p_status=>'paid')->>'count')::int<>0
    or (public.get_invoice_kpis_columns(filters,'sale',p_date_to=>(current_date-1)::text)->>'count')::int<>0 then
    raise exception 'Invoice status or date bound was bypassed';
  end if;

  result := public.get_receipt_kpis_columns('{}','in',p_cash_box_id=>'55555555-5555-4555-8555-000000000020');
  if result<>'{"total_amount":52.5,"invoice_linked":2.5,"count":2}'::jsonb then
    raise exception 'Receipt totals mismatch: %', result;
  end if;
  result := public.get_receipt_kpis_columns('{"receipt_type":"free"}','out',p_search=>'50%_');
  if result<>'{"total_amount":7,"invoice_linked":0,"count":1}'::jsonb then
    raise exception 'Receipt filter or literal search mismatch: %', result;
  end if;

  result := public.get_warehouse_transfer_kpis_columns('{"total_qty":"1"}',p_search=>'Warehouse A2');
  select jsonb_build_object('total_value',sum((r->>'total_value')::numeric),
    'total_qty',sum((r->>'total_qty')::numeric),'count',count(*))
  into expected from jsonb_array_elements(
    public.get_document_page('warehouse_transfer','{"total_qty":"1"}',p_search=>'Warehouse A2')->'rows') r;
  if (expected->>'count')::int<>1 or result<>expected then
    raise exception 'Warehouse transfer KPI mismatch: % vs %',result,expected;
  end if;

  result := public.get_cash_box_transfer_kpis_columns('{}',p_search=>'Cash A2',
    p_cash_box_id=>'55555555-5555-4555-8555-000000000021');
  if result<>'{"total_amount":2.5,"count":1}'::jsonb then
    raise exception 'Cash transfer destination name or cash box filter mismatch: %',result;
  end if;
  update public.cash_box_transfers set deleted_at=now() where company_id=public.current_company_id();
  if (public.get_cash_box_transfer_kpis_columns('{}')->>'count')::int<>0
    or (public.get_cash_box_transfer_kpis_columns('{}',p_show_deleted=>true)->>'count')::int<>1 then
    raise exception 'Cash transfer deletion filter mismatch';
  end if;
end $test$;

select public.set_user_permissions('55555555-5555-4555-8555-000000000002',
 array['goods.sale.view','goods.warehouse_transfer.view','money.in.view']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
do $test$
begin
  if public.get_invoice_kpis_columns('{}','sale') <> '{"total_amount":10,"paid_amount":2.5,"remaining_amount":7.5,"profit_total":null,"count":1}'::jsonb
    or public.get_warehouse_transfer_kpis_columns('{}') <> '{"total_value":null,"total_qty":1,"count":1}'::jsonb then
    raise exception 'Employee summary mask or totals mismatch';
  end if;
end $test$;
select public.test_boundary_denied('select public.get_invoice_kpis_columns(''{}'',''purchase'')');
select public.test_boundary_denied('select public.get_warehouse_transfer_kpis_columns(''{"total_value":"120"}'')');
select public.test_boundary_denied('select public.get_receipt_kpis_columns(''{}'',''out'')');
select public.test_boundary_denied('select public.get_cash_box_transfer_kpis_columns(''{}'')');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);
do $test$
begin
  if (public.get_invoice_kpis_columns('{}','sale')->>'count')::int<>0
    or (public.get_receipt_kpis_columns('{}','in')->>'count')::int<>0
    or (public.get_warehouse_transfer_kpis_columns('{}')->>'count')::int<>0
    or (public.get_cash_box_transfer_kpis_columns('{}',p_show_deleted=>true)->>'count')::int<>0 then
    raise exception 'Cross-company KPI leak';
  end if;
end $test$;
set local role anon;
select public.test_boundary_denied('select public.get_invoice_kpis_columns(''{}'',''sale'')');
select public.test_boundary_denied('select public.get_receipt_kpis_columns(''{}'',''in'')');
select public.test_boundary_denied('select public.get_warehouse_transfer_kpis_columns(''{}'')');
select public.test_boundary_denied('select public.get_cash_box_transfer_kpis_columns(''{}'')');
rollback;

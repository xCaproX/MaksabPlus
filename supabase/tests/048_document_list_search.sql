begin;
insert into auth.users(id) values
 ('48484848-4848-4484-8484-000000000001'),
 ('48484848-4848-4484-8484-000000000002'),
 ('48484848-4848-4484-8484-000000000003');
insert into public.companies(id,name) values
 ('48484848-4848-4484-8484-0000000000a1','Document A'),
 ('48484848-4848-4484-8484-0000000000b1','Document B');
insert into public.profiles(id,company_id,access_role) values
 ('48484848-4848-4484-8484-000000000001','48484848-4848-4484-8484-0000000000a1','owner'),
 ('48484848-4848-4484-8484-000000000002','48484848-4848-4484-8484-0000000000a1','employee'),
 ('48484848-4848-4484-8484-000000000003','48484848-4848-4484-8484-0000000000b1','owner');
select set_config('request.jwt.claim.sub','48484848-4848-4484-8484-000000000001',true);
select public.set_user_permissions('48484848-4848-4484-8484-000000000002',array['goods.sale.view','money.in.view']);
insert into public.warehouses(id,company_id,name) values
 ('48484848-4848-4484-8484-000000000101','48484848-4848-4484-8484-0000000000a1','مخزن البحث');
insert into public.cash_boxes(id,company_id,name) values
 ('48484848-4848-4484-8484-000000000102','48484848-4848-4484-8484-0000000000a1','خزنة البحث');
insert into public.accounts(id,company_id,name,kind,phone) values
 ('48484848-4848-4484-8484-000000000103','48484848-4848-4484-8484-0000000000a1','عميل البحث','customer','01048484848');
insert into public.invoices(id,company_id,kind,number,invoice_date,account_id,warehouse_id,total,paid,profit_total,notes) values
 ('48484848-4848-4484-8484-000000000201','48484848-4848-4484-8484-0000000000a1','sale','SAL-SEARCH','2026-11-06','48484848-4848-4484-8484-000000000103','48484848-4848-4484-8484-000000000101',100,40,30,'ملاحظة, (خاصة) 50%_'),
 ('48484848-4848-4484-8484-000000000202','48484848-4848-4484-8484-0000000000a1','sale','SAL-OLD','2026-11-04','48484848-4848-4484-8484-000000000103','48484848-4848-4484-8484-000000000101',200,0,60,'قديمة');
insert into public.receipts(company_id,number,receipt_date,account_id,cash_box_id,amount,direction,notes,description) values
 ('48484848-4848-4484-8484-0000000000a1','RCP-SEARCH','2026-11-06','48484848-4848-4484-8484-000000000103','48484848-4848-4484-8484-000000000102',7,'in','استلام, (خاص) 50%_','تحصيل حر منفصل');

set local role authenticated;
do $$
declare v_term text; v_data jsonb; v_count bigint;
begin
 foreach v_term in array array['01048484848','عميل البحث','مخزن البحث','ملاحظة, (خاصة)','50%_','%','_'] loop
  v_data := public.get_invoice_kpis('sale',v_term,'all','2026-11-05','2026-11-06',false);
  select count(*) into v_count from public.v_invoice_list
   where kind='sale' and invoice_date between '2026-11-05' and '2026-11-06'
    and (number ilike '%'||v_term||'%' or account_name ilike '%'||v_term||'%' or account_phone ilike '%'||v_term||'%'
      or warehouse_name ilike '%'||v_term||'%' or notes ilike '%'||v_term||'%');
  if (v_data->>'count')::int <> 1 or v_count<>1
    or (v_data->>'total_amount')::numeric<>100 or (v_data->>'paid_amount')::numeric<>40
    or (v_data->>'remaining_amount')::numeric<>60 then
    raise exception 'Invoice list/summary mismatch for %: %',v_term,v_data;
  end if;
 end loop;
 if (public.get_invoice_kpis('sale','%')->>'count')::int<>1
    or (public.get_invoice_kpis('sale','_missing')->>'count')::int<>0 then
  raise exception 'Invoice wildcard input was not literal';
 end if;
 foreach v_term in array array['01048484848','عميل البحث','خزنة البحث','استلام, (خاص)','تحصيل حر منفصل','50%_'] loop
  v_data := public.get_receipt_kpis('in',null,v_term,'2026-11-06','2026-11-06',false);
  if (v_data->>'count')::int<>1 or (v_data->>'total_amount')::numeric<>7 then
   raise exception 'Receipt search mismatch for %: %',v_term,v_data;
  end if;
 end loop;
 if (public.get_invoice_kpis('sale',null,'partial','2026-11-06','2026-11-06')->>'count')::int<>1
    or (public.get_invoice_kpis('sale',null,'paid','2026-11-06','2026-11-06')->>'count')::int<>0 then
  raise exception 'Status filtering changed';
 end if;
end $$;

select set_config('request.jwt.claim.sub','48484848-4848-4484-8484-000000000002',true);
do $$ begin
 if public.get_invoice_kpis('sale','01048484848')->>'profit_total' is not null
   or exists(select 1 from public.v_invoice_list where profit_total is not null or cost_total is not null) then
  raise exception 'Employee received protected profit/cost';
 end if;
 begin
  perform public.get_invoice_kpis('purchase');
  raise exception 'Employee invoked unauthorized invoice summary';
 exception when insufficient_privilege then null; end;
 begin
  perform public.get_receipt_kpis('out');
  raise exception 'Employee invoked unauthorized receipt summary';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','48484848-4848-4484-8484-000000000003',true);
do $$ begin
 begin
  update public.invoices set notes='forbidden' where id='48484848-4848-4484-8484-000000000201';
  if found then raise exception 'Company B modified company A document'; end if;
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.v_invoice_list where account_phone='01048484848')
   or exists(select 1 from public.v_receipt_list where account_phone='01048484848')
   or (public.get_invoice_kpis('sale','01048484848')->>'count')::int<>0
   or (public.get_receipt_kpis('in',null,'01048484848')->>'count')::int<>0 then
  raise exception 'Company B read company A document search';
 end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_invoice_kpis('sale'); raise exception 'Anon invoice RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform public.get_receipt_kpis('in'); raise exception 'Anon receipt RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.v_invoice_list; raise exception 'Anon invoice view allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.v_receipt_list; raise exception 'Anon receipt view allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_class where oid in ('public.v_invoice_list'::regclass,'public.v_receipt_list'::regclass)
    and not (reloptions @> array['security_invoker=true'])) then raise exception 'Invoker option missing'; end if;
 if exists(select 1 from pg_proc where oid in ('public.get_invoice_kpis(text,text,text,text,text,boolean)'::regprocedure,
   'public.get_receipt_kpis(text,uuid,text,text,text,boolean)'::regprocedure)
   and (not prosecdef or not(proconfig @> array['search_path=public']))) then raise exception 'Function hardening missing'; end if;
end $$;
rollback;

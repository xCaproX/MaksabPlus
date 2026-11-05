begin;
insert into auth.users(id,email) values
 ('47474747-4747-4474-8474-000000000001','account-owner-a@test.local'),
 ('47474747-4747-4474-8474-000000000002','account-creator-a@test.local'),
 ('47474747-4747-4474-8474-000000000003','account-owner-b@test.local');
insert into public.companies(id,name) values
 ('47474747-4747-4474-8474-0000000000a1','Account A'),
 ('47474747-4747-4474-8474-0000000000b1','Account B');
insert into public.profiles(id,company_id,access_role) values
 ('47474747-4747-4474-8474-000000000001','47474747-4747-4474-8474-0000000000a1','owner'),
 ('47474747-4747-4474-8474-000000000002','47474747-4747-4474-8474-0000000000a1','employee'),
 ('47474747-4747-4474-8474-000000000003','47474747-4747-4474-8474-0000000000b1','owner');
select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000001',true);
select public.set_user_permissions('47474747-4747-4474-8474-000000000002',array['data.customers.create']);
set local role authenticated;
select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000002',true);
do $$
declare v_id uuid; v_denied boolean := false;
begin
  -- No data.edit or management.edit is needed to create the opening amount.
  v_id := public.save_account_with_notes(null,'عميل برصيد بداية','customer','01000000000',true,125.5,'ملاحظات الإنشاء');
  if not exists(select 1 from public.accounts where id=v_id and company_id=public.current_company_id()
      and opening_balance=125.5 and current_balance=125.5 and notes='ملاحظات الإنشاء') then
    raise exception 'Customer opening amount or notes were not created atomically';
  end if;
  perform set_config('test.account_form_id',v_id::text,true);
  begin
    perform public.save_account_with_notes(null,'مورد غير مسموح','supplier',null,true,1000,null);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Customer creator created supplier'; end if;
end $$;

select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000001',true);
select public.set_user_permissions('47474747-4747-4474-8474-000000000002',array['data.suppliers.create']);
select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000002',true);
do $$
declare v_id uuid; v_denied boolean := false;
begin
  v_id := public.save_account_with_notes(null,'مورد برصيد بداية','supplier',null,true,1000,'ملاحظات المورد');
  if not exists(select 1 from public.accounts where id=v_id and current_balance=1000 and notes='ملاحظات المورد') then
    raise exception 'Supplier creator could not save opening amount and notes';
  end if;
  begin
    perform public.save_account_with_notes(null,'عميل غير مسموح','customer',null,true,0,null);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Supplier creator created customer'; end if;
end $$;
select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000001',true);
do $$
declare v_case record; v_id uuid; v_invalid text; v_rejected boolean;
begin
  for v_case in select * from (values
    ('customer',1000::numeric),('customer',-1000::numeric),
    ('supplier',1000::numeric),('supplier',-1000::numeric)
  ) as cases(kind,amount) loop
    v_id := public.save_account_with_notes(null,'اتجاه رصيد '||v_case.kind||v_case.amount,
      v_case.kind,null,true,v_case.amount,null);
    if not exists(select 1 from public.v_account_balances where id=v_id and balance=v_case.amount) then
      raise exception 'Signed opening amount changed for % %',v_case.kind,v_case.amount;
    end if;
  end loop;
  foreach v_invalid in array array['NaN','Infinity','-Infinity'] loop
    v_rejected := false;
    begin
      perform public.save_account_with_notes(null,'رصيد غير صالح','customer',null,true,v_invalid::numeric,null);
    exception when invalid_parameter_value then v_rejected := true;
    end;
    if not v_rejected then raise exception 'Non-finite opening amount was accepted: %',v_invalid; end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub','47474747-4747-4474-8474-000000000003',true);
do $$
declare v_rejected boolean := false;
begin
  if exists(select 1 from public.accounts where id=current_setting('test.account_form_id')::uuid) then
    raise exception 'Company B read company A account';
  end if;
  begin
    perform public.save_account_with_notes(current_setting('test.account_form_id')::uuid,
      'محاولة من شركة أخرى','customer',null,true,0,null);
  exception when invalid_parameter_value then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Company B changed company A account'; end if;
end $$;
set local role anon;
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.save_account_with_notes(null,'زائر','customer',null,true,0,null);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon created account'; end if;
end $$;
rollback;

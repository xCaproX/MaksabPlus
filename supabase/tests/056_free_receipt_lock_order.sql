-- @fixture document_boundaries
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000003',true);

do $$
begin
  begin
    perform public.create_free_receipt(
      '55555555-5555-4555-8555-000000000030', '55555555-5555-4555-8555-000000000020',
      current_date, 1, null, null, 'in'
    );
    raise exception 'Company B was able to post a receipt using company A data';
  exception when invalid_parameter_value then
    if sqlerrm <> 'invalid_account' then raise; end if;
  end;
end;
$$;

reset role;
set local role anon;
select public.test_boundary_denied('select public.create_free_receipt(
  ''55555555-5555-4555-8555-000000000030'',''55555555-5555-4555-8555-000000000020'',
  current_date,1,null,null,''in'')');

reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select public.set_user_permissions('55555555-5555-4555-8555-000000000002', array['money.in.create']);
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000002',true);
select public.create_free_receipt(
  '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000020',
  current_date,5,null,null,'in');

reset role;
select public.test_boundary_expect((select count(*) = 1 and sum(amount) = 5
  from public.receipts where company_id = '55555555-5555-4555-8555-0000000000a1'),
  'only the authorized receipt was recorded');
rollback;

begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('21212121-2121-4121-8121-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cash-statements@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('21212121-2121-4121-8121-0000000000a1', 'شركة كشف الخزنة'),
  ('21212121-2121-4121-8121-0000000000a2', 'شركة خزنة أخرى');
insert into public.profiles (id, company_id)
values ('21212121-2121-4121-8121-000000000001', '21212121-2121-4121-8121-0000000000a1');
insert into public.accounts (id, company_id, name, kind) values
  ('21212121-2121-4121-8121-000000000101', '21212121-2121-4121-8121-0000000000a1', 'حساب كشف خزنة', 'customer');
insert into public.cash_boxes (id, company_id, name, opening_balance) values
  ('21212121-2121-4121-8121-000000000201', '21212121-2121-4121-8121-0000000000a1', 'الخزنة الأولى', 1000),
  ('21212121-2121-4121-8121-000000000202', '21212121-2121-4121-8121-0000000000a1', 'الخزنة الثانية', 0),
  ('21212121-2121-4121-8121-000000000203', '21212121-2121-4121-8121-0000000000a2', 'خزنة شركة أخرى', 0);
insert into public.opening_balance_adjustments (company_id, cash_box_id, amount_delta, note, created_at) values
  ('21212121-2121-4121-8121-0000000000a1', '21212121-2121-4121-8121-000000000201', 50, 'تصحيح سابق', '2026-09-25 10:00:00+00');
insert into public.receipts (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, direction, description) values
  ('21212121-2121-4121-8121-0000000000a1', null, 'RCP-CASH-1', '2026-10-10', '21212121-2121-4121-8121-000000000101', '21212121-2121-4121-8121-000000000201', 20000, 'in', 'استلام نقدي'),
  ('21212121-2121-4121-8121-0000000000a1', null, 'PAY-CASH-1', '2026-10-13', '21212121-2121-4121-8121-000000000101', '21212121-2121-4121-8121-000000000201', 20000, 'out', 'صرف نقدي');
insert into public.cash_box_transfers (company_id, number, transfer_date, source_cash_box_id, destination_cash_box_id, amount) values
  ('21212121-2121-4121-8121-0000000000a1', 'CBT-CASH-1', '2026-10-18', '21212121-2121-4121-8121-000000000201', '21212121-2121-4121-8121-000000000202', 6380),
  ('21212121-2121-4121-8121-0000000000a1', 'CBT-CASH-2', '2026-10-19', '21212121-2121-4121-8121-000000000202', '21212121-2121-4121-8121-000000000201', 24500);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"21212121-2121-4121-8121-000000000001"}', true);

do $$
declare
  v_failed boolean := false;
begin
  perform public.test_expect(
    (select running_balance = 1050 and incoming = 1050 and outgoing = 0
     from public.get_cash_box_statement('21212121-2121-4121-8121-000000000201', '2026-10-01', '2026-10-31')
     where row_type = 'opening'),
    'cash box statement carries opening balance and prior adjustments forward'
  );
  perform public.test_expect(
    (select total_incoming = 44500 and total_outgoing = 26380 and running_balance = 19170
     from public.get_cash_box_statement('21212121-2121-4121-8121-000000000201', '2026-10-01', '2026-10-31')
     where transfer_number = 'CBT-CASH-2'),
    'cash box statement totals receipts and both transfer directions'
  );
  perform public.test_expect(
    (select incoming = 24500 and description like '%من الخزنة الثانية'
     from public.get_cash_box_statement('21212121-2121-4121-8121-000000000201', '2026-10-01', '2026-10-31')
     where transfer_number = 'CBT-CASH-2'),
    'incoming transfer identifies its source cash box'
  );
  begin
    perform * from public.get_cash_box_statement('21212121-2121-4121-8121-000000000203', '2026-10-01', '2026-10-31');
  exception when invalid_parameter_value then
    v_failed := sqlerrm = 'cash_box_not_found';
  end;
  perform public.test_expect(v_failed, 'cash box statement cannot read another company cash box');
end;
$$;

rollback;

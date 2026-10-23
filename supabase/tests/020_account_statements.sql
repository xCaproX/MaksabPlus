begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('20202020-2020-4020-8020-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'account-statements@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('20202020-2020-4020-8020-0000000000a1', 'شركة كشف الحساب'),
  ('20202020-2020-4020-8020-0000000000a2', 'شركة أخرى');
insert into public.profiles (id, company_id)
values ('20202020-2020-4020-8020-000000000001', '20202020-2020-4020-8020-0000000000a1');

insert into public.accounts (id, company_id, name, kind, opening_balance) values
  ('20202020-2020-4020-8020-000000000101', '20202020-2020-4020-8020-0000000000a1', 'عميل كشف', 'customer', 50),
  ('20202020-2020-4020-8020-000000000102', '20202020-2020-4020-8020-0000000000a1', 'مورد كشف', 'supplier', 70),
  ('20202020-2020-4020-8020-000000000103', '20202020-2020-4020-8020-0000000000a2', 'حساب شركة أخرى', 'customer', 0);
insert into public.warehouses (id, company_id, name) values
  ('20202020-2020-4020-8020-000000000201', '20202020-2020-4020-8020-0000000000a1', 'مخزن كشف');
insert into public.cash_boxes (id, company_id, name) values
  ('20202020-2020-4020-8020-000000000301', '20202020-2020-4020-8020-0000000000a1', 'خزنة كشف');
insert into public.opening_balance_adjustments (company_id, account_id, amount_delta, note, created_at) values
  ('20202020-2020-4020-8020-0000000000a1', '20202020-2020-4020-8020-000000000101', 5, 'تصحيح سابق', '2026-09-15 10:00:00+00');
insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, total, paid) values
  ('20202020-2020-4020-8020-0000000000a1', 'sale', 'SAL-TEST-1', '2026-10-10', '20202020-2020-4020-8020-000000000101', '20202020-2020-4020-8020-000000000201', 100, 40),
  ('20202020-2020-4020-8020-0000000000a1', 'purchase', 'PUR-TEST-1', '2026-10-10', '20202020-2020-4020-8020-000000000102', '20202020-2020-4020-8020-000000000201', 200, 50);
insert into public.receipts (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, direction, description) values
  ('20202020-2020-4020-8020-0000000000a1', (select id from public.invoices where number = 'SAL-TEST-1'), 'RCP-TEST-1', '2026-10-10', '20202020-2020-4020-8020-000000000101', '20202020-2020-4020-8020-000000000301', 40, 'in', null),
  ('20202020-2020-4020-8020-0000000000a1', (select id from public.invoices where number = 'PUR-TEST-1'), 'PAY-TEST-1', '2026-10-10', '20202020-2020-4020-8020-000000000102', '20202020-2020-4020-8020-000000000301', 50, 'out', null),
  ('20202020-2020-4020-8020-0000000000a1', null, 'RCP-TEST-2', '2026-10-20', '20202020-2020-4020-8020-000000000102', '20202020-2020-4020-8020-000000000301', 5, 'in', 'استلام من المورد'),
  ('20202020-2020-4020-8020-0000000000a1', null, 'PAY-TEST-2', '2026-10-20', '20202020-2020-4020-8020-000000000101', '20202020-2020-4020-8020-000000000301', 10, 'out', 'صرف للعميل');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20202020-2020-4020-8020-000000000001"}', true);

do $$
declare
  v_failed boolean := false;
begin
  perform public.test_expect(
    (select running_balance = 55 and debit = 55 and credit = 0
     from public.get_account_statement('20202020-2020-4020-8020-000000000101', '2026-10-01', '2026-10-31')
     where row_type = 'opening'),
    'customer statement carries opening balance and earlier adjustments forward'
  );
  perform public.test_expect(
    (select total_debit = 110 and total_credit = 40 and running_balance = 125
     from public.get_account_statement('20202020-2020-4020-8020-000000000101', '2026-10-01', '2026-10-31')
     where receipt_number = 'PAY-TEST-2'),
    'customer statement includes invoice, linked receipt, free receipt and closing balance'
  );
  perform public.test_expect(
    (select count(*) = 1 and min(invoice_number) = 'SAL-TEST-1' and min(receipt_number) = 'RCP-TEST-1'
     from public.get_account_statement('20202020-2020-4020-8020-000000000101', '2026-10-01', '2026-10-31')
     where row_type = 'movement' and receipt_number = 'RCP-TEST-1'),
    'linked receipt statement row keeps both invoice and receipt numbers'
  );
  perform public.test_expect(
    (select total_debit = 50 and total_credit = 205 and running_balance = 225
     from public.get_account_statement('20202020-2020-4020-8020-000000000102', '2026-10-01', '2026-10-31')
     where receipt_number = 'RCP-TEST-2'),
    'supplier statement applies supplier debit and credit orientation',
    (select concat_ws(', ', 'debit=' || total_debit, 'credit=' || total_credit, 'balance=' || running_balance)
     from public.get_account_statement('20202020-2020-4020-8020-000000000102', '2026-10-01', '2026-10-31')
     where receipt_number = 'RCP-TEST-2')
  );
  begin
    perform * from public.get_account_statement('20202020-2020-4020-8020-000000000103', '2026-10-01', '2026-10-31');
  exception when invalid_parameter_value then
    v_failed := sqlerrm = 'account_not_found';
  end;
  perform public.test_expect(v_failed, 'account statement cannot read another company account');
end;
$$;

rollback;

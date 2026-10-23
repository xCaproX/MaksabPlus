begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('22222222-2222-4222-8222-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'item-movements@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('22222222-2222-4222-8222-0000000000a1', 'شركة كشف الصنف'),
  ('22222222-2222-4222-8222-0000000000a2', 'شركة صنف أخرى');
insert into public.profiles (id, company_id)
values ('22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-0000000000a1');
insert into public.accounts (id, company_id, name, kind) values
  ('22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-0000000000a1', 'حساب حركة الصنف', 'supplier');
insert into public.items (id, company_id, name) values
  ('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-0000000000a1', 'صنف كشف الحركة'),
  ('22222222-2222-4222-8222-000000000203', '22222222-2222-4222-8222-0000000000a2', 'صنف شركة أخرى');
insert into public.warehouses (id, company_id, name) values
  ('22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-0000000000a1', 'المخزن الأول'),
  ('22222222-2222-4222-8222-000000000302', '22222222-2222-4222-8222-0000000000a1', 'المخزن الثاني'),
  ('22222222-2222-4222-8222-000000000303', '22222222-2222-4222-8222-0000000000a2', 'مخزن شركة أخرى');
insert into public.stock_opening_balances (company_id, warehouse_id, item_id, opening_qty, unit_cost, created_at) values
  ('22222222-2222-4222-8222-0000000000a1', '22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-000000000201', 62, 10, '2026-05-01 10:00:00+00');
insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost) values
  ('22222222-2222-4222-8222-0000000000a1', '22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-000000000201', 77, 10);
insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, total, paid, created_at) values
  ('22222222-2222-4222-8222-0000000000a1', 'purchase', 'PUR-BEFORE', '2026-04-28', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 500, 0, '2026-04-28 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'purchase', 'PUR-MOVE-1', '2026-06-03', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 200, 0, '2026-06-03 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'sale', 'SAL-MOVE-1', '2026-06-04', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 50, 0, '2026-06-04 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'sale_return', 'SRT-MOVE-1', '2026-06-05', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 20, 0, '2026-06-05 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'purchase_return', 'PRT-MOVE-1', '2026-06-06', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 30, 0, '2026-06-06 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'waste', 'WST-MOVE-1', '2026-06-07', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-000000000301', 0, 0, '2026-06-07 10:00:00+00');
insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price) values
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'PUR-BEFORE'), '22222222-2222-4222-8222-000000000201', 50, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'PUR-MOVE-1'), '22222222-2222-4222-8222-000000000201', 20, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'SAL-MOVE-1'), '22222222-2222-4222-8222-000000000201', 5, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'SRT-MOVE-1'), '22222222-2222-4222-8222-000000000201', 2, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'PRT-MOVE-1'), '22222222-2222-4222-8222-000000000201', 3, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.invoices where number = 'WST-MOVE-1'), '22222222-2222-4222-8222-000000000201', 1, 0);
insert into public.stock_opening_adjustments (company_id, warehouse_id, item_id, quantity_delta, unit_cost, note, created_at) values
  ('22222222-2222-4222-8222-0000000000a1', '22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-000000000201', 2, 10, 'تصحيح رصيد افتتاحي', '2026-06-10 10:00:00+00');
insert into public.warehouse_transfers (company_id, number, transfer_date, source_warehouse_id, destination_warehouse_id, created_at) values
  ('22222222-2222-4222-8222-0000000000a1', 'WTR-MOVE-1', '2026-06-08', '22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-000000000302', '2026-06-08 10:00:00+00'),
  ('22222222-2222-4222-8222-0000000000a1', 'WTR-MOVE-2', '2026-06-09', '22222222-2222-4222-8222-000000000302', '22222222-2222-4222-8222-000000000301', '2026-06-09 10:00:00+00');
insert into public.warehouse_transfer_items (company_id, transfer_id, item_id, qty, unit_cost) values
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.warehouse_transfers where number = 'WTR-MOVE-1'), '22222222-2222-4222-8222-000000000201', 4, 10),
  ('22222222-2222-4222-8222-0000000000a1', (select id from public.warehouse_transfers where number = 'WTR-MOVE-2'), '22222222-2222-4222-8222-000000000201', 6, 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000001"}', true);

do $$
declare
  v_failed boolean := false;
begin
  perform public.test_expect(
    (select running_balance = 60 and incoming = 60 and outgoing = 0
     from public.get_item_movement_statement('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000301', '2026-06-01', '2026-06-30')
     where row_type = 'opening'),
    'item statement reconciles legacy opening snapshot and movements before the selected period'
  );
  perform public.test_expect(
    (select total_incoming = 30 and total_outgoing = 13 and running_balance = 77
     from public.get_item_movement_statement('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000301', '2026-06-01', '2026-06-30')
     where description = 'تصحيح رصيد افتتاحي'),
    'item statement calculates purchases, sales, returns, waste, adjustments and warehouse transfers',
    (select concat_ws(', ', 'incoming=' || total_incoming, 'outgoing=' || total_outgoing, 'balance=' || running_balance)
     from public.get_item_movement_statement('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000301', '2026-06-01', '2026-06-30')
     where description = 'تصحيح رصيد افتتاحي')
  );
  perform public.test_expect(
    (select outgoing = 4 and description like '%إلى المخزن الثاني'
     from public.get_item_movement_statement('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000301', '2026-06-01', '2026-06-30')
     where transfer_number = 'WTR-MOVE-1'),
    'outgoing warehouse transfer identifies its destination'
  );
  begin
    perform * from public.get_item_movement_statement('22222222-2222-4222-8222-000000000203', '22222222-2222-4222-8222-000000000303', '2026-06-01', '2026-06-30');
  exception when invalid_parameter_value then
    v_failed := sqlerrm = 'invalid_item_statement_target';
  end;
  perform public.test_expect(v_failed, 'item statement cannot read another company item or warehouse');
end;
$$;

rollback;

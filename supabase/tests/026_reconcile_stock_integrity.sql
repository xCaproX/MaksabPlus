begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

-- Setup users, companies, warehouses, items
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('26262626-2626-4262-8262-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stock-reconcile-a@test.local', now(), now(), now()),
  ('26262626-2626-4262-8262-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stock-reconcile-b@test.local', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name) values
  ('26262626-2626-4262-8262-0000000000a1', 'شركة المطابقة أ'),
  ('26262626-2626-4262-8262-0000000000a2', 'شركة المطابقة ب')
on conflict (id) do nothing;

insert into public.profiles (id, company_id, access_role) values
  ('26262626-2626-4262-8262-000000000001', '26262626-2626-4262-8262-0000000000a1', 'owner'),
  ('26262626-2626-4262-8262-000000000002', '26262626-2626-4262-8262-0000000000a2', 'owner')
on conflict (id) do update set company_id = excluded.company_id, access_role = excluded.access_role;

insert into public.warehouses (id, company_id, name, is_active, is_primary) values
  ('26262626-2626-4262-8262-000000000101', '26262626-2626-4262-8262-0000000000a1', 'المخزن الرئيسي أ', true, true),
  ('26262626-2626-4262-8262-000000000102', '26262626-2626-4262-8262-0000000000a1', 'فرع المعرض أ', true, false),
  ('26262626-2626-4262-8262-000000000103', '26262626-2626-4262-8262-0000000000a2', 'مخزن شركة ب', true, true);

insert into public.items (id, company_id, name, is_active, purchase_price, sale_price) values
  ('26262626-2626-4262-8262-000000000201', '26262626-2626-4262-8262-0000000000a1', 'صنف تجريبي مطابقة', true, 10, 20),
  ('26262626-2626-4262-8262-000000000202', '26262626-2626-4262-8262-0000000000a2', 'صنف شركة ب', true, 15, 30);

insert into public.accounts (id, company_id, name, kind) values
  ('26262626-2626-4262-8262-000000000301', '26262626-2626-4262-8262-0000000000a1', 'مورد أ', 'supplier'),
  ('26262626-2626-4262-8262-000000000302', '26262626-2626-4262-8262-0000000000a1', 'عميل أ', 'customer');

insert into public.cash_boxes (id, company_id, name, is_active) values
  ('26262626-2626-4262-8262-000000000401', '26262626-2626-4262-8262-0000000000a1', 'خزنة أ', true);

-- Invoices and transfers (simulating the exact scenario)
-- Purchase PUR: +100
insert into public.invoices (id, company_id, kind, number, invoice_date, account_id, warehouse_id, total, paid, created_at)
values ('26262626-2626-4262-8262-000000000501', '26262626-2626-4262-8262-0000000000a1', 'purchase', 'PUR-TST-1', '2026-10-24', '26262626-2626-4262-8262-000000000301', '26262626-2626-4262-8262-000000000101', 1000, 1000, '2026-10-24 10:00:00+00');
insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
values ('26262626-2626-4262-8262-0000000000a1', '26262626-2626-4262-8262-000000000501', '26262626-2626-4262-8262-000000000201', 100, 10, 10);

-- Sale SAL: -5
insert into public.invoices (id, company_id, kind, number, invoice_date, account_id, warehouse_id, total, paid, created_at)
values ('26262626-2626-4262-8262-000000000502', '26262626-2626-4262-8262-0000000000a1', 'sale', 'SAL-TST-1', '2026-10-24', '26262626-2626-4262-8262-000000000302', '26262626-2626-4262-8262-000000000101', 100, 100, '2026-10-24 10:30:00+00');
insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
values ('26262626-2626-4262-8262-0000000000a1', '26262626-2626-4262-8262-000000000502', '26262626-2626-4262-8262-000000000201', 5, 20, 10);

-- Warehouse transfer WTR: -45 from Wh1 to Wh2
insert into public.warehouse_transfers (id, company_id, number, transfer_date, source_warehouse_id, destination_warehouse_id, created_at)
values ('26262626-2626-4262-8262-000000000601', '26262626-2626-4262-8262-0000000000a1', 'WTR-TST-1', '2026-10-24', '26262626-2626-4262-8262-000000000101', '26262626-2626-4262-8262-000000000102', '2026-10-24 11:00:00+00');
insert into public.warehouse_transfer_items (company_id, transfer_id, item_id, qty, unit_cost)
values ('26262626-2626-4262-8262-0000000000a1', '26262626-2626-4262-8262-000000000601', '26262626-2626-4262-8262-000000000201', 45, 10);

-- Intentionally create a desynchronized item_stock row (e.g. qty = 0 as happened with the bug)
insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
values ('26262626-2626-4262-8262-0000000000a1', '26262626-2626-4262-8262-000000000101', '26262626-2626-4262-8262-000000000201', 0, 0)
on conflict (warehouse_id, item_id) do update set qty = 0, avg_cost = 0;

-- Set auth context to Company A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"26262626-2626-4262-8262-000000000001"}', true);

-- Run reconciliation
select public.reconcile_item_stock();

-- 1. Verify item_stock has been reconciled to 50 (100 - 5 - 45)
do $$
declare
  v_qty numeric(18,4);
  v_stmt_balance numeric(18,4);
begin
  select qty into v_qty from public.item_stock
  where warehouse_id = '26262626-2626-4262-8262-000000000101'
    and item_id = '26262626-2626-4262-8262-000000000201';

  perform public.test_expect(v_qty = 50, 'reconcile_item_stock sets warehouse 1 qty to 50', 'got ' || coalesce(v_qty::text, 'null'));

  -- Verify it matches get_item_movement_statement running balance
  with stmt as (
    select running_balance, row_number() over () as rn, count(*) over () as total
    from public.get_item_movement_statement('26262626-2626-4262-8262-000000000201', '26262626-2626-4262-8262-000000000101', '2026-10-01', '2026-10-31')
  )
  select running_balance into v_stmt_balance
  from stmt
  where rn = total;

  perform public.test_expect(v_stmt_balance = v_qty, 'item_stock.qty matches statement running balance', 'stmt=' || coalesce(v_stmt_balance::text, 'null') || ' stock=' || coalesce(v_qty::text, 'null'));
end;
$$;

-- 2. Verify destination warehouse 2 has 45
do $$
declare
  v_qty numeric(18,4);
begin
  select qty into v_qty from public.item_stock
  where warehouse_id = '26262626-2626-4262-8262-000000000102'
    and item_id = '26262626-2626-4262-8262-000000000201';

  perform public.test_expect(v_qty = 45, 'destination warehouse has 45 qty', 'got ' || coalesce(v_qty::text, 'null'));
end;
$$;

-- 3. Test that calling save_opening_balances does NOT wipe out item_stock.qty
do $$
declare
  v_stock_param jsonb;
  v_cash_param jsonb;
  v_qty numeric(18,4);
begin
  v_stock_param := jsonb_build_array(
    jsonb_build_object(
      'warehouse_id', '26262626-2626-4262-8262-000000000101',
      'item_id', '26262626-2626-4262-8262-000000000201',
      'opening_qty', 0,
      'unit_cost', 10
    )
  );
  v_cash_param := jsonb_build_array(
    jsonb_build_object(
      'cash_box_id', '26262626-2626-4262-8262-000000000401',
      'opening_balance', 0
    )
  );

  perform public.save_opening_balances(v_cash_param, v_stock_param);

  select qty into v_qty from public.item_stock
  where warehouse_id = '26262626-2626-4262-8262-000000000101'
    and item_id = '26262626-2626-4262-8262-000000000201';

  perform public.test_expect(v_qty = 50, 'save_opening_balances does NOT wipe item_stock when activity exists', 'got ' || coalesce(v_qty::text, 'null'));
end;
$$;

-- 4. Multi-tenant isolation test: Company A user cannot read Company B's stock
do $$
declare
  v_company_b_stock_count integer;
begin
  select count(*) into v_company_b_stock_count from public.item_stock
  where company_id = '26262626-2626-4262-8262-0000000000a2';

  perform public.test_expect(v_company_b_stock_count = 0, 'Company A user cannot read Company B stock rows', 'got ' || v_company_b_stock_count::text);
end;
$$;

rollback;

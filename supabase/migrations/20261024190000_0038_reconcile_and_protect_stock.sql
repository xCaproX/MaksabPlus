-- Reconcile and protect item_stock against desynchronization.
-- 1. Create public.reconcile_item_stock function to reconcile item_stock from actual ledger transactions.
-- 2. Execute reconciliation immediately for existing data.
-- 3. Fix public.save_opening_balances to accurately detect activity without flawed timestamp comparisons
--    and protect item_stock from being wiped out.

create or replace function public.reconcile_item_stock(p_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_company uuid := coalesce(p_company_id, public.current_company_id());
  v_updated_count integer := 0;
begin
  if v_target_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  with target_items as (
    select i.company_id, i.id as item_id, w.id as warehouse_id
    from public.items i
    cross join public.warehouses w
    where i.company_id = v_target_company
      and w.company_id = v_target_company
      and i.is_active
      and w.is_active
  ),
  ledger_sums as (
    select
      ti.company_id,
      ti.warehouse_id,
      ti.item_id,
      round(
        coalesce(o.opening_qty, 0) +
        coalesce((
          select sum(
            case
              when inv.kind in ('purchase', 'sale_return') then ii.qty
              when inv.kind in ('sale', 'purchase_return', 'waste') then -ii.qty
              else 0
            end
          )
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.deleted_at is null
        ), 0) +
        coalesce((
          select sum(
            case
              when t.destination_warehouse_id = ti.warehouse_id then tri.qty
              when t.source_warehouse_id = ti.warehouse_id then -tri.qty
              else 0
            end
          )
          from public.warehouse_transfers t
          join public.warehouse_transfer_items tri on tri.company_id = t.company_id and tri.transfer_id = t.id
          where t.company_id = ti.company_id
            and ti.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
            and tri.item_id = ti.item_id
            and t.deleted_at is null
        ), 0) +
        coalesce((
          select sum(adj.quantity_delta)
          from public.stock_opening_adjustments adj
          where adj.company_id = ti.company_id
            and adj.warehouse_id = ti.warehouse_id
            and adj.item_id = ti.item_id
        ), 0)
      , 4)::numeric(18,4) as reconciled_qty,
      coalesce(
        s.avg_cost,
        o.unit_cost,
        (
          select ii.unit_cost
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.kind = 'purchase'
            and inv.deleted_at is null
          order by inv.invoice_date desc, inv.created_at desc
          limit 1
        ),
        0
      )::numeric(18,4) as effective_cost
    from target_items ti
    left join public.stock_opening_balances o
      on o.company_id = ti.company_id and o.warehouse_id = ti.warehouse_id and o.item_id = ti.item_id
    left join public.item_stock s
      on s.company_id = ti.company_id and s.warehouse_id = ti.warehouse_id and s.item_id = ti.item_id
  )
  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost, updated_at)
  select company_id, warehouse_id, item_id, reconciled_qty, effective_cost, now()
  from ledger_sums
  on conflict (warehouse_id, item_id)
  do update set
    qty = excluded.qty,
    avg_cost = case when public.item_stock.avg_cost > 0 then public.item_stock.avg_cost else excluded.avg_cost end,
    updated_at = now();

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.reconcile_item_stock(uuid) from public, anon;
grant execute on function public.reconcile_item_stock(uuid) to authenticated;

-- Run reconciliation for all existing companies right now
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_item_stock(r.id);
  end loop;
end;
$$;

-- Fix save_opening_balances to accurately identify existing transactions without flawed timestamp comparisons
create or replace function public.save_opening_balances(
  p_cash_boxes jsonb,
  p_stock jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash record;
  v_stock record;
  v_box public.cash_boxes%rowtype;
  v_open public.stock_opening_balances%rowtype;
  v_effective numeric(18,4);
  v_delta numeric(18,4);
  v_has_activity boolean;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_cash_boxes) <> 'array' or jsonb_typeof(p_stock) <> 'array' then
    raise exception 'invalid_opening_balances' using errcode = '22023';
  end if;

  for v_cash in select * from jsonb_to_recordset(p_cash_boxes) as x(cash_box_id uuid, opening_balance numeric)
  loop
    if v_cash.opening_balance is null then raise exception 'invalid_opening_balance' using errcode = '22023'; end if;
    select * into v_box from public.cash_boxes where id = v_cash.cash_box_id and company_id = v_company for update;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    select v_box.opening_balance + coalesce(sum(amount_delta), 0) into v_effective
      from public.opening_balance_adjustments where cash_box_id = v_box.id;
    if round(v_cash.opening_balance, 4) <> v_effective then
      if not exists (select 1 from public.receipts where cash_box_id = v_box.id and deleted_at is null)
         and not exists (select 1 from public.opening_balance_adjustments where cash_box_id = v_box.id)
         and not exists (select 1 from public.cash_box_transfers where (source_cash_box_id = v_box.id or destination_cash_box_id = v_box.id) and deleted_at is null) then
        update public.cash_boxes set opening_balance = round(v_cash.opening_balance, 4) where id = v_box.id;
      else
        insert into public.opening_balance_adjustments(company_id, cash_box_id, amount_delta, note)
        values (v_company, v_box.id, round(v_cash.opening_balance, 4) - v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    end if;
  end loop;

  for v_stock in select * from jsonb_to_recordset(p_stock) as x(warehouse_id uuid, item_id uuid, opening_qty numeric, unit_cost numeric)
  loop
    if v_stock.opening_qty is null or v_stock.opening_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
    if v_stock.unit_cost is null or v_stock.unit_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_stock.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = v_stock.warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

    select * into v_open from public.stock_opening_balances
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id for update;

    if not found then
      if v_stock.opening_qty > 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_stock.opening_qty, v_stock.unit_cost);
      else
        insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, v_stock.unit_cost)
        on conflict (warehouse_id, item_id) do nothing;
      end if;
      insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
      values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      continue;
    end if;

    v_delta := round(v_stock.opening_qty, 4) - v_open.opening_qty;

    -- Comprehensive check for any activity: invoices, warehouse transfers, or opening adjustments
    select exists (
      select 1 from public.invoices inv
      join public.invoice_items ii on ii.invoice_id = inv.id and ii.company_id = inv.company_id
      where inv.company_id = v_company
        and inv.warehouse_id = v_stock.warehouse_id
        and ii.item_id = v_stock.item_id
        and inv.deleted_at is null
    ) or exists (
      select 1 from public.warehouse_transfers t
      join public.warehouse_transfer_items ti on ti.transfer_id = t.id and ti.company_id = t.company_id
      where t.company_id = v_company
        and v_stock.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
        and ti.item_id = v_stock.item_id
        and t.deleted_at is null
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = v_company
        and a.warehouse_id = v_stock.warehouse_id
        and a.item_id = v_stock.item_id
    ) into v_has_activity;

    if v_has_activity then
      if round(v_stock.unit_cost, 4) <> v_open.unit_cost then
        raise exception 'opening_stock_cost_locked' using errcode = '22023';
      end if;
      if v_delta <> 0 then
        select public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, null) into v_effective;
        update public.stock_opening_balances set opening_qty = round(v_stock.opening_qty, 4)
          where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
        insert into public.stock_opening_adjustments(company_id, warehouse_id, item_id, quantity_delta, unit_cost, note)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    else
      -- Only update item_stock directly if there is truly no activity
      if v_delta <> 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_stock.unit_cost);
      end if;
      update public.stock_opening_balances
      set opening_qty = round(v_stock.opening_qty, 4),
          unit_cost = round(v_stock.unit_cost, 4)
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_opening_balances(jsonb, jsonb) from public, anon;
grant execute on function public.save_opening_balances(jsonb, jsonb) to authenticated;

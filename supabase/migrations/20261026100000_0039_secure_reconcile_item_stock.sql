-- Keep the reconciliation implementation available to migrations while exposing
-- only a tenant-scoped RPC to authenticated users.
create or replace function public.reconcile_item_stock_internal(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_company_id is null then
    raise exception 'invalid_company' using errcode = '22023';
  end if;

  with target_items as (
    select i.company_id, i.id as item_id, w.id as warehouse_id
    from public.items i
    cross join public.warehouses w
    where i.company_id = p_company_id
      and w.company_id = p_company_id
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
          select sum(case
            when inv.kind in ('purchase', 'sale_return') then ii.qty
            when inv.kind in ('sale', 'purchase_return', 'waste') then -ii.qty
            else 0
          end)
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.deleted_at is null
        ), 0) +
        coalesce((
          select sum(case
            when t.destination_warehouse_id = ti.warehouse_id then tri.qty
            when t.source_warehouse_id = ti.warehouse_id then -tri.qty
            else 0
          end)
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

create or replace function public.reconcile_item_stock(p_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_company_id is not null and p_company_id is distinct from v_company_id then
    raise exception 'unauthorized_company' using errcode = '42501';
  end if;

  return public.reconcile_item_stock_internal(v_company_id);
end;
$$;

revoke all on function public.reconcile_item_stock_internal(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_item_stock(uuid) from public, anon;
grant execute on function public.reconcile_item_stock(uuid) to authenticated;

-- Migrations run without a request JWT, so they use the unexposed internal path.
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_item_stock_internal(r.id);
  end loop;
end;
$$;

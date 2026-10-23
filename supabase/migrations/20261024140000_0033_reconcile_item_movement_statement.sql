-- Reconcile the statement to current stock while retaining every dated source
-- movement. Opening balance rows may have been created after invoices, and
-- migrated opening rows may already contain pre-migration stock movements.
create or replace function public.get_item_movement_statement(
  p_item_id uuid,
  p_warehouse_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  invoice_number text,
  transfer_number text,
  incoming numeric(18,4),
  outgoing numeric(18,4),
  running_balance numeric(18,4),
  total_incoming numeric(18,4),
  total_outgoing numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.items i
    join public.warehouses w on w.company_id = i.company_id
    where i.id = p_item_id and w.id = p_warehouse_id
      and i.company_id = public.current_company_id()
  ) then
    raise exception 'invalid_item_statement_target' using errcode = '22023';
  end if;

  return query
  with movements as (
    select inv.invoice_date as movement_date,
      1 as movement_order,
      inv.created_at as movement_at,
      (case inv.kind
        when 'purchase' then 'مشتريات '
        when 'sale' then 'مبيعات '
        when 'sale_return' then 'مرتجع مبيعات '
        when 'purchase_return' then 'مرتجع مشتريات '
        when 'waste' then 'هالك '
        else 'فاتورة '
      end || inv.number || ' - ' || coalesce(nullif(btrim(a.name), ''), ''))::text as movement_description,
      inv.number as movement_invoice_number,
      null::text as movement_transfer_number,
      (case when inv.kind in ('purchase', 'sale_return') then ii.qty else -ii.qty end)::numeric(18,4) as quantity_delta
    from public.invoices inv
    join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
    join public.accounts a on a.company_id = inv.company_id and a.id = inv.account_id
    where inv.company_id = public.current_company_id()
      and inv.warehouse_id = p_warehouse_id
      and ii.item_id = p_item_id
      and inv.deleted_at is null

    union all

    select t.transfer_date,
      2,
      t.created_at,
      'تحويل مخزني ' || t.number || ' - ' ||
        case when t.source_warehouse_id = p_warehouse_id then 'إلى ' || destination.name
             else 'من ' || source.name end,
      null::text,
      t.number,
      (case when t.destination_warehouse_id = p_warehouse_id then ti.qty else -ti.qty end)::numeric(18,4)
    from public.warehouse_transfers t
    join public.warehouse_transfer_items ti on ti.company_id = t.company_id and ti.transfer_id = t.id
    join public.warehouses source on source.company_id = t.company_id and source.id = t.source_warehouse_id
    join public.warehouses destination on destination.company_id = t.company_id and destination.id = t.destination_warehouse_id
    where t.company_id = public.current_company_id()
      and p_warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
      and ti.item_id = p_item_id
      and t.deleted_at is null

    union all

    select adj.created_at::date,
      0,
      adj.created_at,
      coalesce(nullif(btrim(adj.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      adj.quantity_delta::numeric(18,4)
    from public.stock_opening_adjustments adj
    where adj.company_id = public.current_company_id()
      and adj.item_id = p_item_id and adj.warehouse_id = p_warehouse_id
  ),
  base_opening as (
    select (coalesce(
      (select s.qty from public.item_stock s
       where s.company_id = public.current_company_id()
         and s.item_id = p_item_id and s.warehouse_id = p_warehouse_id),
      (select o.opening_qty from public.stock_opening_balances o
       where o.company_id = public.current_company_id()
         and o.item_id = p_item_id and o.warehouse_id = p_warehouse_id),
      0
    ) - coalesce((select sum(m.quantity_delta) from movements m), 0))::numeric(18,4) as quantity
  ),
  opening as (
    select (b.quantity + coalesce(sum(m.quantity_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from base_opening b
    left join movements m on true
    group by b.quantity
  ),
  period_movements as (
    select m.* from movements m where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when m.quantity_delta > 0 then m.quantity_delta else 0 end), 0)::numeric(18,4) as incoming,
      coalesce(sum(case when m.quantity_delta < 0 then abs(m.quantity_delta) else 0 end), 0)::numeric(18,4) as outgoing
    from period_movements m
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_invoice_number, null::text as movement_transfer_number,
      0::numeric(18,4) as quantity_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_invoice_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_transfer_number, m.quantity_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then greatest(s.displayed_balance, 0)
           else greatest(s.quantity_delta, 0) end::numeric(18,4) as incoming_amount,
      case when s.kind = 'opening' then greatest(-s.displayed_balance, 0)
           else greatest(-s.quantity_delta, 0) end::numeric(18,4) as outgoing_amount,
      (o.amount + sum(s.quantity_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join opening o
  )
  select c.kind, c.movement_date, c.movement_description,
    c.movement_invoice_number, c.movement_transfer_number,
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_item_movement_statement(uuid, uuid, date, date) from public, anon;
grant execute on function public.get_item_movement_statement(uuid, uuid, date, date) to authenticated;

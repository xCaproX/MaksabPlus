create or replace function public.get_cash_box_statement(
  p_cash_box_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  receipt_number text,
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
    select 1 from public.cash_boxes cb
    where cb.id = p_cash_box_id and cb.company_id = public.current_company_id()
  ) then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;

  return query
  with cash_box as (
    select cb.id, cb.opening_balance
    from public.cash_boxes cb
    where cb.id = p_cash_box_id and cb.company_id = public.current_company_id()
  ),
  movements as (
    select r.receipt_date as movement_date,
      1 as movement_order,
      r.created_at as movement_at,
      (case r.direction when 'in' then 'استلام ' else 'صرف ' end) || r.number || ' - ' ||
        coalesce(nullif(btrim(a.name), ''), nullif(btrim(r.description), ''), 'إيصال حر') as movement_description,
      r.number as movement_receipt_number,
      null::text as movement_transfer_number,
      (case r.direction when 'in' then r.amount else -r.amount end)::numeric(18,4) as balance_delta
    from public.receipts r
    join public.accounts a on a.id = r.account_id and a.company_id = r.company_id
    where r.company_id = public.current_company_id()
      and r.cash_box_id = p_cash_box_id
      and r.deleted_at is null

    union all

    select t.transfer_date,
      2,
      t.created_at,
      'تحويل بين الخزن ' || t.number || ' - ' ||
        case when t.source_cash_box_id = p_cash_box_id then 'إلى ' || destination.name
             else 'من ' || source.name end,
      null::text,
      t.number,
      (case when t.destination_cash_box_id = p_cash_box_id then t.amount else -t.amount end)::numeric(18,4)
    from public.cash_box_transfers t
    join public.cash_boxes source on source.id = t.source_cash_box_id and source.company_id = t.company_id
    join public.cash_boxes destination on destination.id = t.destination_cash_box_id and destination.company_id = t.company_id
    where t.company_id = public.current_company_id()
      and p_cash_box_id in (t.source_cash_box_id, t.destination_cash_box_id)
      and t.deleted_at is null

    union all

    select a.created_at::date,
      0,
      a.created_at,
      coalesce(nullif(btrim(a.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      a.amount_delta::numeric(18,4)
    from public.opening_balance_adjustments a
    where a.company_id = public.current_company_id()
      and a.cash_box_id = p_cash_box_id
  ),
  opening as (
    select (cb.opening_balance + coalesce(sum(m.balance_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from cash_box cb
    left join movements m on true
    group by cb.opening_balance
  ),
  period_movements as (
    select m.* from movements m where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when m.balance_delta > 0 then m.balance_delta else 0 end), 0)::numeric(18,4) as incoming,
      coalesce(sum(case when m.balance_delta < 0 then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as outgoing
    from period_movements m
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_receipt_number, null::text as movement_transfer_number,
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_receipt_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_receipt_number, m.movement_transfer_number, m.balance_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then greatest(s.displayed_balance, 0)
           else greatest(s.balance_delta, 0) end::numeric(18,4) as incoming_amount,
      case when s.kind = 'opening' then greatest(-s.displayed_balance, 0)
           else greatest(-s.balance_delta, 0) end::numeric(18,4) as outgoing_amount,
      (o.amount + sum(s.balance_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join opening o
  )
  select c.kind, c.movement_date, c.movement_description,
    c.movement_receipt_number, c.movement_transfer_number,
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_cash_box_statement(uuid, date, date) from public, anon;
grant execute on function public.get_cash_box_statement(uuid, date, date) to authenticated;

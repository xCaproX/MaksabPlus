create or replace function public.get_account_statement(
  p_account_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  invoice_number text,
  receipt_number text,
  debit numeric(18,4),
  credit numeric(18,4),
  running_balance numeric(18,4),
  total_debit numeric(18,4),
  total_credit numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_kind text;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;

  select a.kind into v_account_kind
  from public.accounts a
  where a.id = p_account_id
    and a.company_id = public.current_company_id()
    and a.system_key is null;

  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;

  return query
  with account_row as (
    select a.id, a.kind, a.opening_balance
    from public.accounts a
    where a.id = p_account_id and a.company_id = public.current_company_id()
  ),
  movements as (
    select i.invoice_date as movement_date,
      1 as movement_order,
      i.created_at as movement_at,
      case i.kind
        when 'sale' then 'مبيعات '
        when 'purchase' then 'مشتريات '
        when 'sale_return' then 'مرتجع مبيعات '
        when 'purchase_return' then 'مرتجع مشتريات '
        when 'waste' then 'هالك '
        else 'فاتورة '
      end || i.number as movement_description,
      i.number as movement_invoice_number,
      null::text as movement_receipt_number,
      (case when i.kind in ('sale', 'purchase') then i.total else -i.total end)::numeric(18,4) as balance_delta
    from public.invoices i
    where i.company_id = public.current_company_id()
      and i.account_id = p_account_id
      and i.deleted_at is null

    union all

    select r.receipt_date,
      2,
      r.created_at,
      (case r.direction when 'in' then 'استلام ' else 'صرف ' end) || r.number || ' - ' ||
        case when i.id is not null then
          case i.kind
            when 'sale' then 'مبيعات '
            when 'purchase' then 'مشتريات '
            when 'sale_return' then 'مرتجع مبيعات '
            when 'purchase_return' then 'مرتجع مشتريات '
            when 'waste' then 'هالك '
            else 'فاتورة '
          end || i.number
        else coalesce(nullif(btrim(r.description), ''), 'إيصال حر') end,
      i.number,
      r.number,
      (case
        when r.invoice_id is not null and i.kind in ('sale', 'purchase') then -r.amount
        when r.invoice_id is not null then r.amount
        when (a.kind = 'customer' and r.direction = 'in')
          or (a.kind = 'supplier' and r.direction = 'out') then -r.amount
        else r.amount
      end)::numeric(18,4)
    from public.receipts r
    join account_row a on a.id = r.account_id
    left join public.invoices i on i.id = r.invoice_id and i.company_id = r.company_id
    where r.company_id = public.current_company_id()
      and r.account_id = p_account_id
      and r.deleted_at is null

    union all

    select x.created_at::date,
      0,
      x.created_at,
      coalesce(nullif(btrim(x.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      x.amount_delta::numeric(18,4)
    from public.opening_balance_adjustments x
    where x.company_id = public.current_company_id()
      and x.account_id = p_account_id
  ),
  opening as (
    select (a.opening_balance + coalesce(sum(m.balance_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from account_row a
    left join movements m on true
    group by a.opening_balance
  ),
  period_movements as (
    select m.*
    from movements m
    where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when (a.kind = 'customer' and m.balance_delta > 0)
                         or (a.kind = 'supplier' and m.balance_delta < 0)
                        then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as debit,
      coalesce(sum(case when (a.kind = 'customer' and m.balance_delta < 0)
                         or (a.kind = 'supplier' and m.balance_delta > 0)
                        then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as credit
    from account_row a
    left join period_movements m on true
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_invoice_number, null::text as movement_receipt_number,
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at, m.movement_invoice_number nulls last, m.movement_receipt_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_receipt_number, m.balance_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then
        case when (a.kind = 'customer' and s.displayed_balance > 0)
                  or (a.kind = 'supplier' and s.displayed_balance < 0)
             then abs(s.displayed_balance) else 0 end
        else case when (a.kind = 'customer' and s.balance_delta > 0)
                       or (a.kind = 'supplier' and s.balance_delta < 0)
                  then abs(s.balance_delta) else 0 end
      end::numeric(18,4) as debit_amount,
      case when s.kind = 'opening' then
        case when (a.kind = 'customer' and s.displayed_balance < 0)
                  or (a.kind = 'supplier' and s.displayed_balance > 0)
             then abs(s.displayed_balance) else 0 end
        else case when (a.kind = 'customer' and s.balance_delta < 0)
                       or (a.kind = 'supplier' and s.balance_delta > 0)
                  then abs(s.balance_delta) else 0 end
      end::numeric(18,4) as credit_amount,
      (o.amount + sum(s.balance_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join account_row a
    cross join opening o
  )
  select c.kind, c.movement_date, c.movement_description,
    c.movement_invoice_number, c.movement_receipt_number,
    c.debit_amount, c.credit_amount, c.balance_amount, t.debit, t.credit
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_account_statement(uuid, date, date) from public, anon;
grant execute on function public.get_account_statement(uuid, date, date) to authenticated;

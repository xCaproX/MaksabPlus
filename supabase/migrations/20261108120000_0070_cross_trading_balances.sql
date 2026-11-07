-- =====================================================================
-- 0070_cross_trading_balances.sql
-- تصحيح المعادلة المحاسبية المركزية لحساب الأرصدة اللحظية التراكمية وكشوف الحسابات
-- عند البيع لمورد أو الشراء من عميل (Cross-Trading):
--   1. العميل (Customer): فواتير البيع ومرتجع الشراء تزيد المديونية (+)،
--      وفواتير الشراء ومرتجع البيع تخفض المديونية بالمقاصة (-).
--   2. المورد (Supplier): فواتير الشراء ومرتجع البيع تزيد المستحقات (+)،
--      وفواتير البيع ومرتجع الشراء تخفض المستحقات بالمقاصة (-).
--   3. الإيصالات المرتبطة بالفواتير تعكس نفس إشارة الفاتورة الأصلية.
-- =====================================================================

-- 1. تحديث دالة مزامنة رصيد الحساب (sync_account_balance)
create or replace function public.sync_account_balance(p_account_id uuid)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_raw_opening numeric(18,4);
  v_adj_amount numeric(18,4);
  v_adj_cnt integer;
  v_inv_total numeric(18,4);
  v_inv_cnt integer;
  v_rec_amount numeric(18,4);
  v_rec_balance_effect numeric(18,4);
  v_rec_cnt integer;
  v_current_bal numeric(18,4);
  v_effective_opening numeric(18,4);
  v_has_docs boolean;
begin
  if p_account_id is null then
    return 0;
  end if;

  select kind, coalesce(opening_balance, 0)
  into v_kind, v_raw_opening
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    return 0;
  end if;

  -- 1. تسويات الرصيد الافتتاحي
  select coalesce(sum(amount_delta), 0), count(*)
  into v_adj_amount, v_adj_cnt
  from public.opening_balance_adjustments
  where account_id = p_account_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  -- 2. الفواتير غير المحذوفة مع مراعاة نوع الحساب ونوع الفاتورة
  if v_kind = 'customer' then
    select
      coalesce(sum(case
        when kind in ('sale', 'purchase_return') then total
        when kind in ('purchase', 'sale_return') then -total
        else 0 end) filter (where deleted_at is null), 0),
      count(*)
    into v_inv_total, v_inv_cnt
    from public.invoices
    where account_id = p_account_id;
  elsif v_kind = 'supplier' then
    select
      coalesce(sum(case
        when kind in ('purchase', 'sale_return') then total
        when kind in ('sale', 'purchase_return') then -total
        else 0 end) filter (where deleted_at is null), 0),
      count(*)
    into v_inv_total, v_inv_cnt
    from public.invoices
    where account_id = p_account_id;
  else
    select 0, count(*)
    into v_inv_total, v_inv_cnt
    from public.invoices
    where account_id = p_account_id;
  end if;

  -- 3. الإيصالات غير المحذوفة مع مراعاة نوع الحساب والارتباط بالفاتورة
  select
    coalesce(sum(r.amount) filter (where r.deleted_at is null), 0),
    coalesce(sum(case
      when r.invoice_id is null then
        case
          when (v_kind = 'customer' and r.direction = 'in')
            or (v_kind = 'supplier' and r.direction = 'out') then r.amount
          else -r.amount
        end
      else
        case
          when (v_kind = 'customer' and i.kind in ('sale', 'purchase_return'))
            or (v_kind = 'supplier' and i.kind in ('purchase', 'sale_return')) then r.amount
          when (v_kind = 'customer' and i.kind in ('purchase', 'sale_return'))
            or (v_kind = 'supplier' and i.kind in ('sale', 'purchase_return')) then -r.amount
          else 0
        end
      end) filter (where r.deleted_at is null), 0),
    count(*)
  into v_rec_amount, v_rec_balance_effect, v_rec_cnt
  from public.receipts r
  left join public.invoices i on i.id = r.invoice_id
  where r.account_id = p_account_id;

  v_current_bal := (v_effective_opening + v_inv_total - v_rec_balance_effect)::numeric(18,4);
  v_has_docs := ((v_inv_cnt + v_rec_cnt) > 0 or v_raw_opening <> 0 or v_adj_cnt > 0);

  perform set_config('maksab.balance_sync', 'true', true);

  update public.accounts
  set
    current_balance = v_current_bal,
    effective_opening_balance = v_effective_opening,
    invoiced_total = v_inv_total::numeric(18,4),
    paid_total = v_rec_amount::numeric(18,4),
    has_documents = v_has_docs
  where id = p_account_id;

  perform set_config('maksab.balance_sync', 'false', true);

  return v_current_bal;
end;
$$;

revoke all on function public.sync_account_balance(uuid) from public, anon, authenticated;

-- 2. تحديث دالة كشف الحساب (get_account_statement)
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
      (case
        when a.kind = 'customer' then
          case
            when i.kind in ('sale', 'purchase_return') then i.total
            when i.kind in ('purchase', 'sale_return') then -i.total
            else 0
          end
        when a.kind = 'supplier' then
          case
            when i.kind in ('purchase', 'sale_return') then i.total
            when i.kind in ('sale', 'purchase_return') then -i.total
            else 0
          end
        else 0
      end)::numeric(18,4) as balance_delta
    from public.invoices i
    join account_row a on a.id = i.account_id
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
      -(case
        when r.invoice_id is not null then
          case
            when (a.kind = 'customer' and i.kind in ('sale', 'purchase_return'))
              or (a.kind = 'supplier' and i.kind in ('purchase', 'sale_return')) then r.amount
            when (a.kind = 'customer' and i.kind in ('purchase', 'sale_return'))
              or (a.kind = 'supplier' and i.kind in ('sale', 'purchase_return')) then -r.amount
            else 0
          end
        else
          case
            when (a.kind = 'customer' and r.direction = 'in')
              or (a.kind = 'supplier' and r.direction = 'out') then r.amount
            else -r.amount
          end
      end)::numeric(18,4) as balance_delta
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
  select c.kind as row_type, c.movement_date as transaction_date, c.movement_description as description,
    c.movement_invoice_number as invoice_number, c.movement_receipt_number as receipt_number,
    c.debit_amount as debit, c.credit_amount as credit, c.balance_amount as running_balance,
    t.debit as total_debit, t.credit as total_credit
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_account_statement(uuid, date, date) from public, anon;
grant execute on function public.get_account_statement(uuid, date, date) to authenticated;

-- 3. إعادة مزامنة أرصدة جميع الحسابات في النظام لتطبيق المعادلة الجديدة
do $$
declare
  r record;
begin
  for r in select id from public.accounts loop
    perform public.sync_account_balance(r.id);
  end loop;
end $$;

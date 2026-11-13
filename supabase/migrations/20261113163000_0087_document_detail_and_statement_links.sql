-- =====================================================================
-- 20261113163000_0087_document_detail_and_statement_links.sql
-- Phase 4 (T-09b):
-- 1. دالة get_document_detail الآمنة لاسترجاع مستند واحد عبر ?doc= مع التحقق الكامل من الشركة والصلاحيات وحالة الحذف وإخفاء التكلفة والربح لغير المصرح لهم.
-- 2. إضافة doc_id و doc_kind إلى دوال كشوف الحساب والخزنة وحركة الصنف لتمكين الانتقال الدقيق من أي سطر كشف.
-- =====================================================================

create or replace function public.get_document_detail(
  p_scope text,
  p_doc_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_inv record;
  v_rcp record;
  v_wtr record;
  v_ctr record;
  v_lines jsonb;
  v_can_profit boolean;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_scope is null or p_scope not in ('invoice', 'receipt', 'warehouse_transfer', 'cash_box_transfer') then
    raise exception 'invalid_document_scope' using errcode = '22023';
  end if;

  if p_doc_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_can_profit := public.can_view_profit();

  if p_scope = 'invoice' then
    select
      i.id,
      i.company_id,
      i.kind,
      i.number,
      i.invoice_date,
      i.account_id,
      a.name as account_name,
      a.kind as account_kind,
      i.warehouse_id,
      w.name as warehouse_name,
      i.subtotal,
      i.total,
      i.paid,
      (i.total - i.paid)::numeric(18,4) as remaining,
      i.notes,
      i.created_at,
      i.updated_at,
      i.deleted_at,
      i.created_by_name,
      r.id as receipt_id,
      r.number as receipt_number,
      r.amount as receipt_amount,
      r.cash_box_id,
      cb.name as cash_box_name
    into v_inv
    from public.invoices i
    join public.accounts a on a.id = i.account_id
    join public.warehouses w on w.id = i.warehouse_id
    left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
    left join public.cash_boxes cb on cb.id = r.cash_box_id
    where i.id = p_doc_id
      and i.company_id = v_company_id
    limit 1;

    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not public.has_permission('goods.' || v_inv.kind || '.view') then
      return jsonb_build_object('status', 'forbidden');
    end if;

    if v_inv.deleted_at is not null and not public.has_permission('goods.' || v_inv.kind || '.delete') then
      return jsonb_build_object('status', 'deleted_forbidden');
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ii.id,
          'invoice_id', ii.invoice_id,
          'item_id', ii.item_id,
          'item_name', it.name,
          'unit', it.unit,
          'qty', ii.qty,
          'unit_price', ii.unit_price,
          'line_total', ii.line_total,
          'unit_cost', case when v_can_profit then ii.unit_cost else null end,
          'line_cost', case when v_can_profit then (ii.qty * ii.unit_cost)::numeric(18,4) else null end,
          'line_profit', case when v_can_profit then (ii.line_total - (ii.qty * ii.unit_cost))::numeric(18,4) else null end
        )
        order by ii.created_at, ii.id
      ),
      '[]'::jsonb
    )
    into v_lines
    from public.invoice_items ii
    join public.items it on it.id = ii.item_id
    where ii.invoice_id = v_inv.id
      and ii.company_id = v_company_id;

    return jsonb_build_object(
      'status', 'ok',
      'doc', jsonb_build_object(
        'id', v_inv.id,
        'created_at', v_inv.created_at,
        'kind', v_inv.kind,
        'number', v_inv.number,
        'invoice_date', v_inv.invoice_date,
        'account_id', v_inv.account_id,
        'account_name', v_inv.account_name,
        'account_kind', v_inv.account_kind,
        'cost_total', case when v_can_profit then public.read_protected_cost('invoice_cost', v_inv.id) else null end,
        'profit_total', case when v_can_profit then public.read_protected_cost('invoice_profit', v_inv.id) else null end,
        'warehouse_id', v_inv.warehouse_id,
        'warehouse_name', v_inv.warehouse_name,
        'subtotal', v_inv.subtotal,
        'total', v_inv.total,
        'paid', v_inv.paid,
        'remaining', v_inv.remaining,
        'notes', v_inv.notes,
        'receipt_id', v_inv.receipt_id,
        'receipt_number', v_inv.receipt_number,
        'receipt_amount', v_inv.receipt_amount,
        'cash_box_id', v_inv.cash_box_id,
        'cash_box_name', v_inv.cash_box_name,
        'deleted_at', v_inv.deleted_at,
        'created_by_name', v_inv.created_by_name
      ),
      'lines', v_lines
    );
  elsif p_scope = 'receipt' then
    select
      r.id,
      r.created_at,
      r.number,
      r.receipt_date,
      r.amount,
      r.notes,
      r.description,
      case
        when r.invoice_id is not null then
          (case when i.kind in ('sale', 'purchase') then 'فاتورة ' else 'مرتجع ' end) || i.number
        else r.description
      end as statement,
      r.account_id,
      a.name as account_name,
      a.kind as account_kind,
      r.cash_box_id,
      cb.name as cash_box_name,
      r.invoice_id,
      i.number as invoice_number,
      i.kind as invoice_kind,
      (r.invoice_id is null) as is_free,
      r.deleted_at,
      r.direction,
      r.created_by_name
    into v_rcp
    from public.receipts r
    join public.accounts a on a.id = r.account_id
    join public.cash_boxes cb on cb.id = r.cash_box_id
    left join public.invoices i on i.id = r.invoice_id
    where r.id = p_doc_id
      and r.company_id = v_company_id
    limit 1;

    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not public.has_permission('money.' || v_rcp.direction || '.view') then
      return jsonb_build_object('status', 'forbidden');
    end if;

    if v_rcp.deleted_at is not null and not public.has_permission('money.' || v_rcp.direction || '.delete') then
      return jsonb_build_object('status', 'deleted_forbidden');
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'doc', to_jsonb(v_rcp)
    );
  elsif p_scope = 'warehouse_transfer' then
    select
      t.id,
      t.created_at,
      t.number,
      t.transfer_date,
      t.source_warehouse_id,
      sw.name as source_warehouse_name,
      t.destination_warehouse_id,
      dw.name as destination_warehouse_name,
      t.notes,
      t.deleted_at,
      t.created_by_name,
      coalesce(lines_agg.line_count, 0)::integer as line_count,
      coalesce(lines_agg.total_qty, 0)::numeric(18,4) as total_qty,
      case when v_can_profit then coalesce(lines_agg.total_value, 0)::numeric(18,4) else null end as total_value,
      coalesce(lines_agg.items_summary, '') as items_summary
    into v_wtr
    from public.warehouse_transfers t
    join public.warehouses sw on sw.id = t.source_warehouse_id
    join public.warehouses dw on dw.id = t.destination_warehouse_id
    left join lateral (
      select
        count(*) as line_count,
        sum(ti.qty) as total_qty,
        sum(ti.qty * ti.unit_cost) as total_value,
        string_agg(it.name || ' × ' || ti.qty::text, '، ' order by it.name) as items_summary
      from public.warehouse_transfer_items ti
      join public.items it on it.id = ti.item_id
      where ti.transfer_id = t.id
    ) lines_agg on true
    where t.id = p_doc_id
      and t.company_id = v_company_id
    limit 1;

    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not public.has_permission('goods.warehouse_transfer.view') then
      return jsonb_build_object('status', 'forbidden');
    end if;

    if v_wtr.deleted_at is not null and not public.has_permission('goods.warehouse_transfer.delete') then
      return jsonb_build_object('status', 'deleted_forbidden');
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', ti.item_id,
          'item_name', it.name,
          'unit', it.unit,
          'qty', ti.qty,
          'unit_cost', case when v_can_profit then ti.unit_cost else null end
        )
        order by ti.item_id, ti.id
      ),
      '[]'::jsonb
    )
    into v_lines
    from public.warehouse_transfer_items ti
    join public.items it on it.id = ti.item_id
    where ti.transfer_id = v_wtr.id
      and ti.company_id = v_company_id;

    return jsonb_build_object(
      'status', 'ok',
      'doc', to_jsonb(v_wtr),
      'lines', v_lines
    );
  else
    -- cash_box_transfer
    select
      t.id,
      t.created_at,
      t.number,
      t.transfer_date,
      t.source_cash_box_id,
      sb.name as source_cash_box_name,
      t.destination_cash_box_id,
      db.name as destination_cash_box_name,
      t.amount,
      t.notes,
      t.deleted_at,
      t.created_by_name
    into v_ctr
    from public.cash_box_transfers t
    join public.cash_boxes sb on sb.id = t.source_cash_box_id
    join public.cash_boxes db on db.id = t.destination_cash_box_id
    where t.id = p_doc_id
      and t.company_id = v_company_id
    limit 1;

    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not public.has_permission('money.cash_box_transfer.view') then
      return jsonb_build_object('status', 'forbidden');
    end if;

    if v_ctr.deleted_at is not null and not public.has_permission('money.cash_box_transfer.delete') then
      return jsonb_build_object('status', 'deleted_forbidden');
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'doc', to_jsonb(v_ctr)
    );
  end if;
end;
$$;

revoke all on function public.get_document_detail(text, uuid) from public, anon;
grant execute on function public.get_document_detail(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- توسيع دوال الكشوف بإرجاع doc_id و doc_kind
-- ---------------------------------------------------------------------

drop function if exists public.get_account_statement(uuid, date, date);
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
  total_credit numeric(18,4),
  doc_id uuid,
  doc_kind text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_kind text;
  v_subtab text;
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

  v_subtab := case when v_account_kind = 'customer' then 'customers' else 'suppliers' end;
  if not (public.has_permission('balances.' || v_subtab || '.view') or public.has_permission('data.' || v_subtab || '.view')) then
    raise exception 'permission_denied' using errcode = '42501';
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
      i.id as movement_doc_id,
      i.kind::text as movement_doc_kind,
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
      r.id as movement_doc_id,
      r.direction::text as movement_doc_kind,
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

    select (x.created_at at time zone 'Africa/Cairo')::date,
      0,
      x.created_at,
      coalesce(nullif(btrim(x.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      null::uuid as movement_doc_id,
      null::text as movement_doc_kind,
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
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance,
      null::uuid as movement_doc_id, null::text as movement_doc_kind
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at, m.movement_invoice_number nulls last, m.movement_receipt_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_receipt_number, m.balance_delta, null::numeric(18,4),
      m.movement_doc_id, m.movement_doc_kind
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
    t.debit as total_debit, t.credit as total_credit,
    c.movement_doc_id as doc_id, c.movement_doc_kind as doc_kind
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_account_statement(uuid, date, date) from public, anon;
grant execute on function public.get_account_statement(uuid, date, date) to authenticated;

drop function if exists public.get_cash_box_statement(uuid, date, date);
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
  total_outgoing numeric(18,4),
  doc_id uuid,
  doc_kind text
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

  if not (public.has_permission('balances.cashBoxes.view') or public.has_permission('data.cashBoxes.view')) then
    raise exception 'permission_denied' using errcode = '42501';
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
      r.id as movement_doc_id,
      r.direction::text as movement_doc_kind,
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
      t.id as movement_doc_id,
      'cash_box_transfer'::text as movement_doc_kind,
      (case when t.destination_cash_box_id = p_cash_box_id then t.amount else -t.amount end)::numeric(18,4)
    from public.cash_box_transfers t
    join public.cash_boxes source on source.id = t.source_cash_box_id and source.company_id = t.company_id
    join public.cash_boxes destination on destination.id = t.destination_cash_box_id and destination.company_id = t.company_id
    where t.company_id = public.current_company_id()
      and p_cash_box_id in (t.source_cash_box_id, t.destination_cash_box_id)
      and t.deleted_at is null

    union all

    select (a.created_at at time zone 'Africa/Cairo')::date,
      0,
      a.created_at,
      coalesce(nullif(btrim(a.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      null::uuid as movement_doc_id,
      null::text as movement_doc_kind,
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
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance,
      null::uuid as movement_doc_id, null::text as movement_doc_kind
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_receipt_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_receipt_number, m.movement_transfer_number, m.balance_delta, null::numeric(18,4),
      m.movement_doc_id, m.movement_doc_kind
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
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing,
    c.movement_doc_id as doc_id, c.movement_doc_kind as doc_kind
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_cash_box_statement(uuid, date, date) from public, anon;
grant execute on function public.get_cash_box_statement(uuid, date, date) to authenticated;

drop function if exists public.get_item_movement_statement(uuid, uuid, date, date);
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
  total_outgoing numeric(18,4),
  doc_id uuid,
  doc_kind text
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

  if not (public.has_permission('balances.items.view') or public.has_permission('data.items.view')) then
    raise exception 'permission_denied' using errcode = '42501';
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
      inv.id as movement_doc_id,
      inv.kind::text as movement_doc_kind,
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
      t.id as movement_doc_id,
      'warehouse_transfer'::text as movement_doc_kind,
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

    select (adj.created_at at time zone 'Africa/Cairo')::date,
      0,
      adj.created_at,
      coalesce(nullif(btrim(adj.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      null::uuid as movement_doc_id,
      null::text as movement_doc_kind,
      adj.quantity_delta::numeric(18,4)
    from public.stock_opening_adjustments adj
    where adj.company_id = public.current_company_id()
      and adj.item_id = p_item_id and adj.warehouse_id = p_warehouse_id
  ),
  base_opening as (
    select coalesce(
      (select o.opening_qty from public.stock_opening_balances o
       where o.company_id = public.current_company_id()
         and o.item_id = p_item_id and o.warehouse_id = p_warehouse_id),
      0
    )::numeric(18,4) as quantity
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
      0::numeric(18,4) as quantity_delta, o.amount as displayed_balance,
      null::uuid as movement_doc_id, null::text as movement_doc_kind
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_invoice_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_transfer_number, m.quantity_delta, null::numeric(18,4),
      m.movement_doc_id, m.movement_doc_kind
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
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing,
    c.movement_doc_id as doc_id, c.movement_doc_kind as doc_kind
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_item_movement_statement(uuid, uuid, date, date) from public, anon;
grant execute on function public.get_item_movement_statement(uuid, uuid, date, date) to authenticated;

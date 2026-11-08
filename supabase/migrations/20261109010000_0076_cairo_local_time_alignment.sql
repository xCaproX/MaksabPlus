-- =====================================================================
-- 20261109010000_0076_cairo_local_time_alignment.sql
-- توحيد التاريخ المحلي في كافة دوال وإحصائيات وجداول النظام ليعتمد توقيت مصر (Africa/Cairo)
-- =====================================================================

-- 1) دالة مساعدة مستقرة لاسترجاع تاريخ اليوم المحلي في مصر
create or replace function public.cairo_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Africa/Cairo')::date;
$$;

revoke all on function public.cairo_today() from public, anon;
grant execute on function public.cairo_today() to authenticated;

-- 2) تعديل القيم الافتراضية للجداول لتعتمد تاريخ مصر
alter table public.invoices alter column invoice_date set default public.cairo_today();
alter table public.receipts alter column receipt_date set default public.cairo_today();
alter table public.warehouse_transfers alter column transfer_date set default public.cairo_today();
alter table public.cash_box_transfers alter column transfer_date set default public.cairo_today();

-- 3) تحديث دالة ملخص لوحة التحكم الرئيسية (get_home_dashboard_summary)
create or replace function public.get_home_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_cairo_today date := public.cairo_today();

  v_can_view_sales boolean := false;
  v_can_view_collections boolean := false;
  v_can_view_cash boolean := false;
  v_can_view_customers boolean := false;
  v_can_view_suppliers boolean := false;
  v_can_view_items boolean := false;

  v_today_sales numeric(18,4) := 0;
  v_today_count integer := 0;
  v_yesterday_sales numeric(18,4) := 0;
  v_yesterday_count integer := 0;
  v_week_sales numeric(18,4) := 0;
  v_month_sales numeric(18,4) := 0;
  v_week_count integer := 0;
  v_month_count integer := 0;

  v_today_collections numeric(18,4) := 0;
  v_today_collections_count integer := 0;
  v_yesterday_collections numeric(18,4) := 0;
  v_yesterday_collections_count integer := 0;

  v_cash_balance numeric(18,4) := 0;
  v_receivables_balance numeric(18,4) := 0;
  v_payables_balance numeric(18,4) := 0;

  v_top_items jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
  v_low_stock_items jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- فحص الصلاحيات
  v_can_view_sales := (public.has_permission('goods.sale.view') or public.has_permission('goods.view') or public.is_company_owner());
  v_can_view_collections := (public.has_permission('money.in.view') or public.has_permission('money.view') or public.is_company_owner());
  v_can_view_cash := (public.has_permission('money.view') or public.has_permission('balances.cashBoxes.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_customers := (public.has_permission('balances.customers.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_suppliers := (public.has_permission('balances.suppliers.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_items := (public.has_permission('balances.items.view') or public.has_permission('balances.view') or public.has_permission('goods.view') or public.is_company_owner());

  -- 1) مؤشرات المبيعات (اليوم وأمس وآخر 7 و 30 يوماً بتوقيت مصر مع عدد الفواتير)
  if v_can_view_sales then
    select
      coalesce(sum(case when kind = 'sale' and invoice_date = v_cairo_today then total when kind = 'sale_return' and invoice_date = v_cairo_today then -total else 0 end), 0)::numeric(18,4),
      count(case when kind = 'sale' and invoice_date = v_cairo_today then 1 end)::int,
      coalesce(sum(case when kind = 'sale' and invoice_date = v_cairo_today - 1 then total when kind = 'sale_return' and invoice_date = v_cairo_today - 1 then -total else 0 end), 0)::numeric(18,4),
      count(case when kind = 'sale' and invoice_date = v_cairo_today - 1 then 1 end)::int,
      coalesce(sum(case when kind = 'sale' and invoice_date >= v_cairo_today - interval '6 days' then total when kind = 'sale_return' and invoice_date >= v_cairo_today - interval '6 days' then -total else 0 end), 0)::numeric(18,4),
      coalesce(sum(case when kind = 'sale' and invoice_date >= v_cairo_today - interval '29 days' then total when kind = 'sale_return' and invoice_date >= v_cairo_today - interval '29 days' then -total else 0 end), 0)::numeric(18,4),
      count(*) filter (where kind = 'sale' and invoice_date >= v_cairo_today - 6)::int,
      count(*) filter (where kind = 'sale')::int
    into v_today_sales, v_today_count, v_yesterday_sales, v_yesterday_count, v_week_sales, v_month_sales, v_week_count, v_month_count
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and kind in ('sale', 'sale_return')
      and invoice_date >= v_cairo_today - interval '29 days';

    -- قائمة الأصناف الأكثر مبيعاً في آخر 30 يوماً
    select coalesce(jsonb_agg(item_row), '[]'::jsonb)
    into v_top_items
    from (
      select
        i.id as item_id,
        i.name as item_name,
        i.unit,
        coalesce(sum(ii.qty), 0)::numeric(18,4) as total_qty,
        coalesce(sum(ii.line_total), 0)::numeric(18,4) as total_amount
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id
      join public.items i on i.id = ii.item_id and i.company_id = v_company_id
      where inv.company_id = v_company_id
        and ii.company_id = v_company_id
        and inv.kind = 'sale'
        and inv.deleted_at is null
        and inv.invoice_date >= v_cairo_today - interval '29 days'
      group by i.id, i.name, i.unit
      order by total_qty desc
      limit 5
    ) item_row;

    -- قائمة كبار العملاء في آخر 30 يوماً
    select coalesce(jsonb_agg(cust_row), '[]'::jsonb)
    into v_top_customers
    from (
      select
        a.id as account_id,
        a.name as account_name,
        coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0)::numeric(18,4) as total_amount,
        count(case when inv.kind = 'sale' then 1 end)::int as invoice_count
      from public.invoices inv
      join public.accounts a on a.id = inv.account_id and a.company_id = v_company_id
      where inv.company_id = v_company_id
        and inv.deleted_at is null
        and inv.kind in ('sale', 'sale_return')
        and inv.invoice_date >= v_cairo_today - interval '29 days'
      group by a.id, a.name
      having coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0) > 0
      order by total_amount desc
      limit 5
    ) cust_row;
  end if;

  -- 2) مؤشرات التحصيلات (المقبوضات النقدية في اليوم وأمس بتوقيت مصر)
  if v_can_view_collections then
    select
      coalesce(sum(case when receipt_date = v_cairo_today then amount else 0 end), 0)::numeric(18,4),
      count(case when receipt_date = v_cairo_today then 1 end)::int,
      coalesce(sum(case when receipt_date = v_cairo_today - 1 then amount else 0 end), 0)::numeric(18,4),
      count(case when receipt_date = v_cairo_today - 1 then 1 end)::int
    into v_today_collections, v_today_collections_count, v_yesterday_collections, v_yesterday_collections_count
    from public.receipts
    where company_id = v_company_id
      and deleted_at is null
      and direction = 'in'
      and receipt_date >= v_cairo_today - 1;
  end if;

  -- 3) السيولة النقدية في الخزن
  if v_can_view_cash then
    select coalesce(sum(current_balance), 0)::numeric(18,4)
    into v_cash_balance
    from public.cash_boxes
    where company_id = v_company_id
      and is_active = true;
  end if;

  -- 4) فلوسنا في السوق (مديونيات العملاء)
  if v_can_view_customers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_receivables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'customer'
      and is_active = true;
  end if;

  -- 5) ديون الموردين (التزامات الشركة)
  if v_can_view_suppliers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_payables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'supplier'
      and is_active = true;
  end if;

  -- 6) نواقص المخزن (أصناف رصيدها قارب على الانتهاء <= 5)
  if v_can_view_items then
    select coalesce(jsonb_agg(low_row), '[]'::jsonb)
    into v_low_stock_items
    from (
      select
        i.id as item_id,
        i.name as item_name,
        i.unit,
        i.code,
        coalesce(sum(s.qty), 0)::numeric(18,4) as current_qty
      from public.items i
      left join public.item_stock s on s.item_id = i.id and s.company_id = v_company_id
      where i.company_id = v_company_id
        and i.is_active = true
      group by i.id, i.name, i.unit, i.code
      having coalesce(sum(s.qty), 0) <= 5
      order by current_qty asc, i.name asc
      limit 5
    ) low_row;
  end if;

  return jsonb_build_object(
    'sales', case when v_can_view_sales then jsonb_build_object(
      'today', v_today_sales,
      'today_count', v_today_count,
      'yesterday', v_yesterday_sales,
      'yesterday_count', v_yesterday_count,
      'week', v_week_sales,
      'week_count', v_week_count,
      'month', v_month_sales,
      'month_count', v_month_count
    ) else null end,
    'collections', case when v_can_view_collections then jsonb_build_object(
      'today', v_today_collections,
      'today_count', v_today_collections_count,
      'yesterday', v_yesterday_collections,
      'yesterday_count', v_yesterday_collections_count
    ) else null end,
    'cash_balance', case when v_can_view_cash then v_cash_balance else null end,
    'receivables_balance', case when v_can_view_customers then v_receivables_balance else null end,
    'payables_balance', case when v_can_view_suppliers then v_payables_balance else null end,
    'top_items', case when v_can_view_sales then v_top_items else null end,
    'top_customers', case when v_can_view_sales then v_top_customers else null end,
    'low_stock_items', case when v_can_view_items then v_low_stock_items else null end,
    'permissions', jsonb_build_object(
      'can_view_sales', v_can_view_sales,
      'can_view_collections', v_can_view_collections,
      'can_view_cash', v_can_view_cash,
      'can_view_customers', v_can_view_customers,
      'can_view_suppliers', v_can_view_suppliers,
      'can_view_items', v_can_view_items
    )
  );
end;
$$;

revoke all on function public.get_home_dashboard_summary() from public, anon;
grant execute on function public.get_home_dashboard_summary() to authenticated;

-- 4) تحديث دالة الرسوم البيانية وقوائم الأكثر طلباً (get_home_dashboard_charts) بتوقيت مصر
create or replace function public.get_home_dashboard_charts(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_cairo_today date := public.cairo_today();
  v_can_view_sales boolean := false;
  v_can_view_purchases boolean := false;
  v_effective_days integer := coalesce(p_days, 30);
  v_start_date date;
  v_daily_trend jsonb := '[]'::jsonb;
  v_distribution jsonb := null;
  v_top_items jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_effective_days not in (7, 14, 30, 60, 90, 180, 365, 0) then
    v_effective_days := 30;
  end if;

  v_can_view_sales := (public.has_permission('goods.sale.view') or public.has_permission('goods.view') or public.is_company_owner());
  v_can_view_purchases := (public.has_permission('goods.purchase.view') or public.has_permission('goods.view') or public.is_company_owner());

  if not v_can_view_sales and not v_can_view_purchases then
    return jsonb_build_object(
      'daily_trend', '[]'::jsonb,
      'sales_distribution', null,
      'top_items', null,
      'top_customers', null,
      'permissions', jsonb_build_object(
        'can_view_sales', false,
        'can_view_purchases', false
      )
    );
  end if;

  -- تحديد تاريخ البداية بتوقيت مصر
  if v_effective_days = 0 then
    select coalesce(min(invoice_date), v_cairo_today - 29)
    into v_start_date
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and (
        (v_can_view_sales and kind in ('sale', 'sale_return'))
        or (v_can_view_purchases and kind in ('purchase', 'purchase_return'))
      );

    if v_start_date is null or v_start_date > v_cairo_today then
      v_start_date := v_cairo_today - 29;
    end if;
  else
    v_start_date := v_cairo_today - (v_effective_days - 1);
  end if;

  -- 1) التجميع اليومي للمبيعات والمشتريات عبر generate_series حتى تاريخ مصر اليوم
  with days as (
    select generate_series(
      v_start_date,
      v_cairo_today,
      interval '1 day'
    )::date as day_date
  ),
  daily_summary as (
    select
      d.day_date,
      case when v_can_view_sales then
        coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0)::numeric(18,4)
      else null end as sales,
      case when v_can_view_sales then
        count(case when inv.kind = 'sale' then 1 end)::int
      else null end as sales_count,
      case when v_can_view_purchases then
        coalesce(sum(case when inv.kind = 'purchase' then inv.total when inv.kind = 'purchase_return' then -inv.total else 0 end), 0)::numeric(18,4)
      else null end as purchases,
      case when v_can_view_purchases then
        count(case when inv.kind = 'purchase' then 1 end)::int
      else null end as purchases_count
    from days d
    left join public.invoices inv
      on inv.company_id = v_company_id
      and inv.deleted_at is null
      and inv.invoice_date = d.day_date
      and (
        (v_can_view_sales and kind in ('sale', 'sale_return'))
        or (v_can_view_purchases and kind in ('purchase', 'purchase_return'))
      )
    group by d.day_date
    order by d.day_date asc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(day_date, 'YYYY-MM-DD'),
      'sales', sales,
      'sales_count', sales_count,
      'purchases', purchases,
      'purchases_count', purchases_count
    )
  ), '[]'::jsonb)
  into v_daily_trend
  from daily_summary;

  -- 2) توزيع المبيعات (نقدي مقابل آجل والمرتجعات) خلال الفترة
  if v_can_view_sales then
    select jsonb_build_object(
      'cash_sales', coalesce(sum(case when kind = 'sale' then paid else 0 end), 0)::numeric(18,4),
      'credit_sales', coalesce(sum(case when kind = 'sale' then (total - paid) else 0 end), 0)::numeric(18,4),
      'returns_total', coalesce(sum(case when kind = 'sale_return' then total else 0 end), 0)::numeric(18,4),
      'cash_count', count(case when kind = 'sale' and paid > 0 and paid = total then 1 end)::int,
      'partial_count', count(case when kind = 'sale' and paid > 0 and paid < total then 1 end)::int,
      'credit_count', count(case when kind = 'sale' and paid = 0 then 1 end)::int,
      'returns_count', count(case when kind = 'sale_return' then 1 end)::int
    )
    into v_distribution
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and kind in ('sale', 'sale_return')
      and invoice_date >= v_start_date;

    -- 3) قائمة الأصناف الأكثر مبيعاً خلال الفترة (حتى 10 أصناف)
    select coalesce(jsonb_agg(item_row), '[]'::jsonb)
    into v_top_items
    from (
      select
        i.id as item_id,
        i.name as item_name,
        i.unit,
        coalesce(sum(ii.qty), 0)::numeric(18,4) as total_qty,
        coalesce(sum(ii.line_total), 0)::numeric(18,4) as total_amount
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id
      join public.items i on i.id = ii.item_id and i.company_id = v_company_id
      where inv.company_id = v_company_id
        and ii.company_id = v_company_id
        and inv.kind = 'sale'
        and inv.deleted_at is null
        and inv.invoice_date >= v_start_date
      group by i.id, i.name, i.unit
      order by total_qty desc
      limit 10
    ) item_row;

    -- 4) قائمة كبار العملاء خلال الفترة (حتى 10 عملاء)
    select coalesce(jsonb_agg(cust_row), '[]'::jsonb)
    into v_top_customers
    from (
      select
        a.id as account_id,
        a.name as account_name,
        coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0)::numeric(18,4) as total_amount,
        count(case when inv.kind = 'sale' then 1 end)::int as invoice_count
      from public.invoices inv
      join public.accounts a on a.id = inv.account_id and a.company_id = v_company_id
      where inv.company_id = v_company_id
        and inv.deleted_at is null
        and inv.kind in ('sale', 'sale_return')
        and inv.invoice_date >= v_start_date
      group by a.id, a.name
      having coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0) > 0
      order by total_amount desc
      limit 10
    ) cust_row;
  end if;

  return jsonb_build_object(
    'daily_trend', v_daily_trend,
    'sales_distribution', v_distribution,
    'top_items', case when v_can_view_sales then v_top_items else null end,
    'top_customers', case when v_can_view_sales then v_top_customers else null end,
    'permissions', jsonb_build_object(
      'can_view_sales', v_can_view_sales,
      'can_view_purchases', v_can_view_purchases
    )
  );
end;
$$;

revoke all on function public.get_home_dashboard_charts(integer) from public, anon;
grant execute on function public.get_home_dashboard_charts(integer) to authenticated;

-- 5) تحديث دوال إنشاء المستندات لتعتمد تاريخ مصر عند غياب التاريخ الصريح
create or replace function public.create_free_receipt(
  p_account_id uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount numeric,
  p_notes text,
  p_description text,
  p_direction text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_system_key text;
begin
  perform public.require_permission('money.' || p_direction || '.create');
  perform public.require_permission('money.create');

  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if v_system_key in ('cash_customer', 'cash_supplier') then
    raise exception 'invalid_free_receipt_account' using errcode = '22023';
  end if;

  perform 1 from public.cash_boxes where id = p_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  insert into public.receipts
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, notes, description, direction)
  values
    (v_company, null,
     public.next_document_number(v_company, case p_direction when 'in' then 'receipt_in' else 'receipt_out' end),
     coalesce(p_receipt_date, public.cairo_today()), p_account_id, p_cash_box_id, p_amount, p_notes, p_description, p_direction)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) to authenticated;

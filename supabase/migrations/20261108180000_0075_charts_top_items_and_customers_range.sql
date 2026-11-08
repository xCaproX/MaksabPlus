-- =====================================================================
-- 20261108180000_0075_charts_top_items_and_customers_range.sql
-- إضافة قوائم كبار العملاء والأصناف الأكثر مبيعاً (حتى 10 عناصر) مرتبطة بفترة الفلتر
-- =====================================================================

create or replace function public.get_home_dashboard_charts(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
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

  -- السماح بالفترات: 7 (أسبوع), 14, 30 (شهر), 60, 90 (3 أشهر), 180 (6 أشهر), 365 (سنة), 0 (طول الوقت)
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

  -- تحديد تاريخ البداية
  if v_effective_days = 0 then
    -- طول الوقت: من تاريخ أول فاتورة مبيعات/مشتريات مسجلة للشركة حتى اليوم
    select coalesce(min(invoice_date), current_date - 29)
    into v_start_date
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and (
        (v_can_view_sales and kind in ('sale', 'sale_return'))
        or (v_can_view_purchases and kind in ('purchase', 'purchase_return'))
      );

    if v_start_date is null or v_start_date > current_date then
      v_start_date := current_date - 29;
    end if;
  else
    v_start_date := current_date - (v_effective_days - 1);
  end if;

  -- 1) التجميع اليومي للمبيعات والمشتريات عبر generate_series
  with days as (
    select generate_series(
      v_start_date,
      current_date,
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

-- =====================================================================
-- 20261108130000_0071_home_dashboard_charts.sql
-- دالة تجميع بيانات الرسوم البيانية للوحة التحكم (المبيعات، المشتريات، التوزيع)
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
  v_daily_trend jsonb := '[]'::jsonb;
  v_distribution jsonb := null;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_effective_days not in (7, 14, 30, 60, 90) then
    v_effective_days := 30;
  end if;

  v_can_view_sales := (public.has_permission('goods.sale.view') or public.has_permission('goods.view') or public.is_company_owner());
  v_can_view_purchases := (public.has_permission('goods.purchase.view') or public.has_permission('goods.view') or public.is_company_owner());

  if not v_can_view_sales and not v_can_view_purchases then
    return jsonb_build_object(
      'daily_trend', '[]'::jsonb,
      'sales_distribution', null,
      'permissions', jsonb_build_object(
        'can_view_sales', false,
        'can_view_purchases', false
      )
    );
  end if;

  -- 1) التجميع اليومي للمبيعات والمشتريات عبر generate_series
  with days as (
    select generate_series(
      current_date - (v_effective_days - 1),
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
        (v_can_view_sales and inv.kind in ('sale', 'sale_return'))
        or (v_can_view_purchases and inv.kind in ('purchase', 'purchase_return'))
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
      and invoice_date >= current_date - (v_effective_days - 1);
  end if;

  return jsonb_build_object(
    'daily_trend', v_daily_trend,
    'sales_distribution', v_distribution,
    'permissions', jsonb_build_object(
      'can_view_sales', v_can_view_sales,
      'can_view_purchases', v_can_view_purchases
    )
  );
end;
$$;

revoke all on function public.get_home_dashboard_charts(integer) from public, anon;
grant execute on function public.get_home_dashboard_charts(integer) to authenticated;

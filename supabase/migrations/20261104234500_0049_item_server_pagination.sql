-- =====================================================================
-- 0049_item_server_pagination.sql
-- فهارس تصفح الأصناف بالصفحات (Server-Side Pagination)
-- وعرض خفيف لأرصدة مخازن الأصناف دون استعلامات التكلفة المقفولة المعقدة
-- ودوال تجميعية لحساب مؤشرات المخزون والأصناف على السيرفر
-- =====================================================================

-- 1. فهارس تصفح وترتيب الأصناف
create index if not exists items_paged_name_idx
  on public.items (company_id, name);

create index if not exists items_paged_serial_idx
  on public.items (company_id, serial_number desc);

create index if not exists items_paged_price_idx
  on public.items (company_id, sale_price desc);

create index if not exists items_search_active_code_idx
  on public.items (company_id, code)
  where (is_active is true);

-- 2. عرض خفيف وسريع لأرصدة الأصناف بالمخازن (v_warehouse_items)
-- يلغي فحص EXISTS المكلف على كامل جدول الفواتير التاريخية
create or replace view public.v_warehouse_items
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.code as item_code,
  i.unit,
  i.sale_price::numeric(18,4) as sale_price,
  i.purchase_price::numeric(18,4) as purchase_price,
  i.serial_number as item_number,
  i.notes as item_notes,
  i.is_active as item_is_active,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.serial_number as warehouse_number,
  w.notes as warehouse_notes,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  coalesce(s.avg_cost, o.unit_cost, i.purchase_price, 0)::numeric(18,4) as unit_cost
from public.items i
cross join public.warehouses w
left join public.item_stock s on s.company_id = i.company_id and s.warehouse_id = w.id and s.item_id = i.id
left join public.stock_opening_balances o on o.company_id = i.company_id and o.warehouse_id = w.id and o.item_id = i.id
where i.is_active is true and w.is_active is true;

grant select on public.v_warehouse_items to authenticated;

-- 3. دالة حساب مؤشرات إدارة الأصناف (Master Data Items Tab)
create or replace function public.get_master_items_kpis(
  p_search text default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_res jsonb;
  v_search text := trim(coalesce(p_search, ''));
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_count', count(*),
    'active_count', count(*) filter (where i.is_active is true),
    'inactive_count', count(*) filter (where i.is_active is false),
    'avg_price', coalesce(avg(i.sale_price) filter (where i.sale_price > 0), 0)::numeric(18,4)
  )
  into v_res
  from public.items i
  where i.company_id = v_company_id
    and (
      p_status = 'all' or p_status is null or p_status = ''
      or (p_status = 'active' and i.is_active is true)
      or (p_status = 'inactive' and i.is_active is false)
    )
    and (
      v_search = ''
      or i.name ilike '%' || v_search || '%'
      or i.code ilike '%' || v_search || '%'
      or i.serial_number::text ilike '%' || v_search || '%'
      or i.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_count', 0,
    'active_count', 0,
    'inactive_count', 0,
    'avg_price', 0
  ));
end;
$$;

revoke all on function public.get_master_items_kpis(text, text) from public, anon;
grant execute on function public.get_master_items_kpis(text, text) to authenticated;

-- 4. دالة حساب مؤشرات أرصدة المخزون (Balances Items Tab)
create or replace function public.get_warehouse_stock_kpis(
  p_warehouse_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_res jsonb;
  v_search text := trim(coalesce(p_search, ''));
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_qty', coalesce(sum(v.current_qty), 0)::numeric(18,4),
    'total_val', coalesce(sum(case when v.current_qty > 0 then v.current_qty * v.unit_cost else 0 end), 0)::numeric(18,4),
    'out_of_stock_count', count(*) filter (where v.current_qty <= 0),
    'count', count(*)
  )
  into v_res
  from public.v_warehouse_items v
  where v.company_id = v_company_id
    and (p_warehouse_id is null or v.warehouse_id = p_warehouse_id)
    and (
      v_search = ''
      or v.item_name ilike '%' || v_search || '%'
      or v.item_code ilike '%' || v_search || '%'
      or v.item_number::text ilike '%' || v_search || '%'
      or v.item_notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_qty', 0,
    'total_val', 0,
    'out_of_stock_count', 0,
    'count', 0
  ));
end;
$$;

revoke all on function public.get_warehouse_stock_kpis(uuid, text) from public, anon;
grant execute on function public.get_warehouse_stock_kpis(uuid, text) to authenticated;

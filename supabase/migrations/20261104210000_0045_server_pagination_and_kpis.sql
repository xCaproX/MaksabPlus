-- =====================================================================
-- 0045_server_pagination_and_kpis.sql
-- فهارس مركبة لتصفح الفواتير والإيصالات بالصفحات (Server-Side Pagination)
-- ودوال تجميعية خفيفة لحساب مؤشرات الأداء (KPIs) في السيرفر مباشرة
-- =====================================================================

-- 1. فهارس التصفح والترتيب للجداول الرئيسية
create index if not exists invoices_paged_list_idx
  on public.invoices (company_id, kind, invoice_date desc, number desc)
  where (deleted_at is null);

create index if not exists invoices_paged_deleted_idx
  on public.invoices (company_id, kind, invoice_date desc, number desc)
  where (deleted_at is not null);

create index if not exists receipts_paged_list_idx
  on public.receipts (company_id, direction, receipt_date desc, number desc)
  where (deleted_at is null);

create index if not exists receipts_paged_deleted_idx
  on public.receipts (company_id, direction, receipt_date desc, number desc)
  where (deleted_at is not null);

create index if not exists warehouse_transfers_paged_list_idx
  on public.warehouse_transfers (company_id, transfer_date desc, number desc)
  where (deleted_at is null);

create index if not exists warehouse_transfers_paged_deleted_idx
  on public.warehouse_transfers (company_id, transfer_date desc, number desc)
  where (deleted_at is not null);

create index if not exists cash_box_transfers_paged_list_idx
  on public.cash_box_transfers (company_id, transfer_date desc, number desc)
  where (deleted_at is null);

create index if not exists cash_box_transfers_paged_deleted_idx
  on public.cash_box_transfers (company_id, transfer_date desc, number desc)
  where (deleted_at is not null);

-- 2. دالة حساب مؤشرات الفواتير المجمعة على السيرفر
create or replace function public.get_invoice_kpis(
  p_kind text,
  p_search text default null,
  p_status text default 'all',
  p_date_from text default null,
  p_date_to text default null,
  p_show_deleted boolean default false
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
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_amount', coalesce(sum(v.total), 0)::numeric(18,4),
    'paid_amount', coalesce(sum(v.paid), 0)::numeric(18,4),
    'remaining_amount', coalesce(sum(v.remaining), 0)::numeric(18,4),
    'profit_total', coalesce(sum(v.profit_total), 0)::numeric(18,4),
    'count', count(*)
  )
  into v_res
  from public.v_invoice_list v
  where v.company_id = v_company_id
    and v.kind = p_kind
    and (
      (p_show_deleted is true and v.deleted_at is not null)
      or
      (p_show_deleted is not true and v.deleted_at is null)
    )
    and (v_date_from is null or v.invoice_date >= v_date_from)
    and (v_date_to is null or v.invoice_date <= v_date_to)
    and (
      p_status = 'all' or p_status is null or p_status = ''
      or (p_status = 'paid' and v.remaining <= 0)
      or (p_status = 'partial' and v.paid > 0 and v.remaining > 0)
      or (p_status = 'unpaid' and v.paid <= 0 and v.remaining > 0)
    )
    and (
      v_search = ''
      or v.number ilike '%' || v_search || '%'
      or v.account_name ilike '%' || v_search || '%'
      or v.warehouse_name ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'paid_amount', 0,
    'remaining_amount', 0,
    'profit_total', 0,
    'count', 0
  ));
end;
$$;

-- 3. دالة حساب مؤشرات تحويلات المخازن المجمعة
create or replace function public.get_warehouse_transfer_kpis(
  p_search text default null,
  p_date_from text default null,
  p_date_to text default null,
  p_show_deleted boolean default false
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
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_value', coalesce(sum(v.total_value), 0)::numeric(18,4),
    'total_qty', coalesce(sum(v.total_qty), 0)::numeric(18,4),
    'count', count(*)
  )
  into v_res
  from public.v_warehouse_transfer_list v
  where v.company_id = v_company_id
    and (
      (p_show_deleted is true and v.deleted_at is not null)
      or
      (p_show_deleted is not true and v.deleted_at is null)
    )
    and (v_date_from is null or v.transfer_date >= v_date_from)
    and (v_date_to is null or v.transfer_date <= v_date_to)
    and (
      v_search = ''
      or v.number ilike '%' || v_search || '%'
      or v.source_warehouse_name ilike '%' || v_search || '%'
      or v.destination_warehouse_name ilike '%' || v_search || '%'
      or v.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_value', 0,
    'total_qty', 0,
    'count', 0
  ));
end;
$$;

-- 4. دالة حساب مؤشرات الإيصالات المجمعة
create or replace function public.get_receipt_kpis(
  p_direction text,
  p_cash_box_id uuid default null,
  p_search text default null,
  p_date_from text default null,
  p_date_to text default null,
  p_show_deleted boolean default false
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
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_amount', coalesce(sum(v.amount), 0)::numeric(18,4),
    'invoice_linked', coalesce(sum(case when v.invoice_id is not null then v.amount else 0 end), 0)::numeric(18,4),
    'count', count(*)
  )
  into v_res
  from public.v_receipt_list v
  where v.company_id = v_company_id
    and v.direction = p_direction
    and (
      (p_show_deleted is true and v.deleted_at is not null)
      or
      (p_show_deleted is not true and v.deleted_at is null)
    )
    and (p_cash_box_id is null or v.cash_box_id = p_cash_box_id)
    and (v_date_from is null or v.receipt_date >= v_date_from)
    and (v_date_to is null or v.receipt_date <= v_date_to)
    and (
      v_search = ''
      or v.number ilike '%' || v_search || '%'
      or v.account_name ilike '%' || v_search || '%'
      or v.cash_box_name ilike '%' || v_search || '%'
      or v.statement ilike '%' || v_search || '%'
      or v.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'invoice_linked', 0,
    'count', 0
  ));
end;
$$;

-- 5. دالة حساب مؤشرات التحويل بين الخزن
create or replace function public.get_cash_box_transfer_kpis(
  p_cash_box_id uuid default null,
  p_search text default null,
  p_date_from text default null,
  p_date_to text default null,
  p_show_deleted boolean default false
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
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_amount', coalesce(sum(v.amount), 0)::numeric(18,4),
    'count', count(*)
  )
  into v_res
  from public.v_cash_box_transfer_list v
  where v.company_id = v_company_id
    and (
      (p_show_deleted is true and v.deleted_at is not null)
      or
      (p_show_deleted is not true and v.deleted_at is null)
    )
    and (
      p_cash_box_id is null
      or v.source_cash_box_id = p_cash_box_id
      or v.destination_cash_box_id = p_cash_box_id
    )
    and (v_date_from is null or v.transfer_date >= v_date_from)
    and (v_date_to is null or v.transfer_date <= v_date_to)
    and (
      v_search = ''
      or v.number ilike '%' || v_search || '%'
      or v.source_cash_box_name ilike '%' || v_search || '%'
      or v.destination_cash_box_name ilike '%' || v_search || '%'
      or v.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'count', 0
  ));
end;
$$;

-- 6. الصلاحيات
grant execute on function public.get_invoice_kpis to authenticated;
grant execute on function public.get_warehouse_transfer_kpis to authenticated;
grant execute on function public.get_receipt_kpis to authenticated;
grant execute on function public.get_cash_box_transfer_kpis to authenticated;

-- Search the same literal text in document lists and their summaries.
create or replace view public.v_invoice_list
with (security_invoker = true) as
select
  i.id, i.company_id, i.kind, i.number, i.invoice_date, i.account_id,
  a.name as account_name, i.warehouse_id, w.name as warehouse_name,
  i.subtotal, i.total, i.paid, (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes, i.created_at, i.updated_at,
  r.id as receipt_id, r.number as receipt_number, r.amount as receipt_amount,
  i.deleted_at, a.kind as account_kind,
  (case when public.can_view_profit() then public.read_protected_cost('invoice_cost', i.id) else null end)::numeric(18,4) as cost_total,
  (case when public.can_view_profit() then public.read_protected_cost('invoice_profit', i.id) else null end)::numeric(18,4) as profit_total,
  r.cash_box_id,
  cb.name as cash_box_name,
  a.phone as account_phone
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
left join public.cash_boxes cb on cb.id = r.cash_box_id;

create or replace view public.v_receipt_list
with (security_invoker = true) as
select
  r.id,
  r.company_id,
  r.number,
  r.receipt_date,
  r.amount,
  r.notes,
  r.account_id,
  a.name as account_name,
  a.kind as account_kind,
  r.cash_box_id,
  cb.name as cash_box_name,
  r.invoice_id,
  i.number as invoice_number,
  i.kind as invoice_kind,
  (r.invoice_id is null) as is_free,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  r.description,
  case
    when r.invoice_id is not null then
      (case when i.kind in ('sale', 'purchase') then 'فاتورة ' else 'مرتجع ' end) || i.number
    else r.description
  end as statement,
  r.direction,
  a.phone as account_phone
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

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
  v_pattern text := '%' || replace(replace(replace(v_search, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%';
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not (public.has_permission('goods.' || p_kind || '.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_amount', coalesce(sum(v.total), 0)::numeric(18,4),
    'paid_amount', coalesce(sum(v.paid), 0)::numeric(18,4),
    'remaining_amount', coalesce(sum(v.remaining), 0)::numeric(18,4),
    'profit_total', case when public.can_view_profit() then coalesce(sum(v.profit_total), 0)::numeric(18,4) else null end,
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
      or v.number ilike v_pattern
      or v.account_name ilike v_pattern
      or v.account_phone ilike v_pattern
      or v.warehouse_name ilike v_pattern
      or v.notes ilike v_pattern
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'paid_amount', 0,
    'remaining_amount', 0,
    'profit_total', null,
    'count', 0
  ));
end;
$$;

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
  v_pattern text := '%' || replace(replace(replace(v_search, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%';
  v_date_from date := case when p_date_from is not null and p_date_from <> '' then p_date_from::date else null end;
  v_date_to date := case when p_date_to is not null and p_date_to <> '' then p_date_to::date else null end;
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not (public.has_permission('money.' || p_direction || '.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
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
      or v.number ilike v_pattern
      or v.account_name ilike v_pattern
      or v.account_phone ilike v_pattern
      or v.cash_box_name ilike v_pattern
      or v.statement ilike v_pattern
      or v.notes ilike v_pattern
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'invoice_linked', 0,
    'count', 0
  ));
end;
$$;

revoke all on public.v_invoice_list, public.v_receipt_list from public, anon;
grant select on public.v_invoice_list, public.v_receipt_list to authenticated;
revoke all on function public.get_invoice_kpis(text,text,text,text,text,boolean) from public, anon;
revoke all on function public.get_receipt_kpis(text,uuid,text,text,text,boolean) from public, anon;
grant execute on function public.get_invoice_kpis(text,text,text,text,text,boolean) to authenticated;
grant execute on function public.get_receipt_kpis(text,uuid,text,text,text,boolean) to authenticated;

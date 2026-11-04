-- =====================================================================
-- 0051_security_hardening_and_profit_guards.sql
-- 1. تأمين دوال التريجرات وسحب صلاحيات المزامنة المباشرة
-- 2. دالة مركزية can_view_profit لحجب الأرباح والتكلفة في v_invoice_list و get_invoice_kpis
-- 3. حماية دوال المؤشرات الـ 8 بفحص has_permission
-- 4. قصر reconcile_all_balances على المالك فقط
-- =====================================================================

-- 1) المحفزات التي تستدعي دوال المزامنة تعمل بصلاحية المالك
alter function public.trg_accounts_after_update()            security definer;
alter function public.trg_cash_boxes_after_update()          security definer;
alter function public.trg_invoices_balance_sync()            security definer;
alter function public.trg_receipts_balance_sync()            security definer;
alter function public.trg_cash_box_transfers_balance_sync()  security definer;
alter function public.trg_opening_adjustments_sync()         security definer;

-- 2) سحب التنفيذ المباشر من دوال المزامنة
revoke all on function public.sync_account_balance(uuid)  from public, anon, authenticated;
revoke all on function public.sync_cash_box_balance(uuid) from public, anon, authenticated;

-- 3) دالة مركزية للتحقق من صلاحية رؤية الأرباح والتكلفة (حالياً المالك فقط)
create or replace function public.can_view_profit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_owner();
$$;

revoke all on function public.can_view_profit() from public, anon;
grant execute on function public.can_view_profit() to authenticated;

-- 4) تأمين recalc_invoice_totals بفحص الشركة
create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cost numeric(18,4);
  v_profit numeric(18,4);
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select
    coalesce(sum(ii.qty * ii.unit_cost), 0)::numeric(18,4),
    coalesce(sum(case i.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end), 0)::numeric(18,4)
  into v_cost, v_profit
  from public.invoices i
  left join public.invoice_items ii on ii.invoice_id = i.id
  where i.id = p_invoice_id and i.company_id = v_company
  group by i.id, i.kind;

  update public.invoices
  set cost_total = coalesce(v_cost, 0),
      profit_total = coalesce(v_profit, 0)
  where id = p_invoice_id and company_id = v_company;
end;
$$;

revoke all on function public.recalc_invoice_totals(uuid) from public, anon;
grant execute on function public.recalc_invoice_totals(uuid) to authenticated;

-- 5) تعديل v_invoice_list لحجب الأرباح والتكلفة لغير المصرح لهم عبر can_view_profit()
create or replace view public.v_invoice_list
with (security_invoker = true) as
select
  i.id, i.company_id, i.kind, i.number, i.invoice_date, i.account_id,
  a.name as account_name, i.warehouse_id, w.name as warehouse_name,
  i.subtotal, i.total, i.paid, (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes, i.created_at, i.updated_at,
  r.id as receipt_id, r.number as receipt_number, r.amount as receipt_amount,
  i.deleted_at, a.kind as account_kind,
  (case when public.can_view_profit() then i.cost_total else null end)::numeric(18,4) as cost_total,
  (case when public.can_view_profit() then i.profit_total else null end)::numeric(18,4) as profit_total,
  r.cash_box_id,
  cb.name as cash_box_name
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
left join public.cash_boxes cb on cb.id = r.cash_box_id;

grant select on public.v_invoice_list to authenticated;

-- 6) تأمين دوال المؤشرات الـ 8 بفحص الصلاحيات

-- دالة 1: مؤشرات الفواتير
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
      or v.number ilike '%' || v_search || '%'
      or v.account_name ilike '%' || v_search || '%'
      or v.warehouse_name ilike '%' || v_search || '%'
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

-- دالة 2: مؤشرات تحويلات المخازن
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

  if not (public.has_permission('goods.warehouse_transfer.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
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

-- دالة 3: مؤشرات الإيصالات
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

-- دالة 4: مؤشرات تحويلات الخزن
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

  if not (public.has_permission('money.cash_box_transfer.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_amount', coalesce(sum(cbt.amount), 0)::numeric(18,4),
    'count', count(*)
  )
  into v_res
  from public.cash_box_transfers cbt
  join public.cash_boxes scb on scb.id = cbt.source_cash_box_id
  join public.cash_boxes dcb on dcb.id = cbt.destination_cash_box_id
  where cbt.company_id = v_company_id
    and (
      (p_show_deleted is true and cbt.deleted_at is not null)
      or
      (p_show_deleted is not true and cbt.deleted_at is null)
    )
    and (v_date_from is null or cbt.transfer_date >= v_date_from)
    and (v_date_to is null or cbt.transfer_date <= v_date_to)
    and (
      p_cash_box_id is null
      or cbt.source_cash_box_id = p_cash_box_id
      or cbt.destination_cash_box_id = p_cash_box_id
    )
    and (
      v_search = ''
      or cbt.number ilike '%' || v_search || '%'
      or scb.name ilike '%' || v_search || '%'
      or dcb.name ilike '%' || v_search || '%'
      or coalesce(cbt.notes, '') ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_amount', 0,
    'count', 0
  ));
end;
$$;

-- دالة 5: مؤشرات أرصدة الحسابات (Balances Accounts Tab)
create or replace function public.get_account_balances_kpis(
  p_kind text,
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
  v_perm text := 'balances.' || (case when p_kind = 'customer' then 'customers' else 'suppliers' end) || '.view';
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not (public.has_permission(v_perm) or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'net_balance', coalesce(sum(a.current_balance), 0)::numeric(18,4),
    'total_debit', coalesce(sum(case when a.current_balance > 0 then a.current_balance else 0 end), 0)::numeric(18,4),
    'total_credit', coalesce(sum(case when a.current_balance < 0 then -a.current_balance else 0 end), 0)::numeric(18,4),
    'positive_count', count(*) filter (where a.current_balance > 0),
    'count', count(*)
  )
  into v_res
  from public.accounts a
  where a.company_id = v_company_id
    and a.kind = p_kind
    and a.system_key is null
    and (
      v_search = ''
      or a.name ilike '%' || v_search || '%'
      or a.phone ilike '%' || v_search || '%'
      or a.serial_number::text ilike '%' || v_search || '%'
      or a.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'net_balance', 0,
    'total_debit', 0,
    'total_credit', 0,
    'positive_count', 0,
    'count', 0
  ));
end;
$$;

-- دالة 6: مؤشرات دليل الحسابات (Master Data Accounts Tab)
create or replace function public.get_master_accounts_kpis(
  p_kind text,
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
  v_perm text := 'data.' || (case when p_kind = 'customer' then 'customers' else 'suppliers' end) || '.view';
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not (public.has_permission(v_perm) or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_count', count(*),
    'active_count', count(*) filter (where a.is_active is true),
    'inactive_count', count(*) filter (where a.is_active is false),
    'with_opening_count', count(*) filter (where a.opening_balance is not null and a.opening_balance <> 0)
  )
  into v_res
  from public.accounts a
  where a.company_id = v_company_id
    and a.kind = p_kind
    and a.system_key is null
    and (
      p_status = 'all' or p_status is null or p_status = ''
      or (p_status = 'active' and a.is_active is true)
      or (p_status = 'inactive' and a.is_active is false)
    )
    and (
      v_search = ''
      or a.name ilike '%' || v_search || '%'
      or a.phone ilike '%' || v_search || '%'
      or a.serial_number::text ilike '%' || v_search || '%'
      or a.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_count', 0,
    'active_count', 0,
    'inactive_count', 0,
    'with_opening_count', 0
  ));
end;
$$;

-- دالة 7: مؤشرات دليل الأصناف (Master Data Items Tab)
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

  if not (public.has_permission('data.items.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
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

-- دالة 8: مؤشرات أرصدة المخزون (Balances Items Tab)
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

  if not (public.has_permission('balances.items.view') or public.is_company_owner()) then
    raise exception 'permission_denied' using errcode = '42501';
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

-- 7) قصر دالة مطابقة الأرصدة reconcile_all_balances على المالك فقط
create or replace function public.reconcile_all_balances(p_company_id uuid default null)
returns table (
  entity_type text,
  entity_id uuid,
  entity_name text,
  old_balance numeric(18,4),
  reconciled_balance numeric(18,4),
  discrepancy numeric(18,4)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.is_company_owner() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_company_id is not null and p_company_id is distinct from v_company_id then
    raise exception 'unauthorized_company' using errcode = '42501';
  end if;

  return query select * from public.reconcile_all_balances_internal(v_company_id);
end;
$$;

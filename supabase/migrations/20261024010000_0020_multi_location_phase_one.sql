-- أضف اسم الخزنة المرتبطة بمدفوع الفاتورة إلى قائمة الفواتير.
create or replace view public.v_invoice_list
with (security_invoker = true) as
select
  i.id, i.company_id, i.kind, i.number, i.invoice_date, i.account_id,
  a.name as account_name, i.warehouse_id, w.name as warehouse_name,
  i.subtotal, i.total, i.paid, (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes, i.created_at, i.updated_at,
  r.id as receipt_id, r.number as receipt_number, r.amount as receipt_amount,
  i.deleted_at, a.kind as account_kind,
  coalesce(cost.cost_total, 0)::numeric(18,4) as cost_total,
  coalesce(cost.profit_total, 0)::numeric(18,4) as profit_total,
  r.cash_box_id,
  cb.name as cash_box_name
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
left join public.cash_boxes cb on cb.id = r.cash_box_id
left join lateral (
  select sum(ii.qty * ii.unit_cost) as cost_total,
    sum(case i.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end) as profit_total
  from public.invoice_items ii where ii.invoice_id = i.id
) cost on true;
grant select on public.v_invoice_list to authenticated;

-- احتفظ بدوال الفاتورة الحالية، وغيّر خزنة الإيصال المرتبط داخل نفس معاملة قاعدة البيانات.
create or replace function public.create_invoice_with_cash_box(
  p_kind text,
  p_account_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid numeric,
  p_notes text,
  p_lines jsonb,
  p_cash_box_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_invoice uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(p_paid, 0) > 0 then
    perform 1 from public.cash_boxes
    where id = p_cash_box_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  end if;

  v_invoice := public.create_invoice(p_kind, p_account_id, p_warehouse_id, p_invoice_date, p_paid, p_notes, p_lines);
  if coalesce(p_paid, 0) > 0 then
    update public.receipts set cash_box_id = p_cash_box_id
    where invoice_id = v_invoice and company_id = v_company and deleted_at is null;
  end if;
  return v_invoice;
end;
$$;

create or replace function public.update_invoice_with_cash_box(
  p_invoice_id uuid,
  p_account_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid numeric,
  p_notes text,
  p_lines jsonb,
  p_cash_box_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_current_cash_box uuid;
  v_invoice uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(p_paid, 0) > 0 then
    select cash_box_id into v_current_cash_box from public.receipts
    where invoice_id = p_invoice_id and company_id = v_company and deleted_at is null;
    perform 1 from public.cash_boxes
    where id = p_cash_box_id and company_id = v_company
      and (is_active or id = v_current_cash_box);
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  end if;

  v_invoice := public.update_invoice(p_invoice_id, p_account_id, p_warehouse_id,
    p_invoice_date, p_paid, p_notes, p_lines);
  if coalesce(p_paid, 0) > 0 then
    update public.receipts set cash_box_id = p_cash_box_id
    where invoice_id = v_invoice and company_id = v_company and deleted_at is null;
  end if;
  return v_invoice;
end;
$$;

revoke all on function public.create_invoice_with_cash_box(text, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_invoice_with_cash_box(text, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;
revoke all on function public.update_invoice_with_cash_box(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.update_invoice_with_cash_box(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

-- المخزن الذي ما زال يحتوي كميات لا يمكن إيقافه حتى لا تختفي الكميات من اختيارات المخزون.
create or replace function public.prevent_warehouse_deactivation_with_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.item_stock
    where company_id = old.company_id and warehouse_id = old.id and qty <> 0
  ) then
    raise exception 'warehouse_has_stock' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger warehouses_prevent_deactivation_with_stock
before update of is_active on public.warehouses
for each row execute function public.prevent_warehouse_deactivation_with_stock();

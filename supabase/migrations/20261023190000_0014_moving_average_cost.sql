-- تكلفة مخزون بمتوسط متحرك لكل صنف ومخزن، وتثبيت تكلفة كل سطر مستند.

alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices
  add constraint invoices_kind_check
  check (kind in ('sale', 'purchase', 'sale_return', 'purchase_return', 'waste'));

alter table public.item_stock
  add column avg_cost numeric(18,4) not null default 0 check (avg_cost >= 0);
update public.item_stock s
   set avg_cost = i.purchase_price
  from public.items i
 where i.id = s.item_id
   and s.avg_cost = 0;

create or replace function public.item_stock_set_opening_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.qty > 0 and new.avg_cost = 0 then
    select purchase_price into new.avg_cost from public.items
    where id = new.item_id and company_id = new.company_id;
  end if;
  return new;
end;
$$;
drop trigger if exists item_stock_set_opening_cost on public.item_stock;
create trigger item_stock_set_opening_cost
before insert on public.item_stock
for each row execute function public.item_stock_set_opening_cost();

alter table public.invoice_items
  add column unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0);
update public.invoice_items ii
   set unit_cost = case when inv.kind = 'purchase' then ii.unit_price else i.purchase_price end
  from public.invoices inv, public.items i
 where inv.id = ii.invoice_id
   and i.id = ii.item_id;

-- تعديل السطور القديمة يُظهر تكلفة تقديرية باستخدام سعر الشراء الحالي للصنف.
-- تكلفة المستندات الجديدة تُحسب داخل هذه الدالة عند كل حركة مخزون.
create or replace function public.apply_stock_movement(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_item_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric default null
)
returns numeric(18,4)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_qty numeric(18,4);
  v_avg numeric(18,4);
  v_new_qty numeric(18,4);
  v_unit_cost numeric(18,4);
  v_new_avg numeric(18,4);
begin
  if p_company_id is distinct from public.current_company_id() then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;
  if p_qty_delta is null or p_qty_delta = 0 then
    raise exception 'invalid_stock_movement' using errcode = '22023';
  end if;

  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
  values (p_company_id, p_warehouse_id, p_item_id, 0, coalesce(p_unit_cost, 0))
  on conflict (warehouse_id, item_id) do nothing;

  select qty, avg_cost into v_qty, v_avg
  from public.item_stock
  where company_id = p_company_id
    and warehouse_id = p_warehouse_id
    and item_id = p_item_id
  for update;

  v_unit_cost := round(coalesce(p_unit_cost, v_avg), 4);
  if v_unit_cost < 0 then
    raise exception 'invalid_line_cost' using errcode = '22023';
  end if;

  v_new_qty := v_qty + p_qty_delta;
  if v_new_qty < 0 then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;

  if v_new_qty > 0 then
    v_new_avg := round(((v_qty * v_avg) + (p_qty_delta * v_unit_cost)) / v_new_qty, 4);
    if v_new_avg < 0 then
      raise exception 'stock_cost_below_zero' using errcode = '22023';
    end if;
  else
    v_new_avg := v_avg;
  end if;

  update public.item_stock
     set qty = v_new_qty,
         avg_cost = v_new_avg,
         updated_at = now()
   where company_id = p_company_id
     and warehouse_id = p_warehouse_id
     and item_id = p_item_id;

  return v_unit_cost;
end;
$$;

-- النوع «هالك» يستخدم حساب الهالك الثابت، ولا يحمل قيمة مالية أو إيصالًا.
create or replace function public.create_invoice(
  p_kind text, p_account_id uuid, p_warehouse_id uuid, p_invoice_date date,
  p_paid numeric, p_notes text, p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_invoice uuid;
  v_total numeric(18,4) := 0;
  v_paid numeric(18,4) := coalesce(p_paid, 0);
  v_date date := coalesce(p_invoice_date, current_date);
  v_line record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind is null or p_kind not in ('sale', 'purchase', 'sale_return', 'purchase_return', 'waste') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  v_sign := case when p_kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  select system_key into v_system_key
  from public.accounts
  where id = p_account_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if (p_kind = 'waste' and v_system_key <> 'waste')
     or (p_kind <> 'waste' and v_system_key = 'waste') then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  perform 1 from public.warehouses
  where id = p_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then raise exception 'line_missing_item' using errcode = '22023'; end if;
    if v_line.qty is null or v_line.qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then raise exception 'invalid_line_price' using errcode = '22023'; end if;
    if p_kind = 'waste' and v_line.unit_price <> 0 then
      raise exception 'waste_price_must_be_zero' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;

  if p_kind = 'waste' and v_paid <> 0 then raise exception 'waste_cannot_be_paid' using errcode = '22023'; end if;
  if v_paid < 0 then raise exception 'invalid_paid' using errcode = '22023'; end if;
  if v_paid > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, notes)
  values (v_company, p_kind, public.next_document_number(v_company, p_kind), v_date,
          p_account_id, p_warehouse_id, v_total, v_total, v_paid, p_notes)
  returning id into v_invoice;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    v_unit_cost := public.apply_stock_movement(
      v_company, p_warehouse_id, v_line.item_id, v_sign * v_line.qty,
      case when p_kind = 'purchase' then v_line.unit_price else null end
    );
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, v_invoice, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  if p_kind <> 'waste' then perform public.sync_invoice_receipt(v_invoice); end if;
  return v_invoice;
end;
$$;

create or replace function public.update_invoice(
  p_invoice_id uuid, p_account_id uuid, p_warehouse_id uuid, p_invoice_date date,
  p_paid numeric, p_notes text, p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_total numeric(18,4) := 0;
  v_paid numeric(18,4) := coalesce(p_paid, 0);
  v_date date := coalesce(p_invoice_date, current_date);
  v_line record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;
  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if (v_inv.kind = 'waste' and v_system_key <> 'waste')
     or (v_inv.kind <> 'waste' and v_system_key = 'waste') then
    raise exception 'invalid_account' using errcode = '22023';
  end if;
  perform 1 from public.warehouses where id = p_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then raise exception 'line_missing_item' using errcode = '22023'; end if;
    if v_line.qty is null or v_line.qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then raise exception 'invalid_line_price' using errcode = '22023'; end if;
    if v_inv.kind = 'waste' and v_line.unit_price <> 0 then
      raise exception 'waste_price_must_be_zero' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;
  if v_inv.kind = 'waste' and v_paid <> 0 then raise exception 'waste_cannot_be_paid' using errcode = '22023'; end if;
  if v_paid < 0 then raise exception 'invalid_paid' using errcode = '22023'; end if;
  if v_paid > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  for v_line in select item_id, qty, unit_cost from public.invoice_items where invoice_id = p_invoice_id
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      -v_sign * v_line.qty, v_line.unit_cost);
  end loop;
  delete from public.invoice_items where invoice_id = p_invoice_id;

  update public.invoices set account_id = p_account_id, warehouse_id = p_warehouse_id,
    invoice_date = v_date, subtotal = v_total, total = v_total, paid = v_paid, notes = p_notes
  where id = p_invoice_id;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    v_unit_cost := public.apply_stock_movement(v_company, p_warehouse_id, v_line.item_id,
      v_sign * v_line.qty, case when v_inv.kind = 'purchase' then v_line.unit_price else null end);
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, p_invoice_id, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id); end if;
  return p_invoice_id;
end;
$$;

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_line record;
  v_sign integer;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_already_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;
  for v_line in select item_id, qty, unit_cost from public.invoice_items where invoice_id = p_invoice_id
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      -v_sign * v_line.qty, v_line.unit_cost);
  end loop;
  update public.invoices set deleted_at = now() where id = p_invoice_id;
  perform public.set_linked_receipt_deleted(p_invoice_id, true);
end;
$$;

create or replace function public.restore_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_line record;
  v_sign integer;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is null then raise exception 'invoice_not_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;
  for v_line in select item_id, qty, unit_cost from public.invoice_items where invoice_id = p_invoice_id
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      v_sign * v_line.qty, v_line.unit_cost);
  end loop;
  update public.invoices set deleted_at = null where id = p_invoice_id;
  perform public.set_linked_receipt_deleted(p_invoice_id, false);
end;
$$;

-- فواتير الهالك لا تنشئ أو تعيد إيصالات.
create or replace function public.sync_invoice_receipt(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_receipt public.receipts%rowtype;
  v_box uuid;
  v_dir text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  select * into v_receipt from public.receipts where invoice_id = p_invoice_id;

  if v_inv.kind = 'waste' or v_inv.paid = 0 then
    update public.receipts set deleted_at = now()
    where invoice_id = p_invoice_id and deleted_at is null;
    return;
  end if;
  v_dir := case when v_inv.kind in ('sale', 'purchase_return') then 'in' else 'out' end;
  if v_receipt.id is null then
    select id into v_box from public.cash_boxes
    where company_id = v_company and is_active order by created_at limit 1;
    if v_box is null then raise exception 'no_cash_box' using errcode = '22023'; end if;
    insert into public.receipts (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, direction)
    values (v_company, p_invoice_id,
      public.next_document_number(v_company, case v_dir when 'in' then 'receipt_in' else 'receipt_out' end),
      v_inv.invoice_date, v_inv.account_id, v_box, v_inv.paid, v_dir);
  else
    update public.receipts set amount = v_inv.paid, account_id = v_inv.account_id,
      receipt_date = v_inv.invoice_date, direction = v_dir, deleted_at = null
    where invoice_id = p_invoice_id;
  end if;
end;
$$;

create or replace view public.v_invoice_items
with (security_invoker = true) as
select
  ii.id, ii.company_id, ii.invoice_id, ii.item_id,
  it.name as item_name, it.unit, ii.qty, ii.unit_price, ii.line_total,
  ii.unit_cost,
  (ii.qty * ii.unit_cost)::numeric(18,4) as line_cost,
  case inv.kind
    when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
    when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
    when 'waste' then -(ii.qty * ii.unit_cost)
    else 0
  end::numeric(18,4) as line_profit
from public.invoice_items ii
join public.items it on it.id = ii.item_id
join public.invoices inv on inv.id = ii.invoice_id;

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
  coalesce(cost.profit_total, 0)::numeric(18,4) as profit_total
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
left join lateral (
  select sum(ii.qty * ii.unit_cost) as cost_total,
    sum(case i.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end) as profit_total
  from public.invoice_items ii
  where ii.invoice_id = i.id
) cost on true;

grant select on public.v_invoice_items, public.v_invoice_list to authenticated;
revoke all on function public.apply_stock_movement(uuid, uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.item_stock_set_opening_cost() from public, anon, authenticated;
grant execute on function public.apply_stock_movement(uuid, uuid, uuid, numeric, numeric) to authenticated;
revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.delete_invoice(uuid) from public, anon;
revoke all on function public.restore_invoice(uuid) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.delete_invoice(uuid) to authenticated;
grant execute on function public.restore_invoice(uuid) to authenticated;

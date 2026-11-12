-- =====================================================================
-- 20261112160000_0085_security_and_transfer_restore_fixes.sql
-- 1. منع استعادة التحويل المخزني إذا كان أي صنف في بنوده معطلاً (items.is_active = false).
-- 2. فحص صلاحية فلترة purchase_price في validate_list_columns قبل تخطي القيم الفارغة.
-- 3. تضمين s.company_id = i.company_id في ربط v_item_stock مع الإبقاء على security_invoker = true.
-- 4. توحيد القفل المسبق لـ cash_boxes في delete_free_receipt لكلا الاتجاهين (in/out)،
--    وتقريب p_amount إلى 4 منازل عشرية قبل فحص الرصيد في create_free_receipt و update_free_receipt.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. تقييد عرض v_item_stock بشرط الشركة في الـ JOIN
-- ---------------------------------------------------------------------
create or replace view public.v_item_stock
with (security_invoker = true) as
select
  i.id,
  i.company_id,
  i.name,
  i.unit,
  i.sale_price,
  public.read_protected_purchase_price(i.id)::numeric(18,4) as purchase_price,
  i.is_active,
  coalesce(sum(s.qty), 0)::numeric(18,4) as qty,
  i.code
from public.items i
left join public.item_stock s on s.item_id = i.id and s.company_id = i.company_id
group by i.id;

revoke all on public.v_item_stock from public, anon;
grant select on public.v_item_stock to authenticated;

-- ---------------------------------------------------------------------
-- 2. فحص صلاحية purchase_price في validate_list_columns قبل تخطي النص الفارغ
-- ---------------------------------------------------------------------
create or replace function public.validate_list_columns(p_scope text, p_columns jsonb)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_schema jsonb := public.list_column_schema(p_scope);
  v_key text;
  v_value jsonb;
  v_column jsonb;
  v_type text;
  v_text text;
begin
  if jsonb_typeof(p_columns) is distinct from 'object' then
    raise exception 'invalid_column_filters' using errcode = '22023';
  end if;
  for v_key, v_value in select * from jsonb_each(p_columns) loop
    select c into v_column from jsonb_array_elements(v_schema->'columns') c
    where c->>'key' = v_key or c->>'secondaryKey' = v_key;
    if v_column is null or coalesce(v_column->>'type', 'none') = 'none' then
      raise exception 'invalid_filter_column' using errcode = '22023';
    end if;
    if coalesce((v_column->>'ownerOnly')::boolean, false) and not public.can_view_profit() then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if p_scope = 'master_items' and v_key = 'purchase_price' and not public.can_view_purchase_price() then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if jsonb_typeof(v_value) not in ('string', 'number', 'boolean', 'null') then
      raise exception 'invalid_filter_value' using errcode = '22023';
    end if;
    v_text := btrim(coalesce(v_value#>>'{}', ''));
    if v_text = '' then continue; end if;
    v_type := case when v_column->>'type' = 'datetime' then case when v_key = v_column->>'secondaryKey' then 'time' else 'date' end else v_column->>'type' end;
    if v_type = 'number' then
      if v_text !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
        raise exception 'invalid_filter_number' using errcode = '22023';
      end if;
      perform v_text::numeric;
    elsif v_type = 'date' then
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid_filter_date' using errcode = '22023';
      end if;
      perform v_text::date;
    elsif v_type = 'time' and v_text !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_filter_time' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_list_columns(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. منع استعادة التحويل المخزني إذا كان أحد أصنافه معطلاً
-- ---------------------------------------------------------------------
create or replace function public.restore_warehouse_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_transfer public.warehouse_transfers%rowtype;
  v_line record;
  v_lock record;
  v_qty numeric(18,4);
  v_cost numeric(18,4);
begin
  perform public.require_permission('goods.warehouse_transfer.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is null then raise exception 'transfer_not_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;
  perform 1 from public.warehouses where id = v_transfer.source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = v_transfer.destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if exists (
    select 1
    from public.warehouse_transfer_items wti
    left join public.items it on it.id = wti.item_id and it.company_id = v_company
    where wti.transfer_id = p_transfer_id
      and (it.id is null or not it.is_active)
  ) then
    raise exception 'invalid_item' using errcode = '22023';
  end if;

  for v_lock in
    select distinct wh_id as warehouse_id, item_id
    from public.warehouse_transfer_items wti
    cross join (values (v_transfer.source_warehouse_id), (v_transfer.destination_warehouse_id)) as w(wh_id)
    where wti.transfer_id = p_transfer_id
    order by warehouse_id asc, item_id asc
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
    values (v_company, v_lock.warehouse_id, v_lock.item_id, 0, 0)
    on conflict (warehouse_id, item_id) do nothing;

    perform 1 from public.item_stock
    where company_id = v_company and warehouse_id = v_lock.warehouse_id and item_id = v_lock.item_id
    for update;
  end loop;

  for v_line in select * from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id asc loop
    select qty, avg_cost into v_qty, v_cost from public.item_stock
    where company_id = v_company and warehouse_id = v_transfer.source_warehouse_id and item_id = v_line.item_id;
    if not found or v_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
  end loop;
  update public.warehouse_transfers set deleted_at = null where id = p_transfer_id and company_id = v_company;
end;
$$;

revoke all on function public.restore_warehouse_transfer(uuid) from public, anon;
grant execute on function public.restore_warehouse_transfer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. تقريب مبلغ الإيصالات الحرة لـ 4 منازل قبل التحقق وتوحيد القفل في الحذف
-- ---------------------------------------------------------------------
create or replace function public.create_free_receipt(
  p_account_id uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount numeric,
  p_notes text,
  p_description text default null,
  p_direction text default 'in'
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
  v_cash_bal numeric(18,4);
  v_amount numeric(18,4);
begin
  perform public.require_permission('money.' || p_direction || '.create');
  perform public.require_permission('money.create');

  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  v_amount := round(p_amount, 4);
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if v_system_key in ('cash_customer', 'cash_supplier') then
    raise exception 'invalid_free_receipt_account' using errcode = '22023';
  end if;

  select current_balance into v_cash_bal from public.cash_boxes
  where id = p_cash_box_id and company_id = v_company and is_active for update;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  if p_direction = 'out' and v_cash_bal < v_amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  insert into public.receipts
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, notes, description, direction)
  values
    (v_company, null,
     public.next_document_number(v_company, case p_direction when 'in' then 'receipt_in' else 'receipt_out' end),
     coalesce(p_receipt_date, public.cairo_today()), p_account_id, p_cash_box_id, v_amount, p_notes, p_description, p_direction)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) to authenticated;

create or replace function public.update_free_receipt(
  p_receipt_id uuid,
  p_account_id uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount numeric,
  p_notes text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_receipt public.receipts%rowtype;
  v_system_key text;
  v_cash_bal numeric(18,4);
  v_old_box_bal numeric(18,4);
  v_amount numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_receipt from public.receipts where id = p_receipt_id and company_id = v_company for update;
  if not found then raise exception 'receipt_not_found' using errcode = '22023'; end if;
  if v_receipt.invoice_id is not null then raise exception 'receipt_linked_immutable' using errcode = '22023'; end if;
  if v_receipt.deleted_at is not null then raise exception 'receipt_already_deleted' using errcode = '22023'; end if;
  v_amount := round(p_amount, 4);
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  perform public.require_permission('money.' || v_receipt.direction || '.edit');
  perform public.require_permission('money.edit');

  perform 1 from public.accounts
  where company_id = v_company and id in (v_receipt.account_id, p_account_id)
  order by id asc for update;

  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if v_system_key in ('cash_customer', 'cash_supplier') then
    raise exception 'invalid_free_receipt_account' using errcode = '22023';
  end if;

  if v_receipt.cash_box_id = p_cash_box_id then
    select current_balance into v_cash_bal from public.cash_boxes
    where id = p_cash_box_id and company_id = v_company and is_active for update;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

    if v_receipt.direction = 'out' and (v_cash_bal + v_receipt.amount) < v_amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    elsif v_receipt.direction = 'in' and (v_cash_bal - v_receipt.amount + v_amount) < 0 then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  else
    perform 1 from public.cash_boxes
    where company_id = v_company and id in (v_receipt.cash_box_id, p_cash_box_id)
    order by id asc for update;

    select current_balance into v_cash_bal from public.cash_boxes
    where id = p_cash_box_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

    select current_balance into v_old_box_bal from public.cash_boxes
    where id = v_receipt.cash_box_id and company_id = v_company;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

    if v_receipt.direction = 'in' and (v_old_box_bal - v_receipt.amount) < 0 then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    elsif v_receipt.direction = 'out' and v_cash_bal < v_amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  end if;

  update public.receipts set account_id = p_account_id, cash_box_id = p_cash_box_id,
    receipt_date = coalesce(p_receipt_date, public.cairo_today()), amount = v_amount,
    notes = p_notes, description = p_description
  where id = p_receipt_id and company_id = v_company;

  return p_receipt_id;
end;
$$;

revoke all on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text, text) from public, anon;
grant execute on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text, text) to authenticated;

create or replace function public.delete_free_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_receipt public.receipts%rowtype;
  v_cash_bal numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_receipt from public.receipts where id = p_receipt_id and company_id = v_company for update;
  if not found then raise exception 'receipt_not_found' using errcode = '22023'; end if;
  if v_receipt.invoice_id is not null then raise exception 'receipt_linked_immutable' using errcode = '22023'; end if;
  if v_receipt.deleted_at is not null then raise exception 'receipt_already_deleted' using errcode = '22023'; end if;

  perform public.require_permission('money.' || v_receipt.direction || '.delete');
  perform public.require_permission('money.delete');

  -- قفل الحساب ثم الخزنة لكلا الاتجاهين لتوحيد ترتيب الأقفال
  perform 1 from public.accounts
  where id = v_receipt.account_id and company_id = v_company
  for update;

  select current_balance into v_cash_bal from public.cash_boxes
  where id = v_receipt.cash_box_id and company_id = v_company for update;

  if v_receipt.direction = 'in' and coalesce(v_cash_bal, 0) < v_receipt.amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  update public.receipts set deleted_at = now() where id = p_receipt_id and company_id = v_company;
end;
$$;

revoke all on function public.delete_free_receipt(uuid) from public, anon;
grant execute on function public.delete_free_receipt(uuid) to authenticated;

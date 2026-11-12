-- =====================================================================
-- 20261112120000_0081_security_lock_order_and_p1_fixes.sql
-- المرحلة 4: إغلاق الثغرات الحرجة وتوحيد ترتيب الأقفال بالكامل
-- 1. منع استعادة فاتورة الشراء أو تغيير تاريخها عند وجود حركات خروج لاحقة.
-- 2. تقييد رؤية وتعديل سعر الشراء على المصرح لهم وحماية عمود purchase_price في جدول items.
-- 3. توحيد ترتيب الأقفال في create_invoice و delete_free_receipt و restore_receipt و update_free_receipt
--    و save_opening_balances وجميع دوال التحويلات المخزنية لمنع الـ Deadlocks.
-- 4. إصلاح فحص الخزنة في update_free_receipt و create_cash_box_transfer.
-- 5. استبعاد المستندات ذات التواريخ المستقبلية (> cairo_today()) في لوحة التحكم والرسوم البيانية.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. تشديد صلاحية رؤية سعر الشراء وحماية عمود purchase_price في جدول items
-- ---------------------------------------------------------------------
create or replace function public.can_view_purchase_price()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_profit()
      or public.has_permission('goods.purchase.view')
      or public.has_permission('goods.purchase.create')
      or public.has_permission('goods.purchase.edit')
      or public.has_permission('goods.purchase_return.view')
      or public.has_permission('goods.purchase_return.create')
      or public.has_permission('goods.purchase_return.edit');
$$;

revoke all on function public.can_view_purchase_price() from public, anon;
grant execute on function public.can_view_purchase_price() to authenticated;

create or replace function public.read_protected_purchase_price(p_item_id uuid)
returns numeric(18,4)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_price numeric(18,4);
begin
  if v_company is null or not public.can_view_purchase_price() then
    return null;
  end if;
  select i.purchase_price into v_price
  from public.items i
  where i.id = p_item_id and i.company_id = v_company;
  return v_price;
end;
$$;

revoke all on function public.read_protected_purchase_price(uuid) from public, anon;
grant execute on function public.read_protected_purchase_price(uuid) to authenticated;

-- سحب القراءة المباشرة لعمود purchase_price من جدول items عن authenticated
do $$
declare
  v_columns text;
begin
  revoke select on public.items from public, anon, authenticated;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
  from pg_attribute
  where attrelid = 'public.items'::regclass
    and attnum > 0
    and not attisdropped
    and attname <> 'purchase_price';
  execute format('grant select (%s) on public.items to authenticated', v_columns);
end $$;

-- تحديث العروض لتقرأ سعر الشراء المحمي عبر read_protected_purchase_price
create or replace view public.v_warehouse_items
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.code as item_code,
  i.unit,
  i.sale_price,
  public.read_protected_purchase_price(i.id)::numeric(18,4) as purchase_price,
  i.serial_number as item_number,
  i.notes as item_notes,
  i.is_active as item_is_active,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.serial_number as warehouse_number,
  w.notes as warehouse_notes,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  (case when public.can_view_profit() then
    coalesce(public.read_protected_cost('stock', i.id, w.id),
             public.read_protected_cost('opening', i.id, w.id),
             public.read_protected_purchase_price(i.id), 0)::numeric(18,4)
   else null::numeric end)::numeric(18,4) as unit_cost
from public.items i
join public.warehouses w on w.company_id = i.company_id
left join public.item_stock s
  on s.company_id = i.company_id and s.warehouse_id = w.id and s.item_id = i.id
left join public.stock_opening_balances o
  on o.company_id = i.company_id and o.warehouse_id = w.id and o.item_id = i.id
where i.is_active is true and w.is_active is true;

revoke all on public.v_warehouse_items from public, anon;
grant select on public.v_warehouse_items to authenticated;

create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.unit,
  w.id as warehouse_id,
  w.name as warehouse_name,
  (coalesce(o.opening_qty, 0) + coalesce(adj.quantity_delta, 0))::numeric(18,4) as opening_qty,
  (case when public.can_view_profit() then coalesce(public.read_protected_cost('opening', i.id, w.id), public.read_protected_purchase_price(i.id)) else null end)::numeric(18,4) as unit_cost,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  case when o.item_id is null then false else
    exists (
      select 1 from public.invoices inv join public.invoice_items ii on ii.invoice_id = inv.id
      where inv.company_id = i.company_id and inv.warehouse_id = w.id and ii.item_id = i.id
        and inv.created_at >= o.created_at
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = i.company_id and a.warehouse_id = w.id and a.item_id = i.id
    ) end as cost_locked,
  w.notes as warehouse_notes,
  i.notes as item_notes,
  i.serial_number as item_number,
  w.serial_number as warehouse_number,
  i.code as item_code,
  i.sale_price::numeric(18,4) as sale_price,
  public.read_protected_purchase_price(i.id)::numeric(18,4) as purchase_price
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join (
  select warehouse_id, item_id, sum(quantity_delta) as quantity_delta
  from public.stock_opening_adjustments
  group by warehouse_id, item_id
) adj on adj.warehouse_id = w.id and adj.item_id = i.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;

revoke all on public.v_stock_opening_balances from public, anon;
grant select on public.v_stock_opening_balances to authenticated;

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
left join public.item_stock s on s.item_id = i.id
group by i.id;

revoke all on public.v_item_stock from public, anon;
grant select on public.v_item_stock to authenticated;

-- منع تصفية عمود purchase_price وإخفاؤه في filter_master_item_rows و get_master_items_kpis_columns لغير المصرح لهم
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
    if jsonb_typeof(v_value) not in ('string', 'number', 'boolean', 'null') then
      raise exception 'invalid_filter_value' using errcode = '22023';
    end if;
    v_text := btrim(coalesce(v_value#>>'{}', ''));
    if v_text = '' then continue; end if;
    if p_scope = 'master_items' and v_key = 'purchase_price' and not public.can_view_purchase_price() then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
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

create or replace function public.filter_master_item_rows(p_columns jsonb, p_search text default null)
returns setof public.items
language plpgsql
stable
security definer
set search_path = public
as $rows$
declare
  v_company uuid := public.current_company_id();
  v_can_view_purchase boolean := public.can_view_purchase_price();
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  perform public.require_permission('data.items.view');
  perform public.validate_list_columns('master_items', p_columns);
  return query
  select
    v.id,
    v.company_id,
    v.name,
    v.unit,
    v.sale_price,
    (case when v_can_view_purchase then v.purchase_price else null::numeric(18,4) end)::numeric(18,4) as purchase_price,
    v.is_active,
    v.created_at,
    v.updated_at,
    v.notes,
    v.serial_number,
    v.code
  from public.items v
  where v.company_id = v_company
    and public.matches_list_columns('master_items', to_jsonb(v), p_columns)
    and public.matches_list_search('master_items', to_jsonb(v), p_search);
end $rows$;

revoke all on function public.filter_master_item_rows(jsonb, text) from public, anon;
grant execute on function public.filter_master_item_rows(jsonb, text) to authenticated;

-- منع تعديل purchase_price على جدول items من مستخدم لا يملك صلاحية رؤية/تعديل سعر الشراء
create or replace function public.guard_permission_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_subtab text;
  v_meta_changed boolean := false;
  v_opening_changed boolean := false;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and new.company_id = public.current_company_id() then
    if tg_table_name = 'accounts' then
      if (to_jsonb(new) - array['current_balance','effective_opening_balance',
            'invoiced_total','paid_total','has_documents','updated_at'])
         = (to_jsonb(old) - array['current_balance','effective_opening_balance',
            'invoiced_total','paid_total','has_documents','updated_at']) then
        return new;
      end if;
    elsif tg_table_name = 'cash_boxes' then
      if (to_jsonb(new) - array['current_balance','effective_opening_balance','updated_at'])
         = (to_jsonb(old) - array['current_balance','effective_opening_balance','updated_at']) then
        return new;
      end if;
    end if;
  end if;

  v_action := case when tg_op = 'INSERT' then 'create' when tg_op = 'DELETE' then 'delete' else 'edit' end;

  if tg_table_name = 'accounts' then
    v_subtab := case when coalesce(case when tg_op = 'DELETE' then old.kind else new.kind end, 'customer') = 'customer'
                     then 'customers' else 'suppliers' end;
    if tg_op = 'INSERT' then
      if not (public.has_permission('data.' || v_subtab || '.create') or public.has_permission('management.' || v_subtab || '.edit')) then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      perform public.require_permission('data.' || v_subtab || '.delete');
    else
      v_opening_changed := new.opening_balance is distinct from old.opening_balance;
      v_meta_changed := (to_jsonb(new) - array['opening_balance','current_balance','effective_opening_balance','invoiced_total','paid_total','has_documents','updated_at'])
                        is distinct from
                        (to_jsonb(old) - array['opening_balance','current_balance','effective_opening_balance','invoiced_total','paid_total','has_documents','updated_at']);
      if v_opening_changed then
        perform public.require_permission('management.' || v_subtab || '.edit');
      end if;
      if v_meta_changed then
        if old.is_active is true and new.is_active is false
           and (to_jsonb(new) - array['is_active','current_balance','effective_opening_balance','invoiced_total','paid_total','has_documents','updated_at'])
               = (to_jsonb(old) - array['is_active','current_balance','effective_opening_balance','invoiced_total','paid_total','has_documents','updated_at']) then
          if not (public.has_permission('data.' || v_subtab || '.edit') or public.has_permission('data.' || v_subtab || '.delete')) then
            raise exception 'permission_denied' using errcode = '42501';
          end if;
        else
          perform public.require_permission('data.' || v_subtab || '.edit');
        end if;
      end if;
      if not v_opening_changed and not v_meta_changed then
        if not (public.has_permission('data.' || v_subtab || '.edit') or public.has_permission('management.' || v_subtab || '.edit')) then
          raise exception 'permission_denied' using errcode = '42501';
        end if;
      end if;
    end if;

  elsif tg_table_name = 'items' then
    if tg_op = 'INSERT' then
      perform public.require_permission('data.items.create');
    elsif tg_op = 'DELETE' then
      perform public.require_permission('data.items.delete');
    else
      if old.is_active is true and new.is_active is false
         and (to_jsonb(new) - array['is_active','updated_at']) = (to_jsonb(old) - array['is_active','updated_at']) then
        if not (public.has_permission('data.items.edit') or public.has_permission('data.items.delete')) then
          raise exception 'permission_denied' using errcode = '42501';
        end if;
      else
        perform public.require_permission('data.items.edit');
      end if;
      if new.purchase_price is distinct from old.purchase_price and not public.can_view_purchase_price() then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
    end if;

  elsif tg_table_name = 'warehouses' then
    perform public.require_permission('data.warehouses.' || v_action);

  elsif tg_table_name = 'cash_boxes' then
    if tg_op = 'INSERT' then
      perform public.require_permission('data.cashBoxes.create');
    elsif tg_op = 'DELETE' then
      perform public.require_permission('data.cashBoxes.delete');
    else
      v_opening_changed := new.opening_balance is distinct from old.opening_balance;
      v_meta_changed := (to_jsonb(new) - array['opening_balance','current_balance','effective_opening_balance','updated_at'])
                        is distinct from
                        (to_jsonb(old) - array['opening_balance','current_balance','effective_opening_balance','updated_at']);
      if v_opening_changed then
        perform public.require_permission('management.cashBoxes.edit');
      end if;
      if v_meta_changed then
        perform public.require_permission('data.cashBoxes.edit');
      end if;
      if not v_opening_changed and not v_meta_changed then
        if not (public.has_permission('data.cashBoxes.edit') or public.has_permission('management.cashBoxes.edit')) then
          raise exception 'permission_denied' using errcode = '42501';
        end if;
      end if;
    end if;

  elsif tg_table_name = 'opening_balance_adjustments' then
    if tg_op <> 'DELETE' and new.account_id is not null then
      select case when kind = 'customer' then 'customers' else 'suppliers' end into v_subtab
      from public.accounts where id = new.account_id;
      perform public.require_permission('management.' || coalesce(v_subtab, 'customers') || '.edit');
    elsif tg_op <> 'DELETE' and new.cash_box_id is not null then
      perform public.require_permission('management.cashBoxes.edit');
    else
      perform public.require_permission('management.edit');
    end if;

  elsif tg_table_name = 'stock_opening_balances' then
    if tg_op = 'INSERT' then
      if not (public.has_permission('data.items.create') or public.has_permission('management.items.edit')) then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      if not (public.has_permission('data.items.delete') or public.has_permission('management.items.edit')) then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
    else
      perform public.require_permission('management.items.edit');
    end if;

  elsif tg_table_name = 'stock_opening_adjustments' then
    perform public.require_permission('management.items.edit');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_permission_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. توحيد قفل الحساب في create_invoice + حماية تاريخ واستعادة فاتورة الشراء
-- ---------------------------------------------------------------------
create or replace function public.create_invoice(
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
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_invoice uuid;
  v_total numeric(18,4) := 0;
  v_paid numeric(18,4) := coalesce(p_paid, 0);
  v_date date := coalesce(p_invoice_date, public.cairo_today());
  v_line record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_avail numeric(18,4);
begin
  perform public.require_permission('goods.' || p_kind || '.create');

  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind is null or p_kind not in ('sale', 'purchase', 'sale_return', 'purchase_return', 'waste') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  v_sign := case when p_kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  -- قفل صف الحساب قبل قفل المخزون والخزنة لتوحيد ترتيب الأقفال ومنع الـ deadlock
  select system_key into v_system_key
  from public.accounts
  where id = p_account_id and company_id = v_company and is_active
  for update;
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

    if p_kind in ('sale', 'waste', 'purchase_return') then
      select coalesce(qty, 0) into v_avail
      from public.item_stock
      where company_id = v_company and warehouse_id = p_warehouse_id and item_id = v_line.item_id;

      if coalesce(v_avail, 0) <= 0 or v_line.qty > v_avail then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
    end if;

    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;

  if p_kind = 'waste' and v_paid <> 0 then raise exception 'waste_cannot_be_paid' using errcode = '22023'; end if;
  if v_paid < 0 then raise exception 'invalid_paid' using errcode = '22023'; end if;
  if v_paid > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  if v_system_key in ('cash_customer', 'cash_supplier') and v_paid <> v_total then
    raise exception 'cash_account_requires_full_payment' using errcode = '22023';
  end if;

  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, notes, created_at)
  values (v_company, p_kind, public.next_document_number(v_company, p_kind), v_date,
          p_account_id, p_warehouse_id, v_total, v_total, v_paid, p_notes, clock_timestamp())
  returning id into v_invoice;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
    order by item_id asc
  loop
    v_unit_cost := public.apply_stock_movement(
      v_company, p_warehouse_id, v_line.item_id,
      v_sign * v_line.qty,
      case when p_kind = 'purchase' then v_line.unit_price else null end
    );

    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, v_invoice, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  perform public.recalc_invoice_totals(v_invoice);

  if p_kind <> 'waste' then
    perform public.sync_invoice_receipt(v_invoice, p_cash_box_id);
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

create or replace function public.update_invoice(
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
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_total numeric(18,4) := 0;
  v_paid numeric(18,4) := coalesce(p_paid, 0);
  v_date date := coalesce(p_invoice_date, public.cairo_today());
  v_line record;
  v_change record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_net_purchase_edit boolean := false;
  v_purchase_prices_unchanged boolean := false;
  v_has_subsequent_sales boolean := false;
  v_lines_changed boolean := false;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  if not public.has_permission('goods.sale.edit')
     and not public.has_permission('goods.purchase.edit')
     and not public.has_permission('goods.sale_return.edit')
     and not public.has_permission('goods.purchase_return.edit')
     and not public.has_permission('goods.waste.edit')
     and not public.is_company_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_deleted' using errcode = '22023'; end if;

  perform public.require_permission('goods.' || v_inv.kind || '.edit');
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  perform 1
  from public.accounts
  where company_id = v_company
    and id in (v_inv.account_id, p_account_id)
  order by id asc
  for update;

  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if (v_inv.kind = 'waste' and v_system_key <> 'waste')
     or (v_inv.kind <> 'waste' and v_system_key = 'waste') then
    raise exception 'invalid_account' using errcode = '22023';
  end if;
  perform 1 from public.warehouses where id = p_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if v_inv.kind = 'purchase' then
    v_has_subsequent_sales := public.purchase_invoice_has_later_outflow(p_invoice_id);

    if v_has_subsequent_sales then
      if p_warehouse_id <> v_inv.warehouse_id then
        raise exception 'cannot_modify_purchase_items_with_subsequent_sales' using errcode = '22023';
      end if;

      -- منع تغيير تاريخ فاتورة الشراء عندما تكون عليها حركات لاحقة لتفادي تجاوز فحص التاريخ
      if v_date <> v_inv.invoice_date then
        raise exception 'cannot_modify_purchase_date_with_subsequent_sales' using errcode = '22023';
      end if;

      select exists (
        select item_id, qty, unit_price from public.invoice_items where invoice_id = p_invoice_id
        except
        select item_id, qty, unit_price from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
      ) or exists (
        select item_id, qty, unit_price from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        except
        select item_id, qty, unit_price from public.invoice_items where invoice_id = p_invoice_id
      ) into v_lines_changed;

      if v_lines_changed then
        raise exception 'cannot_modify_purchase_items_with_subsequent_sales' using errcode = '22023';
      end if;
    elsif v_date < v_inv.invoice_date then
      -- منع إرجاع تاريخ فاتورة الشراء للخلف عبر حركات خروج أقدم منها
      if exists (
        select 1
        from public.invoice_items pii
        join public.invoices sinv on sinv.company_id = v_company
                                 and sinv.warehouse_id = v_inv.warehouse_id
                                 and sinv.deleted_at is null
                                 and sinv.kind in ('sale', 'waste', 'purchase_return')
                                 and sinv.id <> p_invoice_id
                                 and sinv.invoice_date >= v_date
                                 and (sinv.invoice_date < v_inv.invoice_date or (sinv.invoice_date = v_inv.invoice_date and sinv.created_at < v_inv.created_at))
        join public.invoice_items sii on sii.invoice_id = sinv.id and sii.item_id = pii.item_id
        where pii.invoice_id = p_invoice_id and pii.company_id = v_company
      ) or exists (
        select 1
        from public.invoice_items pii
        join public.warehouse_transfers wt on wt.company_id = v_company
                                          and wt.source_warehouse_id = v_inv.warehouse_id
                                          and wt.deleted_at is null
                                          and wt.transfer_date >= v_date
                                          and (wt.transfer_date < v_inv.invoice_date or (wt.transfer_date = v_inv.invoice_date and wt.created_at < v_inv.created_at))
        join public.warehouse_transfer_items wti on wti.transfer_id = wt.id and wti.item_id = pii.item_id
        where pii.invoice_id = p_invoice_id and pii.company_id = v_company
      ) then
        raise exception 'cannot_modify_purchase_date_with_subsequent_sales' using errcode = '22023';
      end if;
    end if;
  end if;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then raise exception 'line_missing_item' using errcode = '22023'; end if;
    if v_line.qty is null or v_line.qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then raise exception 'invalid_line_price' using errcode = '22023'; end if;
    if v_inv.kind = 'waste' and v_line.unit_price <> 0 then raise exception 'waste_price_must_be_zero' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;

  if v_inv.kind = 'waste' and v_paid <> 0 then raise exception 'waste_cannot_be_paid' using errcode = '22023'; end if;
  if v_paid < 0 then raise exception 'invalid_paid' using errcode = '22023'; end if;
  if v_paid > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  if v_system_key in ('cash_customer', 'cash_supplier') and v_paid <> v_total then
    raise exception 'cash_account_requires_full_payment' using errcode = '22023';
  end if;

  if v_inv.kind = 'purchase' and v_has_subsequent_sales and not v_lines_changed then
    update public.invoices
    set account_id = p_account_id,
        invoice_date = v_date,
        paid = v_paid,
        notes = p_notes
    where id = p_invoice_id and company_id = v_company;
    perform public.sync_invoice_receipt(p_invoice_id, p_cash_box_id);
    return p_invoice_id;
  end if;

  if v_inv.kind = 'purchase' and p_warehouse_id = v_inv.warehouse_id then
    select not exists (
      select 1
      from (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from public.invoice_items where invoice_id = p_invoice_id group by item_id
      ) old_lines
      join (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        group by item_id
      ) new_lines using (item_id)
      where old_lines.min_price <> new_lines.min_price
         or old_lines.max_price <> new_lines.max_price
    ) into v_purchase_prices_unchanged;

    if v_purchase_prices_unchanged then
      v_net_purchase_edit := true;
      for v_change in
        select item_id,
          sum(new_qty - old_qty)::numeric(18,4) as qty_delta,
          case when sum(new_qty) > 0 then sum(new_value) / sum(new_qty) else null end::numeric(18,4) as added_unit_cost
        from (
          select item_id, qty as old_qty, 0::numeric as new_qty, 0::numeric as new_value
          from public.invoice_items where invoice_id = p_invoice_id
          union all
          select item_id, 0::numeric, qty, qty * unit_price
          from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        ) lines
        group by item_id
        order by item_id asc
      loop
        if v_change.qty_delta <> 0 then
          v_unit_cost := public.apply_stock_movement(
            v_company, p_warehouse_id, v_change.item_id, v_change.qty_delta,
            case when v_change.qty_delta > 0 then v_change.added_unit_cost else null end
          );
        end if;
      end loop;
    end if;
  end if;

  if not v_net_purchase_edit then
    for v_line in
      select item_id, qty, unit_cost from public.invoice_items
      where invoice_id = p_invoice_id
      order by item_id asc
    loop
      perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
        -v_sign * v_line.qty, v_line.unit_cost);
    end loop;
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  update public.invoices set account_id = p_account_id, warehouse_id = p_warehouse_id,
    invoice_date = v_date, subtotal = v_total, total = v_total, paid = v_paid, notes = p_notes
  where id = p_invoice_id and company_id = v_company;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
    order by item_id asc
  loop
    if v_net_purchase_edit then
      v_unit_cost := v_line.unit_price;
    else
      v_unit_cost := public.apply_stock_movement(v_company, p_warehouse_id, v_line.item_id,
        v_sign * v_line.qty, case when v_inv.kind = 'purchase' then v_line.unit_price else null end);
    end if;
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, p_invoice_id, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  perform public.recalc_invoice_totals(p_invoice_id);

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id, p_cash_box_id); end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

create or replace function public.restore_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_line record;
  v_sign integer;
  v_avail numeric(18,4);
  v_unit_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  if not public.has_permission('goods.sale.delete')
     and not public.has_permission('goods.purchase.delete')
     and not public.has_permission('goods.sale_return.delete')
     and not public.has_permission('goods.purchase_return.delete')
     and not public.has_permission('goods.waste.delete')
     and not public.is_company_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is null then raise exception 'invoice_not_deleted' using errcode = '22023'; end if;

  perform public.require_permission('goods.' || v_inv.kind || '.delete');

  if v_inv.kind = 'purchase' and public.purchase_invoice_has_later_outflow(p_invoice_id) then
    raise exception 'cannot_restore_purchase_with_subsequent_sales' using errcode = '22023';
  end if;

  perform 1 from public.accounts
  where id = v_inv.account_id and company_id = v_company
  for update;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if v_inv.kind in ('sale', 'waste', 'purchase_return') then
    for v_line in select item_id, qty from public.invoice_items where invoice_id = p_invoice_id
    loop
      select coalesce(qty, 0) into v_avail from public.item_stock
      where company_id = v_company and warehouse_id = v_inv.warehouse_id and item_id = v_line.item_id;
      if coalesce(v_avail, 0) <= 0 or v_line.qty > v_avail then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
    end loop;
  end if;

  for v_line in
    select id, item_id, qty, unit_price from public.invoice_items
    where invoice_id = p_invoice_id
    order by item_id asc
  loop
    v_unit_cost := public.apply_stock_movement(
      v_company, v_inv.warehouse_id, v_line.item_id,
      v_sign * v_line.qty,
      case when v_inv.kind = 'purchase' then v_line.unit_price else null end
    );
    update public.invoice_items set unit_cost = v_unit_cost where id = v_line.id;
  end loop;

  perform public.recalc_invoice_totals(p_invoice_id);

  update public.invoices set deleted_at = null where id = p_invoice_id and company_id = v_company;
  if v_inv.paid > 0 then
    perform public.sync_invoice_receipt(p_invoice_id);
  end if;
end;
$$;

revoke all on function public.restore_invoice(uuid) from public, anon;
grant execute on function public.restore_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. إصلاح update_free_receipt و delete_free_receipt و restore_receipt و create_cash_box_transfer
-- ---------------------------------------------------------------------
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
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_receipt from public.receipts where id = p_receipt_id and company_id = v_company for update;
  if not found then raise exception 'receipt_not_found' using errcode = '22023'; end if;
  if v_receipt.invoice_id is not null then raise exception 'receipt_linked_immutable' using errcode = '22023'; end if;
  if v_receipt.deleted_at is not null then raise exception 'receipt_already_deleted' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

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

    if v_receipt.direction = 'out' and (v_cash_bal + v_receipt.amount) < p_amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    elsif v_receipt.direction = 'in' and (v_cash_bal - v_receipt.amount + p_amount) < 0 then
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
    elsif v_receipt.direction = 'out' and v_cash_bal < p_amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  end if;

  update public.receipts set account_id = p_account_id, cash_box_id = p_cash_box_id,
    receipt_date = coalesce(p_receipt_date, public.cairo_today()), amount = p_amount,
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

  -- قفل الحساب قبل الخزنة لتوحيد ترتيب الأقفال
  perform 1 from public.accounts
  where id = v_receipt.account_id and company_id = v_company
  for update;

  if v_receipt.direction = 'in' then
    select current_balance into v_cash_bal from public.cash_boxes
    where id = v_receipt.cash_box_id and company_id = v_company for update;
    if coalesce(v_cash_bal, 0) < v_receipt.amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  end if;

  update public.receipts set deleted_at = now() where id = p_receipt_id and company_id = v_company;
end;
$$;

revoke all on function public.delete_free_receipt(uuid) from public, anon;
grant execute on function public.delete_free_receipt(uuid) to authenticated;

create or replace function public.restore_receipt(p_receipt_id uuid)
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
  if v_receipt.deleted_at is null then raise exception 'receipt_not_deleted' using errcode = '22023'; end if;

  perform public.require_permission('money.' || v_receipt.direction || '.delete');
  perform public.require_permission('money.delete');

  -- قفل الحساب قبل الخزنة لتوحيد ترتيب الأقفال
  perform 1 from public.accounts
  where id = v_receipt.account_id and company_id = v_company
  for update;

  if v_receipt.direction = 'out' then
    select current_balance into v_cash_bal from public.cash_boxes
    where id = v_receipt.cash_box_id and company_id = v_company and is_active for update;
    if not found or coalesce(v_cash_bal, 0) < v_receipt.amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  end if;

  update public.receipts set deleted_at = null where id = p_receipt_id and company_id = v_company;
end;
$$;

revoke all on function public.restore_receipt(uuid) from public, anon;
grant execute on function public.restore_receipt(uuid) to authenticated;

create or replace function public.create_cash_box_transfer(
  p_source_cash_box_id uuid, p_destination_cash_box_id uuid, p_transfer_date date,
  p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_source_box public.cash_boxes%rowtype;
begin
  perform public.require_permission('money.cash_box_transfer.create');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_source_cash_box_id is null or p_destination_cash_box_id is null
     or p_source_cash_box_id = p_destination_cash_box_id then
    raise exception 'invalid_transfer_cash_boxes' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_transfer_amount' using errcode = '22023'; end if;

  perform 1 from public.cash_boxes
  where company_id = v_company and id in (p_source_cash_box_id, p_destination_cash_box_id)
  order by id asc for update;

  select * into v_source_box from public.cash_boxes
  where id = p_source_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  perform 1 from public.cash_boxes
  where id = p_destination_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  if coalesce(v_source_box.current_balance, 0) < p_amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  insert into public.cash_box_transfers(company_id, number, transfer_date, source_cash_box_id, destination_cash_box_id, amount, notes)
  values (v_company, public.next_document_number(v_company, 'cash_box_transfer'), coalesce(p_transfer_date, public.cairo_today()), p_source_cash_box_id, p_destination_cash_box_id, round(p_amount, 4), p_notes)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_cash_box_transfer(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.create_cash_box_transfer(uuid, uuid, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. توحيد ترتيب الأقفال في save_opening_balances (المخزون قبل الخزن)
-- ---------------------------------------------------------------------
create or replace function public.save_opening_balances(
  p_cash_boxes jsonb,
  p_stock jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash record;
  v_stock record;
  v_open public.stock_opening_balances%rowtype;
  v_box public.cash_boxes%rowtype;
  v_delta numeric(18,4);
  v_effective numeric(18,4);
  v_has_activity boolean;
  v_current_effective_opening numeric(18,4);
begin
  perform public.require_permission('management.edit');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_cash_boxes) <> 'array' or jsonb_typeof(p_stock) <> 'array' then
    raise exception 'invalid_opening_balances' using errcode = '22023';
  end if;

  if jsonb_array_length(p_cash_boxes) > 0 then
    perform public.require_permission('management.cashBoxes.edit');
  end if;
  if jsonb_array_length(p_stock) > 0 then
    perform public.require_permission('management.items.edit');
  end if;

  -- معالجة وقفل المخزون أولاً قبل الخزن لتطابق الترتيب العام (item_stock -> cash_boxes)
  for v_stock in
    select *
    from jsonb_to_recordset(p_stock) as x(warehouse_id uuid, item_id uuid, opening_qty numeric, unit_cost numeric)
    order by warehouse_id asc, item_id asc
  loop
    if v_stock.opening_qty is null or v_stock.opening_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
    if not public.can_view_profit() then
      if v_stock.unit_cost is not null then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
      select coalesce(o.unit_cost, i.purchase_price, 0) into v_stock.unit_cost
      from public.items i
      left join public.stock_opening_balances o
        on o.item_id = i.id and o.company_id = v_company
        and o.warehouse_id = v_stock.warehouse_id
      where i.id = v_stock.item_id and i.company_id = v_company;
    end if;
    if v_stock.unit_cost is null or v_stock.unit_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_stock.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = v_stock.warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

    select * into v_open from public.stock_opening_balances
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id for update;

    if not found then
      if v_stock.opening_qty > 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_stock.opening_qty, v_stock.unit_cost);
      else
        insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, round(v_stock.unit_cost, 4))
        on conflict (warehouse_id, item_id) do update set avg_cost = excluded.avg_cost;
      end if;
      insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
      values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      continue;
    end if;

    select v_open.opening_qty + coalesce((
      select sum(quantity_delta) from public.stock_opening_adjustments
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id
    ), 0) into v_current_effective_opening;

    v_delta := round(v_stock.opening_qty, 4) - v_current_effective_opening;

    select exists (
      select 1 from public.invoices inv
      join public.invoice_items ii on ii.invoice_id = inv.id and ii.company_id = inv.company_id
      where inv.company_id = v_company
        and inv.warehouse_id = v_stock.warehouse_id
        and ii.item_id = v_stock.item_id
        and inv.deleted_at is null
    ) or exists (
      select 1 from public.warehouse_transfers t
      join public.warehouse_transfer_items ti on ti.transfer_id = t.id and ti.company_id = t.company_id
      where t.company_id = v_company
        and v_stock.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
        and ti.item_id = v_stock.item_id
        and t.deleted_at is null
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = v_company
        and a.warehouse_id = v_stock.warehouse_id
        and a.item_id = v_stock.item_id
    ) into v_has_activity;

    if v_has_activity then
      if round(v_stock.unit_cost, 4) <> v_open.unit_cost then
        raise exception 'opening_stock_cost_locked' using errcode = '22023';
      end if;
      if v_delta <> 0 then
        select public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, null) into v_effective;
        insert into public.stock_opening_adjustments(company_id, warehouse_id, item_id, quantity_delta, unit_cost, note)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    else
      if v_delta <> 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_stock.unit_cost);
      end if;
      update public.item_stock
      set avg_cost = round(v_stock.unit_cost, 4)
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
      update public.stock_opening_balances
      set opening_qty = round(v_stock.opening_qty, 4),
          unit_cost = round(v_stock.unit_cost, 4)
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
    end if;
  end loop;

  for v_cash in
    select *
    from jsonb_to_recordset(p_cash_boxes) as x(cash_box_id uuid, opening_balance numeric)
    order by cash_box_id asc
  loop
    if v_cash.opening_balance is null then raise exception 'invalid_opening_balance' using errcode = '22023'; end if;
    select * into v_box from public.cash_boxes where id = v_cash.cash_box_id and company_id = v_company for update;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    select v_box.opening_balance + coalesce(sum(amount_delta), 0) into v_effective
      from public.opening_balance_adjustments where cash_box_id = v_box.id;
    if round(v_cash.opening_balance, 4) <> v_effective then
      if coalesce(v_box.current_balance, 0) + (round(v_cash.opening_balance, 4) - v_effective) < 0 then
        raise exception 'insufficient_cash_box_balance' using errcode = '22023';
      end if;
      if not exists (select 1 from public.receipts where cash_box_id = v_box.id)
         and not exists (select 1 from public.opening_balance_adjustments where cash_box_id = v_box.id)
         and not exists (select 1 from public.cash_box_transfers where source_cash_box_id = v_box.id or destination_cash_box_id = v_box.id) then
        update public.cash_boxes set opening_balance = round(v_cash.opening_balance, 4) where id = v_box.id;
      else
        insert into public.opening_balance_adjustments(company_id, cash_box_id, amount_delta, note)
        values (v_company, v_box.id, round(v_cash.opening_balance, 4) - v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_opening_balances(jsonb, jsonb) from public, anon;
grant execute on function public.save_opening_balances(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. قفل صفوف item_stock بترتيب (warehouse_id, item_id) في جميع دوال التحويل المخزني
-- ---------------------------------------------------------------------
create or replace function public.create_warehouse_transfer(
  p_source_warehouse_id uuid, p_destination_warehouse_id uuid, p_transfer_date date,
  p_notes text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_line record;
  v_lock record;
  v_source_qty numeric(18,4);
  v_source_cost numeric(18,4);
  v_cost numeric(18,4);
begin
  perform public.require_permission('goods.warehouse_transfer.create');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_source_warehouse_id is null or p_destination_warehouse_id is null
     or p_source_warehouse_id = p_destination_warehouse_id then
    raise exception 'invalid_transfer_warehouses' using errcode = '22023';
  end if;
  perform 1 from public.warehouses where id = p_source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_has_no_lines' using errcode = '22023';
  end if;

  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id asc
  loop
    if v_line.item_id is null or v_line.qty is null or v_line.qty <= 0 then
      raise exception 'invalid_transfer_line' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
  end loop;

  -- قفل جميع صفوف item_stock المتأثرة بترتيب ثابت (warehouse_id, item_id) لمنع deadlock بين تحويلين متعاكسين
  for v_lock in
    select distinct wh_id as warehouse_id, l.item_id
    from (
      select distinct item_id from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    ) l
    cross join (values (p_source_warehouse_id), (p_destination_warehouse_id)) as w(wh_id)
    order by warehouse_id asc, l.item_id asc
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
    values (v_company, v_lock.warehouse_id, v_lock.item_id, 0, 0)
    on conflict (warehouse_id, item_id) do nothing;

    perform 1 from public.item_stock
    where company_id = v_company and warehouse_id = v_lock.warehouse_id and item_id = v_lock.item_id
    for update;
  end loop;

  insert into public.warehouse_transfers(company_id, number, transfer_date, source_warehouse_id, destination_warehouse_id, notes, created_at)
  values (v_company, public.next_document_number(v_company, 'warehouse_transfer'), coalesce(p_transfer_date, public.cairo_today()), p_source_warehouse_id, p_destination_warehouse_id, p_notes, clock_timestamp())
  returning id into v_id;

  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id asc
  loop
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id;
    if not found or v_source_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    v_cost := public.apply_stock_movement(v_company, p_source_warehouse_id, v_line.item_id, -v_line.qty, v_source_cost);
    perform public.apply_stock_movement(v_company, p_destination_warehouse_id, v_line.item_id, v_line.qty, v_cost);
    insert into public.warehouse_transfer_items(company_id, transfer_id, item_id, qty, unit_cost)
    values (v_company, v_id, v_line.item_id, v_line.qty, v_cost);
  end loop;
  return v_id;
end;
$$;

revoke all on function public.create_warehouse_transfer(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.create_warehouse_transfer(uuid, uuid, date, text, jsonb) to authenticated;

create or replace function public.update_warehouse_transfer(
  p_transfer_id uuid, p_source_warehouse_id uuid, p_destination_warehouse_id uuid,
  p_transfer_date date, p_notes text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_transfer public.warehouse_transfers%rowtype;
  v_line record;
  v_lock record;
  v_source_qty numeric(18,4);
  v_source_cost numeric(18,4);
  v_cost numeric(18,4);
begin
  perform public.require_permission('goods.warehouse_transfer.edit');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;
  if p_source_warehouse_id = p_destination_warehouse_id then raise exception 'invalid_transfer_warehouses' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_has_no_lines' using errcode = '22023';
  end if;

  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id asc
  loop
    if v_line.item_id is null or v_line.qty is null or v_line.qty <= 0 then
      raise exception 'invalid_transfer_line' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
  end loop;

  for v_lock in
    select distinct wh_id as warehouse_id, it_id as item_id
    from (
      select v_transfer.source_warehouse_id as wh_id, item_id as it_id from public.warehouse_transfer_items where transfer_id = p_transfer_id
      union
      select v_transfer.destination_warehouse_id, item_id from public.warehouse_transfer_items where transfer_id = p_transfer_id
      union
      select p_source_warehouse_id, item_id from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
      union
      select p_destination_warehouse_id, item_id from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    ) pairs
    order by warehouse_id asc, item_id asc
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
    values (v_company, v_lock.warehouse_id, v_lock.item_id, 0, 0)
    on conflict (warehouse_id, item_id) do nothing;

    perform 1 from public.item_stock
    where company_id = v_company and warehouse_id = v_lock.warehouse_id and item_id = v_lock.item_id
    for update;
  end loop;

  for v_line in select item_id, qty, unit_cost from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id asc
  loop
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
  end loop;

  delete from public.warehouse_transfer_items where transfer_id = p_transfer_id;
  update public.warehouse_transfers
  set source_warehouse_id = p_source_warehouse_id,
      destination_warehouse_id = p_destination_warehouse_id,
      transfer_date = coalesce(p_transfer_date, public.cairo_today()),
      notes = p_notes
  where id = p_transfer_id and company_id = v_company;

  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id asc
  loop
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id;
    if not found or v_source_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    v_cost := public.apply_stock_movement(v_company, p_source_warehouse_id, v_line.item_id, -v_line.qty, v_source_cost);
    perform public.apply_stock_movement(v_company, p_destination_warehouse_id, v_line.item_id, v_line.qty, v_cost);
    insert into public.warehouse_transfer_items(company_id, transfer_id, item_id, qty, unit_cost)
    values (v_company, p_transfer_id, v_line.item_id, v_line.qty, v_cost);
  end loop;
  return p_transfer_id;
end;
$$;

revoke all on function public.update_warehouse_transfer(uuid, uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.update_warehouse_transfer(uuid, uuid, uuid, date, text, jsonb) to authenticated;

create or replace function public.delete_warehouse_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_transfer public.warehouse_transfers%rowtype;
  v_line record;
  v_lock record;
begin
  perform public.require_permission('goods.warehouse_transfer.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;

  for v_lock in
    select distinct wh_id as warehouse_id, item_id
    from public.warehouse_transfer_items wti
    cross join (values (v_transfer.source_warehouse_id), (v_transfer.destination_warehouse_id)) as w(wh_id)
    where wti.transfer_id = p_transfer_id
    order by warehouse_id asc, item_id asc
  loop
    perform 1 from public.item_stock
    where company_id = v_company and warehouse_id = v_lock.warehouse_id and item_id = v_lock.item_id
    for update;
  end loop;

  for v_line in select * from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id asc loop
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
  end loop;
  update public.warehouse_transfers set deleted_at = now() where id = p_transfer_id and company_id = v_company;
end;
$$;

revoke all on function public.delete_warehouse_transfer(uuid) from public, anon;
grant execute on function public.delete_warehouse_transfer(uuid) to authenticated;

create or replace function public.restore_warehouse_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
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
-- 6. استبعاد التواريخ المستقبلية (> cairo_today()) من ملخص ورسوم لوحة التحكم
-- ---------------------------------------------------------------------
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

  v_can_view_sales := (public.has_permission('goods.sale.view') or public.has_permission('goods.view') or public.is_company_owner());
  v_can_view_collections := (public.has_permission('money.in.view') or public.has_permission('money.view') or public.is_company_owner());
  v_can_view_cash := (public.has_permission('money.view') or public.has_permission('balances.cashBoxes.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_customers := (public.has_permission('balances.customers.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_suppliers := (public.has_permission('balances.suppliers.view') or public.has_permission('balances.view') or public.is_company_owner());
  v_can_view_items := (public.has_permission('balances.items.view') or public.has_permission('balances.view') or public.has_permission('goods.view') or public.is_company_owner());

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
      and invoice_date >= v_cairo_today - interval '29 days'
      and invoice_date <= v_cairo_today;

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
        and inv.invoice_date <= v_cairo_today
      group by i.id, i.name, i.unit
      order by total_qty desc
      limit 5
    ) item_row;

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
        and inv.invoice_date <= v_cairo_today
      group by a.id, a.name
      having coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0) > 0
      order by total_amount desc
      limit 5
    ) cust_row;
  end if;

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
      and receipt_date >= v_cairo_today - 1
      and receipt_date <= v_cairo_today;
  end if;

  if v_can_view_cash then
    select coalesce(sum(current_balance), 0)::numeric(18,4)
    into v_cash_balance
    from public.cash_boxes
    where company_id = v_company_id
      and is_active = true;
  end if;

  if v_can_view_customers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_receivables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'customer'
      and is_active = true;
  end if;

  if v_can_view_suppliers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_payables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'supplier'
      and is_active = true;
  end if;

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

  if v_effective_days = 0 then
    select coalesce(min(invoice_date), v_cairo_today - 29)
    into v_start_date
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and invoice_date <= v_cairo_today
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
      and invoice_date >= v_start_date
      and invoice_date <= v_cairo_today;

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
        and inv.invoice_date <= v_cairo_today
      group by i.id, i.name, i.unit
      order by total_qty desc
      limit 10
    ) item_row;

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
        and inv.invoice_date <= v_cairo_today
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

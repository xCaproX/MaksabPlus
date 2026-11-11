-- =====================================================================
-- 20261111170000_0080_permissions_security_and_lock_order.sql
-- المرحلة 3: إحكام الصلاحيات الفرعية والأمان وتوحيد ترتيب الأقفال في قاعدة البيانات
-- 1. دعم مفاتيح الصلاحيات الفرعية بحروف كبيرة/صغيرة (مثل cashBoxes) في قيد الجدول ودالة has_permission.
-- 2. سحب صلاحيات الدوال المساعدة الداخلية من authenticated وتثبيت search_path وحماية العروض (Views).
-- 3. فرض الصلاحيات الفرعية الدقيقة على دوال البيانات الأساسية والأرصدة الافتتاحية وكشوف الحسابات.
-- 4. إضافة دالة save_account_opening_balances لحفظ الأرصدة الافتتاحية للحسابات في معاملة ذرية واحدة.
-- 5. حماية purchase_price في عروض المخزون لغير المصرح لهم برؤية التكلفة أو المشتريات أو بيانات الأصناف.
-- 6. توحيد ترتيب الأقفال (invoices -> accounts -> item_stock -> receipts -> cash_boxes) في دوال الفواتير.
-- 7. شمول الأصناف والمخازن الموقوفة التي لها حركات سابقة في reconcile_item_stock_internal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. دعم مفاتيح الصلاحيات الفرعية (cashBoxes / cash_boxes) في الجدول والدوال
-- ---------------------------------------------------------------------
alter table public.user_permissions drop constraint if exists user_permissions_permission_key_check;
alter table public.user_permissions drop constraint if exists user_permissions_permission_key_format;
alter table public.user_permissions add constraint user_permissions_permission_key_format
  check (permission_key ~ '^[a-zA-Z_]+(\.[a-zA-Z_]+)+$' or permission_key = '*');

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_owner() or exists(
    select 1
    from public.user_permissions up
    join public.profiles p on p.id = up.user_id and p.company_id = up.company_id
    cross join lateral (
      select
        replace(up.permission_key, 'cashBoxes', 'cash_boxes') as norm_up,
        replace(p_key, 'cashBoxes', 'cash_boxes') as norm_key
    ) n
    where up.user_id = auth.uid()
      and p.is_active
      and (
        n.norm_up = n.norm_key
        or up.permission_key = '*'
        or (
          split_part(n.norm_key, '.', 3) <> ''
          and n.norm_up = (split_part(n.norm_key, '.', 1) || '.' || split_part(n.norm_key, '.', 3))
        )
        or (
          split_part(n.norm_key, '.', 3) = ''
          and n.norm_up like (split_part(n.norm_key, '.', 1) || '.%.' || split_part(n.norm_key, '.', 2))
        )
      )
  );
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.set_user_permissions(p_user_id uuid, p_permission_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_company uuid := public.current_company_id();
begin
  if not public.is_company_owner() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_permission_keys, '{}'::text[])) k
    where k !~ '^[a-zA-Z_]+(\.[a-zA-Z_]+)+$' and k <> '*'
  ) then
    raise exception 'invalid_permission_key' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_user_id and company_id = v_company and access_role = 'employee'
  ) then
    raise exception 'invalid_company_user' using errcode = '22023';
  end if;

  delete from public.user_permissions
  where user_id = p_user_id and company_id = v_company;

  for v_key in select distinct unnest(coalesce(p_permission_keys, '{}'::text[])) loop
    insert into public.user_permissions(company_id, user_id, permission_key)
    values (v_company, p_user_id, v_key);
  end loop;
end;
$$;

revoke all on function public.set_user_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_user_permissions(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. تحصين الدوال المساعدة الداخلية وتثبيت search_path وحماية العروض
-- ---------------------------------------------------------------------
revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;
revoke all on function public.purchase_invoice_has_later_outflow(uuid) from public, anon, authenticated;
revoke all on function public.recalc_invoice_totals(uuid) from public, anon, authenticated;

alter function public.cairo_today() set search_path = public;
alter function public.set_updated_at() set search_path = public;

revoke all on
  public.v_stock_opening_balances,
  public.v_account_balances,
  public.v_cash_box_balances,
  public.v_invoice_list,
  public.v_invoice_items,
  public.v_item_stock
from public, anon;

grant select on
  public.v_stock_opening_balances,
  public.v_account_balances,
  public.v_cash_box_balances,
  public.v_invoice_list,
  public.v_invoice_items,
  public.v_item_stock
to authenticated;

-- ---------------------------------------------------------------------
-- 3. حماية purchase_price في عروض المخزون لغير المصرح لهم
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
      or public.has_permission('goods.purchase_return.edit')
      or public.has_permission('data.items.view')
      or public.has_permission('data.items.create')
      or public.has_permission('data.items.edit');
$$;

revoke all on function public.can_view_purchase_price() from public, anon;
grant execute on function public.can_view_purchase_price() to authenticated;

create or replace view public.v_warehouse_items
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.code as item_code,
  i.unit,
  i.sale_price,
  (case when public.can_view_purchase_price() then i.purchase_price else null::numeric end)::numeric(18,4) as purchase_price,
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
             i.purchase_price, 0)::numeric(18,4)
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
  (case when public.can_view_profit() then coalesce(public.read_protected_cost('opening', i.id, w.id), i.purchase_price) else null end)::numeric(18,4) as unit_cost,
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
  (case when public.can_view_purchase_price() then i.purchase_price else null::numeric end)::numeric(18,4) as purchase_price
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
  (case when public.can_view_purchase_price() then i.purchase_price else null::numeric end)::numeric(18,4) as purchase_price,
  i.is_active,
  coalesce(sum(s.qty), 0)::numeric(18,4) as qty,
  i.code
from public.items i
left join public.item_stock s on s.item_id = i.id
group by i.id;

revoke all on public.v_item_stock from public, anon;
grant select on public.v_item_stock to authenticated;

-- ---------------------------------------------------------------------
-- 4. فرض الصلاحيات الفرعية على دوال البيانات الأساسية والأرصدة الافتتاحية
-- ---------------------------------------------------------------------
create or replace function public.create_warehouse(
  p_name text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.warehouses.create');

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'warehouse_name_required' using errcode = '22023';
  end if;

  insert into public.warehouses (company_id, name, notes)
  values (v_company, btrim(p_name), nullif(btrim(p_notes), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_warehouse(text, text) from public, anon;
grant execute on function public.create_warehouse(text, text) to authenticated;

create or replace function public.update_warehouse(
  p_warehouse_id uuid,
  p_name text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.warehouses.edit');

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'warehouse_name_required' using errcode = '22023';
  end if;

  update public.warehouses
  set name = btrim(p_name),
      notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_warehouse_id
    and company_id = v_company;

  if not found then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.update_warehouse(uuid, text, text) from public, anon;
grant execute on function public.update_warehouse(uuid, text, text) to authenticated;

create or replace function public.toggle_warehouse_active(
  p_warehouse_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_next_state boolean;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.warehouses.edit');

  update public.warehouses
  set is_active = not is_active,
      updated_at = now()
  where id = p_warehouse_id
    and company_id = v_company
  returning is_active into v_next_state;

  if not found then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;

  return v_next_state;
end;
$$;

revoke all on function public.toggle_warehouse_active(uuid) from public, anon;
grant execute on function public.toggle_warehouse_active(uuid) to authenticated;

create or replace function public.delete_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_warehouse public.warehouses%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.warehouses.delete');

  select * into v_warehouse from public.warehouses
  where id = p_warehouse_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_not_found' using errcode = '22023'; end if;
  if v_warehouse.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.invoices where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_documents' using errcode = '23514';
  end if;
  if exists (select 1 from public.warehouse_transfers where company_id = v_company and p_warehouse_id in (source_warehouse_id, destination_warehouse_id)) then
    raise exception 'warehouse_has_transfers' using errcode = '23514';
  end if;
  if exists (select 1 from public.item_stock where company_id = v_company and warehouse_id = p_warehouse_id and qty <> 0)
     or exists (select 1 from public.stock_opening_adjustments where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_stock_for_delete' using errcode = '23514';
  end if;
  delete from public.warehouses where id = p_warehouse_id and company_id = v_company;
end;
$$;

revoke all on function public.delete_warehouse(uuid) from public, anon;
grant execute on function public.delete_warehouse(uuid) to authenticated;

create or replace function public.create_cash_box_with_opening_balance_and_notes(
  p_name text,
  p_opening_balance numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash_box_id uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.cashBoxes.create');
  if p_name is null or btrim(p_name) = '' then raise exception 'cash_box_name_required' using errcode = '22023'; end if;
  if p_opening_balance is null then raise exception 'invalid_opening_balance' using errcode = '22023'; end if;

  insert into public.cash_boxes(company_id, name, opening_balance, notes)
  values (v_company, btrim(p_name), round(p_opening_balance, 4), nullif(btrim(p_notes), ''))
  returning id into v_cash_box_id;

  return v_cash_box_id;
end;
$$;

revoke all on function public.create_cash_box_with_opening_balance_and_notes(text, numeric, text) from public, anon;
grant execute on function public.create_cash_box_with_opening_balance_and_notes(text, numeric, text) to authenticated;

create or replace function public.update_cash_box(
  p_cash_box_id uuid,
  p_name text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.cashBoxes.edit');

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'cash_box_name_required' using errcode = '22023';
  end if;

  update public.cash_boxes
  set name = btrim(p_name),
      notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_cash_box_id
    and company_id = v_company;

  if not found then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.update_cash_box(uuid, text, text) from public, anon;
grant execute on function public.update_cash_box(uuid, text, text) to authenticated;

create or replace function public.toggle_cash_box_active(
  p_cash_box_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_is_primary boolean;
  v_current_active boolean;
  v_next_state boolean;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.cashBoxes.edit');

  select is_primary, is_active into v_is_primary, v_current_active
  from public.cash_boxes
  where id = p_cash_box_id
    and company_id = v_company;

  if not found then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;

  if v_is_primary and v_current_active then
    raise exception 'primary_location_protected' using errcode = '23514';
  end if;

  update public.cash_boxes
  set is_active = not is_active,
      updated_at = now()
  where id = p_cash_box_id
    and company_id = v_company
  returning is_active into v_next_state;

  return v_next_state;
end;
$$;

revoke all on function public.toggle_cash_box_active(uuid) from public, anon;
grant execute on function public.toggle_cash_box_active(uuid) to authenticated;

create or replace function public.delete_cash_box(p_cash_box_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash_box public.cash_boxes%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.cashBoxes.delete');

  select * into v_cash_box from public.cash_boxes
  where id = p_cash_box_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_not_found' using errcode = '22023'; end if;
  if v_cash_box.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.receipts where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_documents' using errcode = '23514';
  end if;
  if exists (select 1 from public.cash_box_transfers where company_id = v_company and p_cash_box_id in (source_cash_box_id, destination_cash_box_id)) then
    raise exception 'cash_box_has_transfers' using errcode = '23514';
  end if;
  if coalesce(v_cash_box.opening_balance, 0) <> 0
     or exists (select 1 from public.opening_balance_adjustments where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_balance' using errcode = '23514';
  end if;
  delete from public.cash_boxes where id = p_cash_box_id and company_id = v_company;
end;
$$;

revoke all on function public.delete_cash_box(uuid) from public, anon;
grant execute on function public.delete_cash_box(uuid) to authenticated;

create or replace function public.create_item_with_opening_stock(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item uuid;
  v_qty numeric(18,4) := round(coalesce(p_opening_qty, 0), 4);
  v_cost numeric(18,4) := round(coalesce(p_unit_cost, 0), 4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.items.create');
  if p_name is null or btrim(p_name) = '' then raise exception 'item_name_required' using errcode = '22023'; end if;
  if coalesce(p_sale_price, 0) < 0 or coalesce(p_purchase_price, 0) < 0 then
    raise exception 'invalid_line_price' using errcode = '22023';
  end if;
  if v_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
  if v_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
  if v_qty > 0 and p_warehouse_id is null then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if p_warehouse_id is not null then
    perform 1 from public.warehouses
    where id = p_warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  end if;

  insert into public.items(company_id, name, unit, sale_price, purchase_price, is_active)
  values (v_company, btrim(p_name), coalesce(nullif(btrim(p_unit), ''), 'قطعة'),
    coalesce(p_sale_price, 0), coalesce(p_purchase_price, 0), coalesce(p_is_active, true))
  returning id into v_item;

  if p_warehouse_id is not null then
    if v_qty > 0 then
      perform public.apply_stock_movement(v_company, p_warehouse_id, v_item, v_qty, v_cost);
    else
      insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
      values (v_company, p_warehouse_id, v_item, 0, v_cost);
    end if;
    insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
    values (v_company, p_warehouse_id, v_item, v_qty, v_cost);
  end if;
  return v_item;
end;
$$;

revoke all on function public.create_item_with_opening_stock(text, text, numeric, numeric, boolean, uuid, numeric, numeric) from public, anon;
grant execute on function public.create_item_with_opening_stock(text, text, numeric, numeric, boolean, uuid, numeric, numeric) to authenticated;

create or replace function public.create_item_with_opening_stock_and_notes(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_item_with_opening_stock_and_notes_and_code(
    p_name, p_unit, p_sale_price, p_purchase_price, p_is_active,
    p_warehouse_id, p_opening_qty, p_unit_cost, p_notes, null
  );
end;
$$;

revoke all on function public.create_item_with_opening_stock_and_notes(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.create_item_with_opening_stock_and_notes(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text) to authenticated;

create or replace function public.create_item_with_opening_stock_and_notes_and_code(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric,
  p_notes text,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item uuid;
  v_qty numeric(18,4) := round(coalesce(p_opening_qty, 0), 4);
  v_cost numeric(18,4) := round(coalesce(p_unit_cost, 0), 4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.items.create');
  if p_name is null or btrim(p_name) = '' then raise exception 'item_name_required' using errcode = '22023'; end if;
  if coalesce(p_sale_price, 0) < 0 or coalesce(p_purchase_price, 0) < 0 then
    raise exception 'invalid_line_price' using errcode = '22023';
  end if;
  if v_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
  if v_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
  if v_qty > 0 and p_warehouse_id is null then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if p_warehouse_id is not null then
    perform 1 from public.warehouses
    where id = p_warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  end if;

  insert into public.items(company_id, name, unit, sale_price, purchase_price, is_active, notes, code)
  values (
    v_company,
    btrim(p_name),
    coalesce(nullif(btrim(p_unit), ''), 'قطعة'),
    coalesce(p_sale_price, 0),
    coalesce(p_purchase_price, 0),
    coalesce(p_is_active, true),
    nullif(btrim(p_notes), ''),
    nullif(btrim(p_code), '')
  )
  returning id into v_item;

  if p_warehouse_id is not null then
    if v_qty > 0 then
      perform public.apply_stock_movement(v_company, p_warehouse_id, v_item, v_qty, v_cost);
    else
      insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
      values (v_company, p_warehouse_id, v_item, 0, v_cost);
    end if;
    insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
    values (v_company, p_warehouse_id, v_item, v_qty, v_cost);
  end if;

  return v_item;
end;
$$;

revoke all on function public.create_item_with_opening_stock_and_notes_and_code(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_item_with_opening_stock_and_notes_and_code(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text, text) to authenticated;

create or replace function public.delete_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('data.items.delete');
  if not exists (select 1 from public.items where id = p_item_id and company_id = v_company) then
    raise exception 'item_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoice_items where item_id = p_item_id)
     or exists (select 1 from public.warehouse_transfer_items where item_id = p_item_id)
     or exists (select 1 from public.stock_opening_adjustments where item_id = p_item_id)
     or exists (select 1 from public.stock_opening_balances where item_id = p_item_id and opening_qty <> 0)
     or exists (select 1 from public.item_stock where item_id = p_item_id and qty <> 0) then
    update public.items set is_active = false where id = p_item_id and company_id = v_company;
    return false;
  end if;
  delete from public.stock_opening_balances where item_id = p_item_id and company_id = v_company;
  delete from public.item_stock where item_id = p_item_id and company_id = v_company;
  delete from public.items where id = p_item_id and company_id = v_company;
  return true;
end;
$$;

revoke all on function public.delete_item(uuid) from public, anon;
grant execute on function public.delete_item(uuid) to authenticated;

create or replace function public.delete_account(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_account public.accounts%rowtype;
  v_tab text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('data.customers.delete')
     and not public.has_permission('data.suppliers.delete') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into v_account
  from public.accounts
  where id = p_account_id and company_id = v_company
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if v_account.system_key is not null then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;

  v_tab := case when v_account.kind = 'customer' then 'customers' else 'suppliers' end;
  perform public.require_permission('data.' || v_tab || '.delete');

  if exists (select 1 from public.invoices where account_id = p_account_id)
     or exists (select 1 from public.receipts where account_id = p_account_id)
     or exists (select 1 from public.opening_balance_adjustments where account_id = p_account_id)
     or v_account.opening_balance <> 0 then
    update public.accounts set is_active = false where id = p_account_id and company_id = v_company;
    return false;
  end if;
  delete from public.accounts where id = p_account_id and company_id = v_company;
  return true;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;

create or replace function public.save_account(
  p_account_id uuid,
  p_name text,
  p_kind text,
  p_phone text,
  p_is_active boolean,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_account public.accounts%rowtype;
  v_id uuid;
  v_effective_opening numeric(18,4);
  v_target numeric(18,4);
  v_tab text;
  v_existing_tab text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_opening_balance is not null and p_opening_balance::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'invalid_opening_balance' using errcode = '22023';
  end if;
  v_target := round(coalesce(p_opening_balance, 0), 4);

  if p_kind is null or p_kind not in ('customer', 'supplier') then
    if not (public.has_permission('data.create') or public.has_permission('data.edit') or public.has_permission('management.edit')) then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    raise exception 'invalid_account_kind' using errcode = '22023';
  end if;

  v_tab := case when p_kind = 'customer' then 'customers' else 'suppliers' end;

  if p_account_id is null then
    if not (public.has_permission('data.' || v_tab || '.create') or public.has_permission('management.' || v_tab || '.edit')) then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if p_name is null or length(btrim(p_name)) = 0 then raise exception 'account_name_required' using errcode = '22023'; end if;

    insert into public.accounts(company_id, name, kind, phone, is_active, opening_balance)
    values (v_company, btrim(p_name), p_kind, nullif(btrim(p_phone), ''), coalesce(p_is_active, true), v_target)
    returning id into v_id;
    return v_id;
  end if;

  if not (public.has_permission('data.' || v_tab || '.edit') or public.has_permission('management.' || v_tab || '.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'account_name_required' using errcode = '22023'; end if;

  select * into v_account from public.accounts where id = p_account_id and company_id = v_company for update;
  if not found then raise exception 'account_not_found' using errcode = '22023'; end if;
  if v_account.system_key is not null then raise exception 'system_account_protected' using errcode = '22023'; end if;

  v_existing_tab := case when v_account.kind = 'customer' then 'customers' else 'suppliers' end;
  if not (public.has_permission('data.' || v_existing_tab || '.edit') or public.has_permission('management.' || v_existing_tab || '.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select v_account.opening_balance + coalesce(sum(amount_delta), 0)
    into v_effective_opening from public.opening_balance_adjustments where account_id = p_account_id;

  if v_target <> v_effective_opening then
    perform public.require_permission('management.' || v_existing_tab || '.edit');
    if v_existing_tab <> v_tab then
      perform public.require_permission('management.' || v_tab || '.edit');
    end if;
  end if;

  if v_account.name is distinct from btrim(p_name)
     or v_account.kind is distinct from p_kind
     or v_account.phone is distinct from nullif(btrim(p_phone), '')
     or v_account.is_active is distinct from coalesce(p_is_active, true) then
    perform public.require_permission('data.' || v_existing_tab || '.edit');
    if v_existing_tab <> v_tab then
      perform public.require_permission('data.' || v_tab || '.edit');
    end if;
    update public.accounts set name = btrim(p_name), kind = p_kind,
      phone = nullif(btrim(p_phone), ''), is_active = coalesce(p_is_active, true)
    where id = p_account_id and company_id = v_company;
  end if;

  if v_target <> v_effective_opening then
    if not exists (select 1 from public.invoices where account_id = p_account_id)
       and not exists (select 1 from public.receipts where account_id = p_account_id)
       and not exists (select 1 from public.opening_balance_adjustments where account_id = p_account_id) then
      update public.accounts set opening_balance = v_target where id = p_account_id and company_id = v_company;
    else
      insert into public.opening_balance_adjustments(company_id, account_id, amount_delta, note)
      values (v_company, p_account_id, v_target - v_effective_opening, 'تصحيح رصيد افتتاحي');
    end if;
  end if;
  return p_account_id;
end;
$$;

revoke all on function public.save_account(uuid, text, text, text, boolean, numeric) from public, anon;
grant execute on function public.save_account(uuid, text, text, text, boolean, numeric) to authenticated;

create or replace function public.save_account_opening_balances(p_accounts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item record;
  v_account public.accounts%rowtype;
  v_effective_opening numeric(18,4);
  v_target numeric(18,4);
  v_tab text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.require_permission('management.edit');
  if p_accounts is null or jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'invalid_opening_balances' using errcode = '22023';
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_accounts) as x(account_id uuid, opening_balance numeric)
    order by account_id asc
  loop
    if v_item.account_id is null then
      raise exception 'account_not_found' using errcode = '22023';
    end if;
    if v_item.opening_balance is null or v_item.opening_balance::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'invalid_opening_balance' using errcode = '22023';
    end if;

    select * into v_account
    from public.accounts
    where id = v_item.account_id and company_id = v_company
    for update;

    if not found then
      raise exception 'account_not_found' using errcode = '22023';
    end if;
    if v_account.system_key is not null then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;

    v_tab := case when v_account.kind = 'customer' then 'customers' else 'suppliers' end;
    perform public.require_permission('management.' || v_tab || '.edit');

    v_target := round(v_item.opening_balance, 4);

    select v_account.opening_balance + coalesce(sum(amount_delta), 0)
    into v_effective_opening
    from public.opening_balance_adjustments
    where account_id = v_account.id;

    if v_target <> v_effective_opening then
      if not exists (select 1 from public.invoices where account_id = v_account.id)
         and not exists (select 1 from public.receipts where account_id = v_account.id)
         and not exists (select 1 from public.opening_balance_adjustments where account_id = v_account.id) then
        update public.accounts
        set opening_balance = v_target
        where id = v_account.id and company_id = v_company;
      else
        insert into public.opening_balance_adjustments(company_id, account_id, amount_delta, note)
        values (v_company, v_account.id, v_target - v_effective_opening, 'تصحيح رصيد افتتاحي');
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_account_opening_balances(jsonb) from public, anon;
grant execute on function public.save_account_opening_balances(jsonb) to authenticated;

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
end;
$$;

revoke all on function public.save_opening_balances(jsonb, jsonb) from public, anon;
grant execute on function public.save_opening_balances(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. تحديث guard_permission_write وسياسات RLS لدعم الصلاحيات الفرعية والحذف الآمن
-- ---------------------------------------------------------------------
alter policy accounts_permissions on public.accounts
  using (
    public.has_permission('data.view') or public.has_permission('balances.view')
    or public.has_permission('data.edit') or public.has_permission('data.delete')
    or public.has_permission('data.create') or public.has_permission('management.view')
    or public.has_permission('management.edit')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit')
    or public.has_permission('money.view') or public.has_permission('money.create') or public.has_permission('money.edit')
  )
  with check (
    public.has_permission('data.create') or public.has_permission('data.edit')
    or public.has_permission('data.delete') or public.has_permission('management.edit')
  );

alter policy items_permissions on public.items
  using (
    public.has_permission('data.view') or public.has_permission('data.edit')
    or public.has_permission('data.delete') or public.has_permission('data.create')
    or public.has_permission('management.view') or public.has_permission('balances.view')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit')
  )
  with check (
    public.has_permission('data.create') or public.has_permission('data.edit')
    or public.has_permission('data.delete')
  );

alter policy warehouses_permissions on public.warehouses
  using (
    public.has_permission('data.view') or public.has_permission('data.edit')
    or public.has_permission('data.delete') or public.has_permission('data.create')
    or public.has_permission('management.view') or public.has_permission('balances.view')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit')
  )
  with check (
    public.has_permission('data.create') or public.has_permission('data.edit')
    or public.has_permission('data.delete')
  );

alter policy cash_boxes_permissions on public.cash_boxes
  using (
    public.has_permission('data.view') or public.has_permission('data.create')
    or public.has_permission('data.edit') or public.has_permission('data.delete')
    or public.has_permission('management.view') or public.has_permission('management.edit')
    or public.has_permission('balances.view')
    or public.has_permission('money.view') or public.has_permission('money.create') or public.has_permission('money.edit')
  )
  with check (
    public.has_permission('data.create') or public.has_permission('data.edit')
    or public.has_permission('data.delete') or public.has_permission('management.edit')
  );

alter policy stock_opening_balances_permissions on public.stock_opening_balances
  using (
    public.has_permission('management.view') or public.has_permission('balances.view')
    or public.has_permission('management.edit')
  )
  with check (
    public.has_permission('management.edit') or public.has_permission('data.create')
    or public.has_permission('data.delete')
  );

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
-- 6. فرض الصلاحيات الفرعية على دوال كشوف الحسابات والخزن وحركة الصنف
-- ---------------------------------------------------------------------
create or replace function public.get_account_statement(
  p_account_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  invoice_number text,
  receipt_number text,
  debit numeric(18,4),
  credit numeric(18,4),
  running_balance numeric(18,4),
  total_debit numeric(18,4),
  total_credit numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_kind text;
  v_subtab text;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;

  select a.kind into v_account_kind
  from public.accounts a
  where a.id = p_account_id
    and a.company_id = public.current_company_id()
    and a.system_key is null;

  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;

  v_subtab := case when v_account_kind = 'customer' then 'customers' else 'suppliers' end;
  if not (public.has_permission('balances.' || v_subtab || '.view') or public.has_permission('data.' || v_subtab || '.view')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  with account_row as (
    select a.id, a.kind, a.opening_balance
    from public.accounts a
    where a.id = p_account_id and a.company_id = public.current_company_id()
  ),
  movements as (
    select i.invoice_date as movement_date,
      1 as movement_order,
      i.created_at as movement_at,
      case i.kind
        when 'sale' then 'مبيعات '
        when 'purchase' then 'مشتريات '
        when 'sale_return' then 'مرتجع مبيعات '
        when 'purchase_return' then 'مرتجع مشتريات '
        when 'waste' then 'هالك '
        else 'فاتورة '
      end || i.number as movement_description,
      i.number as movement_invoice_number,
      null::text as movement_receipt_number,
      (case
        when a.kind = 'customer' then
          case
            when i.kind in ('sale', 'purchase_return') then i.total
            when i.kind in ('purchase', 'sale_return') then -i.total
            else 0
          end
        when a.kind = 'supplier' then
          case
            when i.kind in ('purchase', 'sale_return') then i.total
            when i.kind in ('sale', 'purchase_return') then -i.total
            else 0
          end
        else 0
      end)::numeric(18,4) as balance_delta
    from public.invoices i
    join account_row a on a.id = i.account_id
    where i.company_id = public.current_company_id()
      and i.account_id = p_account_id
      and i.deleted_at is null

    union all

    select r.receipt_date,
      2,
      r.created_at,
      (case r.direction when 'in' then 'استلام ' else 'صرف ' end) || r.number || ' - ' ||
        case when i.id is not null then
          case i.kind
            when 'sale' then 'مبيعات '
            when 'purchase' then 'مشتريات '
            when 'sale_return' then 'مرتجع مبيعات '
            when 'purchase_return' then 'مرتجع مشتريات '
            when 'waste' then 'هالك '
            else 'فاتورة '
          end || i.number
        else coalesce(nullif(btrim(r.description), ''), 'إيصال حر') end,
      i.number,
      r.number,
      -(case
        when r.invoice_id is not null then
          case
            when (a.kind = 'customer' and i.kind in ('sale', 'purchase_return'))
              or (a.kind = 'supplier' and i.kind in ('purchase', 'sale_return')) then r.amount
            when (a.kind = 'customer' and i.kind in ('purchase', 'sale_return'))
              or (a.kind = 'supplier' and i.kind in ('sale', 'purchase_return')) then -r.amount
            else 0
          end
        else
          case
            when (a.kind = 'customer' and r.direction = 'in')
              or (a.kind = 'supplier' and r.direction = 'out') then r.amount
            else -r.amount
          end
      end)::numeric(18,4) as balance_delta
    from public.receipts r
    join account_row a on a.id = r.account_id
    left join public.invoices i on i.id = r.invoice_id and i.company_id = r.company_id
    where r.company_id = public.current_company_id()
      and r.account_id = p_account_id
      and r.deleted_at is null

    union all

    select x.created_at::date,
      0,
      x.created_at,
      coalesce(nullif(btrim(x.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      x.amount_delta::numeric(18,4)
    from public.opening_balance_adjustments x
    where x.company_id = public.current_company_id()
      and x.account_id = p_account_id
  ),
  opening as (
    select (a.opening_balance + coalesce(sum(m.balance_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from account_row a
    left join movements m on true
    group by a.opening_balance
  ),
  period_movements as (
    select m.*
    from movements m
    where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when (a.kind = 'customer' and m.balance_delta > 0)
                         or (a.kind = 'supplier' and m.balance_delta < 0)
                        then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as debit,
      coalesce(sum(case when (a.kind = 'customer' and m.balance_delta < 0)
                         or (a.kind = 'supplier' and m.balance_delta > 0)
                        then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as credit
    from account_row a
    left join period_movements m on true
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_invoice_number, null::text as movement_receipt_number,
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at, m.movement_invoice_number nulls last, m.movement_receipt_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_receipt_number, m.balance_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then
        case when (a.kind = 'customer' and s.displayed_balance > 0)
                  or (a.kind = 'supplier' and s.displayed_balance < 0)
             then abs(s.displayed_balance) else 0 end
        else case when (a.kind = 'customer' and s.balance_delta > 0)
                       or (a.kind = 'supplier' and s.balance_delta < 0)
                  then abs(s.balance_delta) else 0 end
      end::numeric(18,4) as debit_amount,
      case when s.kind = 'opening' then
        case when (a.kind = 'customer' and s.displayed_balance < 0)
                  or (a.kind = 'supplier' and s.displayed_balance > 0)
             then abs(s.displayed_balance) else 0 end
        else case when (a.kind = 'customer' and s.balance_delta < 0)
                       or (a.kind = 'supplier' and s.balance_delta > 0)
                  then abs(s.balance_delta) else 0 end
      end::numeric(18,4) as credit_amount,
      (o.amount + sum(s.balance_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join account_row a
    cross join opening o
  )
  select c.kind as row_type, c.movement_date as transaction_date, c.movement_description as description,
    c.movement_invoice_number as invoice_number, c.movement_receipt_number as receipt_number,
    c.debit_amount as debit, c.credit_amount as credit, c.balance_amount as running_balance,
    t.debit as total_debit, t.credit as total_credit
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_account_statement(uuid, date, date) from public, anon;
grant execute on function public.get_account_statement(uuid, date, date) to authenticated;

create or replace function public.get_cash_box_statement(
  p_cash_box_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  receipt_number text,
  transfer_number text,
  incoming numeric(18,4),
  outgoing numeric(18,4),
  running_balance numeric(18,4),
  total_incoming numeric(18,4),
  total_outgoing numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.cash_boxes cb
    where cb.id = p_cash_box_id and cb.company_id = public.current_company_id()
  ) then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;

  if not (public.has_permission('balances.cashBoxes.view') or public.has_permission('data.cashBoxes.view')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  with cash_box as (
    select cb.id, cb.opening_balance
    from public.cash_boxes cb
    where cb.id = p_cash_box_id and cb.company_id = public.current_company_id()
  ),
  movements as (
    select r.receipt_date as movement_date,
      1 as movement_order,
      r.created_at as movement_at,
      (case r.direction when 'in' then 'استلام ' else 'صرف ' end) || r.number || ' - ' ||
        coalesce(nullif(btrim(a.name), ''), nullif(btrim(r.description), ''), 'إيصال حر') as movement_description,
      r.number as movement_receipt_number,
      null::text as movement_transfer_number,
      (case r.direction when 'in' then r.amount else -r.amount end)::numeric(18,4) as balance_delta
    from public.receipts r
    join public.accounts a on a.id = r.account_id and a.company_id = r.company_id
    where r.company_id = public.current_company_id()
      and r.cash_box_id = p_cash_box_id
      and r.deleted_at is null

    union all

    select t.transfer_date,
      2,
      t.created_at,
      'تحويل بين الخزن ' || t.number || ' - ' ||
        case when t.source_cash_box_id = p_cash_box_id then 'إلى ' || destination.name
             else 'من ' || source.name end,
      null::text,
      t.number,
      (case when t.destination_cash_box_id = p_cash_box_id then t.amount else -t.amount end)::numeric(18,4)
    from public.cash_box_transfers t
    join public.cash_boxes source on source.id = t.source_cash_box_id and source.company_id = t.company_id
    join public.cash_boxes destination on destination.id = t.destination_cash_box_id and destination.company_id = t.company_id
    where t.company_id = public.current_company_id()
      and p_cash_box_id in (t.source_cash_box_id, t.destination_cash_box_id)
      and t.deleted_at is null

    union all

    select a.created_at::date,
      0,
      a.created_at,
      coalesce(nullif(btrim(a.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      a.amount_delta::numeric(18,4)
    from public.opening_balance_adjustments a
    where a.company_id = public.current_company_id()
      and a.cash_box_id = p_cash_box_id
  ),
  opening as (
    select (cb.opening_balance + coalesce(sum(m.balance_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from cash_box cb
    left join movements m on true
    group by cb.opening_balance
  ),
  period_movements as (
    select m.* from movements m where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when m.balance_delta > 0 then m.balance_delta else 0 end), 0)::numeric(18,4) as incoming,
      coalesce(sum(case when m.balance_delta < 0 then abs(m.balance_delta) else 0 end), 0)::numeric(18,4) as outgoing
    from period_movements m
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_receipt_number, null::text as movement_transfer_number,
      0::numeric(18,4) as balance_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_receipt_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_receipt_number, m.movement_transfer_number, m.balance_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then greatest(s.displayed_balance, 0)
           else greatest(s.balance_delta, 0) end::numeric(18,4) as incoming_amount,
      case when s.kind = 'opening' then greatest(-s.displayed_balance, 0)
           else greatest(-s.balance_delta, 0) end::numeric(18,4) as outgoing_amount,
      (o.amount + sum(s.balance_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join opening o
  )
  select c.kind, c.movement_date, c.movement_description,
    c.movement_receipt_number, c.movement_transfer_number,
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_cash_box_statement(uuid, date, date) from public, anon;
grant execute on function public.get_cash_box_statement(uuid, date, date) to authenticated;

create or replace function public.get_item_movement_statement(
  p_item_id uuid,
  p_warehouse_id uuid,
  p_from date,
  p_to date
)
returns table (
  row_type text,
  transaction_date date,
  description text,
  invoice_number text,
  transfer_number text,
  incoming numeric(18,4),
  outgoing numeric(18,4),
  running_balance numeric(18,4),
  total_incoming numeric(18,4),
  total_outgoing numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.items i
    join public.warehouses w on w.company_id = i.company_id
    where i.id = p_item_id and w.id = p_warehouse_id
      and i.company_id = public.current_company_id()
  ) then
    raise exception 'invalid_item_statement_target' using errcode = '22023';
  end if;

  if not (public.has_permission('balances.items.view') or public.has_permission('data.items.view')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  with movements as (
    select inv.invoice_date as movement_date,
      1 as movement_order,
      inv.created_at as movement_at,
      (case inv.kind
        when 'purchase' then 'مشتريات '
        when 'sale' then 'مبيعات '
        when 'sale_return' then 'مرتجع مبيعات '
        when 'purchase_return' then 'مرتجع مشتريات '
        when 'waste' then 'هالك '
        else 'فاتورة '
      end || inv.number || ' - ' || coalesce(nullif(btrim(a.name), ''), ''))::text as movement_description,
      inv.number as movement_invoice_number,
      null::text as movement_transfer_number,
      (case when inv.kind in ('purchase', 'sale_return') then ii.qty else -ii.qty end)::numeric(18,4) as quantity_delta
    from public.invoices inv
    join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
    join public.accounts a on a.company_id = inv.company_id and a.id = inv.account_id
    where inv.company_id = public.current_company_id()
      and inv.warehouse_id = p_warehouse_id
      and ii.item_id = p_item_id
      and inv.deleted_at is null

    union all

    select t.transfer_date,
      2,
      t.created_at,
      'تحويل مخزني ' || t.number || ' - ' ||
        case when t.source_warehouse_id = p_warehouse_id then 'إلى ' || destination.name
             else 'من ' || source.name end,
      null::text,
      t.number,
      (case when t.destination_warehouse_id = p_warehouse_id then ti.qty else -ti.qty end)::numeric(18,4)
    from public.warehouse_transfers t
    join public.warehouse_transfer_items ti on ti.company_id = t.company_id and ti.transfer_id = t.id
    join public.warehouses source on source.company_id = t.company_id and source.id = t.source_warehouse_id
    join public.warehouses destination on destination.company_id = t.company_id and destination.id = t.destination_warehouse_id
    where t.company_id = public.current_company_id()
      and p_warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
      and ti.item_id = p_item_id
      and t.deleted_at is null

    union all

    select adj.created_at::date,
      0,
      adj.created_at,
      coalesce(nullif(btrim(adj.note), ''), 'تعديل رصيد افتتاحي'),
      null::text,
      null::text,
      adj.quantity_delta::numeric(18,4)
    from public.stock_opening_adjustments adj
    where adj.company_id = public.current_company_id()
      and adj.item_id = p_item_id and adj.warehouse_id = p_warehouse_id
  ),
  base_opening as (
    select coalesce(
      (select o.opening_qty from public.stock_opening_balances o
       where o.company_id = public.current_company_id()
         and o.item_id = p_item_id and o.warehouse_id = p_warehouse_id),
      0
    )::numeric(18,4) as quantity
  ),
  opening as (
    select (b.quantity + coalesce(sum(m.quantity_delta) filter (where m.movement_date < p_from), 0))::numeric(18,4) as amount
    from base_opening b
    left join movements m on true
    group by b.quantity
  ),
  period_movements as (
    select m.* from movements m where m.movement_date between p_from and p_to
  ),
  totals as (
    select
      coalesce(sum(case when m.quantity_delta > 0 then m.quantity_delta else 0 end), 0)::numeric(18,4) as incoming,
      coalesce(sum(case when m.quantity_delta < 0 then abs(m.quantity_delta) else 0 end), 0)::numeric(18,4) as outgoing
    from period_movements m
  ),
  statement_rows as (
    select 0 as row_order, p_from as movement_date, null::timestamptz as movement_at,
      'opening'::text as kind, 'رصيد سابق'::text as movement_description,
      null::text as movement_invoice_number, null::text as movement_transfer_number,
      0::numeric(18,4) as quantity_delta, o.amount as displayed_balance
    from opening o

    union all

    select row_number() over(order by m.movement_date, m.movement_order, m.movement_at,
      m.movement_invoice_number nulls last, m.movement_transfer_number nulls last)::integer,
      m.movement_date, m.movement_at, 'movement'::text, m.movement_description,
      m.movement_invoice_number, m.movement_transfer_number, m.quantity_delta, null::numeric(18,4)
    from period_movements m
  ),
  calculated as (
    select s.*,
      case when s.kind = 'opening' then greatest(s.displayed_balance, 0)
           else greatest(s.quantity_delta, 0) end::numeric(18,4) as incoming_amount,
      case when s.kind = 'opening' then greatest(-s.displayed_balance, 0)
           else greatest(-s.quantity_delta, 0) end::numeric(18,4) as outgoing_amount,
      (o.amount + sum(s.quantity_delta) over(order by s.row_order rows between unbounded preceding and current row))::numeric(18,4) as balance_amount
    from statement_rows s
    cross join opening o
  )
  select c.kind, c.movement_date, c.movement_description,
    c.movement_invoice_number, c.movement_transfer_number,
    c.incoming_amount, c.outgoing_amount, c.balance_amount, t.incoming, t.outgoing
  from calculated c
  cross join totals t
  order by c.row_order;
end;
$$;

revoke all on function public.get_item_movement_statement(uuid, uuid, date, date) from public, anon;
grant execute on function public.get_item_movement_statement(uuid, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 7. توحيد ترتيب الأقفال في update_invoice و delete_invoice و restore_invoice
-- ---------------------------------------------------------------------
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

  -- قفل الحساب القديم والجديد بترتيب تصاعدي قبل قفل المخزون لتوحيد ترتيب الأقفال ومنع الـ deadlock
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

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_receipt public.receipts%rowtype;
  v_cash_bal numeric(18,4);
  v_line record;
  v_sign integer;
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
  if v_inv.deleted_at is not null then raise exception 'invoice_already_deleted' using errcode = '22023'; end if;

  perform public.require_permission('goods.' || v_inv.kind || '.delete');

  if v_inv.kind = 'purchase' and public.purchase_invoice_has_later_outflow(p_invoice_id) then
    raise exception 'cannot_delete_purchase_with_subsequent_sales' using errcode = '22023';
  end if;

  -- قفل الحساب قبل المخزون والخزنة لتوحيد ترتيب الأقفال
  perform 1 from public.accounts
  where id = v_inv.account_id and company_id = v_company
  for update;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  for v_line in
    select item_id, qty, unit_cost from public.invoice_items
    where invoice_id = p_invoice_id
    order by item_id asc
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      -v_sign * v_line.qty, v_line.unit_cost);
  end loop;

  select * into v_receipt
  from public.receipts
  where invoice_id = p_invoice_id and company_id = v_company and deleted_at is null
  for update;

  if found and v_receipt.direction = 'in' then
    select current_balance into v_cash_bal
    from public.cash_boxes
    where id = v_receipt.cash_box_id and company_id = v_company
    for update;
    if coalesce(v_cash_bal, 0) < v_receipt.amount then
      raise exception 'insufficient_cash_box_balance' using errcode = '22023';
    end if;
  end if;

  update public.invoices set deleted_at = now() where id = p_invoice_id and company_id = v_company;
  update public.receipts set deleted_at = now() where invoice_id = p_invoice_id and company_id = v_company and deleted_at is null;
end;
$$;

revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

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

  -- قفل الحساب قبل قفل المخزون لتوحيد ترتيب الأقفال
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
-- 8. شمول الأصناف والمخازن الموقوفة ذات الحركات في reconcile_item_stock_internal
-- ---------------------------------------------------------------------
create or replace function public.reconcile_item_stock_internal(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_company_id is null then
    raise exception 'invalid_company' using errcode = '22023';
  end if;

  with target_items as (
    select i.company_id, i.id as item_id, w.id as warehouse_id
    from public.items i
    cross join public.warehouses w
    where i.company_id = p_company_id
      and w.company_id = p_company_id
      and (
        (i.is_active and w.is_active)
        or exists (
          select 1 from public.item_stock s
          where s.company_id = p_company_id and s.warehouse_id = w.id and s.item_id = i.id
        )
        or exists (
          select 1 from public.stock_opening_balances o
          where o.company_id = p_company_id and o.warehouse_id = w.id and o.item_id = i.id
        )
        or exists (
          select 1 from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = p_company_id and inv.warehouse_id = w.id and ii.item_id = i.id
        )
        or exists (
          select 1 from public.warehouse_transfers t
          join public.warehouse_transfer_items ti on ti.company_id = t.company_id and ti.transfer_id = t.id
          where t.company_id = p_company_id and w.id in (t.source_warehouse_id, t.destination_warehouse_id) and ti.item_id = i.id
        )
      )
  ),
  ledger_sums as (
    select
      ti.company_id,
      ti.warehouse_id,
      ti.item_id,
      round(
        coalesce(o.opening_qty, 0) +
        coalesce((
          select sum(case
            when inv.kind in ('purchase', 'sale_return') then ii.qty
            when inv.kind in ('sale', 'purchase_return', 'waste') then -ii.qty
            else 0
          end)
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.deleted_at is null
        ), 0) +
        coalesce((
          select sum(case
            when t.destination_warehouse_id = ti.warehouse_id then tri.qty
            when t.source_warehouse_id = ti.warehouse_id then -tri.qty
            else 0
          end)
          from public.warehouse_transfers t
          join public.warehouse_transfer_items tri on tri.company_id = t.company_id and tri.transfer_id = t.id
          where t.company_id = ti.company_id
            and ti.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
            and tri.item_id = ti.item_id
            and t.deleted_at is null
        ), 0) +
        coalesce((
          select sum(adj.quantity_delta)
          from public.stock_opening_adjustments adj
          where adj.company_id = ti.company_id
            and adj.warehouse_id = ti.warehouse_id
            and adj.item_id = ti.item_id
        ), 0)
      , 4)::numeric(18,4) as reconciled_qty,
      coalesce(
        s.avg_cost,
        o.unit_cost,
        (
          select ii.unit_cost
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.kind = 'purchase'
            and inv.deleted_at is null
          order by inv.invoice_date desc, inv.created_at desc
          limit 1
        ),
        0
      )::numeric(18,4) as effective_cost
    from target_items ti
    left join public.stock_opening_balances o
      on o.company_id = ti.company_id and o.warehouse_id = ti.warehouse_id and o.item_id = ti.item_id
    left join public.item_stock s
      on s.company_id = ti.company_id and s.warehouse_id = ti.warehouse_id and s.item_id = ti.item_id
  )
  insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost, updated_at)
  select company_id, warehouse_id, item_id, reconciled_qty, effective_cost, now()
  from ledger_sums
  on conflict (warehouse_id, item_id)
  do update set
    qty = excluded.qty,
    avg_cost = case when public.item_stock.avg_cost > 0 then public.item_stock.avg_cost else excluded.avg_cost end,
    updated_at = now();

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.reconcile_item_stock_internal(uuid) from public, anon, authenticated;

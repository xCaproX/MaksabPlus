-- =====================================================================
-- 20261109110000_0077_invoice_item_lock_order.sql
-- فرض الترتيب التصاعدي للأصناف (order by item_id) عند تطبيق حركات المخزون
-- في دوال الفواتير لمنع حدوث تعارض الأقفال اللحظي (Deadlock 40P01)
-- بين المعاملات المتزامنة.
-- =====================================================================

-- 1. دالة إنشاء الفاتورة مع ترتيب الأصناف تصاعدياً
create or replace function public.create_invoice(
  p_kind text,
  p_account_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid numeric,
  p_notes text,
  p_lines jsonb
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
  v_date date := coalesce(p_invoice_date, current_date);
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

  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, notes)
  values (v_company, p_kind, public.next_document_number(v_company, p_kind), v_date,
          p_account_id, p_warehouse_id, v_total, v_total, v_paid, p_notes)
  returning id into v_invoice;

  -- ترتيب تصاعدي حسب معرف الصنف item_id لمنع حدوث deadlock بين المعاملات المتزامنة
  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
    order by item_id
  loop
    v_unit_cost := public.apply_stock_movement(
      v_company, p_warehouse_id, v_line.item_id, v_sign * v_line.qty,
      case when p_kind = 'purchase' then v_line.unit_price else null end
    );
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, v_invoice, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  perform public.recalc_invoice_totals(v_invoice);

  if p_kind <> 'waste' then perform public.sync_invoice_receipt(v_invoice); end if;
  return v_invoice;
end;
$$;

revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) to authenticated;

-- 2. دالة تعديل الفاتورة مع ترتيب الأصناف تصاعدياً
create or replace function public.update_invoice(
  p_invoice_id uuid,
  p_account_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid numeric,
  p_notes text,
  p_lines jsonb
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
  v_date date := coalesce(p_invoice_date, current_date);
  v_line record;
  v_change record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_net_purchase_edit boolean := false;
  v_purchase_prices_unchanged boolean := false;
begin
  perform public.require_permission('goods.' || (
    select kind from public.invoices
    where id = p_invoice_id and company_id = public.current_company_id()
  ) || '.edit');

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
        order by item_id
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
      select item_id, qty, unit_cost
      from public.invoice_items
      where invoice_id = p_invoice_id
      order by item_id
    loop
      perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
        -v_sign * v_line.qty, v_line.unit_cost);
    end loop;
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  update public.invoices set account_id = p_account_id, warehouse_id = p_warehouse_id,
    invoice_date = v_date, subtotal = v_total, total = v_total, paid = v_paid, notes = p_notes
  where id = p_invoice_id;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
    order by item_id
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

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id); end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;

-- 3. دالة حذف الفاتورة مع ترتيب الأصناف تصاعدياً
create or replace function public.delete_invoice(p_invoice_id uuid)
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
begin
  perform public.require_permission('goods.' || (
    select kind from public.invoices
    where id = p_invoice_id and company_id = public.current_company_id()
  ) || '.delete');

  perform public.require_permission('goods.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_already_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  for v_line in
    select item_id, qty, unit_cost
    from public.invoice_items
    where invoice_id = p_invoice_id
    order by item_id
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      -v_sign * v_line.qty, v_line.unit_cost);
  end loop;
  update public.invoices set deleted_at = now() where id = p_invoice_id;
  perform public.set_linked_receipt_deleted(p_invoice_id, true);
end;
$$;

revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

-- 4. دالة استعادة الفاتورة مع ترتيب الأصناف تصاعدياً
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
begin
  perform public.require_permission('goods.' || (
    select kind from public.invoices
    where id = p_invoice_id and company_id = public.current_company_id()
  ) || '.delete');

  perform public.require_permission('goods.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is null then raise exception 'invoice_not_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  for v_line in
    select item_id, qty, unit_cost
    from public.invoice_items
    where invoice_id = p_invoice_id
    order by item_id
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      v_sign * v_line.qty, v_line.unit_cost);
  end loop;
  update public.invoices set deleted_at = null where id = p_invoice_id;
  perform public.set_linked_receipt_deleted(p_invoice_id, false);
end;
$$;

revoke all on function public.restore_invoice(uuid) from public, anon;
grant execute on function public.restore_invoice(uuid) to authenticated;

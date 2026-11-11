-- =====================================================================
-- 20261111160000_0079_accounting_and_balance_fixes.sql
-- المرحلة 2: إصلاحات المحاسبة والأرصدة الحرجة في قاعدة البيانات
-- 1. تضمين مرتجعات المشتريات (purchase_return) في purchase_invoice_has_later_outflow.
-- 2. منع كسر رصيد الخزنة للسالب في sync_invoice_receipt و delete_invoice و delete_cash_box_transfer و update_cash_box_transfer و save_opening_balances.
-- 3. استدعاء sync_invoice_receipt دائماً في update_invoice عند تعديل فاتورة شراء عليها حركات لاحقة.
-- 4. استدعاء recalc_invoice_totals داخل restore_invoice لتحديث تكلفة وربح الفاتورة بعد الاستعادة.
-- 5. إصلاح get_item_movement_statement لعدم طرح تسويات الرصيد الافتتاحي من الرصيد الافتتاحي الأصلي.
-- 6. تحديث avg_cost في item_stock عند تعديل التكلفة الافتتاحية لصنف ليس عليه حركات في save_opening_balances.
-- 7. فحص warehouse_transfer_items داخل delete_item لتعطيل الصنف بدلاً من فشل الحذف بخطأ مفتاح أجنبي.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. تضمين purchase_return في دالة فحص حركات الخروج اللاحقة على فاتورة شراء
-- ---------------------------------------------------------------------
create or replace function public.purchase_invoice_has_later_outflow(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invoices pinv
    join public.invoice_items pii on pii.invoice_id = pinv.id and pii.company_id = pinv.company_id
    join public.invoices sinv on sinv.company_id = pinv.company_id
                             and sinv.warehouse_id = pinv.warehouse_id
                             and sinv.deleted_at is null
                             and sinv.kind in ('sale', 'waste', 'purchase_return')
                             and sinv.id <> pinv.id
                             and (sinv.invoice_date > pinv.invoice_date or (sinv.invoice_date = pinv.invoice_date and sinv.created_at > pinv.created_at))
    join public.invoice_items sii on sii.invoice_id = sinv.id and sii.item_id = pii.item_id
    where pinv.id = p_invoice_id
      and pinv.company_id = public.current_company_id()
      and pinv.kind = 'purchase'
  ) or exists (
    select 1
    from public.invoices pinv
    join public.invoice_items pii on pii.invoice_id = pinv.id and pii.company_id = pinv.company_id
    join public.warehouse_transfers wt on wt.company_id = pinv.company_id
                                      and wt.source_warehouse_id = pinv.warehouse_id
                                      and wt.deleted_at is null
                                      and (wt.transfer_date > pinv.invoice_date or (wt.transfer_date = pinv.invoice_date and wt.created_at > pinv.created_at))
    join public.warehouse_transfer_items wti on wti.transfer_id = wt.id and wti.item_id = pii.item_id
    where pinv.id = p_invoice_id
      and pinv.company_id = public.current_company_id()
      and pinv.kind = 'purchase'
  );
$$;

revoke all on function public.purchase_invoice_has_later_outflow(uuid) from public, anon;
grant execute on function public.purchase_invoice_has_later_outflow(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. تحديث sync_invoice_receipt لمنع كسر رصيد الخزنة للسالب في جميع الحالات
-- ---------------------------------------------------------------------
create or replace function public.sync_invoice_receipt(p_invoice_id uuid, p_cash_box_id uuid default null)
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
  v_cash_bal numeric(18,4);
  v_old_box_bal numeric(18,4);
  v_old_delta numeric(18,4) := 0;
  v_new_delta numeric(18,4) := 0;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  select * into v_receipt from public.receipts where invoice_id = p_invoice_id and company_id = v_company for update;

  if v_inv.kind = 'waste' or v_inv.paid = 0 then
    if v_receipt.id is not null and v_receipt.deleted_at is null then
      if v_receipt.direction = 'in' then
        select current_balance into v_old_box_bal
        from public.cash_boxes
        where id = v_receipt.cash_box_id and company_id = v_company
        for update;
        if coalesce(v_old_box_bal, 0) < v_receipt.amount then
          raise exception 'insufficient_cash_box_balance' using errcode = '22023';
        end if;
      end if;

      update public.receipts set deleted_at = now()
      where invoice_id = p_invoice_id and company_id = v_company and deleted_at is null;
    end if;
    return;
  end if;

  v_dir := case when v_inv.kind in ('sale', 'purchase_return') then 'in' else 'out' end;

  if v_receipt.id is null then
    if p_cash_box_id is not null then
      select id into v_box from public.cash_boxes
      where id = p_cash_box_id and company_id = v_company and is_active;
      if v_box is null then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    else
      select id into v_box from public.cash_boxes
      where company_id = v_company and is_active order by is_primary desc, created_at limit 1;
      if v_box is null then raise exception 'no_cash_box' using errcode = '22023'; end if;
    end if;

    if v_dir = 'out' then
      select current_balance into v_cash_bal from public.cash_boxes
      where id = v_box and company_id = v_company and is_active for update;
      if coalesce(v_cash_bal, 0) < v_inv.paid then
        raise exception 'insufficient_cash_box_balance' using errcode = '22023';
      end if;
    end if;

    insert into public.receipts (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, direction)
    values (v_company, p_invoice_id,
      public.next_document_number(v_company, case v_dir when 'in' then 'receipt_in' else 'receipt_out' end),
      v_inv.invoice_date, v_inv.account_id, v_box, v_inv.paid, v_dir);
  else
    if p_cash_box_id is not null then
      select id into v_box from public.cash_boxes
      where id = p_cash_box_id and company_id = v_company and (is_active or id = v_receipt.cash_box_id);
      if v_box is null then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    else
      v_box := v_receipt.cash_box_id;
    end if;

    v_old_delta := case
      when v_receipt.deleted_at is null then
        case when v_receipt.direction = 'in' then -v_receipt.amount else v_receipt.amount end
      else 0
    end;
    v_new_delta := case when v_dir = 'in' then v_inv.paid else -v_inv.paid end;

    if v_box = v_receipt.cash_box_id then
      if (v_old_delta + v_new_delta) < 0 then
        select current_balance into v_cash_bal from public.cash_boxes
        where id = v_box and company_id = v_company for update;
        if coalesce(v_cash_bal, 0) + v_old_delta + v_new_delta < 0 then
          raise exception 'insufficient_cash_box_balance' using errcode = '22023';
        end if;
      end if;
    else
      perform 1 from public.cash_boxes
      where company_id = v_company and id in (v_receipt.cash_box_id, v_box)
      order by id for update;

      select current_balance into v_old_box_bal from public.cash_boxes
      where id = v_receipt.cash_box_id and company_id = v_company;
      select current_balance into v_cash_bal from public.cash_boxes
      where id = v_box and company_id = v_company;

      if (v_old_delta < 0 and coalesce(v_old_box_bal, 0) + v_old_delta < 0)
         or (v_new_delta < 0 and coalesce(v_cash_bal, 0) + v_new_delta < 0) then
        raise exception 'insufficient_cash_box_balance' using errcode = '22023';
      end if;
    end if;

    update public.receipts set cash_box_id = v_box, amount = v_inv.paid, account_id = v_inv.account_id,
      receipt_date = v_inv.invoice_date, direction = v_dir, deleted_at = null
    where invoice_id = p_invoice_id and company_id = v_company;
  end if;
end;
$$;

revoke all on function public.sync_invoice_receipt(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. تحديث update_invoice و delete_invoice و restore_invoice
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

  -- إذا كانت فاتورة شراء وبها حركات خروج لاحقة وتحديثها مقتصر على الحساب/التاريخ/المدفوع/الخزنة/الملاحظات
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

  -- فحص عدم كسر رصيد الخزنة للسالب عند حذف فاتورة لها إيصال قبض مرتبط
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

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  for v_line in
    select item_id, qty, unit_cost from public.invoice_items
    where invoice_id = p_invoice_id
    order by item_id asc
  loop
    perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
      -v_sign * v_line.qty, v_line.unit_cost);
  end loop;

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
-- 4. منع كسر رصيد الخزنة للسالب في تعديل وحذف تحويلات الخزن
-- ---------------------------------------------------------------------
create or replace function public.update_cash_box_transfer(
  p_transfer_id uuid, p_source_cash_box_id uuid, p_destination_cash_box_id uuid,
  p_transfer_date date, p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_transfer public.cash_box_transfers%rowtype;
begin
  perform public.require_permission('money.cash_box_transfer.edit');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.cash_box_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if p_source_cash_box_id is null or p_destination_cash_box_id is null or p_source_cash_box_id = p_destination_cash_box_id then
    raise exception 'invalid_transfer_cash_boxes' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_transfer_amount' using errcode = '22023'; end if;

  perform 1 from public.cash_boxes
  where company_id = v_company
    and id in (p_source_cash_box_id, p_destination_cash_box_id, v_transfer.source_cash_box_id, v_transfer.destination_cash_box_id)
  order by id for update;

  perform 1 from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  if exists (
    select 1
    from public.cash_boxes b
    where b.company_id = v_company
      and b.id in (v_transfer.source_cash_box_id, v_transfer.destination_cash_box_id, p_source_cash_box_id, p_destination_cash_box_id)
      and (
        coalesce(b.current_balance, 0)
        + case when b.id = v_transfer.source_cash_box_id then v_transfer.amount else 0 end
        - case when b.id = v_transfer.destination_cash_box_id then v_transfer.amount else 0 end
        - case when b.id = p_source_cash_box_id then round(p_amount, 4) else 0 end
        + case when b.id = p_destination_cash_box_id then round(p_amount, 4) else 0 end
      ) < 0
  ) then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  update public.cash_box_transfers
  set source_cash_box_id = p_source_cash_box_id,
      destination_cash_box_id = p_destination_cash_box_id,
      transfer_date = coalesce(p_transfer_date, public.cairo_today()),
      amount = round(p_amount, 4),
      notes = p_notes
  where id = p_transfer_id and company_id = v_company;
  return p_transfer_id;
end;
$$;

revoke all on function public.update_cash_box_transfer(uuid, uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.update_cash_box_transfer(uuid, uuid, uuid, date, numeric, text) to authenticated;

create or replace function public.delete_cash_box_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_transfer public.cash_box_transfers%rowtype;
  v_dest_bal numeric(18,4);
begin
  perform public.require_permission('money.cash_box_transfer.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_transfer
  from public.cash_box_transfers
  where id = p_transfer_id and company_id = v_company and deleted_at is null
  for update;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;

  perform 1 from public.cash_boxes
  where company_id = v_company
    and id in (v_transfer.source_cash_box_id, v_transfer.destination_cash_box_id)
  order by id for update;

  select current_balance into v_dest_bal
  from public.cash_boxes
  where id = v_transfer.destination_cash_box_id and company_id = v_company;

  if coalesce(v_dest_bal, 0) < v_transfer.amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  update public.cash_box_transfers
  set deleted_at = now()
  where id = p_transfer_id and company_id = v_company and deleted_at is null;
end;
$$;

revoke all on function public.delete_cash_box_transfer(uuid) from public, anon;
grant execute on function public.delete_cash_box_transfer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. تحديث save_opening_balances لحماية رصيد الخزنة وتحديث avg_cost للصنف بدون حركات
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

  for v_cash in select * from jsonb_to_recordset(p_cash_boxes) as x(cash_box_id uuid, opening_balance numeric)
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

  for v_stock in select * from jsonb_to_recordset(p_stock) as x(warehouse_id uuid, item_id uuid, opening_qty numeric, unit_cost numeric)
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
-- 6. إصلاح get_item_movement_statement مع تسويات الرصيد الافتتاحي
-- ---------------------------------------------------------------------
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
-- 7. فحص warehouse_transfer_items داخل delete_item لمنع انهيار الحذف بخطأ 23503
-- ---------------------------------------------------------------------
create or replace function public.delete_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  perform public.require_permission('data.delete');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
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

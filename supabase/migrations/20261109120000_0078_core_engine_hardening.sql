-- =====================================================================
-- 20261109120000_0078_core_engine_hardening.sql
-- حزمة تحصين المحرك المالي والمحاسبي وقواعد البيانات (المرحلة 1):
-- 1. منع السحب على المكشوف في الخزينة على جميع المسارات النقدية الصادرة.
-- 2. توحيد توقيت القاهرة cairo_today() عند تمرير تاريخ فارغ NULL.
-- 3. حماية تكلفة المخزون والأرباح في فواتير الشراء بعد حدوث مبيعات لاحقة.
-- 4. قفل رأس الفاتورة FOR UPDATE في دوال التعديل والحذف والاستعادة.
-- 5. تصحيح تسويات رصيد أول المدة للمخزون ومنع تكرار الاحتساب في المطابقة.
-- 6. توحيد دالة محاكاة مطابقة الحسابات calculate_expected_account_balance مع المقاصة.
-- 7. حصر صلاحية دالة reconcile_item_stock بمالك الشركة فقط.
-- 8. حجب المستندات ذات التواريخ المستقبلية من إحصائيات لوحة التحكم الحالية.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. دالة مساعدة لفحص وجود مبيعات أو تحويلات لاحقة على أصناف فاتورة شراء
-- ---------------------------------------------------------------------
alter table public.invoices alter column created_at set default clock_timestamp();
alter table public.warehouse_transfers alter column created_at set default clock_timestamp();

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
                             and sinv.kind in ('sale', 'waste')
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
-- 2. تحديث دالة sync_invoice_receipt لمنع السحب على المكشوف في الخزينة
-- ---------------------------------------------------------------------
drop function if exists public.sync_invoice_receipt(uuid);
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
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  select * into v_receipt from public.receipts where invoice_id = p_invoice_id and company_id = v_company for update;

  if v_inv.kind = 'waste' or v_inv.paid = 0 then
    update public.receipts set deleted_at = now()
    where invoice_id = p_invoice_id and company_id = v_company and deleted_at is null;
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

    -- التحقق من رصيد الخزنة عند الصرف النقدي (مشتريات أو مرتجع مبيعات)
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

    if v_dir = 'out' then
      select current_balance into v_cash_bal from public.cash_boxes
      where id = v_box and company_id = v_company and is_active for update;
      -- حساب الرصيد المتاح مع مراعاة المبلغ المحجوز مسبقاً في نفس الإيصال ونفس الخزينة
      if (coalesce(v_cash_bal, 0) + case when v_receipt.cash_box_id = v_box and v_receipt.deleted_at is null and v_receipt.direction = 'out' then v_receipt.amount else 0 end) < v_inv.paid then
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
-- 3. دوال الفواتير الرئيسية: create_invoice, update_invoice, delete_invoice, restore_invoice
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

  insert into public.invoices (company_id, kind, number, invoice_date, account_id, warehouse_id, subtotal, total, paid, notes, created_at)
  values (v_company, p_kind, public.next_document_number(v_company, p_kind), v_date,
          p_account_id, p_warehouse_id, v_total, v_total, v_paid, p_notes, clock_timestamp())
  returning id into v_invoice;

  -- ترتيب تصاعدي حسب معرف الصنف item_id لمنع حدوث deadlock
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

  -- إعادة احتساب وحفظ مجاميع التكلفة والربح
  perform public.recalc_invoice_totals(v_invoice);

  if p_kind <> 'waste' then
    perform public.sync_invoice_receipt(v_invoice, p_cash_box_id);
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

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
begin
  return public.create_invoice(p_kind, p_account_id, p_warehouse_id, p_invoice_date, p_paid, p_notes, p_lines, null);
end;
$$;

revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) to authenticated;

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

  -- فحص مبدئي للصلاحيات لمنع فحص وجود معرفات الفواتير من قبل غير المصرح لهم
  if not public.has_permission('goods.sale.edit')
     and not public.has_permission('goods.purchase.edit')
     and not public.has_permission('goods.sale_return.edit')
     and not public.has_permission('goods.purchase_return.edit')
     and not public.has_permission('goods.waste.edit')
     and not public.is_company_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- 1) قفل صريح لرأس الفاتورة لمنع أي Race Condition متزامن
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

  -- 2) فحص فواتير الشراء عند وجود مبيعات لاحقة (المشكلة 5)
  if v_inv.kind = 'purchase' then
    v_has_subsequent_sales := public.purchase_invoice_has_later_outflow(p_invoice_id);

    if v_has_subsequent_sales then
      if p_warehouse_id <> v_inv.warehouse_id then
        raise exception 'cannot_modify_purchase_items_with_subsequent_sales' using errcode = '22023';
      end if;

      -- فحص هل تم تغيير الأصناف أو الكميات أو الأسعار
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

  -- إذا كانت فاتورة شراء وبها مبيعات لاحقة وتحديثها مقتصر على الملاحظات/التاريخ
  if v_inv.kind = 'purchase' and v_has_subsequent_sales and not v_lines_changed then
    update public.invoices set account_id = p_account_id, invoice_date = v_date, notes = p_notes
    where id = p_invoice_id and company_id = v_company;
    if v_paid <> v_inv.paid then
      update public.invoices set paid = v_paid where id = p_invoice_id and company_id = v_company;
      perform public.sync_invoice_receipt(p_invoice_id, p_cash_box_id);
    end if;
    return p_invoice_id;
  end if;

  -- فحص تعديل الشراء بنفس الأسعار
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

  -- إعادة احتساب وحفظ مجاميع التكلفة والربح
  perform public.recalc_invoice_totals(p_invoice_id);

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id, p_cash_box_id); end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

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
begin
  return public.update_invoice(p_invoice_id, p_account_id, p_warehouse_id, p_invoice_date, p_paid, p_notes, p_lines, null);
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;

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
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  -- فحص مبدئي للصلاحيات لمنع فحص وجود معرفات الفواتير من قبل غير المصرح لهم
  if not public.has_permission('goods.sale.delete')
     and not public.has_permission('goods.purchase.delete')
     and not public.has_permission('goods.sale_return.delete')
     and not public.has_permission('goods.purchase_return.delete')
     and not public.has_permission('goods.waste.delete')
     and not public.is_company_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- 1) قفل صريح لرأس الفاتورة
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_already_deleted' using errcode = '22023'; end if;

  perform public.require_permission('goods.' || v_inv.kind || '.delete');

  -- 2) منع حذف فاتورة شراء تمت عليها مبيعات لاحقة (المشكلة 5)
  if v_inv.kind = 'purchase' and public.purchase_invoice_has_later_outflow(p_invoice_id) then
    raise exception 'cannot_delete_purchase_with_subsequent_sales' using errcode = '22023';
  end if;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  -- ترتيب تصاعدي لحركات الأقفال
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

  -- فحص مبدئي للصلاحيات لمنع فحص وجود معرفات الفواتير من قبل غير المصرح لهم
  if not public.has_permission('goods.sale.delete')
     and not public.has_permission('goods.purchase.delete')
     and not public.has_permission('goods.sale_return.delete')
     and not public.has_permission('goods.purchase_return.delete')
     and not public.has_permission('goods.waste.delete')
     and not public.is_company_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- 1) قفل صريح لرأس الفاتورة
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is null then raise exception 'invoice_not_deleted' using errcode = '22023'; end if;

  perform public.require_permission('goods.' || v_inv.kind || '.delete');

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  -- التحقق من المخزون
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

  -- ترتيب تصاعدي لحركات الأقفال
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

  update public.invoices set deleted_at = null where id = p_invoice_id and company_id = v_company;
  if v_inv.paid > 0 then
    perform public.sync_invoice_receipt(p_invoice_id);
  end if;
end;
$$;

revoke all on function public.restore_invoice(uuid) from public, anon;
grant execute on function public.restore_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. دوال الفاتورة مع الخزينة: create_invoice_with_cash_box, update_invoice_with_cash_box
-- ---------------------------------------------------------------------
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
begin
  return public.create_invoice(p_kind, p_account_id, p_warehouse_id, p_invoice_date, p_paid, p_notes, p_lines, p_cash_box_id);
end;
$$;

revoke all on function public.create_invoice_with_cash_box(text, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_invoice_with_cash_box(text, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

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
begin
  return public.update_invoice(p_invoice_id, p_account_id, p_warehouse_id, p_invoice_date, p_paid, p_notes, p_lines, p_cash_box_id);
end;
$$;

revoke all on function public.update_invoice_with_cash_box(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.update_invoice_with_cash_box(uuid, uuid, uuid, date, numeric, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. دوال الإيصالات الحرة مع فحص رصيد الخزينة وقفلها
-- ---------------------------------------------------------------------
create or replace function public.create_free_receipt(
  p_account_id uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount numeric,
  p_notes text,
  p_description text,
  p_direction text
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
begin
  perform public.require_permission('money.' || p_direction || '.create');
  perform public.require_permission('money.create');

  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

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

  -- فحص كفاية رصيد الخزينة عند الصرف (المشكلة 1)
  if p_direction = 'out' and v_cash_bal < p_amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  insert into public.receipts
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, notes, description, direction)
  values
    (v_company, null,
     public.next_document_number(v_company, case p_direction when 'in' then 'receipt_in' else 'receipt_out' end),
     coalesce(p_receipt_date, public.cairo_today()), p_account_id, p_cash_box_id, p_amount, p_notes, p_description, p_direction)
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
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_receipt from public.receipts where id = p_receipt_id and company_id = v_company for update;
  if not found then raise exception 'receipt_not_found' using errcode = '22023'; end if;
  if v_receipt.invoice_id is not null then raise exception 'receipt_linked_immutable' using errcode = '22023'; end if;
  if v_receipt.deleted_at is not null then raise exception 'receipt_already_deleted' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  perform public.require_permission('money.' || v_receipt.direction || '.edit');
  perform public.require_permission('money.edit');

  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if v_system_key in ('cash_customer', 'cash_supplier') then
    raise exception 'invalid_free_receipt_account' using errcode = '22023';
  end if;

  -- قفل الخزائن بنظام ترتيب ثابت لتفادي deadlocks
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
    if v_receipt.cash_box_id < p_cash_box_id then
      select current_balance into v_old_box_bal from public.cash_boxes where id = v_receipt.cash_box_id and company_id = v_company for update;
      select current_balance into v_cash_bal from public.cash_boxes where id = p_cash_box_id and company_id = v_company and is_active for update;
    else
      select current_balance into v_cash_bal from public.cash_boxes where id = p_cash_box_id and company_id = v_company and is_active for update;
      select current_balance into v_old_box_bal from public.cash_boxes where id = v_receipt.cash_box_id and company_id = v_company for update;
    end if;

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

  -- إذا كان إيصال قبض 'in'، فحذفه يخصم من الخزنة؛ نتأكد أن رصيد الخزنة لا يصبح سالباً
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

  -- إذا كان إيصال صرف 'out'، فاستعادته تخصم من الخزنة؛ نتأكد أن رصيد الخزنة يكفي
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

-- ---------------------------------------------------------------------
-- 6. دوال التحويلات المخزنية والنقدية: توحيد cairo_today()
-- ---------------------------------------------------------------------
create or replace function public.create_warehouse_transfer(
  p_source_warehouse_id uuid, p_destination_warehouse_id uuid, p_transfer_date date,
  p_notes text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id(); v_id uuid; v_line record;
  v_source_qty numeric(18,4); v_source_cost numeric(18,4); v_cost numeric(18,4);
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

  insert into public.warehouse_transfers(company_id, number, transfer_date, source_warehouse_id, destination_warehouse_id, notes, created_at)
  values (v_company, public.next_document_number(v_company, 'warehouse_transfer'), coalesce(p_transfer_date, public.cairo_today()), p_source_warehouse_id, p_destination_warehouse_id, p_notes, clock_timestamp())
  returning id into v_id;

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
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id for update;
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
  v_company uuid := public.current_company_id(); v_transfer public.warehouse_transfers%rowtype;
  v_line record; v_source_qty numeric(18,4); v_source_cost numeric(18,4); v_cost numeric(18,4);
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
    if v_line.item_id is null or v_line.qty <= 0 then raise exception 'invalid_transfer_line' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id for update;
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

create or replace function public.create_cash_box_transfer(
  p_source_cash_box_id uuid, p_destination_cash_box_id uuid, p_transfer_date date,
  p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id(); v_id uuid; v_source_box public.cash_boxes%rowtype;
begin
  perform public.require_permission('money.cash_box_transfer.create');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_source_cash_box_id is null or p_destination_cash_box_id is null
     or p_source_cash_box_id = p_destination_cash_box_id then
    raise exception 'invalid_transfer_cash_boxes' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_transfer_amount' using errcode = '22023'; end if;

  if p_source_cash_box_id < p_destination_cash_box_id then
    select * into v_source_box from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active for update;
    perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active for update;
  else
    perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active for update;
    select * into v_source_box from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active for update;
  end if;

  if v_source_box.id is null then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
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

create or replace function public.update_cash_box_transfer(
  p_transfer_id uuid, p_source_cash_box_id uuid, p_destination_cash_box_id uuid,
  p_transfer_date date, p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id(); v_transfer public.cash_box_transfers%rowtype;
  v_source_bal numeric(18,4);
begin
  perform public.require_permission('money.cash_box_transfer.edit');
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.cash_box_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if p_source_cash_box_id = p_destination_cash_box_id then raise exception 'invalid_transfer_cash_boxes' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_transfer_amount' using errcode = '22023'; end if;

  perform 1 from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active for update;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active for update;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  select current_balance into v_source_bal from public.cash_boxes where id = p_source_cash_box_id;
  if p_source_cash_box_id = v_transfer.source_cash_box_id then v_source_bal := v_source_bal + v_transfer.amount; end if;
  if p_source_cash_box_id = v_transfer.destination_cash_box_id then v_source_bal := v_source_bal - v_transfer.amount; end if;
  if coalesce(v_source_bal, 0) < p_amount then raise exception 'insufficient_cash_box_balance' using errcode = '22023'; end if;

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

-- ---------------------------------------------------------------------
-- 7. تصحيح تسويات رصيد أول المدة للمخزون (المشكلة 7)
-- ---------------------------------------------------------------------
create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id, i.id as item_id, i.name as item_name, i.unit,
  w.id as warehouse_id, w.name as warehouse_name,
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
  w.notes as warehouse_notes, i.notes as item_notes,
  i.serial_number as item_number, w.serial_number as warehouse_number,
  i.code as item_code,
  i.sale_price::numeric(18,4) as sale_price,
  i.purchase_price::numeric(18,4) as purchase_price
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
      if not exists (select 1 from public.receipts where cash_box_id = v_box.id)
         and not exists (select 1 from public.opening_balance_adjustments where cash_box_id = v_box.id) then
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
        values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, v_stock.unit_cost)
        on conflict (warehouse_id, item_id) do nothing;
      end if;
      insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
      values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      continue;
    end if;

    -- حساب الرصيد الافتتاحي الفعلي الحالي (الأصلي + مجموع التسويات)
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
        -- لا نغير opening_qty الأصلي حتى لا نحتسب الفرق مرتين في إعادة المطابقة
        insert into public.stock_opening_adjustments(company_id, warehouse_id, item_id, quantity_delta, unit_cost, note)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    else
      if v_delta <> 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_stock.unit_cost);
      end if;
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
-- 8. توحيد محاكاة مطابقة الحسابات calculate_expected_account_balance (المشكلة 8)
-- ---------------------------------------------------------------------
create or replace function public.calculate_expected_account_balance(p_account_id uuid)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw_opening numeric(18,4);
  v_kind text;
  v_adj_amount numeric(18,4);
  v_effective_opening numeric(18,4);
  v_inv_total numeric(18,4);
  v_rec_balance_effect numeric(18,4);
begin
  if p_account_id is null then return 0; end if;
  select coalesce(opening_balance, 0), kind
  into v_raw_opening, v_kind
  from public.accounts where id = p_account_id;
  if not found then return 0; end if;

  select coalesce(sum(amount_delta), 0) into v_adj_amount
  from public.opening_balance_adjustments where account_id = p_account_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  if v_kind = 'customer' then
    select coalesce(sum(case
      when kind in ('sale', 'purchase_return') then total
      when kind in ('purchase', 'sale_return') then -total
      else 0 end) filter (where deleted_at is null), 0)
    into v_inv_total
    from public.invoices
    where account_id = p_account_id;
  elsif v_kind = 'supplier' then
    select coalesce(sum(case
      when kind in ('purchase', 'sale_return') then total
      when kind in ('sale', 'purchase_return') then -total
      else 0 end) filter (where deleted_at is null), 0)
    into v_inv_total
    from public.invoices
    where account_id = p_account_id;
  else
    v_inv_total := 0;
  end if;

  select coalesce(sum(case
    when r.invoice_id is null then
      case
        when (v_kind = 'customer' and r.direction = 'in')
          or (v_kind = 'supplier' and r.direction = 'out') then r.amount
        else -r.amount
      end
    else
      case
        when (v_kind = 'customer' and i.kind in ('sale', 'purchase_return'))
          or (v_kind = 'supplier' and i.kind in ('purchase', 'sale_return')) then r.amount
        when (v_kind = 'customer' and i.kind in ('purchase', 'sale_return'))
          or (v_kind = 'supplier' and i.kind in ('sale', 'purchase_return')) then -r.amount
        else 0
      end
    end) filter (where r.deleted_at is null), 0)
  into v_rec_balance_effect
  from public.receipts r
  left join public.invoices i on i.id = r.invoice_id
  where r.account_id = p_account_id;

  return (v_effective_opening + v_inv_total - v_rec_balance_effect)::numeric(18,4);
end;
$$;

revoke all on function public.calculate_expected_account_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. قصر استدعاء reconcile_item_stock على المالك فقط (المشكلة 9)
-- ---------------------------------------------------------------------
create or replace function public.reconcile_item_stock(p_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
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

  return public.reconcile_item_stock_internal(v_company_id);
end;
$$;

revoke all on function public.reconcile_item_stock(uuid) from public, anon;
grant execute on function public.reconcile_item_stock(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. ضبط نافذة لوحة التحكم لعدم شمول تواريخ مستقبلية (المشكلة 10)
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

  -- 1) مؤشرات المبيعات (مقيدة بحد أقصى cairo_today)
  if v_can_view_sales then
    select
      coalesce(sum(case when kind = 'sale' and invoice_date = v_cairo_today then total when kind = 'sale_return' and invoice_date = v_cairo_today then -total else 0 end), 0)::numeric(18,4),
      count(case when kind = 'sale' and invoice_date = v_cairo_today then 1 end)::int,
      coalesce(sum(case when kind = 'sale' and invoice_date = v_cairo_today - 1 then total when kind = 'sale_return' and invoice_date = v_cairo_today - 1 then -total else 0 end), 0)::numeric(18,4),
      count(case when kind = 'sale' and invoice_date = v_cairo_today - 1 then 1 end)::int,
      coalesce(sum(case when kind = 'sale' and invoice_date between v_cairo_today - interval '6 days' and v_cairo_today then total when kind = 'sale_return' and invoice_date between v_cairo_today - interval '6 days' and v_cairo_today then -total else 0 end), 0)::numeric(18,4),
      coalesce(sum(case when kind = 'sale' and invoice_date between v_cairo_today - interval '29 days' and v_cairo_today then total when kind = 'sale_return' and invoice_date between v_cairo_today - interval '29 days' and v_cairo_today then -total else 0 end), 0)::numeric(18,4),
      count(*) filter (where kind = 'sale' and invoice_date between v_cairo_today - 6 and v_cairo_today)::int,
      count(*) filter (where kind = 'sale' and invoice_date <= v_cairo_today)::int
    into v_today_sales, v_today_count, v_yesterday_sales, v_yesterday_count, v_week_sales, v_month_sales, v_week_count, v_month_count
    from public.invoices
    where company_id = v_company_id
      and deleted_at is null
      and kind in ('sale', 'sale_return')
      and invoice_date between (v_cairo_today - interval '29 days') and v_cairo_today;

    -- قائمة الأصناف الأكثر مبيعاً في آخر 30 يوماً حتى اليوم
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
        and inv.invoice_date between (v_cairo_today - interval '29 days') and v_cairo_today
      group by i.id, i.name, i.unit
      order by total_qty desc
      limit 5
    ) item_row;

    -- قائمة كبار العملاء في آخر 30 يوماً حتى اليوم
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
        and inv.invoice_date between (v_cairo_today - interval '29 days') and v_cairo_today
      group by a.id, a.name
      having coalesce(sum(case when inv.kind = 'sale' then inv.total when inv.kind = 'sale_return' then -inv.total else 0 end), 0) > 0
      order by total_amount desc
      limit 5
    ) cust_row;
  end if;

  -- 2) مؤشرات التحصيلات (مقيدة حتى اليوم)
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
      and receipt_date between (v_cairo_today - 1) and v_cairo_today;
  end if;

  -- 3) السيولة النقدية في الخزن
  if v_can_view_cash then
    select coalesce(sum(current_balance), 0)::numeric(18,4)
    into v_cash_balance
    from public.cash_boxes
    where company_id = v_company_id
      and is_active = true;
  end if;

  -- 4) فلوسنا في السوق (مديونيات العملاء)
  if v_can_view_customers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_receivables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'customer'
      and is_active = true;
  end if;

  -- 5) ديون الموردين (التزامات الشركة)
  if v_can_view_suppliers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_payables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'supplier'
      and is_active = true;
  end if;

  -- 6) نواقص المخزن (أصناف رصيدها قارب على الانتهاء <= 5)
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

-- ---------------------------------------------------------------------
-- 10. دعم صلاحية رؤية الأرباح والتكلفة reports.profit.view إلى جانب المالك (المشكلة 11)
-- ---------------------------------------------------------------------
create or replace function public.can_view_profit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_owner() or public.has_permission('reports.profit.view');
$$;

revoke all on function public.can_view_profit() from public, anon;
grant execute on function public.can_view_profit() to authenticated;


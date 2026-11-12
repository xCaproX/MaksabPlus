-- =====================================================================
-- 20261112130000_0082_stock_cost_and_opening_fixes.sql
-- المرحلة 1: تحصين محرك المخزون ومتوسط التكلفة والافتتاحيات
-- 1. منع save_opening_balances من مسح avg_cost في المخازن الفرعية عند
--    عدم وجود سجل افتتاحي سابق وكون الكمية الافتتاحية صفراً.
-- 2. إصلاح مسار التعديل بالصافي في update_invoice لتمرير التكلفة الأصلية
--    عند تقليل كمية فاتورة شراء أو إزالة صنف منها.
-- 3. معالجة انحراف تقريب الكسور العشرية (4 منازل) في apply_stock_movement
--    عند عكس دفعات الشراء حتى لا يفشل الحذف بخطأ stock_cost_below_zero.
-- 4. تضمين الترتيب الفعلي للإنشاء (created_at > pinv.created_at) في
--    purchase_invoice_has_later_outflow لمنع تجاوز القفل بتواريخ أقدم.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. معالجة انحراف تقريب الكسور في apply_stock_movement
-- ---------------------------------------------------------------------
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
  v_numerator numeric;
  v_tolerance numeric;
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
    v_numerator := (v_qty * v_avg) + (p_qty_delta * v_unit_cost);
    v_new_avg := round(v_numerator / v_new_qty, 4);

    if v_new_avg < 0 then
      -- السماح بتسامح تقريب 4 منازل عشرية عند عكس دفعة شراء سابقة
      v_tolerance := ((v_qty + abs(p_qty_delta)) * 0.00005) + 0.0001;
      if p_qty_delta < 0 and v_numerator >= -v_tolerance then
        v_new_avg := 0;
      else
        raise exception 'stock_cost_below_zero' using errcode = '22023';
      end if;
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

revoke all on function public.apply_stock_movement(uuid, uuid, uuid, numeric, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. تضمين الترتيب الفعلي للإنشاء في purchase_invoice_has_later_outflow
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
                             and (sinv.created_at > pinv.created_at or sinv.invoice_date > pinv.invoice_date)
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
                                      and (wt.created_at > pinv.created_at or wt.transfer_date > pinv.invoice_date)
    join public.warehouse_transfer_items wti on wti.transfer_id = wt.id and wti.item_id = pii.item_id
    where pinv.id = p_invoice_id
      and pinv.company_id = public.current_company_id()
      and pinv.kind = 'purchase'
  );
$$;

revoke all on function public.purchase_invoice_has_later_outflow(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. إصلاح مسار التعديل بالصافي في update_invoice لحفظ دقة avg_cost
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
      full outer join (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        group by item_id
      ) new_lines using (item_id)
      where (old_lines.item_id is not null and new_lines.item_id is not null
             and (old_lines.min_price <> new_lines.min_price or old_lines.max_price <> new_lines.max_price))
         or (new_lines.item_id is not null and new_lines.min_price <> new_lines.max_price)
    ) into v_purchase_prices_unchanged;

    if v_purchase_prices_unchanged then
      v_net_purchase_edit := true;
      for v_change in
        select item_id,
          sum(new_qty - old_qty)::numeric(18,4) as qty_delta,
          case when sum(new_qty) > 0 then sum(new_value) / sum(new_qty) else null end::numeric(18,4) as added_unit_cost,
          case when sum(old_qty) > 0 then sum(old_value) / sum(old_qty) else null end::numeric(18,4) as removed_unit_cost
        from (
          select item_id, qty as old_qty, qty * unit_cost as old_value, 0::numeric as new_qty, 0::numeric as new_value
          from public.invoice_items where invoice_id = p_invoice_id
          union all
          select item_id, 0::numeric, 0::numeric, qty, qty * unit_price
          from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        ) lines
        group by item_id
        order by item_id asc
      loop
        if v_change.qty_delta <> 0 then
          v_unit_cost := public.apply_stock_movement(
            v_company, p_warehouse_id, v_change.item_id, v_change.qty_delta,
            case
              when v_change.qty_delta > 0 then v_change.added_unit_cost
              else v_change.removed_unit_cost
            end
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

-- ---------------------------------------------------------------------
-- 4. منع save_opening_balances من مسح avg_cost عند وجود مخزون/حركات سابقة
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
  v_has_open boolean;
  v_current_effective_opening numeric(18,4);
  v_existing_stock boolean;
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
    v_has_open := found;

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

    if not v_has_open then
      if v_stock.opening_qty > 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_stock.opening_qty, v_stock.unit_cost);
        insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      else
        select exists (
          select 1 from public.item_stock s
          where s.company_id = v_company
            and s.warehouse_id = v_stock.warehouse_id
            and s.item_id = v_stock.item_id
        ) into v_existing_stock;

        -- عدم تعديل avg_cost أو إنشاء سجل افتتاحي وهمي إذا كانت الكمية صفراً والمخزون له سجل/حركات قائمة
        if not v_existing_stock and not v_has_activity then
          insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
          values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, round(v_stock.unit_cost, 4))
          on conflict (warehouse_id, item_id) do nothing;

          insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
          values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, round(v_stock.unit_cost, 4));
        end if;
      end if;
      continue;
    end if;

    select v_open.opening_qty + coalesce((
      select sum(quantity_delta) from public.stock_opening_adjustments
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id
    ), 0) into v_current_effective_opening;

    v_delta := round(v_stock.opening_qty, 4) - v_current_effective_opening;

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

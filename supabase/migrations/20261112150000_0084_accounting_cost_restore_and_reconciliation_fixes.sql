-- =====================================================================
-- 20261112150000_0084_accounting_cost_restore_and_reconciliation_fixes.sql
-- إصلاحات محاسبية ومنطقية وأمنية شاملة:
-- 1. توحيد تقريب كميات وأسعار الفاتورة إلى 4 منازل عشرية قبل الحساب وإعادة
--    مزامنة subtotal/total وربح الفاتورة (شاملاً فرق سعر purchase_return).
-- 2. تسعير مرتجع المبيعات sale_return عند الإرجاع لمخزن فارغ بلا تكلفة
--    باستخدام آخر تكلفة بيع أو متوسط تكلفة الشركة أو تكلفة الشراء المرجعية.
-- 3. شمول sale_return في purchase_invoice_has_later_outflow لمنع تشويه
--    تكلفة المرتجع عند تعديل أو حذف أو تغيير تاريخ فاتورة شراء سابقة.
-- 4. استخدام تكلفة الافتتاح الأصلية v_open.unit_cost عند تعديل الكمية
--    الافتتاحية بعد الحركات، وتوحيد شرط cost_locked في v_stock_opening_balances.
-- 5. منع استعادة الفواتير المدفوعة أو الإيصالات على حساب/خزنة معطلة، ومنع
--    تعطيل المخزن الرئيسي (is_primary) أسوةً بالخزنة الرئيسية.
-- 6. خصم مرتجعات المبيعات في قائمة الأكثر مبيعاً (top_items) بالرئيسية والرسوم.
-- 7. توسيع run_comprehensive_reconciliation لفحص وتصحيح تناسق إجمالي وتكلفة
--    وربح ومدفوعات الفواتير مع البنود والإيصالات المرتبطة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. دالة داخلية لاقتباس تكلفة مرتجع المبيعات عند خلو المخزن من التكلفة
-- ---------------------------------------------------------------------
create or replace function public.resolve_sale_return_unit_cost(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_item_id uuid,
  p_account_id uuid
)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty numeric(18,4);
  v_avg numeric(18,4);
  v_cost numeric(18,4);
begin
  if p_company_id is distinct from public.current_company_id() then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;

  select qty, avg_cost
  into v_qty, v_avg
  from public.item_stock
  where company_id = p_company_id
    and warehouse_id = p_warehouse_id
    and item_id = p_item_id;

  -- إذا كان للمخزن تكلفة متوسطة موجبة أو رصيد قائم (حتى لو بتكلفة صفر حقيقية)، نستخدم سلوك المخزن المعتاد
  if found and (coalesce(v_avg, 0) > 0 or coalesce(v_qty, 0) > 0) then
    return null;
  end if;

  -- 1) آخر تكلفة بيع لنفس العميل والصنف
  if p_account_id is not null then
    select ii.unit_cost into v_cost
    from public.invoices inv
    join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
    where inv.company_id = p_company_id
      and inv.account_id = p_account_id
      and inv.kind = 'sale'
      and inv.deleted_at is null
      and ii.item_id = p_item_id
      and ii.unit_cost > 0
    order by inv.invoice_date desc, inv.created_at desc
    limit 1;

    if coalesce(v_cost, 0) > 0 then
      return round(v_cost, 4);
    end if;
  end if;

  -- 2) آخر تكلفة بيع للصنف في أي مخزن بالشركة
  select ii.unit_cost into v_cost
  from public.invoices inv
  join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
  where inv.company_id = p_company_id
    and inv.kind = 'sale'
    and inv.deleted_at is null
    and ii.item_id = p_item_id
    and ii.unit_cost > 0
  order by inv.invoice_date desc, inv.created_at desc
  limit 1;

  if coalesce(v_cost, 0) > 0 then
    return round(v_cost, 4);
  end if;

  -- 3) متوسط تكلفة الصنف في مخازن الشركة الأخرى
  select s.avg_cost into v_cost
  from public.item_stock s
  where s.company_id = p_company_id
    and s.item_id = p_item_id
    and s.avg_cost > 0
  order by (s.qty > 0) desc, s.updated_at desc
  limit 1;

  if coalesce(v_cost, 0) > 0 then
    return round(v_cost, 4);
  end if;

  -- 4) تكلفة الرصيد الافتتاحي أو سعر الشراء الافتراضي للصنف
  select coalesce(
    (
      select o.unit_cost
      from public.stock_opening_balances o
      where o.company_id = p_company_id and o.item_id = p_item_id and o.unit_cost > 0
      order by o.created_at desc
      limit 1
    ),
    nullif(i.purchase_price, 0),
    0
  )::numeric(18,4)
  into v_cost
  from public.items i
  where i.id = p_item_id and i.company_id = p_company_id;

  if coalesce(v_cost, 0) > 0 then
    return round(v_cost, 4);
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_sale_return_unit_cost(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. إعادة احتساب إجمالي وتكلفة وربح الفاتورة من بنودها الفعلية
--    مع إظهار فرق سعر مرتجع المشتريات عن متوسط التكلفة في profit_total
-- ---------------------------------------------------------------------
create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_items_total numeric(18,4);
  v_cost numeric(18,4);
  v_profit numeric(18,4);
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select
    coalesce(sum(ii.line_total), 0)::numeric(18,4),
    coalesce(sum(ii.qty * ii.unit_cost), 0)::numeric(18,4),
    coalesce(sum(case i.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'purchase_return' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end), 0)::numeric(18,4)
  into v_items_total, v_cost, v_profit
  from public.invoices i
  left join public.invoice_items ii on ii.invoice_id = i.id and ii.company_id = i.company_id
  where i.id = p_invoice_id and i.company_id = v_company
  group by i.id, i.kind;

  update public.invoices
  set subtotal = case when kind = 'waste' then 0 else coalesce(v_items_total, 0) end,
      total = case when kind = 'waste' then 0 else coalesce(v_items_total, 0) end,
      cost_total = coalesce(v_cost, 0),
      profit_total = coalesce(v_profit, 0)
  where id = p_invoice_id and company_id = v_company;
end;
$$;

revoke all on function public.recalc_invoice_totals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. شمول sale_return في فحص الحركات اللاحقة على فاتورة الشراء
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
                             and sinv.kind in ('sale', 'waste', 'purchase_return', 'sale_return')
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
-- 4. تحديث create_invoice و update_invoice و restore_invoice
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
  v_paid numeric(18,4) := round(coalesce(p_paid, 0), 2);
  v_date date := coalesce(p_invoice_date, public.cairo_today());
  v_line record;
  v_qty numeric(18,4);
  v_price numeric(18,4);
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_line_input_cost numeric(18,4);
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
    v_qty := round(v_line.qty, 4);
    v_price := round(v_line.unit_price, 4);
    if v_qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if p_kind = 'waste' and v_price <> 0 then
      raise exception 'waste_price_must_be_zero' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;

    if p_kind in ('sale', 'waste', 'purchase_return') then
      select coalesce(qty, 0) into v_avail
      from public.item_stock
      where company_id = v_company and warehouse_id = p_warehouse_id and item_id = v_line.item_id;

      if coalesce(v_avail, 0) <= 0 or v_qty > v_avail then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
    end if;

    v_total := v_total + round(v_qty * v_price, 2);
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
    v_qty := round(v_line.qty, 4);
    v_price := round(v_line.unit_price, 4);
    v_line_input_cost := case
      when p_kind = 'purchase' then v_price
      when p_kind = 'sale_return' then public.resolve_sale_return_unit_cost(v_company, p_warehouse_id, v_line.item_id, p_account_id)
      else null
    end;

    v_unit_cost := public.apply_stock_movement(
      v_company, p_warehouse_id, v_line.item_id,
      v_sign * v_qty,
      v_line_input_cost
    );

    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, v_invoice, v_line.item_id, v_qty, v_price, v_unit_cost);
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
  v_paid numeric(18,4) := round(coalesce(p_paid, 0), 2);
  v_date date := coalesce(p_invoice_date, public.cairo_today());
  v_line record;
  v_lock record;
  v_change record;
  v_qty numeric(18,4);
  v_price numeric(18,4);
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_line_input_cost numeric(18,4);
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
        select item_id, round(qty, 4), round(unit_price, 4) from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
      ) or exists (
        select item_id, round(qty, 4), round(unit_price, 4) from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
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
                                 and sinv.kind in ('sale', 'waste', 'purchase_return', 'sale_return')
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
    v_qty := round(v_line.qty, 4);
    v_price := round(v_line.unit_price, 4);
    if v_qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if v_inv.kind = 'waste' and v_price <> 0 then raise exception 'waste_price_must_be_zero' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    v_total := v_total + round(v_qty * v_price, 2);
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

  -- قفل جميع صفوف item_stock المتأثرة (القديمة والجديدة) بترتيب تصاعدي ثابت (warehouse_id, item_id)
  for v_lock in
    select distinct warehouse_id, item_id
    from (
      select v_inv.warehouse_id as warehouse_id, item_id
      from public.invoice_items
      where invoice_id = p_invoice_id
      union
      select p_warehouse_id as warehouse_id, item_id
      from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
    ) targets
    order by warehouse_id asc, item_id asc
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
    values (v_company, v_lock.warehouse_id, v_lock.item_id, 0, 0)
    on conflict (warehouse_id, item_id) do nothing;

    perform 1 from public.item_stock
    where company_id = v_company
      and warehouse_id = v_lock.warehouse_id
      and item_id = v_lock.item_id
    for update;
  end loop;

  if v_inv.kind = 'purchase' and p_warehouse_id = v_inv.warehouse_id then
    select not exists (
      select 1
      from (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from public.invoice_items where invoice_id = p_invoice_id group by item_id
      ) old_lines
      full outer join (
        select item_id, min(round(unit_price, 4)) as min_price, max(round(unit_price, 4)) as max_price
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
          select item_id, 0::numeric, 0::numeric, round(qty, 4), round(qty, 4) * round(unit_price, 4)
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
    v_qty := round(v_line.qty, 4);
    v_price := round(v_line.unit_price, 4);
    if v_net_purchase_edit then
      v_unit_cost := v_price;
    else
      v_line_input_cost := case
        when v_inv.kind = 'purchase' then v_price
        when v_inv.kind = 'sale_return' then public.resolve_sale_return_unit_cost(v_company, p_warehouse_id, v_line.item_id, p_account_id)
        else null
      end;
      v_unit_cost := public.apply_stock_movement(v_company, p_warehouse_id, v_line.item_id,
        v_sign * v_qty, v_line_input_cost);
    end if;
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, p_invoice_id, v_line.item_id, v_qty, v_price, v_unit_cost);
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
  v_receipt public.receipts%rowtype;
  v_line record;
  v_sign integer;
  v_avail numeric(18,4);
  v_unit_cost numeric(18,4);
  v_line_input_cost numeric(18,4);
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
  where id = v_inv.account_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;

  perform 1 from public.warehouses
  where id = v_inv.warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if exists (
    select 1
    from public.invoice_items ii
    left join public.items i on i.id = ii.item_id and i.company_id = v_company
    where ii.invoice_id = p_invoice_id and (i.id is null or not i.is_active)
  ) then
    raise exception 'invalid_item' using errcode = '22023';
  end if;

  for v_line in
    select distinct item_id from public.invoice_items where invoice_id = p_invoice_id order by item_id asc
  loop
    perform 1 from public.item_stock
    where company_id = v_company and warehouse_id = v_inv.warehouse_id and item_id = v_line.item_id
    for update;
  end loop;

  -- التحقق من أن الخزنة المرتبطة بالإيصال نشطة قبل الاستعادة (مع احترام ترتيب الأقفال: الحساب -> المخزون -> الخزنة)
  if v_inv.kind <> 'waste' and v_inv.paid > 0 then
    select * into v_receipt
    from public.receipts
    where invoice_id = p_invoice_id and company_id = v_company
    for update;

    if found then
      perform 1 from public.cash_boxes
      where id = v_receipt.cash_box_id and company_id = v_company and is_active
      for update;
      if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    end if;
  end if;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if v_inv.kind in ('sale', 'waste', 'purchase_return') then
    for v_line in select item_id, qty from public.invoice_items where invoice_id = p_invoice_id order by item_id asc
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
    v_line_input_cost := case
      when v_inv.kind = 'purchase' then v_line.unit_price
      when v_inv.kind = 'sale_return' then public.resolve_sale_return_unit_cost(v_company, v_inv.warehouse_id, v_line.item_id, v_inv.account_id)
      else null
    end;
    v_unit_cost := public.apply_stock_movement(
      v_company, v_inv.warehouse_id, v_line.item_id,
      v_sign * v_line.qty,
      v_line_input_cost
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
-- 5. تصحيح save_opening_balances + توحيد cost_locked في v_stock_opening_balances
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
  v_cur_qty numeric(18,4);
  v_cur_avg numeric(18,4);
  v_adj_unit_cost numeric(18,4);
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
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
        insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      else
        select exists (
          select 1 from public.item_stock s
          where s.company_id = v_company
            and s.warehouse_id = v_stock.warehouse_id
            and s.item_id = v_stock.item_id
        ) into v_existing_stock;

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
        select coalesce(qty, 0), coalesce(avg_cost, 0)
        into v_cur_qty, v_cur_avg
        from public.item_stock
        where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;

        -- تمرير تكلفة الافتتاح الأصلية إذا كانت التسوية موجبة أو لا تكسر تكلفة الرصيد المتبقي للسالب
        if v_delta > 0 or (v_cur_qty + v_delta <= 0) or ((v_cur_qty * v_cur_avg) + (v_delta * v_open.unit_cost)) >= 0 then
          v_adj_unit_cost := v_open.unit_cost;
        else
          v_adj_unit_cost := null;
        end if;

        select public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_adj_unit_cost) into v_effective;
        insert into public.stock_opening_adjustments(company_id, warehouse_id, item_id, quantity_delta, unit_cost, note)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    else
      if v_delta <> 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, round(v_stock.unit_cost, 4));
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
    if v_cash.opening_balance is null or round(v_cash.opening_balance, 4) < 0 then
      raise exception 'invalid_opening_balance' using errcode = '22023';
    end if;
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
      select 1 from public.invoices inv join public.invoice_items ii on ii.invoice_id = inv.id and ii.company_id = inv.company_id
      where inv.company_id = i.company_id and inv.warehouse_id = w.id and ii.item_id = i.id
        and inv.deleted_at is null
    ) or exists (
      select 1 from public.warehouse_transfers t join public.warehouse_transfer_items ti on ti.transfer_id = t.id and ti.company_id = t.company_id
      where t.company_id = i.company_id and w.id in (t.source_warehouse_id, t.destination_warehouse_id)
        and ti.item_id = i.id
        and t.deleted_at is null
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
  select company_id, warehouse_id, item_id, sum(quantity_delta) as quantity_delta
  from public.stock_opening_adjustments
  group by company_id, warehouse_id, item_id
) adj on adj.company_id = i.company_id and adj.warehouse_id = w.id and adj.item_id = i.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;

revoke all on public.v_stock_opening_balances from public, anon;
grant select on public.v_stock_opening_balances to authenticated;

-- ---------------------------------------------------------------------
-- 6. تحصين restore_receipt و toggle_warehouse_active
-- ---------------------------------------------------------------------
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

  -- قفل الحساب قبل الخزنة والتحقق من نشاطه لتوحيد ترتيب الأقفال
  perform 1 from public.accounts
  where id = v_receipt.account_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;

  -- التحقق من نشاط الخزنة في حالتي الاستلام والصرف، وفحص الرصيد في حالة الصرف
  select current_balance into v_cash_bal from public.cash_boxes
  where id = v_receipt.cash_box_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  if v_receipt.direction = 'out' and coalesce(v_cash_bal, 0) < v_receipt.amount then
    raise exception 'insufficient_cash_box_balance' using errcode = '22023';
  end if;

  update public.receipts set deleted_at = null where id = p_receipt_id and company_id = v_company;
end;
$$;

revoke all on function public.restore_receipt(uuid) from public, anon;
grant execute on function public.restore_receipt(uuid) to authenticated;

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
  v_is_primary boolean;
  v_current_active boolean;
  v_next_state boolean;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.require_permission('data.warehouses.edit');

  select is_primary, is_active into v_is_primary, v_current_active
  from public.warehouses
  where id = p_warehouse_id
    and company_id = v_company
  for update;

  if not found then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;

  if v_is_primary and v_current_active then
    raise exception 'primary_location_protected' using errcode = '23514';
  end if;

  update public.warehouses
  set is_active = not is_active,
      updated_at = now()
  where id = p_warehouse_id
    and company_id = v_company
  returning is_active into v_next_state;

  return v_next_state;
end;
$$;

revoke all on function public.toggle_warehouse_active(uuid) from public, anon;
grant execute on function public.toggle_warehouse_active(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. خصم مرتجع المبيعات من top_items في لوحة التحكم والرسوم البيانية
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
  v_week_count integer := 0;
  v_month_sales numeric(18,4) := 0;
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
        coalesce(sum(case when inv.kind = 'sale' then ii.qty when inv.kind = 'sale_return' then -ii.qty else 0 end), 0)::numeric(18,4) as total_qty,
        coalesce(sum(case when inv.kind = 'sale' then ii.line_total when inv.kind = 'sale_return' then -ii.line_total else 0 end), 0)::numeric(18,4) as total_amount
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id
      join public.items i on i.id = ii.item_id and i.company_id = v_company_id
      where inv.company_id = v_company_id
        and ii.company_id = v_company_id
        and inv.kind in ('sale', 'sale_return')
        and inv.deleted_at is null
        and inv.invoice_date >= v_cairo_today - interval '29 days'
        and inv.invoice_date <= v_cairo_today
      group by i.id, i.name, i.unit
      having coalesce(sum(case when inv.kind = 'sale' then ii.qty when inv.kind = 'sale_return' then -ii.qty else 0 end), 0) > 0
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
    where company_id = v_company_id;
  end if;

  if v_can_view_customers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_receivables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'customer';
  end if;

  if v_can_view_suppliers then
    select coalesce(sum(case when current_balance > 0 then current_balance else 0 end), 0)::numeric(18,4)
    into v_payables_balance
    from public.accounts
    where company_id = v_company_id
      and kind = 'supplier';
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
        coalesce(sum(case when inv.kind = 'sale' then ii.qty when inv.kind = 'sale_return' then -ii.qty else 0 end), 0)::numeric(18,4) as total_qty,
        coalesce(sum(case when inv.kind = 'sale' then ii.line_total when inv.kind = 'sale_return' then -ii.line_total else 0 end), 0)::numeric(18,4) as total_amount
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id
      join public.items i on i.id = ii.item_id and i.company_id = v_company_id
      where inv.company_id = v_company_id
        and ii.company_id = v_company_id
        and inv.kind in ('sale', 'sale_return')
        and inv.deleted_at is null
        and inv.invoice_date >= v_start_date
        and inv.invoice_date <= v_cairo_today
      group by i.id, i.name, i.unit
      having coalesce(sum(case when inv.kind = 'sale' then ii.qty when inv.kind = 'sale_return' then -ii.qty else 0 end), 0) > 0
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

-- ---------------------------------------------------------------------
-- 8. توسيع run_comprehensive_reconciliation لفحص إجماليات وتكاليف وأرباح ومدفوعات الفواتير
-- ---------------------------------------------------------------------
create or replace function public.run_comprehensive_reconciliation(
  p_mode text default 'reconcile',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_mode text := lower(coalesce(p_mode, 'reconcile'));

  v_accounts_count integer := 0;
  v_cash_boxes_count integer := 0;
  v_items_count integer := 0;
  v_discrepancies_count integer := 0;

  v_discrepancies jsonb := '[]'::jsonb;
  v_status text;
  v_log_id uuid;
  v_created_at timestamptz := now();

  r record;
  v_rec_bal numeric(18,4);
  v_diff numeric(18,4);
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.is_company_owner() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if v_mode not in ('reconcile', 'simulation') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;

  select coalesce(p.full_name, u.email, 'المالك')
  into v_user_name
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = v_user_id;

  -- قفل مسبق بترتيب موحد (invoices -> accounts -> item_stock -> cash_boxes) لمنع Deadlock
  if v_mode = 'reconcile' then
    perform 1 from public.invoices where company_id = v_company_id order by id asc for update;
    perform 1 from public.accounts where company_id = v_company_id order by id asc for update;
    perform 1 from public.item_stock where company_id = v_company_id order by warehouse_id asc, item_id asc for update;
    perform 1 from public.cash_boxes where company_id = v_company_id order by id asc for update;
  end if;

  -- 0. فحص تناسق رؤوس الفواتير (الإجمالي، التكلفة، الربح، والمدفوع مقارنة بالإيصالات المرتبطة)
  for r in (
    select
      i.id,
      i.number,
      i.kind,
      i.total,
      i.cost_total,
      i.profit_total,
      i.paid,
      case when i.kind = 'waste' then 0::numeric(18,4) else coalesce(lines.items_total, 0)::numeric(18,4) end as expected_total,
      coalesce(lines.expected_cost, 0)::numeric(18,4) as expected_cost,
      coalesce(lines.expected_profit, 0)::numeric(18,4) as expected_profit,
      case when i.kind = 'waste' then 0::numeric(18,4) else coalesce(rcp.receipts_total, 0)::numeric(18,4) end as expected_paid
    from public.invoices i
    left join (
      select
        ii.invoice_id,
        sum(ii.line_total) as items_total,
        sum(ii.qty * ii.unit_cost) as expected_cost,
        sum(case inv.kind
          when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
          when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
          when 'purchase_return' then ii.line_total - (ii.qty * ii.unit_cost)
          when 'waste' then -(ii.qty * ii.unit_cost)
          else 0 end) as expected_profit
      from public.invoice_items ii
      join public.invoices inv on inv.id = ii.invoice_id and inv.company_id = ii.company_id
      where ii.company_id = v_company_id
      group by ii.invoice_id
    ) lines on lines.invoice_id = i.id
    left join (
      select invoice_id, sum(amount) as receipts_total
      from public.receipts
      where company_id = v_company_id and deleted_at is null and invoice_id is not null
      group by invoice_id
    ) rcp on rcp.invoice_id = i.id
    where i.company_id = v_company_id
      and i.deleted_at is null
    order by i.created_at asc, i.id asc
  ) loop
    if r.expected_total is distinct from r.total then
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'فاتورة (الإجمالي)',
        'entity_category', 'invoice_total',
        'entity_id', r.id,
        'entity_name', r.number,
        'old_balance', r.total,
        'reconciled_balance', r.expected_total,
        'discrepancy', (r.expected_total - r.total)::numeric(18,4)
      );
    end if;

    if r.expected_cost is distinct from r.cost_total then
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'فاتورة (التكلفة)',
        'entity_category', 'invoice_cost',
        'entity_id', r.id,
        'entity_name', r.number,
        'old_balance', r.cost_total,
        'reconciled_balance', r.expected_cost,
        'discrepancy', (r.expected_cost - r.cost_total)::numeric(18,4)
      );
    end if;

    if r.expected_profit is distinct from r.profit_total then
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'فاتورة (الربح)',
        'entity_category', 'invoice_profit',
        'entity_id', r.id,
        'entity_name', r.number,
        'old_balance', r.profit_total,
        'reconciled_balance', r.expected_profit,
        'discrepancy', (r.expected_profit - r.profit_total)::numeric(18,4)
      );
    end if;

    if r.expected_paid is distinct from r.paid then
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'فاتورة (المدفوع)',
        'entity_category', 'invoice_paid',
        'entity_id', r.id,
        'entity_name', r.number,
        'old_balance', r.paid,
        'reconciled_balance', r.expected_paid,
        'discrepancy', (r.expected_paid - r.paid)::numeric(18,4)
      );
    end if;

    if v_mode = 'reconcile' and (
      r.expected_total is distinct from r.total
      or r.expected_cost is distinct from r.cost_total
      or r.expected_profit is distinct from r.profit_total
      or (r.expected_paid is distinct from r.paid and r.expected_paid <= r.expected_total)
    ) then
      if r.expected_total is distinct from r.total
         or r.expected_cost is distinct from r.cost_total
         or r.expected_profit is distinct from r.profit_total then
        perform public.recalc_invoice_totals(r.id);
      end if;
      if r.expected_paid is distinct from r.paid and r.expected_paid <= r.expected_total then
        update public.invoices
        set paid = r.expected_paid
        where id = r.id and company_id = v_company_id;
      end if;
    end if;
  end loop;

  -- 1. فحص ومطابقة حسابات العملاء والموردين
  for r in (
    select a.id, a.name, a.kind, a.current_balance, a.opening_balance, a.serial_number
    from public.accounts a
    where a.company_id = v_company_id
    order by a.serial_number
  ) loop
    v_accounts_count := v_accounts_count + 1;

    if v_mode = 'reconcile' then
      v_rec_bal := public.sync_account_balance(r.id);
    else
      v_rec_bal := public.calculate_expected_account_balance(r.id);
    end if;

    if v_rec_bal is distinct from r.current_balance then
      v_diff := (v_rec_bal - r.current_balance)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', case when r.kind = 'customer' then 'عميل' else 'مورد' end,
        'entity_category', 'account',
        'entity_id', r.id,
        'entity_name', r.name,
        'old_balance', r.current_balance,
        'reconciled_balance', v_rec_bal,
        'discrepancy', v_diff
      );
    end if;
  end loop;

  -- 2. فحص ومطابقة الخزن النقدية
  for r in (
    select b.id, b.name, b.current_balance, b.opening_balance, b.serial_number
    from public.cash_boxes b
    where b.company_id = v_company_id
    order by b.serial_number
  ) loop
    v_cash_boxes_count := v_cash_boxes_count + 1;

    if v_mode = 'reconcile' then
      v_rec_bal := public.sync_cash_box_balance(r.id);
    else
      v_rec_bal := public.calculate_expected_cash_box_balance(r.id);
    end if;

    if v_rec_bal is distinct from r.current_balance then
      v_diff := (v_rec_bal - r.current_balance)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'خزينة',
        'entity_category', 'cash_box',
        'entity_id', r.id,
        'entity_name', r.name,
        'old_balance', r.current_balance,
        'reconciled_balance', v_rec_bal,
        'discrepancy', v_diff
      );
    end if;
  end loop;

  -- 3. فحص ومطابقة كميات المخزون للأصناف والمخازن (شاملاً المعطلة ذات الأرصدة أو الحركات)
  for r in (
    select
      ti.item_id,
      ti.warehouse_id,
      i.name as item_name,
      i.code as item_code,
      i.unit,
      w.name as warehouse_name,
      coalesce(s.qty, 0) as current_qty,
      coalesce(s.avg_cost, 0) as current_cost,
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
    from (
      select it.company_id, it.id as item_id, wh.id as warehouse_id
      from public.items it
      cross join public.warehouses wh
      where it.company_id = v_company_id
        and wh.company_id = v_company_id
        and (
          (it.is_active and wh.is_active)
          or exists (
            select 1 from public.item_stock s2
            where s2.company_id = v_company_id and s2.warehouse_id = wh.id and s2.item_id = it.id
          )
          or exists (
            select 1 from public.stock_opening_balances o2
            where o2.company_id = v_company_id and o2.warehouse_id = wh.id and o2.item_id = it.id
          )
          or exists (
            select 1 from public.invoices inv2
            join public.invoice_items ii2 on ii2.company_id = inv2.company_id and ii2.invoice_id = inv2.id
            where inv2.company_id = v_company_id and inv2.warehouse_id = wh.id and ii2.item_id = it.id
          )
          or exists (
            select 1 from public.warehouse_transfers t2
            join public.warehouse_transfer_items ti2 on ti2.company_id = t2.company_id and ti2.transfer_id = t2.id
            where t2.company_id = v_company_id and wh.id in (t2.source_warehouse_id, t2.destination_warehouse_id) and ti2.item_id = it.id
          )
          or exists (
            select 1 from public.stock_opening_adjustments adj2
            where adj2.company_id = v_company_id and adj2.warehouse_id = wh.id and adj2.item_id = it.id
          )
        )
    ) ti
    join public.items i on i.id = ti.item_id
    join public.warehouses w on w.id = ti.warehouse_id
    left join public.stock_opening_balances o
      on o.company_id = ti.company_id and o.warehouse_id = ti.warehouse_id and o.item_id = ti.item_id
    left join public.item_stock s
      on s.company_id = ti.company_id and s.warehouse_id = ti.warehouse_id and s.item_id = ti.item_id
    order by w.serial_number, i.serial_number
  ) loop
    v_items_count := v_items_count + 1;

    if r.reconciled_qty is distinct from r.current_qty then
      v_diff := (r.reconciled_qty - r.current_qty)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'مخزون صنف',
        'entity_category', 'stock',
        'entity_id', r.item_id,
        'warehouse_id', r.warehouse_id,
        'entity_name', r.item_name || ' (' || r.warehouse_name || ')',
        'unit', r.unit,
        'old_balance', r.current_qty,
        'reconciled_balance', r.reconciled_qty,
        'discrepancy', v_diff
      );

      if v_mode = 'reconcile' then
        insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost, updated_at)
        values (v_company_id, r.warehouse_id, r.item_id, r.reconciled_qty, r.effective_cost, now())
        on conflict (warehouse_id, item_id)
        do update set
          qty = excluded.qty,
          avg_cost = case when public.item_stock.avg_cost > 0 then public.item_stock.avg_cost else excluded.avg_cost end,
          updated_at = now();
      end if;
    end if;
  end loop;

  if v_discrepancies_count = 0 then
    v_status := 'clean';
  else
    v_status := 'discrepancies_found';
  end if;

  insert into public.balance_reconciliation_logs (
    company_id,
    performed_by,
    performed_by_name,
    created_at,
    mode,
    notes,
    accounts_count,
    cash_boxes_count,
    items_count,
    discrepancies_count,
    status,
    discrepancies
  ) values (
    v_company_id,
    v_user_id,
    v_user_name,
    v_created_at,
    v_mode,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_accounts_count,
    v_cash_boxes_count,
    v_items_count,
    v_discrepancies_count,
    v_status,
    v_discrepancies
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'log_id', v_log_id,
    'created_at', v_created_at,
    'performed_by_name', v_user_name,
    'mode', v_mode,
    'notes', p_notes,
    'accounts_count', v_accounts_count,
    'cash_boxes_count', v_cash_boxes_count,
    'items_count', v_items_count,
    'discrepancies_count', v_discrepancies_count,
    'status', v_status,
    'discrepancies', v_discrepancies
  );
end;
$$;

revoke all on function public.run_comprehensive_reconciliation(text, text) from public, anon;
grant execute on function public.run_comprehensive_reconciliation(text, text) to authenticated;

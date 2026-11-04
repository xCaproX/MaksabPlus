-- =====================================================================
-- 0050_denormalize_invoice_totals_and_indexes.sql
-- تخزين إجمالي التكلفة والربح كأعمدة فعلية في جدول invoices (Denormalization)
-- تبسيط v_invoice_list وإلغاء الربط الجانبي (lateral join) لسرعة استعلام الفواتير
-- إضافة فهارس تصفح الفواتير وفهارس البحث النصي السريع (pg_trgm)
-- =====================================================================

-- 1. إضافة أعمدة التكلفة والربح لجدول الفواتير
alter table public.invoices
  add column if not exists cost_total numeric(18,4) not null default 0,
  add column if not exists profit_total numeric(18,4) not null default 0;

-- 2. احتساب وترحيل القيم السابقة لجميع الفواتير القائمة
update public.invoices i
set
  cost_total = coalesce(c.cost_total, 0),
  profit_total = coalesce(c.profit_total, 0)
from (
  select
    ii.invoice_id,
    sum(ii.qty * ii.unit_cost)::numeric(18,4) as cost_total,
    sum(case inv.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end)::numeric(18,4) as profit_total
  from public.invoice_items ii
  join public.invoices inv on inv.id = ii.invoice_id
  group by ii.invoice_id, inv.kind
) c
where i.id = c.invoice_id;

-- 3. دالة مركزية لإعادة احتساب وتحديث إجماليات التكلفة والربح لفاتورة
create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric(18,4);
  v_profit numeric(18,4);
begin
  select
    coalesce(sum(ii.qty * ii.unit_cost), 0)::numeric(18,4),
    coalesce(sum(case i.kind
      when 'sale' then ii.line_total - (ii.qty * ii.unit_cost)
      when 'sale_return' then (ii.qty * ii.unit_cost) - ii.line_total
      when 'waste' then -(ii.qty * ii.unit_cost)
      else 0 end), 0)::numeric(18,4)
  into v_cost, v_profit
  from public.invoices i
  left join public.invoice_items ii on ii.invoice_id = i.id
  where i.id = p_invoice_id
  group by i.id, i.kind;

  update public.invoices
  set
    cost_total = coalesce(v_cost, 0),
    profit_total = coalesce(v_profit, 0)
  where id = p_invoice_id;
end;
$$;

revoke all on function public.recalc_invoice_totals(uuid) from public, anon;
grant execute on function public.recalc_invoice_totals(uuid) to authenticated;

-- 4. تحديث create_invoice لحساب وحفظ التكلفة والربح مباشرة
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
  v_avail numeric(18,4);
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

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    v_unit_cost := public.apply_stock_movement(
      v_company, p_warehouse_id, v_line.item_id, v_sign * v_line.qty,
      case when p_kind = 'purchase' then v_line.unit_price else null end
    );
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, v_invoice, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  -- حساب وتحديث إجمالي التكلفة والربح في سجل الفاتورة
  perform public.recalc_invoice_totals(v_invoice);

  if p_kind <> 'waste' then perform public.sync_invoice_receipt(v_invoice); end if;
  return v_invoice;
end;
$$;

revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) to authenticated;

-- 5. تحديث update_invoice لحساب وحفظ التكلفة والربح مباشرة
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
  v_change record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_net_purchase_edit boolean := false;
  v_purchase_prices_unchanged boolean := false;
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
    for v_line in select item_id, qty, unit_cost from public.invoice_items where invoice_id = p_invoice_id
    loop
      perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
        -v_sign * v_line.qty, v_line.unit_cost);
    end loop;
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  update public.invoices set account_id = p_account_id, warehouse_id = p_warehouse_id,
    invoice_date = v_date, subtotal = v_total, total = v_total, paid = v_paid, notes = p_notes
  where id = p_invoice_id;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
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

  -- إعادة احتساب وحفظ إجمالي التكلفة والربح بعد التعديل
  perform public.recalc_invoice_totals(p_invoice_id);

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id); end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;

-- 6. تبسيط عرض قائمة الفواتير v_invoice_list بإلغاء الربط الجانبي المكلف
create or replace view public.v_invoice_list
with (security_invoker = true) as
select
  i.id, i.company_id, i.kind, i.number, i.invoice_date, i.account_id,
  a.name as account_name, i.warehouse_id, w.name as warehouse_name,
  i.subtotal, i.total, i.paid, (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes, i.created_at, i.updated_at,
  r.id as receipt_id, r.number as receipt_number, r.amount as receipt_amount,
  i.deleted_at, a.kind as account_kind,
  i.cost_total,
  i.profit_total,
  r.cash_box_id,
  cb.name as cash_box_name
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id and r.deleted_at is null
left join public.cash_boxes cb on cb.id = r.cash_box_id;

grant select on public.v_invoice_list to authenticated;

-- 7. فهارس B-Tree لتسريع تصفح وترتيب الفواتير
create index if not exists invoices_paged_date_idx
  on public.invoices (company_id, kind, invoice_date desc, created_at desc);

create index if not exists invoices_paged_number_idx
  on public.invoices (company_id, kind, number desc);

-- 8. تفعيل ملحق وفهارس البحث الثلاثي السريع (pg_trgm) بشكل آمن
do $$
begin
  create extension if not exists pg_trgm;
exception
  when others then null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists accounts_name_trgm_idx on public.accounts using gin (name gin_trgm_ops)';
    execute 'create index if not exists accounts_phone_trgm_idx on public.accounts using gin (phone gin_trgm_ops)';
    execute 'create index if not exists items_name_trgm_idx on public.items using gin (name gin_trgm_ops)';
    execute 'create index if not exists items_code_trgm_idx on public.items using gin (code gin_trgm_ops)';
    execute 'create index if not exists invoices_number_trgm_idx on public.invoices using gin (number gin_trgm_ops)';
  end if;
end;
$$;

-- =====================================================================
-- 0011_any_account_on_invoice.sql
-- نوع الفاتورة (بيع/شراء) يحدد حركة المخزون واتجاه إيصالها،
-- أما الحساب فقد يكون عميلًا أو موردًا في أي نوع:
--   - يمكن البيع لعميل أو لمورد.
--   - يمكن الشراء من مورد أو من عميل.
-- (إلغاء قيد account_kind_mismatch، مع بقاء التحقق من وجود الحساب وتنشيطه.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_invoice: بدون مطابقة نوع الحساب
-- ---------------------------------------------------------------------
create or replace function public.create_invoice(
  p_kind         text,
  p_account_id   uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid         numeric,
  p_notes        text,
  p_lines        jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_invoice uuid;
  v_total   numeric(18,4) := 0;
  v_paid    numeric(18,4) := coalesce(p_paid, 0);
  v_date    date := coalesce(p_invoice_date, current_date);
  v_line    record;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_kind is null or p_kind not in ('sale', 'purchase') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  perform 1
  from public.accounts
  where id = p_account_id
    and company_id = v_company
    and is_active;

  if not found then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  perform 1
  from public.warehouses
  where id = p_warehouse_id
    and company_id = v_company
    and is_active;

  if not found then
    raise exception 'invalid_warehouse' using errcode = '22023';
  end if;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then
      raise exception 'line_missing_item' using errcode = '22023';
    end if;
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'invalid_line_qty' using errcode = '22023';
    end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'invalid_line_price' using errcode = '22023';
    end if;

    perform 1
    from public.items
    where id = v_line.item_id
      and company_id = v_company
      and is_active;

    if not found then
      raise exception 'invalid_item' using errcode = '22023';
    end if;

    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;

  if v_paid < 0 then
    raise exception 'invalid_paid' using errcode = '22023';
  end if;
  if v_paid > v_total then
    raise exception 'paid_exceeds_total' using errcode = '22023';
  end if;

  insert into public.invoices
    (company_id, kind, number, invoice_date, account_id, warehouse_id,
     subtotal, total, paid, notes)
  values
    (v_company, p_kind, public.next_document_number(v_company, p_kind), v_date,
     p_account_id, p_warehouse_id, v_total, v_total, v_paid, p_notes)
  returning id into v_invoice;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price)
    values (v_company, v_invoice, v_line.item_id, v_line.qty, v_line.unit_price);

    insert into public.item_stock (company_id, warehouse_id, item_id, qty)
    values (
      v_company,
      p_warehouse_id,
      v_line.item_id,
      case when p_kind = 'sale' then -v_line.qty else v_line.qty end
    )
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  perform public.sync_invoice_receipt(v_invoice);

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------
-- update_invoice: بدون مطابقة نوع الحساب
-- ---------------------------------------------------------------------
create or replace function public.update_invoice(
  p_invoice_id   uuid,
  p_account_id   uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid         numeric,
  p_notes        text,
  p_lines        jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
  v_total   numeric(18,4) := 0;
  v_paid    numeric(18,4) := coalesce(p_paid, 0);
  v_date    date := coalesce(p_invoice_date, current_date);
  v_line    record;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id
    and company_id = v_company;

  if not found then
    raise exception 'invoice_not_found' using errcode = '22023';
  end if;

  if v_inv.deleted_at is not null then
    raise exception 'invoice_deleted' using errcode = '22023';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  perform 1
  from public.accounts
  where id = p_account_id
    and company_id = v_company
    and is_active;

  if not found then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  perform 1
  from public.warehouses
  where id = p_warehouse_id
    and company_id = v_company
    and is_active;

  if not found then
    raise exception 'invalid_warehouse' using errcode = '22023';
  end if;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then
      raise exception 'line_missing_item' using errcode = '22023';
    end if;
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'invalid_line_qty' using errcode = '22023';
    end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'invalid_line_price' using errcode = '22023';
    end if;

    perform 1
    from public.items
    where id = v_line.item_id
      and company_id = v_company
      and is_active;

    if not found then
      raise exception 'invalid_item' using errcode = '22023';
    end if;

    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;

  if v_paid < 0 then
    raise exception 'invalid_paid' using errcode = '22023';
  end if;
  if v_paid > v_total then
    raise exception 'paid_exceeds_total' using errcode = '22023';
  end if;

  -- 1) عكس تأثير المخزون القديم
  for v_line in
    select item_id, qty
    from public.invoice_items
    where invoice_id = p_invoice_id
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty)
    values (
      v_company,
      v_inv.warehouse_id,
      v_line.item_id,
      case when v_inv.kind = 'sale' then v_line.qty else -v_line.qty end
    )
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  -- 2) تحديث رأس الفاتورة
  update public.invoices
     set account_id   = p_account_id,
         warehouse_id = p_warehouse_id,
         invoice_date = v_date,
         subtotal     = v_total,
         total        = v_total,
         paid         = v_paid,
         notes        = p_notes
   where id = p_invoice_id;

  -- 3) السطور الجديدة + المخزون الجديد
  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price)
    values (v_company, p_invoice_id, v_line.item_id, v_line.qty, v_line.unit_price);

    insert into public.item_stock (company_id, warehouse_id, item_id, qty)
    values (
      v_company,
      p_warehouse_id,
      v_line.item_id,
      case when v_inv.kind = 'sale' then -v_line.qty else v_line.qty end
    )
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  -- 4) مزامنة الإيصال
  perform public.sync_invoice_receipt(p_invoice_id);

  return p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------
-- v_invoice_list: إضافة نوع الحساب للعرض
-- ---------------------------------------------------------------------
create or replace view public.v_invoice_list
with (security_invoker = true) as
select
  i.id,
  i.company_id,
  i.kind,
  i.number,
  i.invoice_date,
  i.account_id,
  a.name as account_name,
  i.warehouse_id,
  w.name as warehouse_name,
  i.subtotal,
  i.total,
  i.paid,
  (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes,
  i.created_at,
  i.updated_at,
  r.id     as receipt_id,
  r.number as receipt_number,
  r.amount as receipt_amount,
  i.deleted_at,
  a.kind   as account_kind
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r
  on r.invoice_id = i.id
 and r.deleted_at is null;

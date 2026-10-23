-- =====================================================================
-- 0002_invoice_functions.sql
-- منطق الفواتير والإيصالات: كل عملية في transaction واحدة.
--   فاتورة مبيعات: حساب العميل +total / المخزون -qty / (مدفوع => خزنة +)
--   فاتورة مشتريات: حساب المورد +total / المخزون +qty / (مدفوع => خزنة -)
-- =====================================================================

-- ---------------------------------------------------------------------
-- ترقيم المستندات: SAL-000001 / PUR-000001 / RCP-000001
-- ---------------------------------------------------------------------
create or replace function public.next_document_number(p_company_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last   integer;
  v_prefix text;
begin
  if auth.uid() is not null and p_company_id <> public.current_company_id() then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;

  insert into public.document_sequences (company_id, doc_type, last_number)
  values (p_company_id, p_doc_type, 0)
  on conflict (company_id, doc_type) do nothing;

  update public.document_sequences
     set last_number = last_number + 1
   where company_id = p_company_id
     and doc_type = p_doc_type
  returning last_number into v_last;

  v_prefix := case p_doc_type
    when 'sale'     then 'SAL'
    when 'purchase' then 'PUR'
    when 'receipt'  then 'RCP'
    else upper(left(p_doc_type, 3))
  end;

  return v_prefix || '-' || lpad(v_last::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- إنشاء فاتورة (+ إيصال تلقائي لو المدفوع أكبر من صفر)
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
  v_company  uuid := public.current_company_id();
  v_invoice  uuid;
  v_total    numeric(18,4) := 0;
  v_paid     numeric(18,4) := coalesce(p_paid, 0);
  v_date     date := coalesce(p_invoice_date, current_date);
  v_line     record;
  v_kind     text;
  v_box      uuid;
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

  select kind into v_kind
  from public.accounts
  where id = p_account_id
    and company_id = v_company
    and is_active;

  if v_kind is null then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  if v_kind <> (case when p_kind = 'sale' then 'customer' else 'supplier' end) then
    raise exception 'account_kind_mismatch' using errcode = '22023';
  end if;

  perform 1
  from public.warehouses
  where id = p_warehouse_id
    and company_id = v_company
    and is_active;

  if not found then
    raise exception 'invalid_warehouse' using errcode = '22023';
  end if;

  -- فحص السطور وحساب الإجمالي
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

  if v_paid > 0 then
    select id into v_box
    from public.cash_boxes
    where company_id = v_company
      and is_active
    order by created_at
    limit 1;

    if v_box is null then
      raise exception 'no_cash_box' using errcode = '22023';
    end if;

    insert into public.receipts
      (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount)
    values
      (v_company, v_invoice, public.next_document_number(v_company, 'receipt'),
       v_date, p_account_id, v_box, v_paid);
  end if;

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------
-- تعديل فاتورة: عكس المخزون القديم ثم تطبيق الجديد + مزامنة الإيصال
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
  v_kind    text;
  v_box     uuid;
  v_receipt public.receipts%rowtype;
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

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;

  select kind into v_kind
  from public.accounts
  where id = p_account_id
    and company_id = v_company
    and is_active;

  if v_kind is null then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  if v_kind <> (case when v_inv.kind = 'sale' then 'customer' else 'supplier' end) then
    raise exception 'account_kind_mismatch' using errcode = '22023';
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
  select * into v_receipt
  from public.receipts
  where invoice_id = p_invoice_id;

  if v_paid = 0 then
    delete from public.receipts where invoice_id = p_invoice_id;
  elsif v_receipt.id is null then
    select id into v_box
    from public.cash_boxes
    where company_id = v_company
      and is_active
    order by created_at
    limit 1;

    if v_box is null then
      raise exception 'no_cash_box' using errcode = '22023';
    end if;

    insert into public.receipts
      (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount)
    values
      (v_company, p_invoice_id, public.next_document_number(v_company, 'receipt'),
       v_date, p_account_id, v_box, v_paid);
  else
    update public.receipts
       set amount       = v_paid,
           account_id   = p_account_id,
           receipt_date = v_date
     where invoice_id = p_invoice_id;
  end if;

  return p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------
-- حذف فاتورة: عكس المخزون ثم الحذف (الإيصال يُحذف بالتتابع)
-- ---------------------------------------------------------------------
create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
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

  delete from public.invoices where id = p_invoice_id and company_id = v_company;
end;
$$;

-- ---------------------------------------------------------------------
-- الصلاحيات: لا وصول للـanon
-- ---------------------------------------------------------------------
revoke all on function public.next_document_number(uuid, text) from public, anon;
revoke all on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.delete_invoice(uuid) from public, anon;

grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.delete_invoice(uuid) to authenticated;

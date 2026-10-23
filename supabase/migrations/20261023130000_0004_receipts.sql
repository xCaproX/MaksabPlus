-- =====================================================================
-- 0004_receipts.sql
-- 1) الإيصال الحر: إيصال بدون فاتورة، قابل للتعديل والحذف.
-- 2) الإيصال المرتبط بفاتورة: غير قابل للتعديل أو الحذف من العميل
--    (يُدار فقط من خلال الفاتورة عبر sync_invoice_receipt).
-- 3) توجيه الخزنة يعتمد على نوع الحساب: عميل => دخل، مورد => صرف.
-- =====================================================================

-- ---------------------------------------------------------------------
-- invoice_id يصبح اختياريًا (NULL = إيصال حر)
-- ---------------------------------------------------------------------
alter table public.receipts alter column invoice_id drop not null;

-- ---------------------------------------------------------------------
-- سياسات الإيصالات: الكتابة المباشرة مسموحة للإيصال الحر فقط
-- ---------------------------------------------------------------------
drop policy receipts_company_isolation on public.receipts;

create policy receipts_select on public.receipts
  for select to authenticated
  using (company_id = public.current_company_id());

create policy receipts_insert on public.receipts
  for insert to authenticated
  with check (company_id = public.current_company_id() and invoice_id is null);

create policy receipts_update on public.receipts
  for update to authenticated
  using (company_id = public.current_company_id() and invoice_id is null)
  with check (company_id = public.current_company_id() and invoice_id is null);

create policy receipts_delete on public.receipts
  for delete to authenticated
  using (company_id = public.current_company_id() and invoice_id is null);

-- ---------------------------------------------------------------------
-- مزامنة الإيصال المرتبط بالفاتورة (رسالة/حذف/تعديل)
-- security definer لأن العميل ممنوع من الكتابة على الإيصال المرتبط،
-- والدالة تتحقق من الشركة والفاتورة بنفسها.
-- ---------------------------------------------------------------------
create or replace function public.sync_invoice_receipt(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
  v_receipt public.receipts%rowtype;
  v_box     uuid;
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

  select * into v_receipt
  from public.receipts
  where invoice_id = p_invoice_id;

  if v_inv.paid = 0 then
    delete from public.receipts where invoice_id = p_invoice_id;
    return;
  end if;

  if v_receipt.id is null then
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
       v_inv.invoice_date, v_inv.account_id, v_box, v_inv.paid);
  else
    update public.receipts
       set amount       = v_inv.paid,
           account_id   = v_inv.account_id,
           receipt_date = v_inv.invoice_date
     where invoice_id = p_invoice_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- create_invoice (نسخة 0004): نفس المنطق، مع مزامنة الإيصال بالدالة
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
  v_kind    text;
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
-- update_invoice (نسخة 0004)
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
  perform public.sync_invoice_receipt(p_invoice_id);

  return p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------
-- دوال الإيصال الحر
-- ---------------------------------------------------------------------
create or replace function public.create_free_receipt(
  p_account_id  uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount      numeric,
  p_notes       text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  perform 1 from public.accounts
   where id = p_account_id and company_id = v_company and is_active;
  if not found then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  perform 1 from public.cash_boxes
   where id = p_cash_box_id and company_id = v_company and is_active;
  if not found then
    raise exception 'invalid_cash_box' using errcode = '22023';
  end if;

  insert into public.receipts
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, notes)
  values
    (v_company, null, public.next_document_number(v_company, 'receipt'),
     coalesce(p_receipt_date, current_date), p_account_id, p_cash_box_id, p_amount, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_free_receipt(
  p_receipt_id  uuid,
  p_account_id  uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount      numeric,
  p_notes       text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_receipt public.receipts%rowtype;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id and company_id = v_company;

  if not found then
    raise exception 'receipt_not_found' using errcode = '22023';
  end if;

  if v_receipt.invoice_id is not null then
    raise exception 'receipt_linked_immutable' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  perform 1 from public.accounts
   where id = p_account_id and company_id = v_company and is_active;
  if not found then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  perform 1 from public.cash_boxes
   where id = p_cash_box_id and company_id = v_company and is_active;
  if not found then
    raise exception 'invalid_cash_box' using errcode = '22023';
  end if;

  update public.receipts
     set account_id   = p_account_id,
         cash_box_id  = p_cash_box_id,
         receipt_date = coalesce(p_receipt_date, current_date),
         amount       = p_amount,
         notes        = p_notes
   where id = p_receipt_id;

  return p_receipt_id;
end;
$$;

create or replace function public.delete_free_receipt(p_receipt_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_receipt public.receipts%rowtype;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id and company_id = v_company;

  if not found then
    raise exception 'receipt_not_found' using errcode = '22023';
  end if;

  if v_receipt.invoice_id is not null then
    raise exception 'receipt_linked_immutable' using errcode = '22023';
  end if;

  delete from public.receipts where id = p_receipt_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  coalesce(sum(case when a.kind = 'customer' then r.amount else -r.amount end), 0)::numeric(18,4) as balance
from public.cash_boxes cb
left join public.receipts r on r.cash_box_id = cb.id
left join public.accounts a on a.id = r.account_id
group by cb.id;

create view public.v_receipt_list
with (security_invoker = true) as
select
  r.id,
  r.company_id,
  r.number,
  r.receipt_date,
  r.amount,
  r.notes,
  r.account_id,
  a.name as account_name,
  a.kind as account_kind,
  r.cash_box_id,
  cb.name as cash_box_name,
  r.invoice_id,
  i.number as invoice_number,
  i.kind as invoice_kind,
  (r.invoice_id is null) as is_free,
  r.created_at,
  r.updated_at
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

create view public.v_invoice_items
with (security_invoker = true) as
select
  ii.id,
  ii.company_id,
  ii.invoice_id,
  ii.item_id,
  it.name as item_name,
  it.unit,
  ii.qty,
  ii.unit_price,
  ii.line_total
from public.invoice_items ii
join public.items it on it.id = ii.item_id;

grant select on
  public.v_receipt_list,
  public.v_invoice_items
to authenticated;

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public.sync_invoice_receipt(uuid) from public, anon;
revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.delete_free_receipt(uuid) from public, anon;

grant execute on function public.sync_invoice_receipt(uuid) to authenticated;
grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_free_receipt(uuid) to authenticated;

-- =====================================================================
-- 0012_returns.sql
-- نوعان جديدان للفواتير:
--   sale_return     = مرتجع مبيعات  (مخزون + / رصيد الحساب − / مسترد نقدي out)
--   purchase_return = مرتجع مشتريات (مخزون − / رصيد الحساب − / مسترد نقدي in)
--
-- المسترد (paid) في المرتجع يعكس أثره على الرصيد:
--   الرصيد = (فواتير البيع والشراء − المرتجعات) − (المدفوع − المسترد)
-- فمثال: فاتورة 100، مدفوع 40، مرتجع 30، مسترد 30 => الرصيد = 70 − 10 = 60.
-- =====================================================================

-- ---------------------------------------------------------------------
-- أنواع الفواتير: إضافة المرتجعين
-- ---------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices
  add constraint invoices_kind_check
  check (kind in ('sale', 'purchase', 'sale_return', 'purchase_return'));

-- ---------------------------------------------------------------------
-- بادئات الترقيم: SRT لمرتجع المبيعات و PRT لمرتجع المشتريات
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
    when 'sale'            then 'SAL'
    when 'purchase'        then 'PUR'
    when 'sale_return'     then 'SRT'
    when 'purchase_return' then 'PRT'
    when 'receipt_in'      then 'RCP'
    when 'receipt_out'     then 'PAY'
    when 'receipt'         then 'RCP'
    else upper(left(p_doc_type, 3))
  end;

  return v_prefix || '-' || lpad(v_last::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- create_invoice: 4 أنواع + إشارة المخزون حسب النوع
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
  v_sign    integer;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_kind is null
     or p_kind not in ('sale', 'purchase', 'sale_return', 'purchase_return') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  -- بيع ومرتجع مشتريات: مخزون خارج / شراء ومرتجع مبيعات: مخزون داخل
  v_sign := case when p_kind in ('sale', 'purchase_return') then -1 else 1 end;

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
    values (v_company, p_warehouse_id, v_line.item_id, v_sign * v_line.qty)
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  perform public.sync_invoice_receipt(v_invoice);

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------
-- update_invoice: 4 أنواع + إشارة المخزون حسب النوع
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
  v_sign    integer;
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

  v_sign := case when v_inv.kind in ('sale', 'purchase_return') then -1 else 1 end;

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
    values (v_company, v_inv.warehouse_id, v_line.item_id, -v_sign * v_line.qty)
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
    values (v_company, p_warehouse_id, v_line.item_id, v_sign * v_line.qty)
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
-- sync_invoice_receipt: اتجاه الإيصال حسب نوع الفاتورة
--   بيع / مرتجع مشتريات => استلام (in)
--   شراء / مرتجع مبيعات  => صرف (out)
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
  v_dir     text;
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

  v_dir := case
    when v_inv.kind in ('sale', 'purchase_return') then 'in'
    else 'out'
  end;

  select * into v_receipt
  from public.receipts
  where invoice_id = p_invoice_id;

  if v_inv.paid = 0 then
    update public.receipts
       set deleted_at = now()
     where invoice_id = p_invoice_id
       and deleted_at is null;
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
      (company_id, invoice_id, number, receipt_date, account_id, cash_box_id,
       amount, direction)
    values
      (v_company, p_invoice_id,
       public.next_document_number(
         v_company,
         case v_dir when 'in' then 'receipt_in' else 'receipt_out' end
       ),
       v_inv.invoice_date, v_inv.account_id, v_box, v_inv.paid, v_dir);
  else
    update public.receipts
       set amount       = v_inv.paid,
           account_id   = v_inv.account_id,
           receipt_date = v_inv.invoice_date,
           direction    = v_dir,
           deleted_at   = null
     where invoice_id = p_invoice_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- delete_invoice / restore_invoice: إشارة عكس المخزون حسب النوع
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
  v_sign    integer;
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
    raise exception 'invoice_already_deleted' using errcode = '22023';
  end if;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return') then -1 else 1 end;

  -- عكس المخزون مع الاحتفاظ بالسطور للاستعادة
  for v_line in
    select item_id, qty
    from public.invoice_items
    where invoice_id = p_invoice_id
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty)
    values (v_company, v_inv.warehouse_id, v_line.item_id, -v_sign * v_line.qty)
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  update public.invoices
     set deleted_at = now()
   where id = p_invoice_id;

  perform public.set_linked_receipt_deleted(p_invoice_id, true);
end;
$$;

create or replace function public.restore_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
  v_line    record;
  v_sign    integer;
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

  if v_inv.deleted_at is null then
    raise exception 'invoice_not_deleted' using errcode = '22023';
  end if;

  v_sign := case when v_inv.kind in ('sale', 'purchase_return') then -1 else 1 end;

  -- إعادة تطبيق المخزون من السطور المحفوظة
  for v_line in
    select item_id, qty
    from public.invoice_items
    where invoice_id = p_invoice_id
  loop
    insert into public.item_stock (company_id, warehouse_id, item_id, qty)
    values (v_company, v_inv.warehouse_id, v_line.item_id, v_sign * v_line.qty)
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  update public.invoices
     set deleted_at = null
   where id = p_invoice_id;

  perform public.set_linked_receipt_deleted(p_invoice_id, false);
end;
$$;

-- ---------------------------------------------------------------------
-- v_account_balances:
--   invoiced = فواتير البيع والشراء − المرتجعات
--   paid     = المدفوع − المسترد (مسترد المرتجع يعكس أثره)
--   balance  = invoiced − paid
-- ---------------------------------------------------------------------
create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  coalesce(inv.total, 0)::numeric(18,4)                         as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4)                        as paid,
  (coalesce(inv.total, 0) - coalesce(rec.amount, 0))::numeric(18,4) as balance,
  (coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0             as has_documents
from public.accounts a
left join (
  select
    account_id,
    sum(case when kind in ('sale', 'purchase') then total else -total end)
      filter (where deleted_at is null) as total,
    count(*)                            as cnt
  from public.invoices
  group by account_id
) inv on inv.account_id = a.id
left join (
  select
    r.account_id,
    sum(
      case
        when r.invoice_id is null then r.amount
        when i.kind in ('sale', 'purchase') then r.amount
        else -r.amount
      end
    ) filter (where r.deleted_at is null) as amount,
    count(*)                              as cnt
  from public.receipts r
  left join public.invoices i on i.id = r.invoice_id
  group by r.account_id
) rec on rec.account_id = a.id;

-- ---------------------------------------------------------------------
-- v_receipt_list: البيان يفرّق بين الفاتورة والمرتجع
-- ---------------------------------------------------------------------
create or replace view public.v_receipt_list
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
  r.updated_at,
  r.deleted_at,
  r.description,
  case
    when r.invoice_id is not null then
      (case when i.kind in ('sale', 'purchase') then 'فاتورة ' else 'مرتجع ' end) || i.number
    else r.description
  end as statement,
  r.direction
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

-- =====================================================================
-- 0007_soft_delete.sql
-- حذف سوفت للفواتير والإيصالات:
--   deleted_at = null  => مستند نشط (يظهر في الأرصدة والتقارير)
--   deleted_at = وقت   => محذوف (يُستثنى من الحسابات، ويمكن استعادته)
-- الفاتورة وإيصالها المرتبط: يُحذفان ويُستعادان معًا.
-- =====================================================================

alter table public.invoices add column deleted_at timestamptz;
alter table public.receipts add column deleted_at timestamptz;

create index invoices_deleted_idx on public.invoices(company_id, kind, deleted_at);
create index receipts_deleted_idx on public.receipts(company_id, deleted_at);

-- ---------------------------------------------------------------------
-- update_invoice: نفس منطق 0004 + منع تعديل فاتورة محذوفة
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

  if v_inv.deleted_at is not null then
    raise exception 'invoice_deleted' using errcode = '22023';
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
-- sync_invoice_receipt: الإيصال يُخفى (سوفت) عند مدفوع=0 ويُعاد عند >0
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
      (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount)
    values
      (v_company, p_invoice_id, public.next_document_number(v_company, 'receipt'),
       v_inv.invoice_date, v_inv.account_id, v_box, v_inv.paid);
  else
    update public.receipts
       set amount       = v_inv.paid,
           account_id   = v_inv.account_id,
           receipt_date = v_inv.invoice_date,
           deleted_at   = null
     where invoice_id = p_invoice_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- إظهار/إخفاء إيصال الفاتورة المرتبط (security definer)
-- العميل ممنوع من الكتابة المباشرة على الإيصال المرتبط (RLS)،
-- ولذلك تُدار الحالة من هنا مع التحقق من حالة الفاتورة نفسها.
-- ---------------------------------------------------------------------
create or replace function public.set_linked_receipt_deleted(
  p_invoice_id uuid,
  p_deleted    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
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

  if p_deleted and v_inv.deleted_at is null then
    raise exception 'invoice_not_deleted' using errcode = '22023';
  end if;

  if not p_deleted and v_inv.deleted_at is not null then
    raise exception 'invoice_deleted' using errcode = '22023';
  end if;

  if p_deleted then
    update public.receipts
       set deleted_at = coalesce(deleted_at, now())
     where invoice_id = p_invoice_id;
  elsif v_inv.paid > 0 then
    update public.receipts
       set deleted_at = null
     where invoice_id = p_invoice_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- حذف/استعادة الفاتورة (مع إيصالها المرتبط)
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

  if v_inv.deleted_at is not null then
    raise exception 'invoice_already_deleted' using errcode = '22023';
  end if;

  -- عكس المخزون مع الاحتفاظ بالسطور للاستعادة
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

  -- إعادة تطبيق المخزون من السطور المحفوظة
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
      case when v_inv.kind = 'sale' then -v_line.qty else v_line.qty end
    )
    on conflict (warehouse_id, item_id) do update
      set qty = public.item_stock.qty + excluded.qty,
          updated_at = now();
  end loop;

  update public.invoices
     set deleted_at = null
   where id = p_invoice_id;

  -- لا نُعيد إيصالًا لفاتورة مدفوعها صفر (هذا داخل الدالة المساعدة)
  perform public.set_linked_receipt_deleted(p_invoice_id, false);
end;
$$;

-- ---------------------------------------------------------------------
-- الإيصال الحر: حذف سوفت + استعادة
-- ---------------------------------------------------------------------
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

  if v_receipt.deleted_at is not null then
    raise exception 'receipt_already_deleted' using errcode = '22023';
  end if;

  update public.receipts
     set deleted_at = now()
   where id = p_receipt_id;
end;
$$;

create or replace function public.restore_receipt(p_receipt_id uuid)
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

  if v_receipt.deleted_at is null then
    raise exception 'receipt_not_deleted' using errcode = '22023';
  end if;

  update public.receipts
     set deleted_at = null
   where id = p_receipt_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Views: الأرصدة تستثني المحذوف، والقوائم تُظهر deleted_at للفلترة
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
    sum(total) filter (where deleted_at is null) as total,
    count(*)                                     as cnt
  from public.invoices
  group by account_id
) inv on inv.account_id = a.id
left join (
  select
    account_id,
    sum(amount) filter (where deleted_at is null) as amount,
    count(*)                                      as cnt
  from public.receipts
  group by account_id
) rec on rec.account_id = a.id;

create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  coalesce(sum(case when a.kind = 'customer' then r.amount else -r.amount end), 0)::numeric(18,4) as balance
from public.cash_boxes cb
left join public.receipts r
  on r.cash_box_id = cb.id
 and r.deleted_at is null
left join public.accounts a on a.id = r.account_id
group by cb.id;

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
  i.deleted_at
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r
  on r.invoice_id = i.id
 and r.deleted_at is null;

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
  r.deleted_at
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public.restore_invoice(uuid) from public, anon;
revoke all on function public.restore_receipt(uuid) from public, anon;
revoke all on function public.set_linked_receipt_deleted(uuid, boolean) from public, anon;

grant execute on function public.restore_invoice(uuid) to authenticated;
grant execute on function public.restore_receipt(uuid) to authenticated;
grant execute on function public.set_linked_receipt_deleted(uuid, boolean) to authenticated;

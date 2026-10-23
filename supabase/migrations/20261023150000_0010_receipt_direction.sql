-- =====================================================================
-- 0010_receipt_direction.sql
-- فصل الإيصالات حسب الاتجاه بدل نوع الحساب:
--   in  = إيصال استلام (نقد يدخل الخزنة)  => RCP
--   out = إيصال صرف   (نقد يخرج من الخزنة) => PAY
--   - الحساب قد يكون عميلًا أو موردًا في أي اتجاه.
--   - إيصال الفاتورة يأخذ اتجاهه من نوع الفاتورة (بيع => استلام، شراء => صرف).
--   - ترقيم منفصل لكل اتجاه، مع إعادة ترقيم الإيصالات القديمة حسب اتجاهها.
-- =====================================================================

alter table public.receipts add column direction text;

update public.receipts r
   set direction = case
     when r.invoice_id is not null then (
       select case i.kind when 'sale' then 'in' else 'out' end
       from public.invoices i
       where i.id = r.invoice_id
     )
     else (
       select case a.kind when 'customer' then 'in' else 'out' end
       from public.accounts a
       where a.id = r.account_id
     )
   end;

alter table public.receipts alter column direction set not null;
alter table public.receipts
  add constraint receipts_direction_check check (direction in ('in', 'out'));

create index receipts_direction_idx
  on public.receipts(company_id, direction, deleted_at);

-- ---------------------------------------------------------------------
-- إعادة ترقيم الإيصالات القديمة حسب الاتجاه
-- (قيمة مؤقتة أولًا لتفادي تصادم unique (company_id, number))
-- ---------------------------------------------------------------------
update public.receipts set number = 'TMP-' || id::text;

with numbered as (
  select
    id,
    case when direction = 'in' then 'RCP' else 'PAY' end as prefix,
    row_number() over (
      partition by company_id, direction
      order by receipt_date, created_at, id
    ) as rn
  from public.receipts
)
update public.receipts r
   set number = n.prefix || '-' || lpad(n.rn::text, 6, '0')
  from numbered n
 where n.id = r.id;

-- ---------------------------------------------------------------------
-- سلاسل الترقيم الجديدة: receipt_in => RCP، receipt_out => PAY
-- ---------------------------------------------------------------------
delete from public.document_sequences where doc_type = 'receipt';

insert into public.document_sequences (company_id, doc_type, last_number)
select company_id, 'receipt_in', count(*)
from public.receipts
where direction = 'in'
group by company_id
on conflict (company_id, doc_type) do update
  set last_number = excluded.last_number;

insert into public.document_sequences (company_id, doc_type, last_number)
select company_id, 'receipt_out', count(*)
from public.receipts
where direction = 'out'
group by company_id
on conflict (company_id, doc_type) do update
  set last_number = excluded.last_number;

-- ---------------------------------------------------------------------
-- بادئات الترقيم
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
    when 'sale'        then 'SAL'
    when 'purchase'    then 'PUR'
    when 'receipt_in'  then 'RCP'
    when 'receipt_out' then 'PAY'
    when 'receipt'     then 'RCP'
    else upper(left(p_doc_type, 3))
  end;

  return v_prefix || '-' || lpad(v_last::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- الإيصال الحر: الاتجاه يُحدَّد عند الإنشاء (من التاب المفتوح)
-- ---------------------------------------------------------------------
drop function if exists public.create_free_receipt(uuid, uuid, date, numeric, text, text);

create function public.create_free_receipt(
  p_account_id  uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount      numeric,
  p_notes       text,
  p_description text,
  p_direction   text
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

  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'invalid_direction' using errcode = '22023';
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
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id,
     amount, notes, description, direction)
  values
    (v_company, null,
     public.next_document_number(
       v_company,
       case p_direction when 'in' then 'receipt_in' else 'receipt_out' end
     ),
     coalesce(p_receipt_date, current_date), p_account_id, p_cash_box_id,
     p_amount, p_notes, p_description, p_direction)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- إيصال الفاتورة: الاتجاه من نوع الفاتورة
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

  v_dir := case v_inv.kind when 'sale' then 'in' else 'out' end;

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
-- الخزنة تتحرك حسب اتجاه الإيصال لا حسب نوع الحساب
-- ---------------------------------------------------------------------
create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  coalesce(sum(case when r.direction = 'in' then r.amount else -r.amount end), 0)::numeric(18,4) as balance
from public.cash_boxes cb
left join public.receipts r
  on r.cash_box_id = cb.id
 and r.deleted_at is null
group by cb.id;

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
    when r.invoice_id is not null then 'فاتورة ' || i.number
    else r.description
  end as statement,
  r.direction
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) to authenticated;

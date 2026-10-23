-- =====================================================================
-- 0009_receipt_description.sql
-- حقل «البيان» للإيصالات:
--   - الإيصال الحر: يكتبه المستخدم (بيان الدفع).
--   - الإيصال المرتبط: يظهر فيه رقم الفاتورة كما كان في عمود «المصدر».
-- «ملاحظات» يبقى حقلًا منفصلًا.
-- =====================================================================

alter table public.receipts add column description text;

drop function if exists public.create_free_receipt(uuid, uuid, date, numeric, text);
drop function if exists public.update_free_receipt(uuid, uuid, uuid, date, numeric, text);

create function public.create_free_receipt(
  p_account_id  uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount      numeric,
  p_notes       text,
  p_description text
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
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id,
     amount, notes, description)
  values
    (v_company, null, public.next_document_number(v_company, 'receipt'),
     coalesce(p_receipt_date, current_date), p_account_id, p_cash_box_id,
     p_amount, p_notes, p_description)
  returning id into v_id;

  return v_id;
end;
$$;

create function public.update_free_receipt(
  p_receipt_id  uuid,
  p_account_id  uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount      numeric,
  p_notes       text,
  p_description text
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

  if v_receipt.deleted_at is not null then
    raise exception 'receipt_already_deleted' using errcode = '22023';
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
         notes        = p_notes,
         description  = p_description
   where id = p_receipt_id;

  return p_receipt_id;
end;
$$;

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
  end as statement
from public.receipts r
join public.accounts a on a.id = r.account_id
join public.cash_boxes cb on cb.id = r.cash_box_id
left join public.invoices i on i.id = r.invoice_id;

revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text, text) from public, anon;
revoke all on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text, text) from public, anon;

grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text, text) to authenticated;
grant execute on function public.update_free_receipt(uuid, uuid, uuid, date, numeric, text, text) to authenticated;

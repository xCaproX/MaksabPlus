create or replace function public.create_free_receipt(
  p_account_id uuid,
  p_cash_box_id uuid,
  p_receipt_date date,
  p_amount numeric,
  p_notes text,
  p_description text,
  p_direction text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_system_key text;
begin
  perform public.require_permission('money.' || p_direction || '.create');
  perform public.require_permission('money.create');

  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  -- Invoices lock the account before numbering their linked receipt.
  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active
  for update;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if v_system_key in ('cash_customer', 'cash_supplier') then
    raise exception 'invalid_free_receipt_account' using errcode = '22023';
  end if;

  perform 1 from public.cash_boxes where id = p_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;

  insert into public.receipts
    (company_id, invoice_id, number, receipt_date, account_id, cash_box_id, amount, notes, description, direction)
  values
    (v_company, null,
     public.next_document_number(v_company, case p_direction when 'in' then 'receipt_in' else 'receipt_out' end),
     coalesce(p_receipt_date, current_date), p_account_id, p_cash_box_id, p_amount, p_notes, p_description, p_direction)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.create_free_receipt(uuid, uuid, date, numeric, text, text, text) to authenticated;

create or replace function public.create_cash_box_with_opening_balance_and_notes(
  p_name text,
  p_opening_balance numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash_box_id uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'cash_box_name_required' using errcode = '22023'; end if;
  if p_opening_balance is null then raise exception 'invalid_opening_balance' using errcode = '22023'; end if;

  insert into public.cash_boxes(company_id, name, opening_balance, notes)
  values (v_company, btrim(p_name), round(p_opening_balance, 4), nullif(btrim(p_notes), ''))
  returning id into v_cash_box_id;

  return v_cash_box_id;
end;
$$;

revoke all on function public.create_cash_box_with_opening_balance_and_notes(text, numeric, text) from public, anon;
grant execute on function public.create_cash_box_with_opening_balance_and_notes(text, numeric, text) to authenticated;

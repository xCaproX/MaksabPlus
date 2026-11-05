-- Create account metadata, notes and the entered opening amount in one insert.
-- A create-only employee must not need edit or opening-adjustment permissions.
create or replace function public.save_account_with_notes(
  p_account_id uuid, p_name text, p_kind text, p_phone text,
  p_is_active boolean, p_opening_balance numeric, p_notes text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_account_id uuid;
  v_existing_kind text;
  v_tab text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'account_name_required' using errcode='22023'; end if;
  if p_kind is null or p_kind not in ('customer','supplier') then
    raise exception 'invalid_account_kind' using errcode='22023';
  end if;
  if p_opening_balance::text in ('NaN','Infinity','-Infinity') then
    raise exception 'invalid_opening_balance' using errcode='22023';
  end if;
  v_tab := case when p_kind='customer' then 'customers' else 'suppliers' end;
  if p_account_id is null then
    perform public.require_permission('data.' || v_tab || '.create');
    insert into public.accounts(company_id,name,kind,phone,is_active,opening_balance,notes)
    values(v_company,btrim(p_name),p_kind,nullif(btrim(p_phone),''),coalesce(p_is_active,true),
      round(coalesce(p_opening_balance,0),4),nullif(btrim(p_notes),''))
    returning id into v_account_id;
  else
    select kind into v_existing_kind from public.accounts
    where id=p_account_id and company_id=v_company;
    if not found then raise exception 'account_not_found' using errcode='22023'; end if;
    perform public.require_permission('data.' || v_tab || '.edit');
    perform public.require_permission('data.' ||
      case when v_existing_kind='customer' then 'customers' else 'suppliers' end || '.edit');
    -- Keep the existing adjustment rules for legacy callers of the edit RPC.
    v_account_id := public.save_account(p_account_id,p_name,p_kind,p_phone,p_is_active,p_opening_balance);
    update public.accounts set notes=nullif(btrim(p_notes),'')
    where id=v_account_id and company_id=v_company;
  end if;
  return v_account_id;
end $$;

revoke all on function public.save_account_with_notes(uuid,text,text,text,boolean,numeric,text) from public, anon;
grant execute on function public.save_account_with_notes(uuid,text,text,text,boolean,numeric,text) to authenticated;

-- =====================================================================
-- 0008_master_data_delete.sql
-- حذف الحسابات والأصناف:
--   - لا توجد فواتير/إيصالات مرتبطة => حذف نهائي.
--   - يوجد أي مستند (حتى المحذوف سوفت، لأنه قابل للاستعادة) => تعطيل فقط.
-- ترجع الدالة true لو تم الحذف النهائي، و false لو تم التعطيل.
-- =====================================================================

create or replace function public.delete_account(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform 1
  from public.accounts
  where id = p_account_id
    and company_id = v_company;

  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;

  if exists (select 1 from public.invoices where account_id = p_account_id)
     or exists (select 1 from public.receipts where account_id = p_account_id) then
    update public.accounts
       set is_active = false
     where id = p_account_id
       and company_id = v_company;
    return false;
  end if;

  delete from public.accounts
   where id = p_account_id
     and company_id = v_company;

  return true;
end;
$$;

create or replace function public.delete_item(p_item_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform 1
  from public.items
  where id = p_item_id
    and company_id = v_company;

  if not found then
    raise exception 'item_not_found' using errcode = '22023';
  end if;

  -- أي سطر فاتورة (حتى لفاتورة محذوفة) يمنع الحذف النهائي
  if exists (select 1 from public.invoice_items where item_id = p_item_id) then
    update public.items
       set is_active = false
     where id = p_item_id
       and company_id = v_company;
    return false;
  end if;

  -- item_stock يُحذف تلقائيًا بالـ cascade، وهذا صريح للوضوح
  delete from public.item_stock where item_id = p_item_id;

  delete from public.items
   where id = p_item_id
     and company_id = v_company;

  return true;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon;
revoke all on function public.delete_item(uuid) from public, anon;

grant execute on function public.delete_account(uuid) to authenticated;
grant execute on function public.delete_item(uuid) to authenticated;

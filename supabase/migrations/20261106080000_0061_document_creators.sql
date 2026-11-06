-- Keep a snapshot of the creator's display name. Existing documents remain
-- unattributed; editing, deleting and restoring never change their creator.
alter table public.invoices add column created_by_name text;
alter table public.receipts add column created_by_name text;
alter table public.warehouse_transfers add column created_by_name text;
alter table public.cash_box_transfers add column created_by_name text;

create function public.stamp_document_creator()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if auth.uid() is not null and (v_company is null or new.company_id is distinct from v_company) then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by_name := old.created_by_name;
    return new;
  end if;

  -- A client-supplied name is never authoritative. Trusted maintenance without
  -- a user session stays unattributed, rather than inventing a creator.
  new.created_by_name := null;
  if v_company is not null then
    select coalesce(nullif(btrim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'المستخدم')
    into new.created_by_name
    from public.profiles p left join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.company_id = v_company and p.is_active;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_document_creator() from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array['invoices','receipts','warehouse_transfers','cash_box_transfers'] loop
    execute format('create trigger document_creator_stamp before insert or update on public.%I
      for each row execute function public.stamp_document_creator()', v_table);
  end loop;
end $$;

-- Invoice SELECT is granted per safe column to protect raw accounting costs.
grant select (created_by_name) on public.invoices to authenticated;

-- Extend the current view definitions without replacing their protected cost
-- expressions, joins, order of existing columns or security-invoker behavior.
do $$
declare
  v_view text;
  v_alias text;
  v_definition text;
  v_extended text;
begin
  foreach v_view in array array['v_invoice_list','v_receipt_list','v_warehouse_transfer_list','v_cash_box_transfer_list'] loop
    v_alias := case v_view when 'v_invoice_list' then 'i' when 'v_receipt_list' then 'r' else 't' end;
    v_definition := pg_get_viewdef(('public.' || v_view)::regclass, true);
    v_extended := regexp_replace(v_definition, E'(\n[[:space:]]+FROM )',
      ', ' || v_alias || '.created_by_name AS created_by_name' || chr(92) || '1');
    if v_extended = v_definition then raise exception 'document_view_definition_did_not_match: %', v_view; end if;
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v_view, v_extended);
    execute format('revoke all on public.%I from public, anon', v_view);
    execute format('grant select on public.%I to authenticated', v_view);
  end loop;
end $$;

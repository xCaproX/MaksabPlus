alter table public.profiles
  add column access_role text not null default 'owner' check (access_role in ('owner','employee')),
  add column is_active boolean not null default true;
update public.profiles set access_role = 'owner';

create table public.user_permissions (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null check (permission_key in (
    'goods.view','goods.create','goods.edit','goods.delete',
    'money.view','money.create','money.edit','money.delete',
    'data.view','data.create','data.edit','data.delete',
    'balances.view','management.view','management.edit')),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);
create index user_permissions_company_idx on public.user_permissions(company_id,user_id);
alter table public.user_permissions enable row level security;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path=public as $$
  select company_id from public.profiles where id=auth.uid() and is_active
$$;
create or replace function public.is_company_owner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active and access_role='owner')
$$;
create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_company_owner() or exists(
    select 1 from public.user_permissions up join public.profiles p on p.id=up.user_id and p.company_id=up.company_id
    where up.user_id=auth.uid() and up.permission_key=p_key and p.is_active)
$$;
create or replace function public.require_permission(p_key text)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_key) then raise exception 'permission_denied' using errcode='42501'; end if;
end; $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('role',p.access_role,'permissions',case when p.access_role='owner' then
    jsonb_build_array('goods.view','goods.create','goods.edit','goods.delete','money.view','money.create','money.edit','money.delete',
      'data.view','data.create','data.edit','data.delete','balances.view','management.view','management.edit')
    else coalesce((select jsonb_agg(up.permission_key order by up.permission_key) from public.user_permissions up where up.user_id=p.id),'[]'::jsonb) end)
  from public.profiles p where p.id=auth.uid() and p.is_active
$$;
create or replace function public.list_company_users()
returns table(user_id uuid,email text,full_name text,is_active boolean,access_role text,permission_keys text[])
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
  return query select p.id,u.email::text,p.full_name,p.is_active,p.access_role,
    coalesce(array_agg(up.permission_key order by up.permission_key) filter(where up.permission_key is not null),'{}'::text[])
    from public.profiles p join auth.users u on u.id=p.id left join public.user_permissions up on up.user_id=p.id
    where p.company_id=public.current_company_id() group by p.id,u.email order by p.created_at;
end; $$;
create or replace function public.set_user_permissions(p_user_id uuid,p_permission_keys text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_key text; v_company uuid:=public.current_company_id();
begin
  if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(p_permission_keys,'{}'::text[])) k where k not in
    ('goods.view','goods.create','goods.edit','goods.delete','money.view','money.create','money.edit','money.delete',
     'data.view','data.create','data.edit','data.delete','balances.view','management.view','management.edit')) then
    raise exception 'invalid_permission_key' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and company_id=v_company and access_role='employee') then
    raise exception 'invalid_company_user' using errcode='22023'; end if;
  delete from public.user_permissions where user_id=p_user_id and company_id=v_company;
  for v_key in select distinct unnest(coalesce(p_permission_keys,'{}'::text[])) loop
    insert into public.user_permissions(company_id,user_id,permission_key) values(v_company,p_user_id,v_key);
  end loop;
end; $$;
create or replace function public.set_company_user_active(p_user_id uuid,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
  update public.profiles set is_active=p_is_active where id=p_user_id and company_id=public.current_company_id() and access_role='employee';
  if not found then raise exception 'invalid_company_user' using errcode='22023'; end if;
end; $$;

drop policy profiles_update_own on public.profiles;
create policy profiles_select_self_or_owner on public.profiles for select to authenticated
  using(id=auth.uid() or (company_id=public.current_company_id() and public.is_company_owner()));
create policy user_permissions_select_self_or_owner on public.user_permissions for select to authenticated
  using(user_id=auth.uid() or (company_id=public.current_company_id() and public.is_company_owner()));
revoke insert,update,delete on public.profiles,public.user_permissions from anon,authenticated;
grant select on public.user_permissions to authenticated;
grant execute on function public.is_company_owner(),public.has_permission(text),public.get_my_access(),
  public.list_company_users(),public.set_user_permissions(uuid,text[]),public.set_company_user_active(uuid,boolean) to authenticated;
revoke all on function public.require_permission(text) from public,anon,authenticated;
grant execute on function public.require_permission(text) to authenticated;

-- Add restrictive access checks while retaining each table's company isolation policy.
create policy accounts_permissions on public.accounts as restrictive for all to authenticated
  using(public.has_permission('data.view') or public.has_permission('balances.view') or public.has_permission('data.edit') or public.has_permission('data.delete')
    or public.has_permission('data.create') or public.has_permission('management.view')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit')
    or public.has_permission('money.view') or public.has_permission('money.create') or public.has_permission('money.edit'))
  with check(public.has_permission('data.create') or public.has_permission('data.edit') or public.has_permission('management.edit'));
create policy items_permissions on public.items as restrictive for all to authenticated
  using(public.has_permission('data.view') or public.has_permission('data.edit') or public.has_permission('data.delete')
    or public.has_permission('data.create') or public.has_permission('management.view') or public.has_permission('balances.view')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit'))
  with check(public.has_permission('data.create') or public.has_permission('data.edit'));
create policy warehouses_permissions on public.warehouses as restrictive for all to authenticated
  using(public.has_permission('data.view') or public.has_permission('data.edit') or public.has_permission('data.delete')
    or public.has_permission('data.create') or public.has_permission('management.view') or public.has_permission('balances.view')
    or public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit'))
  with check(public.has_permission('data.create') or public.has_permission('data.edit'));
create policy cash_boxes_permissions on public.cash_boxes as restrictive for all to authenticated
  using(public.has_permission('data.view') or public.has_permission('data.create') or public.has_permission('data.edit') or public.has_permission('data.delete') or public.has_permission('management.view')
    or public.has_permission('balances.view') or public.has_permission('money.view') or public.has_permission('money.create') or public.has_permission('money.edit'))
  with check(public.has_permission('data.create') or public.has_permission('data.edit') or public.has_permission('management.edit'));
create policy item_stock_permissions on public.item_stock as restrictive for all to authenticated
  using(public.has_permission('goods.view') or public.has_permission('balances.view') or public.has_permission('management.view'))
  with check(public.has_permission('goods.create') or public.has_permission('goods.edit') or public.has_permission('goods.delete') or public.has_permission('management.edit'));
create policy invoices_permissions on public.invoices as restrictive for all to authenticated
  using(public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit') or public.has_permission('balances.view') or public.has_permission('management.view'))
  with check(public.has_permission('goods.create') or public.has_permission('goods.edit'));
create policy invoice_items_permissions on public.invoice_items as restrictive for all to authenticated
  using(public.has_permission('goods.view') or public.has_permission('goods.create') or public.has_permission('goods.edit') or public.has_permission('balances.view') or public.has_permission('management.view'))
  with check(public.has_permission('goods.create') or public.has_permission('goods.edit'));
create policy receipts_permissions on public.receipts as restrictive for all to authenticated
  using(public.has_permission('money.view') or public.has_permission('balances.view') or public.has_permission('management.view') or public.has_permission('money.edit') or public.has_permission('money.delete'))
  with check(public.has_permission('money.create') or public.has_permission('money.edit'));
do $$
declare t text;
begin
  foreach t in array array['opening_balance_adjustments','stock_opening_balances','stock_opening_adjustments'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using(public.has_permission(''management.view'') or public.has_permission(''balances.view'') or public.has_permission(''management.edit'')) with check(public.has_permission(''management.edit'') or public.has_permission(''data.create''))',t||'_permissions',t);
  end loop;
  foreach t in array array['warehouse_transfers','warehouse_transfer_items'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using(public.has_permission(''goods.view'') or public.has_permission(''goods.create'') or public.has_permission(''goods.edit'') or public.has_permission(''balances.view'')) with check(public.has_permission(''goods.create'') or public.has_permission(''goods.edit''))',t||'_permissions',t);
  end loop;
  execute 'create policy cash_box_transfers_permissions on public.cash_box_transfers as restrictive for all to authenticated using(public.has_permission(''money.view'') or public.has_permission(''balances.view'')) with check(public.has_permission(''money.create'') or public.has_permission(''money.edit''))';
end; $$;

-- SECURITY DEFINER mutation RPCs bypass RLS; inject an exact action check at function entry.
do $$
declare r record; d text; dollar_pos int; v_begin_index int; perm text; insert_text text;
begin
  for r in select p.oid,p.proname,pg_get_functiondef(p.oid) definition from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and l.lanname='plpgsql' and p.proname=any(array[
      'create_invoice','create_invoice_with_cash_box','update_invoice','update_invoice_with_cash_box','delete_invoice','restore_invoice',
      'create_warehouse_transfer','update_warehouse_transfer','delete_warehouse_transfer','restore_warehouse_transfer',
      'create_free_receipt','update_free_receipt','delete_free_receipt','restore_receipt',
      'create_cash_box_transfer','update_cash_box_transfer','delete_cash_box_transfer','restore_cash_box_transfer',
      'save_account','save_account_with_notes','create_item_with_opening_stock','create_item_with_opening_stock_and_notes',
      'create_item_with_opening_stock_and_notes_and_code','delete_account','delete_item','delete_warehouse','delete_cash_box',
      'create_cash_box_with_opening_balance_and_notes','save_opening_balances'])
  loop
    perm:=case
      when r.proname like 'create_invoice%' or r.proname in('create_warehouse_transfer') then 'goods.create'
      when r.proname like 'update_invoice%' or r.proname='update_warehouse_transfer' then 'goods.edit'
      when r.proname in('delete_invoice','restore_invoice','delete_warehouse_transfer','restore_warehouse_transfer') then 'goods.delete'
      when r.proname in('create_free_receipt','create_cash_box_transfer') then 'money.create'
      when r.proname in('update_free_receipt','update_cash_box_transfer') then 'money.edit'
      when r.proname in('delete_free_receipt','restore_receipt','delete_cash_box_transfer','restore_cash_box_transfer') then 'money.delete'
      when r.proname in('save_account','save_opening_balances') then 'management.edit'
      when r.proname like 'create_item%' or r.proname='create_cash_box_with_opening_balance_and_notes' then 'data.create'
      when r.proname='save_account_with_notes' then 'data.edit'
      else 'data.delete' end;
    d:=r.definition; dollar_pos:=strpos(d,'$function$');
    v_begin_index:=strpos(lower(substr(d,dollar_pos)),'begin');
    if dollar_pos=0 or v_begin_index=0 then raise exception 'cannot locate body for %',r.proname; end if;
    if r.proname='save_account_with_notes' then
      insert_text:=E'\n  if p_account_id is null then perform public.require_permission(''data.create''); else perform public.require_permission(''data.edit''); end if;';
    else
      insert_text:=format(E'\n  perform public.require_permission(%L);',perm);
    end if;
    d:=overlay(d placing insert_text from dollar_pos+v_begin_index+4 for 0);
    execute d;
  end loop;
end; $$;

create or replace function public.guard_permission_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_action text; v_permission text; v_opening_changed boolean:=false;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  v_action:=case when tg_op='INSERT' then 'create' when tg_op='DELETE' then 'delete' else 'edit' end;
  if tg_op='UPDATE' and tg_table_name='accounts' then
    v_opening_changed:=new.opening_balance is distinct from old.opening_balance;
  elsif tg_op='UPDATE' and tg_table_name='cash_boxes' then
    v_opening_changed:=new.opening_balance is distinct from old.opening_balance;
  end if;
  if tg_table_name='receipts' then
    if tg_op='DELETE' then
      if old.invoice_id is not null then v_permission:='goods.'||v_action; else v_permission:='money.'||v_action; end if;
    else
      if new.invoice_id is not null then v_permission:='goods.'||v_action; else v_permission:='money.'||v_action; end if;
    end if;
  else
  v_permission:=case
    when tg_table_name in ('invoices','invoice_items','warehouse_transfers','warehouse_transfer_items') then 'goods.'||v_action
    when tg_table_name='cash_box_transfers' then 'money.'||v_action
    when tg_table_name in ('opening_balance_adjustments','stock_opening_adjustments') then 'management.edit'
    when tg_table_name='stock_opening_balances' then case when tg_op='INSERT' then 'data.create' else 'management.edit' end
    when tg_table_name='item_stock' then null
    when tg_table_name in ('accounts','items','warehouses','cash_boxes') then
      case when v_opening_changed then 'management.edit' else 'data.'||v_action end
    else null end;
  end if;
  if tg_table_name='item_stock' then
    if not (public.has_permission('management.edit') or public.has_permission('goods.'||v_action)
      or (tg_op='INSERT' and public.has_permission('data.create'))
      or (tg_op='DELETE' and public.has_permission('data.delete'))) then
      raise exception 'permission_denied' using errcode='42501';
    end if;
  elsif v_permission is not null then
    perform public.require_permission(v_permission);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['accounts','items','warehouses','cash_boxes','item_stock','invoices','invoice_items','receipts',
    'opening_balance_adjustments','stock_opening_balances','stock_opening_adjustments','warehouse_transfers','warehouse_transfer_items','cash_box_transfers'] loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_permission_write()',t||'_permission_guard',t);
  end loop;
end; $$;

grant execute on function public.guard_permission_write() to authenticated;

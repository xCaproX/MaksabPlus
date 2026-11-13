-- =====================================================================
-- Platform Admin: Customer-facing suspension reason & single-user lifecycle
-- =====================================================================

-- 1. Optional customer-facing suspension notice (kept strictly separate from private admin_notes)
alter table public.companies
  add column if not exists suspension_reason text not null default '';

-- 2. Authenticated status lookup when get_my_access() returns null
-- Exposes suspension_reason ONLY to active members of that company (never to anon,
-- other companies, platform_admins, or individually deactivated employees).
create or replace function public.get_my_inactive_status()
returns table (
  reason_code text,
  company_name text,
  suspension_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_name text;
  v_company_active boolean;
  v_user_active boolean;
  v_suspension_reason text;
begin
  if v_uid is null then
    return;
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = v_uid) then
    return;
  end if;

  select
    c.name,
    c.is_active,
    p.is_active,
    c.suspension_reason
  into
    v_company_name,
    v_company_active,
    v_user_active,
    v_suspension_reason
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = v_uid;

  if not found then
    return query
    select 'no_profile'::text, ''::text, ''::text;
    return;
  end if;

  if not coalesce(v_user_active, false) then
    return query
    select 'user_deactivated'::text, coalesce(v_company_name, ''), ''::text;
    return;
  end if;

  if not coalesce(v_company_active, false) then
    return query
    select 'company_suspended'::text, coalesce(v_company_name, ''), coalesce(v_suspension_reason, '');
    return;
  end if;

  return;
end;
$$;

revoke all on function public.get_my_inactive_status() from public, anon;
grant execute on function public.get_my_inactive_status() to authenticated;

-- 3. Extend platform_list_companies() with suspension_reason
drop function if exists public.platform_list_companies();

create function public.platform_list_companies()
returns table (
  id uuid,
  name text,
  currency text,
  is_active boolean,
  suspension_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  users_count bigint,
  active_users_count bigint,
  invoices_count bigint,
  last_activity_at timestamptz,
  admin_notes text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    c.currency,
    c.is_active,
    c.suspension_reason,
    c.created_at,
    c.updated_at,
    coalesce(u.users_count, 0)::bigint as users_count,
    coalesce(u.active_users_count, 0)::bigint as active_users_count,
    coalesce(inv.invoices_count, 0)::bigint as invoices_count,
    nullif(
      greatest(
        coalesce(inv.last_invoice_at, '-infinity'::timestamptz),
        coalesce(rec.last_receipt_at, '-infinity'::timestamptz),
        coalesce(wt.last_wt_at, '-infinity'::timestamptz),
        coalesce(cbt.last_cbt_at, '-infinity'::timestamptz),
        c.updated_at,
        c.created_at
      ),
      '-infinity'::timestamptz
    ) as last_activity_at,
    coalesce(meta.admin_notes, '') as admin_notes
  from public.companies c
  left join public.platform_company_metadata meta on meta.company_id = c.id
  left join lateral (
    select
      count(*)::bigint as users_count,
      count(*) filter (where p.is_active)::bigint as active_users_count
    from public.profiles p
    where p.company_id = c.id
  ) u on true
  left join lateral (
    select
      count(*) filter (where i.deleted_at is null)::bigint as invoices_count,
      max(greatest(i.created_at, i.updated_at)) as last_invoice_at
    from public.invoices i
    where i.company_id = c.id
  ) inv on true
  left join lateral (
    select max(greatest(r.created_at, r.updated_at)) as last_receipt_at
    from public.receipts r
    where r.company_id = c.id
  ) rec on true
  left join lateral (
    select max(greatest(t.created_at, t.updated_at)) as last_wt_at
    from public.warehouse_transfers t
    where t.company_id = c.id
  ) wt on true
  left join lateral (
    select max(greatest(ct.created_at, ct.updated_at)) as last_cbt_at
    from public.cash_box_transfers ct
    where ct.company_id = c.id
  ) cbt on true
  order by c.created_at desc, c.id desc;
end;
$$;

revoke all on function public.platform_list_companies() from public, anon;
grant execute on function public.platform_list_companies() to authenticated;

-- 4. Update platform_update_company to store/clear suspension_reason atomically
drop function if exists public.platform_update_company(uuid, text, text, boolean);

create function public.platform_update_company(
  p_company_id uuid,
  p_name text,
  p_admin_notes text,
  p_is_active boolean,
  p_suspension_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
  v_current_active boolean;
  v_next_active boolean;
  v_next_reason text;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'company_name_required' using errcode = '22023';
  end if;

  if p_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select c.id, c.is_active
  into v_id, v_current_active
  from public.companies c
  where c.id = p_company_id
  for update;

  if v_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  v_next_active := coalesce(p_is_active, v_current_active);
  v_next_reason := case
    when v_next_active then ''
    else trim(coalesce(p_suspension_reason, ''))
  end;

  update public.companies
  set name = v_name,
      is_active = v_next_active,
      suspension_reason = v_next_reason
  where id = p_company_id;

  insert into public.platform_company_metadata (company_id, admin_notes)
  values (p_company_id, coalesce(trim(p_admin_notes), ''))
  on conflict (company_id) do update
    set admin_notes = excluded.admin_notes;
end;
$$;

revoke all on function public.platform_update_company(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.platform_update_company(uuid, text, text, boolean, text) to authenticated;

-- 5. Enforce last active owner protection when toggling user activation
create or replace function public.platform_set_company_user_active(
  p_company_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_active boolean := coalesce(p_is_active, true);
  v_role text;
  v_was_active boolean;
  v_other_owners integer;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if p_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select p.access_role, p.is_active
  into v_role, v_was_active
  from public.profiles p
  where p.id = p_user_id
    and p.company_id = p_company_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if not v_next_active and v_role = 'owner' and v_was_active then
    select count(*)
    into v_other_owners
    from public.profiles p
    where p.company_id = p_company_id
      and p.id <> p_user_id
      and p.access_role = 'owner'
      and p.is_active = true;

    if v_other_owners = 0 then
      raise exception 'cannot_remove_last_active_owner' using errcode = '22023';
    end if;
  end if;

  update public.profiles
  set is_active = v_next_active
  where id = p_user_id
    and company_id = p_company_id;
end;
$$;

revoke all on function public.platform_set_company_user_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.platform_set_company_user_active(uuid, uuid, boolean) to authenticated;

-- 6. Service-role RPCs for single-user update & single-user deletion (called via manage-companies)
create or replace function public.platform_update_company_user_profile(
  p_company_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_access_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_next_role text := coalesce(nullif(trim(p_access_role), ''), '');
  v_old_role text;
  v_was_active boolean;
  v_other_owners integer;
begin
  if p_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if v_full_name = '' then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  if v_next_role not in ('owner', 'employee') then
    raise exception 'invalid_access_role' using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;

  select p.access_role, p.is_active
  into v_old_role, v_was_active
  from public.profiles p
  where p.id = p_user_id
    and p.company_id = p_company_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_old_role = 'owner' and v_was_active and v_next_role = 'employee' then
    select count(*)
    into v_other_owners
    from public.profiles p
    where p.company_id = p_company_id
      and p.id <> p_user_id
      and p.access_role = 'owner'
      and p.is_active = true;

    if v_other_owners = 0 then
      raise exception 'cannot_remove_last_active_owner' using errcode = '22023';
    end if;
  end if;

  update public.profiles
  set full_name = v_full_name,
      access_role = v_next_role
  where id = p_user_id
    and company_id = p_company_id;

  if v_next_role = 'owner' and v_old_role <> 'owner' then
    delete from public.user_permissions
    where user_id = p_user_id
      and company_id = p_company_id;
  end if;
end;
$$;

revoke all on function public.platform_update_company_user_profile(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_update_company_user_profile(uuid, uuid, text, text) to service_role;

create or replace function public.platform_delete_company_user_data(
  p_company_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_was_active boolean;
  v_other_owners integer;
begin
  if p_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if p_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;

  select p.access_role, p.is_active
  into v_role, v_was_active
  from public.profiles p
  where p.id = p_user_id
    and p.company_id = p_company_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_role = 'owner' and v_was_active then
    select count(*)
    into v_other_owners
    from public.profiles p
    where p.company_id = p_company_id
      and p.id <> p_user_id
      and p.access_role = 'owner'
      and p.is_active = true;

    if v_other_owners = 0 then
      raise exception 'cannot_remove_last_active_owner' using errcode = '22023';
    end if;
  end if;

  delete from public.user_permissions
  where user_id = p_user_id
    and company_id = p_company_id;

  delete from public.profiles
  where id = p_user_id
    and company_id = p_company_id;
end;
$$;

revoke all on function public.platform_delete_company_user_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.platform_delete_company_user_data(uuid, uuid) to service_role;

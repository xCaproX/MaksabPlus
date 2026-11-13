-- =====================================================================
-- Platform Admin (Developer) & Multi-Tenant Company Lifecycle Management
-- =====================================================================

-- 1. Dedicated platform_admins identity table (completely separate from company profiles)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_admins_set_updated_at on public.platform_admins;
create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_admins to service_role;

-- Enforce identity separation: a platform admin must never have a tenant profile row
create or replace function public.guard_platform_admin_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_platform_admin_identity() from public, anon, authenticated;

drop trigger if exists platform_admins_identity_guard on public.platform_admins;
create trigger platform_admins_identity_guard
  before insert or update on public.platform_admins
  for each row execute function public.guard_platform_admin_identity();

-- 2. Private developer metadata per company (hidden from company users)
create table if not exists public.platform_company_metadata (
  company_id uuid primary key references public.companies(id) on delete cascade,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_company_metadata_set_updated_at on public.platform_company_metadata;
create trigger platform_company_metadata_set_updated_at
  before update on public.platform_company_metadata
  for each row execute function public.set_updated_at();

alter table public.platform_company_metadata enable row level security;
revoke all on table public.platform_company_metadata from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_company_metadata to service_role;

-- 3. Company active/suspended status
alter table public.companies
  add column if not exists is_active boolean not null default true;

-- 4. Platform admin predicate and company suspension enforcement in tenant helpers
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active = true
      and not exists (
        select 1 from public.profiles p where p.id = pa.user_id
      )
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = auth.uid()
    and p.is_active = true
    and c.is_active = true
    and not exists (
      select 1 from public.platform_admins pa where pa.user_id = p.id
    );
$$;

revoke all on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated;

create or replace function public.is_company_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.companies c on c.id = p.company_id
    where p.id = auth.uid()
      and p.is_active = true
      and c.is_active = true
      and p.access_role = 'owner'
      and not exists (
        select 1 from public.platform_admins pa where pa.user_id = p.id
      )
  );
$$;

revoke all on function public.is_company_owner() from public, anon;
grant execute on function public.is_company_owner() to authenticated;

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_owner() or exists (
    select 1
    from public.user_permissions up
    join public.profiles p on p.id = up.user_id and p.company_id = up.company_id
    join public.companies c on c.id = p.company_id
    cross join lateral (
      select
        replace(up.permission_key, 'cashBoxes', 'cash_boxes') as norm_up,
        replace(p_key, 'cashBoxes', 'cash_boxes') as norm_key
    ) n
    where up.user_id = auth.uid()
      and p.is_active = true
      and c.is_active = true
      and not exists (
        select 1 from public.platform_admins pa where pa.user_id = p.id
      )
      and (
        n.norm_up = n.norm_key
        or up.permission_key = '*'
        or (
          split_part(n.norm_key, '.', 3) <> ''
          and n.norm_up = (split_part(n.norm_key, '.', 1) || '.' || split_part(n.norm_key, '.', 3))
        )
        or (
          split_part(n.norm_key, '.', 3) = ''
          and n.norm_up like (split_part(n.norm_key, '.', 1) || '.%.' || split_part(n.norm_key, '.', 2))
        )
      )
  );
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'role', 'platform_admin',
        'permissions', '[]'::jsonb
      )
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.is_active = true
        and not exists (
          select 1 from public.profiles p where p.id = pa.user_id
        )
      limit 1
    ),
    (
      select jsonb_build_object(
        'role', p.access_role,
        'permissions', case
          when p.access_role = 'owner' then '["*"]'::jsonb
          else coalesce(
            (
              select jsonb_agg(up.permission_key order by up.permission_key)
              from public.user_permissions up
              where up.user_id = p.id
            ),
            '[]'::jsonb
          )
        end
      )
      from public.profiles p
      join public.companies c on c.id = p.company_id
      where p.id = auth.uid()
        and p.is_active = true
        and c.is_active = true
    )
  );
$$;

revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;

-- 5. Client-callable Platform Admin RPCs (verified strictly via is_platform_admin())
create or replace function public.get_platform_admin_identity()
returns table (
  user_id uuid,
  email text,
  full_name text
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
    pa.user_id,
    u.email::text,
    coalesce(nullif(trim(pa.full_name), ''), u.email::text, 'مدير النظام') as full_name
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
  where pa.user_id = auth.uid();
end;
$$;

revoke all on function public.get_platform_admin_identity() from public, anon;
grant execute on function public.get_platform_admin_identity() to authenticated;

create or replace function public.platform_list_companies()
returns table (
  id uuid,
  name text,
  currency text,
  is_active boolean,
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

create or replace function public.platform_list_company_users(p_company_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  is_active boolean,
  access_role text,
  created_at timestamptz,
  email_confirmed_at timestamptz
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

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text,
    p.full_name,
    p.is_active,
    p.access_role,
    p.created_at,
    u.email_confirmed_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = p_company_id
  order by
    case when p.access_role = 'owner' then 0 else 1 end,
    p.created_at asc,
    p.id asc;
end;
$$;

revoke all on function public.platform_list_company_users(uuid) from public, anon;
grant execute on function public.platform_list_company_users(uuid) to authenticated;

create or replace function public.platform_update_company(
  p_company_id uuid,
  p_name text,
  p_admin_notes text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
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

  select c.id into v_id
  from public.companies c
  where c.id = p_company_id
  for update;

  if v_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  update public.companies
  set name = v_name,
      is_active = coalesce(p_is_active, is_active)
  where id = p_company_id;

  insert into public.platform_company_metadata (company_id, admin_notes)
  values (p_company_id, coalesce(trim(p_admin_notes), ''))
  on conflict (company_id) do update
    set admin_notes = excluded.admin_notes;
end;
$$;

revoke all on function public.platform_update_company(uuid, text, text, boolean) from public, anon;
grant execute on function public.platform_update_company(uuid, text, text, boolean) to authenticated;

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
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if p_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set is_active = coalesce(p_is_active, true)
  where id = p_user_id
    and company_id = p_company_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.platform_set_company_user_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.platform_set_company_user_active(uuid, uuid, boolean) to authenticated;

create or replace function public.platform_set_company_user_password(
  p_company_id uuid,
  p_user_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_password is null or length(trim(p_password)) < 8 then
    raise exception 'password_too_short' using errcode = '22023';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.company_id = p_company_id
  ) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.platform_set_company_user_password(uuid, uuid, text) from public, anon;
grant execute on function public.platform_set_company_user_password(uuid, uuid, text) to authenticated;

-- 6. Allow controlled transaction-local cascade delete of system accounts for company deletion only
create or replace function public.accounts_guard_system()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     and old.system_key is not null
     and coalesce(current_setting('app.allow_company_cascade_delete', true), '') = 'on' then
    return old;
  end if;

  if old.system_key is not null then
    if tg_op = 'DELETE' then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;
    if new.name is distinct from old.name or new.kind is distinct from old.kind
       or new.company_id is distinct from old.company_id or new.phone is distinct from old.phone
       or new.created_at is distinct from old.created_at or new.system_key is distinct from old.system_key
       or new.is_active is distinct from old.is_active or new.opening_balance is distinct from old.opening_balance then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;
  elsif new.system_key is not null then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.accounts_guard_system() from public, anon, authenticated;

-- 7. Service-role-only provisioning and full company deletion RPCs (called via manage-companies Edge Function)
create or replace function public.platform_provision_company_records(
  p_company_name text,
  p_admin_notes text,
  p_owner_user_id uuid,
  p_owner_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text := trim(coalesce(p_company_name, ''));
  v_owner_name text := trim(coalesce(p_owner_full_name, ''));
  v_company_id uuid;
begin
  if v_company_name = '' then
    raise exception 'company_name_required' using errcode = '22023';
  end if;

  if v_owner_name = '' then
    raise exception 'owner_name_required' using errcode = '22023';
  end if;

  if p_owner_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_owner_user_id
  ) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_owner_user_id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_owner_user_id) then
    raise exception 'user_already_has_company' using errcode = '23505';
  end if;

  -- Creates company row; companies_create_fixed_accounts trigger provisions system accounts
  insert into public.companies (name, currency, is_active)
  values (v_company_name, 'EGP', true)
  returning id into v_company_id;

  insert into public.platform_company_metadata (company_id, admin_notes)
  values (v_company_id, coalesce(trim(p_admin_notes), ''));

  insert into public.warehouses (company_id, name, is_active, is_primary)
  values (v_company_id, 'المخزن الرئيسي', true, true);

  insert into public.cash_boxes (company_id, name, is_active, is_primary)
  values (v_company_id, 'الخزنة الرئيسية', true, true);

  insert into public.profiles (id, company_id, full_name, is_active, access_role)
  values (p_owner_user_id, v_company_id, v_owner_name, true, 'owner');

  return v_company_id;
end;
$$;

revoke all on function public.platform_provision_company_records(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_provision_company_records(text, text, uuid, text) to service_role;

create or replace function public.platform_add_company_user_record(
  p_company_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_access_role text default 'owner'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_role text := coalesce(nullif(trim(p_access_role), ''), 'owner');
begin
  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if v_full_name = '' then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  if v_role not in ('owner', 'employee') then
    raise exception 'invalid_access_role' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id
  ) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user_already_has_company' using errcode = '23505';
  end if;

  insert into public.profiles (id, company_id, full_name, is_active, access_role)
  values (p_user_id, p_company_id, v_full_name, true, v_role);
end;
$$;

revoke all on function public.platform_add_company_user_record(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_add_company_user_record(uuid, uuid, text, text) to service_role;

create or replace function public.platform_delete_company_data(p_company_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_ids uuid[];
begin
  if p_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select c.id into v_company_id
  from public.companies c
  where c.id = p_company_id
  for update;

  if v_company_id is null then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(p.id), '{}'::uuid[])
  into v_user_ids
  from public.profiles p
  where p.company_id = p_company_id
    and not exists (
      select 1 from public.platform_admins pa where pa.user_id = p.id
    );

  perform set_config('app.allow_company_cascade_delete', 'on', true);

  delete from public.receipts where company_id = p_company_id;
  delete from public.invoice_items where company_id = p_company_id;
  delete from public.invoices where company_id = p_company_id;
  delete from public.warehouse_transfer_items where company_id = p_company_id;
  delete from public.warehouse_transfers where company_id = p_company_id;
  delete from public.cash_box_transfers where company_id = p_company_id;
  delete from public.opening_balance_adjustments where company_id = p_company_id;
  delete from public.stock_opening_adjustments where company_id = p_company_id;
  delete from public.stock_opening_balances where company_id = p_company_id;
  delete from public.item_stock where company_id = p_company_id;
  delete from public.balance_reconciliation_logs where company_id = p_company_id;
  delete from public.user_permissions where company_id = p_company_id;
  delete from public.profiles where company_id = p_company_id;
  delete from public.items where company_id = p_company_id;
  delete from public.accounts where company_id = p_company_id;
  delete from public.warehouses where company_id = p_company_id;
  delete from public.cash_boxes where company_id = p_company_id;
  delete from public.document_sequences where company_id = p_company_id;
  delete from public.entity_number_sequences where company_id = p_company_id;
  delete from public.platform_company_metadata where company_id = p_company_id;
  delete from public.companies where id = p_company_id;

  perform set_config('app.allow_company_cascade_delete', '', true);

  return v_user_ids;
end;
$$;

revoke all on function public.platform_delete_company_data(uuid) from public, anon, authenticated;
grant execute on function public.platform_delete_company_data(uuid) to service_role;

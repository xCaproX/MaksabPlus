-- Granular sub-tab permissions with dynamic support for future tabs and hierarchical backward compatibility

alter table public.user_permissions drop constraint if exists user_permissions_permission_key_check;
alter table public.user_permissions drop constraint if exists user_permissions_permission_key_format;
alter table public.user_permissions add constraint user_permissions_permission_key_format
  check (permission_key ~ '^[a-z_]+(\.[a-z_]+)+$' or permission_key = '*');

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_company_owner() or exists(
    select 1 from public.user_permissions up
    join public.profiles p on p.id=up.user_id and p.company_id=up.company_id
    where up.user_id=auth.uid() and p.is_active
      and (
        up.permission_key = p_key
        or up.permission_key = '*'
        or (
          -- If p_key is granular like 'goods.sale.view' (3 parts), grant if user has parent 'goods.view' (part1.part3)
          split_part(p_key, '.', 3) <> ''
          and up.permission_key = (split_part(p_key, '.', 1) || '.' || split_part(p_key, '.', 3))
        )
        or (
          -- If checking parent 'goods.view' (2 parts), grant if user has ANY subtab like 'goods.sale.view'
          split_part(p_key, '.', 3) = ''
          and up.permission_key like (split_part(p_key, '.', 1) || '.%.' || split_part(p_key, '.', 2))
        )
      )
  );
$$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'role', p.access_role,
    'permissions', case
      when p.access_role='owner' then '["*"]'::jsonb
      else coalesce((select jsonb_agg(up.permission_key order by up.permission_key) from public.user_permissions up where up.user_id=p.id),'[]'::jsonb)
    end
  )
  from public.profiles p where p.id=auth.uid() and p.is_active;
$$;

create or replace function public.set_user_permissions(p_user_id uuid, p_permission_keys text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_key text; v_company uuid:=public.current_company_id();
begin
  if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(p_permission_keys,'{}'::text[])) k where k !~ '^[a-z_]+(\.[a-z_]+)+$' and k <> '*') then
    raise exception 'invalid_permission_key' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and company_id=v_company and access_role='employee') then
    raise exception 'invalid_company_user' using errcode='22023';
  end if;
  delete from public.user_permissions where user_id=p_user_id and company_id=v_company;
  for v_key in select distinct unnest(coalesce(p_permission_keys,'{}'::text[])) loop
    insert into public.user_permissions(company_id,user_id,permission_key) values(v_company,p_user_id,v_key);
  end loop;
end; $$;

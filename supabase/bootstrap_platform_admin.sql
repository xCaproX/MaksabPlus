-- Run manually in Supabase SQL Editor after creating the Auth user in Authentication -> Users.
-- Platform Admin accounts MUST remain strictly separate from company profiles.
do $$
declare
  v_email text := 'admin@example.com';
  v_full_name text := 'مدير المنصة';
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(v_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for email: %', v_email;
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'User % already belongs to a tenant company profile and cannot be promoted to platform admin', v_email;
  end if;

  insert into public.platform_admins (user_id, full_name, is_active)
  values (v_user_id, v_full_name, true)
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        is_active = true;
end;
$$;

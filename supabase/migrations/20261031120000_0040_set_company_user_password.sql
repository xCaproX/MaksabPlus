create or replace function public.set_company_user_password(
  p_user_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if not public.is_company_owner() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_password is null or length(trim(p_password)) < 8 then
    raise exception 'password_too_short' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and company_id = v_company_id
      and access_role = 'employee'
  ) then
    raise exception 'invalid_company_user' using errcode = '22023';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_company_user_password(uuid, text) from public, anon;
grant execute on function public.set_company_user_password(uuid, text) to authenticated;

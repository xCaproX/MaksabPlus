-- =====================================================================
-- 0090_profiles_platform_admin_guard.sql
-- Symmetric identity separation guard on public.profiles:
-- ensures a platform admin can never be inserted or updated into public.profiles
-- even through direct SQL or internal helpers bypassing RPC checks.
-- =====================================================================

create or replace function public.guard_profile_not_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.platform_admins pa where pa.user_id = new.id) then
    raise exception 'platform_admin_cannot_belong_to_company' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_not_platform_admin() from public, anon, authenticated;

drop trigger if exists profiles_platform_admin_guard on public.profiles;
create trigger profiles_platform_admin_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_not_platform_admin();

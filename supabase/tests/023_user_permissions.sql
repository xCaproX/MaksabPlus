begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %',p_label,coalesce(p_detail,''); end if;
end; $$;
grant execute on function public.test_expect(boolean,text,text) to authenticated;

insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at)
values('23232323-2323-4323-8323-232323232301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','employee@test.local',now(),now(),now());
insert into public.companies(id,name) values('23232323-2323-4323-8323-2323232323a1','شركة الصلاحيات');
insert into public.profiles(id,company_id,full_name,access_role)
values('23232323-2323-4323-8323-232323232301','23232323-2323-4323-8323-2323232323a1','موظف','employee');
insert into public.user_permissions(company_id,user_id,permission_key)
values('23232323-2323-4323-8323-2323232323a1','23232323-2323-4323-8323-232323232301','goods.view');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"23232323-2323-4323-8323-232323232301"}',true);

do $$
declare v_denied boolean:=false; v_access jsonb;
begin
  v_access:=public.get_my_access();
  perform public.test_expect(v_access->>'role'='employee' and v_access->'permissions' ? 'goods.view',
    'employee receives only assigned permissions');
  perform public.test_expect(not public.has_permission('goods.delete'),
    'unassigned permissions are not granted');
  begin
    perform public.delete_invoice('23232323-2323-4323-8323-232323232399');
  exception when insufficient_privilege then v_denied:=true;
  end;
  perform public.test_expect(v_denied,'view-only employee cannot call invoice deletion RPC');
  v_denied:=false;
  begin
    perform public.set_user_permissions('23232323-2323-4323-8323-232323232301',array['goods.delete']);
  exception when insufficient_privilege then v_denied:=true;
  end;
  perform public.test_expect(v_denied,'employee cannot grant or change permissions');
end; $$;

rollback;

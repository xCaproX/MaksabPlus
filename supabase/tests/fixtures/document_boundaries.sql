begin;

create function public.test_boundary_expect(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED: %', p_label; end if;
end $$;
create function public.test_boundary_denied(p_sql text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  end;
  raise exception 'Expected permission denial: %', p_sql;
end $$;
grant execute on function public.test_boundary_expect(boolean,text),
  public.test_boundary_denied(text) to authenticated, anon;

insert into auth.users(id,email) values
 ('55555555-5555-4555-8555-000000000001','boundary-owner-a@test.local'),
 ('55555555-5555-4555-8555-000000000002','boundary-employee-a@test.local'),
 ('55555555-5555-4555-8555-000000000003','boundary-owner-b@test.local');
insert into public.companies(id,name) values
 ('55555555-5555-4555-8555-0000000000a1','Boundary A'),
 ('55555555-5555-4555-8555-0000000000b1','Boundary B');
insert into public.profiles(id,company_id,access_role) values
 ('55555555-5555-4555-8555-000000000001','55555555-5555-4555-8555-0000000000a1','owner'),
 ('55555555-5555-4555-8555-000000000002','55555555-5555-4555-8555-0000000000a1','employee'),
 ('55555555-5555-4555-8555-000000000003','55555555-5555-4555-8555-0000000000b1','owner');
insert into public.warehouses(id,company_id,name) values
 ('55555555-5555-4555-8555-000000000010','55555555-5555-4555-8555-0000000000a1','Warehouse A'),
 ('55555555-5555-4555-8555-000000000011','55555555-5555-4555-8555-0000000000a1','Warehouse A2');
insert into public.cash_boxes(id,company_id,name) values
 ('55555555-5555-4555-8555-000000000020','55555555-5555-4555-8555-0000000000a1','Cash A'),
 ('55555555-5555-4555-8555-000000000021','55555555-5555-4555-8555-0000000000a1','Cash A2');
insert into public.accounts(id,company_id,name,kind) values
 ('55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-0000000000a1','Customer A','customer');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-000000000001',true);
select set_config('test.boundary.item', public.create_item_with_opening_stock(
 'Boundary item','piece',200,120,true,'55555555-5555-4555-8555-000000000010',20,120)::text,true);
select set_config('test.boundary.purchase', public.create_invoice('purchase',
 '55555555-5555-4555-8555-000000000030','55555555-5555-4555-8555-000000000010',
 current_date,0,null,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.boundary.item'),
 'qty',1,'unit_price',120)))::text,true);

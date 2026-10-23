begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('19191919-1919-4919-8919-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'item-codes@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values
  ('19191919-1919-4919-8919-0000000000a1', 'شركة اختبار الأكواد'),
  ('19191919-1919-4919-8919-0000000000a2', 'شركة اختبار أخرى');
insert into public.profiles (id, company_id)
values ('19191919-1919-4919-8919-000000000001', '19191919-1919-4919-8919-0000000000a1');

insert into public.items (company_id, name)
values ('19191919-1919-4919-8919-0000000000a2', 'صنف شركة أخرى');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"19191919-1919-4919-8919-000000000001"}', true);

do $$
declare
  v_item_id uuid;
  v_second_item_id uuid;
  v_failed boolean := false;
begin
  v_item_id := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف بكود افتراضي', 'قطعة', 0, 0, true, null, 0, 0, null, null
  );
  perform public.test_expect(
    (select code = 'ITM-' || lpad(serial_number::text, 5, '0') from public.items where id = v_item_id),
    'blank code defaults to the generated item number'
  );

  v_second_item_id := public.create_item_with_opening_stock_and_notes_and_code(
    'صنف بكود مخصص', 'قطعة', 0, 0, true, null, 0, 0, null, ' SKU-ABC '
  );
  perform public.test_expect((select code = 'SKU-ABC' from public.items where id = v_second_item_id), 'custom code is trimmed and saved');
  update public.items set code = 'SKU-EDITED' where id = v_second_item_id;
  perform public.test_expect((select code = 'SKU-EDITED' from public.items where id = v_second_item_id), 'item code can be edited');

  begin
    update public.items set code = 'sku-edited' where id = v_item_id;
  exception when unique_violation then
    v_failed := true;
  end;
  perform public.test_expect(v_failed, 'item codes are unique without case sensitivity within a company');
  perform public.test_expect(
    (select count(*) = 1 from public.v_item_stock where id = v_second_item_id and lower(code) = 'sku-edited'),
    'item stock view exposes item code for searching'
  );
  perform public.test_expect(
    (select count(*) = 0 from public.items where company_id = '19191919-1919-4919-8919-0000000000a2'),
    'company A cannot read company B items'
  );
end;
$$;

rollback;

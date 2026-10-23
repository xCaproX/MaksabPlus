begin;

create or replace function public.test_expect(p_ok boolean, p_label text, p_detail text default null)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED [%] %', p_label, coalesce(p_detail, ''); end if;
end;
$$;
grant execute on function public.test_expect(boolean, text, text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('14141414-1414-4414-8414-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fixed-receipt@test.local', now(), now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name) values ('14141414-1414-4414-8414-0000000000a1', 'شركة اختبار الحسابات الثابتة');
insert into public.profiles (id, company_id)
values ('14141414-1414-4414-8414-000000000001', '14141414-1414-4414-8414-0000000000a1');
insert into public.accounts (id, company_id, name, kind) values
  ('14141414-1414-4414-8414-0000000000b1', '14141414-1414-4414-8414-0000000000a1', 'عميل اختبار', 'customer'),
  ('14141414-1414-4414-8414-0000000000b2', '14141414-1414-4414-8414-0000000000a1', 'مورد اختبار', 'supplier');
insert into public.cash_boxes (id, company_id, name)
values ('14141414-1414-4414-8414-0000000000c1', '14141414-1414-4414-8414-0000000000a1', 'خزنة اختبار');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"14141414-1414-4414-8414-000000000001"}', true);

do $$
declare
  v_cash_customer uuid;
  v_cash_supplier uuid;
  v_receipt uuid;
  v_failed boolean;
begin
  select id into v_cash_customer from public.accounts where system_key = 'cash_customer';
  select id into v_cash_supplier from public.accounts where system_key = 'cash_supplier';
  perform public.test_expect(v_cash_customer is not null and v_cash_supplier is not null, 'fixed cash accounts exist');

  v_failed := false;
  begin
    perform public.create_free_receipt(v_cash_customer, '14141414-1414-4414-8414-0000000000c1', current_date, 10, null, null, 'in');
  exception when others then v_failed := sqlerrm = 'invalid_free_receipt_account';
  end;
  perform public.test_expect(v_failed, 'cash customer cannot be used in free receipt');

  v_failed := false;
  begin
    perform public.create_free_receipt(v_cash_supplier, '14141414-1414-4414-8414-0000000000c1', current_date, 10, null, null, 'out');
  exception when others then v_failed := sqlerrm = 'invalid_free_receipt_account';
  end;
  perform public.test_expect(v_failed, 'cash supplier cannot be used in free payment');

  v_receipt := public.create_free_receipt('14141414-1414-4414-8414-0000000000b1',
    '14141414-1414-4414-8414-0000000000c1', current_date, 10, null, 'إيصال اختبار', 'in');
  v_failed := false;
  begin
    perform public.update_free_receipt(v_receipt, v_cash_customer,
      '14141414-1414-4414-8414-0000000000c1', current_date, 10, null, 'إيصال اختبار');
  exception when others then v_failed := sqlerrm = 'invalid_free_receipt_account';
  end;
  perform public.test_expect(v_failed, 'editing a free receipt cannot assign a fixed cash account');
end;
$$;

rollback;

begin;

-- اختبار دوال إنشاء وتعديل المخازن والخزن وتأكيد عزل الشركات (Multi-Tenancy)
do $$
declare
  v_company_a uuid := '31313131-3131-4131-8131-3131313131a1';
  v_company_b uuid := '31313131-3131-4131-8131-3131313131b1';
  v_user_a uuid := '31313131-3131-4131-8131-313131313101';
  v_user_b uuid := '31313131-3131-4131-8131-313131313102';
  v_wh_a uuid;
  v_wh_b uuid;
  v_cb_a uuid;
  v_cb_b uuid;
  v_state boolean;
  v_err text;
begin
  -- إعداد الشركتين والمستخدمين
  insert into auth.users (id, email) values (v_user_a, 'user_a@test.com'), (v_user_b, 'user_b@test.com');
  insert into public.companies (id, name) values (v_company_a, 'شركة أ'), (v_company_b, 'شركة ب');
  insert into public.profiles (id, company_id, full_name) values
    (v_user_a, v_company_a, 'مدير أ'),
    (v_user_b, v_company_b, 'مدير ب');

  -- تجربة بصلاحيات مستخدم شركة أ
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);

  -- 1. إنشاء مخزن للشركة أ عبر RPC دون تمرير company_id
  v_wh_a := public.create_warehouse('مخزن فرعي أ', 'ملاحظات مخزن أ');
  if not exists (select 1 from public.warehouses where id = v_wh_a and company_id = v_company_a and name = 'مخزن فرعي أ') then
    raise exception 'failed to create warehouse for company a';
  end if;

  -- 2. تعديل المخزن
  perform public.update_warehouse(v_wh_a, 'مخزن رئيسي أ المعدل', 'ملاحظات معدلة');
  if not exists (select 1 from public.warehouses where id = v_wh_a and name = 'مخزن رئيسي أ المعدل') then
    raise exception 'failed to update warehouse';
  end if;

  -- 3. تفعيل وإيقاف المخزن
  v_state := public.toggle_warehouse_active(v_wh_a);
  if v_state is not false then
    raise exception 'expected warehouse to become inactive';
  end if;

  -- 4. تجربة بصلاحيات مستخدم شركة ب
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b)::text, true);

  -- 5. إنشاء مخزن وخزنة للشركة ب
  v_wh_b := public.create_warehouse('مخزن ب', null);
  v_cb_b := public.create_cash_box_with_opening_balance_and_notes('خزنة ب', 1000, null);

  -- 6. فحص العزل: مستخدم ب لا يستطيع تعديل أو إيقاف مخزن أ
  begin
    perform public.update_warehouse(v_wh_a, 'محاولة اختراق', null);
    raise exception 'cross tenant update succeeded unexpectedly';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'warehouse_not_found' then
      raise exception 'unexpected error on cross tenant warehouse update: %', v_err;
    end if;
  end;

  begin
    perform public.toggle_warehouse_active(v_wh_a);
    raise exception 'cross tenant toggle succeeded unexpectedly';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'warehouse_not_found' then
      raise exception 'unexpected error on cross tenant warehouse toggle: %', v_err;
    end if;
  end;

  -- 7. تعديل وتفعيل خزنة ب
  perform public.update_cash_box(v_cb_b, 'خزنة ب المعدلة', 'ملاحظات خزنة ب');
  if not exists (select 1 from public.cash_boxes where id = v_cb_b and name = 'خزنة ب المعدلة') then
    raise exception 'failed to update cash box';
  end if;

  v_state := public.toggle_cash_box_active(v_cb_b);
  if v_state is not false then
    raise exception 'expected cash box to become inactive';
  end if;

  -- 8. فحص العزل على الخزنة: مستخدم أ لا يستطيع تعديل خزنة ب
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  begin
    perform public.update_cash_box(v_cb_b, 'اختراق خزنة', null);
    raise exception 'cross tenant cash box update succeeded unexpectedly';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'cash_box_not_found' then
      raise exception 'unexpected error on cross tenant cash box update: %', v_err;
    end if;
  end;
end;
$$;

rollback;

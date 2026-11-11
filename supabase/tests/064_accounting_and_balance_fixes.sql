-- =====================================================================
-- 064_accounting_and_balance_fixes.sql
-- اختبارات شاملة لإصلاحات المحاسبة والأرصدة في المرحلة 2 + اختبارات عزل الشركات ودور anon
-- =====================================================================

begin;

insert into public.companies (id, name) values
  ('c0000000-0000-0000-0000-000000000064', 'شركة المحاسبة أ'),
  ('c0000000-0000-0000-0000-000000000065', 'شركة المحاسبة ب');

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000641', 'owner64a@test.com'),
  ('e0000000-0000-0000-0000-000000000642', 'owner64b@test.com');

insert into public.profiles (id, company_id, access_role, full_name, is_active) values
  ('e0000000-0000-0000-0000-000000000641', 'c0000000-0000-0000-0000-000000000064', 'owner', 'مالك أ', true),
  ('e0000000-0000-0000-0000-000000000642', 'c0000000-0000-0000-0000-000000000065', 'owner', 'مالك ب', true);

insert into public.warehouses (id, company_id, name, is_primary, is_active) values
  ('d0000000-0000-0000-0000-000000000641', 'c0000000-0000-0000-0000-000000000064', 'مخزن أ1', true, true),
  ('d0000000-0000-0000-0000-000000000642', 'c0000000-0000-0000-0000-000000000064', 'مخزن أ2', false, true),
  ('d0000000-0000-0000-0000-000000000651', 'c0000000-0000-0000-0000-000000000065', 'مخزن ب1', true, true);

insert into public.cash_boxes (id, company_id, name, is_primary, is_active, opening_balance, current_balance) values
  ('b0000000-0000-0000-0000-000000000641', 'c0000000-0000-0000-0000-000000000064', 'خزنة أ1', true, true, 2000, 2000),
  ('b0000000-0000-0000-0000-000000000642', 'c0000000-0000-0000-0000-000000000064', 'خزنة أ2', false, true, 1000, 1000),
  ('b0000000-0000-0000-0000-000000000643', 'c0000000-0000-0000-0000-000000000064', 'خزنة مبيعات أ3', false, true, 0, 0),
  ('b0000000-0000-0000-0000-000000000651', 'c0000000-0000-0000-0000-000000000065', 'خزنة ب1', true, true, 1000, 1000);

insert into public.accounts (id, company_id, name, kind, is_active) values
  ('a0000000-0000-0000-0000-000000000641', 'c0000000-0000-0000-0000-000000000064', 'مورد أ1', 'supplier', true),
  ('a0000000-0000-0000-0000-000000000642', 'c0000000-0000-0000-0000-000000000064', 'مورد أ2', 'supplier', true),
  ('a0000000-0000-0000-0000-000000000643', 'c0000000-0000-0000-0000-000000000064', 'عميل أ1', 'customer', true),
  ('a0000000-0000-0000-0000-000000000651', 'c0000000-0000-0000-0000-000000000065', 'عميل ب1', 'customer', true);

insert into public.items (id, company_id, name, unit, sale_price, purchase_price, is_active) values
  ('f0000000-0000-0000-0000-000000000641', 'c0000000-0000-0000-0000-000000000064', 'صنف 1', 'قطعة', 150, 100, true),
  ('f0000000-0000-0000-0000-000000000642', 'c0000000-0000-0000-0000-000000000064', 'صنف 2', 'قطعة', 120, 50, true),
  ('f0000000-0000-0000-0000-000000000643', 'c0000000-0000-0000-0000-000000000064', 'صنف 3', 'قطعة', 90, 40, true),
  ('f0000000-0000-0000-0000-000000000644', 'c0000000-0000-0000-0000-000000000064', 'صنف تحويل', 'قطعة', 80, 30, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000641', true);

-- ---------------------------------------------------------------------
-- 1. تعديل فاتورة شراء لها مبيعات لاحقة مع تغيير المورد والخزنة والتاريخ دون تغيير المدفوع
-- ---------------------------------------------------------------------
do $$
declare
  v_pur_id uuid;
  v_supp1_bal numeric(18,4);
  v_supp2_bal numeric(18,4);
  v_box1_bal numeric(18,4);
  v_box2_bal numeric(18,4);
begin
  v_pur_id := public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000641',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-01'::date,
    400,
    'شراء 10 قطع',
    '[{"item_id":"f0000000-0000-0000-0000-000000000641","qty":10,"unit_price":100}]'::jsonb,
    'b0000000-0000-0000-0000-000000000641'
  );

  -- بيع قطعة واحدة لاحقاً
  perform public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000643',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-02'::date,
    0,
    'بيع 1 قطعة',
    '[{"item_id":"f0000000-0000-0000-0000-000000000641","qty":1,"unit_price":150}]'::jsonb,
    'b0000000-0000-0000-0000-000000000641'
  );

  -- تعديل فاتورة الشراء لتصبح باسم المورد الثاني ومن الخزنة الثانية مع بقاء المسدد 400
  perform public.update_invoice(
    v_pur_id,
    'a0000000-0000-0000-0000-000000000642',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-01'::date,
    400,
    'نقل للمورد الثاني والخزنة الثانية',
    '[{"item_id":"f0000000-0000-0000-0000-000000000641","qty":10,"unit_price":100}]'::jsonb,
    'b0000000-0000-0000-0000-000000000642'
  );

  select balance into v_supp1_bal from public.v_account_balances where id = 'a0000000-0000-0000-0000-000000000641';
  select balance into v_supp2_bal from public.v_account_balances where id = 'a0000000-0000-0000-0000-000000000642';
  select balance into v_box1_bal from public.v_cash_box_balances where id = 'b0000000-0000-0000-0000-000000000641';
  select balance into v_box2_bal from public.v_cash_box_balances where id = 'b0000000-0000-0000-0000-000000000642';

  assert v_supp1_bal = 0, format('Expected supplier 1 balance 0, got %s', v_supp1_bal);
  assert v_supp2_bal = 600, format('Expected supplier 2 balance 600, got %s', v_supp2_bal);
  assert v_box1_bal = 2000, format('Expected box 1 balance 2000, got %s', v_box1_bal);
  assert v_box2_bal = 600, format('Expected box 2 balance 600, got %s', v_box2_bal);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. كشف حركة الصنف بعد تعديل الرصيد الافتتاحي وتحديث التكلفة الافتتاحية
-- ---------------------------------------------------------------------
do $$
declare
  v_stmt_final numeric(18,4);
  v_stock_qty numeric(18,4);
  v_avg_cost numeric(18,4);
begin
  -- رصيد افتتاحي لصنف 3 بدون حركات = 10 بتكلفة 40، ثم تعديل التكلفة إلى 55 فقط
  perform public.save_opening_balances(
    '[]'::jsonb,
    '[{"warehouse_id":"d0000000-0000-0000-0000-000000000641","item_id":"f0000000-0000-0000-0000-000000000643","opening_qty":10,"unit_cost":40}]'::jsonb
  );
  perform public.save_opening_balances(
    '[]'::jsonb,
    '[{"warehouse_id":"d0000000-0000-0000-0000-000000000641","item_id":"f0000000-0000-0000-0000-000000000643","opening_qty":10,"unit_cost":55}]'::jsonb
  );
  v_avg_cost := public.read_protected_cost('stock', 'f0000000-0000-0000-0000-000000000643', 'd0000000-0000-0000-0000-000000000641');
  assert v_avg_cost = 55, format('Expected avg_cost 55 after opening cost edit, got %s', v_avg_cost);

  -- بيع 2 من صنف 3 (يتبقى 8)
  perform public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000643',
    'd0000000-0000-0000-0000-000000000641',
    public.cairo_today(),
    0,
    'بيع 2',
    '[{"item_id":"f0000000-0000-0000-0000-000000000643","qty":2,"unit_price":90}]'::jsonb,
    'b0000000-0000-0000-0000-000000000641'
  );

  -- تعديل الرصيد الافتتاحي لصنف 3 من 10 إلى 15 (+5) -> الرصيد الفعلي 13
  perform public.save_opening_balances(
    '[]'::jsonb,
    '[{"warehouse_id":"d0000000-0000-0000-0000-000000000641","item_id":"f0000000-0000-0000-0000-000000000643","opening_qty":15,"unit_cost":55}]'::jsonb
  );

  select qty into v_stock_qty from public.item_stock
  where warehouse_id = 'd0000000-0000-0000-0000-000000000641' and item_id = 'f0000000-0000-0000-0000-000000000643';

  select s.running_balance into v_stmt_final
  from public.get_item_movement_statement(
    'f0000000-0000-0000-0000-000000000643',
    'd0000000-0000-0000-0000-000000000641',
    public.cairo_today() - 5,
    public.cairo_today() + 5
  ) with ordinality as s
  order by s.ordinality desc
  limit 1;

  assert v_stock_qty = 13, format('Expected stock 13, got %s', v_stock_qty);
  assert v_stmt_final = 13, format('Expected statement final balance 13, got %s', v_stmt_final);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. استعادة فاتورة محذوفة تعيد احتساب cost_total و profit_total، وحماية purchase_return
-- ---------------------------------------------------------------------
do $$
declare
  v_pur_id uuid;
  v_sale_id uuid;
  v_cost_total numeric(18,4);
  v_profit_total numeric(18,4);
  v_err boolean := false;
begin
  v_pur_id := public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000641',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-05'::date,
    0,
    'شراء صنف 2 بتكلفة 50',
    '[{"item_id":"f0000000-0000-0000-0000-000000000642","qty":10,"unit_price":50}]'::jsonb
  );

  v_sale_id := public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000643',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-06'::date,
    0,
    'بيع 2 بسعر 100',
    '[{"item_id":"f0000000-0000-0000-0000-000000000642","qty":2,"unit_price":100}]'::jsonb
  );

  -- حذف فاتورة البيع، ثم شراء 10 قطع بتكلفة 150 (يصبح متوسط التكلفة 100)، ثم استعادة فاتورة البيع
  perform public.delete_invoice(v_sale_id);
  perform public.create_invoice(
    'purchase',
    'a0000000-0000-0000-0000-000000000641',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-07'::date,
    0,
    'شراء 10 بتكلفة 150',
    '[{"item_id":"f0000000-0000-0000-0000-000000000642","qty":10,"unit_price":150}]'::jsonb
  );
  perform public.restore_invoice(v_sale_id);

  select cost_total, profit_total into v_cost_total, v_profit_total
  from public.v_invoice_list where id = v_sale_id;

  assert v_cost_total = 200, format('Expected restored sale cost_total 200, got %s', v_cost_total);
  assert v_profit_total = 0, format('Expected restored sale profit_total 0, got %s', v_profit_total);

  -- تسجيل مرتجع مشتريات لاحق على فاتورة الشراء، والتأكد من منع حذف فاتورة الشراء الأصلية
  perform public.create_invoice(
    'purchase_return',
    'a0000000-0000-0000-0000-000000000641',
    'd0000000-0000-0000-0000-000000000641',
    '2026-10-08'::date,
    0,
    'مرتجع مشتريات',
    '[{"item_id":"f0000000-0000-0000-0000-000000000642","qty":1,"unit_price":50}]'::jsonb
  );

  begin
    perform public.delete_invoice(v_pur_id);
  exception when others then
    if sqlerrm = 'cannot_delete_purchase_with_subsequent_sales' then v_err := true; end if;
  end;
  assert v_err, 'Expected delete_invoice to fail when subsequent purchase_return exists';
end;
$$;

-- ---------------------------------------------------------------------
-- 4. منع كسر رصيد الخزنة للسالب عند حذف/تعديل فاتورة مبيعات أو تحويل خزنة، وفحص delete_item مع التحويلات
-- ---------------------------------------------------------------------
do $$
declare
  v_sale_id uuid;
  v_trf_id uuid;
  v_wh_trf_id uuid;
  v_deleted boolean;
  v_err boolean;
begin
  -- أ) فاتورة مبيعات مسددة في خزنة مبيعات أ3 (رصيدها يصبح 300)
  v_sale_id := public.create_invoice(
    'sale',
    'a0000000-0000-0000-0000-000000000643',
    'd0000000-0000-0000-0000-000000000641',
    public.cairo_today(),
    300,
    'بيع نقدي 300',
    '[{"item_id":"f0000000-0000-0000-0000-000000000641","qty":2,"unit_price":150}]'::jsonb,
    'b0000000-0000-0000-0000-000000000643'
  );

  -- تحويل 250 من خزنة أ3 إلى خزنة أ1 (يتبقى في خزنة أ3 رصيد 50 فقط)
  v_trf_id := public.create_cash_box_transfer(
    'b0000000-0000-0000-0000-000000000643',
    'b0000000-0000-0000-0000-000000000641',
    public.cairo_today(),
    250,
    'توريد للرئيسية'
  );

  -- محاولة حذف فاتورة المبيعات (التي ستسحب 300 من خزنة أ3 التي بها 50 فقط) -> يجب أن تفشل
  v_err := false;
  begin
    perform public.delete_invoice(v_sale_id);
  exception when others then
    if sqlerrm = 'insufficient_cash_box_balance' then v_err := true; end if;
  end;
  assert v_err, 'Expected delete_invoice to block negative cash box balance';

  -- محاولة تعديل الفاتورة لتقليل المدفوع إلى 0 -> يجب أن تفشل
  v_err := false;
  begin
    perform public.update_invoice(
      v_sale_id,
      'a0000000-0000-0000-0000-000000000643',
      'd0000000-0000-0000-0000-000000000641',
      public.cairo_today(),
      0,
      'محاولة تصفير المدفوع',
      '[{"item_id":"f0000000-0000-0000-0000-000000000641","qty":2,"unit_price":150}]'::jsonb,
      'b0000000-0000-0000-0000-000000000643'
    );
  exception when others then
    if sqlerrm = 'insufficient_cash_box_balance' then v_err := true; end if;
  end;
  assert v_err, 'Expected update_invoice to block negative cash box balance when reducing paid';

  -- ب) تحويل مخزني لصنف 4 ثم تصفير مخزونه ومحاولة حذفه عبر delete_item -> يجب أن يعطله (return false) ولا ينهار
  perform public.save_opening_balances(
    '[]'::jsonb,
    '[{"warehouse_id":"d0000000-0000-0000-0000-000000000641","item_id":"f0000000-0000-0000-0000-000000000644","opening_qty":5,"unit_cost":30}]'::jsonb
  );
  v_wh_trf_id := public.create_warehouse_transfer(
    'd0000000-0000-0000-0000-000000000641',
    'd0000000-0000-0000-0000-000000000642',
    public.cairo_today(),
    'تحويل صنف 4',
    '[{"item_id":"f0000000-0000-0000-0000-000000000644","qty":2}]'::jsonb
  );
  perform public.delete_warehouse_transfer(v_wh_trf_id);
  perform public.save_opening_balances(
    '[]'::jsonb,
    '[{"warehouse_id":"d0000000-0000-0000-0000-000000000641","item_id":"f0000000-0000-0000-0000-000000000644","opening_qty":0,"unit_cost":30}]'::jsonb
  );

  v_deleted := public.delete_item('f0000000-0000-0000-0000-000000000644');
  assert v_deleted = false, 'Expected delete_item to return false (soft-deactivate) when transfer history exists';
  assert (select is_active = false from public.items where id = 'f0000000-0000-0000-0000-000000000644'), 'Item should be deactivated';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. اختبارات الأمان وعزل الشركات (Company B و anon لا يستطيعون قراءة أو تعديل بيانات Company A)
-- ---------------------------------------------------------------------
do $$
declare
  v_err boolean;
begin
  -- التبديل إلى مستخدم الشركة ب
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000642', true);

  -- 1) الشركة ب لا تستطيع قراءة كشف حركة صنف الشركة أ
  v_err := false;
  begin
    perform * from public.get_item_movement_statement(
      'f0000000-0000-0000-0000-000000000641',
      'd0000000-0000-0000-0000-000000000641',
      '2026-01-01'::date,
      '2026-12-31'::date
    );
  exception when others then
    if sqlerrm = 'invalid_item_statement_target' then v_err := true; end if;
  end;
  assert v_err, 'Company B must not read Company A item statement';

  -- 2) الشركة ب لا تستطيع حذف صنف من الشركة أ
  v_err := false;
  begin
    perform public.delete_item('f0000000-0000-0000-0000-000000000641');
  exception when others then
    if sqlerrm = 'item_not_found' then v_err := true; end if;
  end;
  assert v_err, 'Company B must not delete Company A item';
end;
$$;

-- 3) دور anon لا يستطيع استدعاء أي من الدوال المعدلة
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_err boolean;
begin
  v_err := false;
  begin
    perform public.delete_item('f0000000-0000-0000-0000-000000000641');
  exception when insufficient_privilege then
    v_err := true;
  end;
  assert v_err, 'anon must not execute delete_item';

  v_err := false;
  begin
    perform * from public.get_item_movement_statement(
      'f0000000-0000-0000-0000-000000000641',
      'd0000000-0000-0000-0000-000000000641',
      '2026-01-01'::date,
      '2026-12-31'::date
    );
  exception when insufficient_privilege then
    v_err := true;
  end;
  assert v_err, 'anon must not execute get_item_movement_statement';
end;
$$;

rollback;

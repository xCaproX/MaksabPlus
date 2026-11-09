import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import assert from 'node:assert/strict';

function getConnectionString() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve('.env.local');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    const match = env.match(/^SUPABASE_DB_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  throw new Error('SUPABASE_DB_URL or DATABASE_URL environment variable is required to run concurrency tests.');
}

async function createAuthenticatedClient(connStr, userId) {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  await client.query('SET statement_timeout = 10000');
  await client.query('SET ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', false)`);
  return client;
}

async function runConcurrencySuite() {
  console.log('================================================================================');
  console.log('🚀 بدء اختبارات التزامن الحقيقي متعددة الاتصالات (Real Multi-Client Concurrency Suite)');
  console.log('================================================================================\n');

  const connStr = getConnectionString();
  const superClient = new Client({ connectionString: connStr });
  await superClient.connect();

  const companyId = '99999999-9999-4999-8999-0000000000c0';
  const userId = '99999999-9999-4999-8999-000000000001';
  const warehouseId = '99999999-9999-4999-8999-0000000000d1';
  const cashBoxId = '99999999-9999-4999-8999-0000000000b1';
  const cashBoxSmallId = '99999999-9999-4999-8999-0000000000b2';
  const customerId = '99999999-9999-4999-8999-0000000000a1';
  const itemA = '99999999-9999-4999-8999-0000000000e1';
  const itemB = '99999999-9999-4999-8999-0000000000e2';

  let client1 = null;
  let client2 = null;

  try {
    // 0. تهيئة بيئة الاختبار المعزولة
    console.log('1. تهيئة بيانات الاختبار المعزولة للشركة...');
    await superClient.query('ALTER TABLE public.accounts DISABLE TRIGGER accounts_guard_system');
    await superClient.query(`DELETE FROM public.companies WHERE id = '${companyId}'`);
    await superClient.query(`DELETE FROM auth.users WHERE id = '${userId}'`);
    await superClient.query('ALTER TABLE public.accounts ENABLE TRIGGER accounts_guard_system');

    await superClient.query('BEGIN');

    await superClient.query(`
      INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      VALUES ('${userId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-test@maksab.local', now(), now())
      ON CONFLICT (id) DO NOTHING
    `);
    await superClient.query(`
      INSERT INTO public.companies (id, name) VALUES ('${companyId}', 'شركة اختبار التزامن')
    `);
    await superClient.query(`
      INSERT INTO public.profiles (id, company_id, full_name, access_role)
      VALUES ('${userId}', '${companyId}', 'مدير التزامن', 'owner')
      ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, access_role = 'owner'
    `);
    await superClient.query(`
      INSERT INTO public.warehouses (id, company_id, name) VALUES ('${warehouseId}', '${companyId}', 'مخزن التزامن')
    `);
    await superClient.query(`
      INSERT INTO public.cash_boxes (id, company_id, name, opening_balance)
      VALUES ('${cashBoxId}', '${companyId}', 'خزنة التزامن الرئيسية', 1000),
             ('${cashBoxSmallId}', '${companyId}', 'خزنة التزامن المحدودة', 500)
    `);
    await superClient.query(`
      INSERT INTO public.accounts (id, company_id, name, kind)
      VALUES ('${customerId}', '${companyId}', 'عميل التزامن', 'customer')
    `);
    await superClient.query(`
      INSERT INTO public.items (id, company_id, name, sale_price, purchase_price)
      VALUES ('${itemA}', '${companyId}', 'صنف تزامن أ', 50, 30),
             ('${itemB}', '${companyId}', 'صنف تزامن ب', 80, 40)
    `);
    await superClient.query(`
      INSERT INTO public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost)
      VALUES ('${companyId}', '${warehouseId}', '${itemA}', 100, 30),
             ('${companyId}', '${warehouseId}', '${itemB}', 100, 40)
    `);
    await superClient.query('COMMIT');
    console.log('   ✅ تم تجهيز الشركة والمخزن والخزنة والأصناف برصيد 100 وحدة بنجاح.\n');

    // إنشاء اتصالين متزامنين مستقلين للمستخدم
    client1 = await createAuthenticatedClient(connStr, userId);
    client2 = await createAuthenticatedClient(connStr, userId);

    // =========================================================================
    // السيناريو 1: فاتورتا بيع متزامنتان على نفس الصنف
    // =========================================================================
    console.log('2. تشغيل السيناريو 1: فاتورتا بيع متزامنتان على نفس الصنف (itemA)...');
    const sale1 = client1.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 200, 'بيع 10',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 10, 'unit_price', 50))
      )
    `);
    const sale2 = client2.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 300, 'بيع 15',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 15, 'unit_price', 50))
      )
    `);

    await Promise.all([sale1, sale2]);

    const { rows: [stock1] } = await superClient.query(`
      SELECT qty FROM public.item_stock WHERE warehouse_id = '${warehouseId}' AND item_id = '${itemA}'
    `);
    const { rows: [cash1] } = await superClient.query(`
      SELECT balance FROM public.v_cash_box_balances WHERE id = '${cashBoxId}'
    `);
    assert.equal(Number(stock1.qty), 75, 'المخزون بعد بيع 10 و15 يجب أن يكون 75 تماماً (100 - 25)');
    assert.equal(Number(cash1.balance), 1500, 'رصيد الخزنة يجب أن يصبح 1500 (1000 + 200 + 300)');
    console.log('   ✅ نجح السيناريو 1: كلا الفاتورتين تم تنفيذهما بدقة والمخزون المتبقي 75 دون خصم مفقود أو مكرر.\n');

    // =========================================================================
    // السيناريو 2: بيع ومرتجع مبيعات متزامنان على نفس الصنف
    // =========================================================================
    console.log('3. تشغيل السيناريو 2: بيع ومرتجع مبيعات متزامنان على نفس الصنف...');
    const saleAction = client1.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 250, 'بيع 5',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 5, 'unit_price', 50))
      )
    `);
    const returnAction = client2.query(`
      SELECT public.create_invoice(
        'sale_return', '${customerId}', '${warehouseId}', public.cairo_today(), 100, 'مرتجع 2',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 2, 'unit_price', 50))
      )
    `);

    await Promise.all([saleAction, returnAction]);

    const { rows: [stock2] } = await superClient.query(`
      SELECT qty FROM public.item_stock WHERE warehouse_id = '${warehouseId}' AND item_id = '${itemA}'
    `);
    const { rows: [cash2] } = await superClient.query(`
      SELECT balance FROM public.v_cash_box_balances WHERE id = '${cashBoxId}'
    `);
    assert.equal(Number(stock2.qty), 72, 'المخزون بعد بيع 5 ومرتجع 2 يجب أن يكون 72 (75 - 5 + 2)');
    assert.equal(Number(cash2.balance), 1650, 'رصيد الخزنة يجب أن يصبح 1650 (1500 + 250 - 100)');
    console.log('   ✅ نجح السيناريو 2: تم تنفيذ البيع والمرتجع المتزامنين والمخزون الفعلي 72 والخزينة 1650.\n');

    // =========================================================================
    // السيناريو 3: تعديل فاتورة بيع أثناء إنشاء فاتورة أخرى على نفس الصنف والمخزن
    // =========================================================================
    console.log('4. تشغيل السيناريو 3: تعديل فاتورة أثناء إنشاء فاتورة بيع أخرى متزامنة...');
    // إنشاء فاتورة أساسية لتعديلها
    const { rows: [{ create_invoice: invId }] } = await client1.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 0, 'فاتورة للتعديل',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 4, 'unit_price', 50))
      )
    `);
    // المخزون أصبح 72 - 4 = 68

    // العميل 1 يعدل الفاتورة لتصبح 10 قطع (فرق -6)
    const updateAction = client1.query(`
      SELECT public.update_invoice(
        '${invId}'::uuid, '${customerId}', '${warehouseId}', public.cairo_today(), 0, 'تعديل إلى 10',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 10, 'unit_price', 50))
      )
    `);
    // العميل 2 ينشئ فاتورة جديدة لـ 8 قطع (فرق -8)
    const createNewAction = client2.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 0, 'فاتورة متزامنة جديدة 8',
        jsonb_build_array(jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 8, 'unit_price', 50))
      )
    `);

    await Promise.all([updateAction, createNewAction]);

    const { rows: [stock3] } = await superClient.query(`
      SELECT qty FROM public.item_stock WHERE warehouse_id = '${warehouseId}' AND item_id = '${itemA}'
    `);
    assert.equal(Number(stock3.qty), 54, 'المخزون بعد التعديل والإنشاء المتزامنين يجب أن يكون 54 (68 - 6 - 8)');
    console.log('   ✅ نجح السيناريو 3: تم التعديل والإنشاء المتزامنان بسلاسة دون تعارض والمخزون 54.\n');

    // =========================================================================
    // السيناريو 4: عمليتا صرف متزامنتان تتنافسان على رصيد الخزنة المحدود (منع السحب على المكشوف)
    // =========================================================================
    console.log('5. تشغيل السيناريو 4: عمليتا صرف متزامنتان تتنافسان على رصيد الخزنة المحدود (500)...');
    // الخزنة cashBoxSmallId بها 500 فقط. العميلان يحاول كل منهما سحب 300 في نفس الوقت (المجموع 600 > 500).
    const withdraw1 = client1.query(`
      SELECT public.create_free_receipt('${customerId}', '${cashBoxSmallId}', public.cairo_today(), 300, 'سحب تزامن 1', 'سند 1', 'out')
    `);
    const withdraw2 = client2.query(`
      SELECT public.create_free_receipt('${customerId}', '${cashBoxSmallId}', public.cairo_today(), 300, 'سحب تزامن 2', 'سند 2', 'out')
    `);

    const results = await Promise.allSettled([withdraw1, withdraw2]);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(succeeded.length, 1, 'يجب أن تنجح عملية صرف واحدة فقط');
    assert.equal(rejected.length, 1, 'يجب أن تُرفض العملية الثانية لمنع السحب على المكشوف');
    assert.match(rejected[0].reason.message, /insufficient_cash_box_balance/, 'رمز الخطأ يجب أن يكون insufficient_cash_box_balance');

    const { rows: [cashSmall] } = await superClient.query(`
      SELECT balance FROM public.v_cash_box_balances WHERE id = '${cashBoxSmallId}'
    `);
    assert.equal(Number(cashSmall.balance), 200, 'رصيد الخزنة المحدودة يجب أن يكون 200 (500 - 300) ولم ينزل تحت الصفر أبداً');
    console.log('   ✅ نجح السيناريو 4: تم قبول طلب صرف واحد ورفض الآخر بـ insufficient_cash_box_balance والرصيد 200.\n');

    // =========================================================================
    // السيناريو 5: عمليتان متعددتا الأصناف بترتيب إدخال معكوس (فحص الوقاية من Deadlock)
    // =========================================================================
    console.log('6. تشغيل السيناريو 5: عمليتان متعددتا الأصناف بترتيب إدخال معكوس [A, B] و [B, A]...');
    // العميل 1 يرسل الأصناف بترتيب: itemA ثم itemB
    const txA = client1.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 0, 'ترتيب A ثم B',
        jsonb_build_array(
          jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 1, 'unit_price', 50),
          jsonb_build_object('item_id', '${itemB}'::uuid, 'qty', 1, 'unit_price', 80)
        )
      )
    `);
    // العميل 2 يرسل الأصناف بترتيب معكوس تماماً: itemB ثم itemA
    const txB = client2.query(`
      SELECT public.create_invoice(
        'sale', '${customerId}', '${warehouseId}', public.cairo_today(), 0, 'ترتيب B ثم A',
        jsonb_build_array(
          jsonb_build_object('item_id', '${itemB}'::uuid, 'qty', 2, 'unit_price', 80),
          jsonb_build_object('item_id', '${itemA}'::uuid, 'qty', 2, 'unit_price', 50)
        )
      )
    `);

    await Promise.all([txA, txB]);

    const { rows: [stockA] } = await superClient.query(`
      SELECT qty FROM public.item_stock WHERE warehouse_id = '${warehouseId}' AND item_id = '${itemA}'
    `);
    const { rows: [stockB] } = await superClient.query(`
      SELECT qty FROM public.item_stock WHERE warehouse_id = '${warehouseId}' AND item_id = '${itemB}'
    `);

    assert.equal(Number(stockA.qty), 51, 'مخزون الصنف A بعد خصم (1 + 2) يجب أن يكون 51 (54 - 3)');
    assert.equal(Number(stockB.qty), 97, 'مخزون الصنف B بعد خصم (1 + 2) يجب أن يكون 97 (100 - 3)');
    console.log('   ✅ نجح السيناريو 5: اجتاز الفحص بترتيب أقفال تصاعدي صارم دون حدوث أي Deadlock وبدقة حسابية تامة.\n');

    console.log('================================================================================');
    console.log('🎉 جميع سيناريوهات التزامن الخمسة نجحت بنسبة 100% (ALL CONCURRENCY TESTS PASSED)!');
    console.log('================================================================================\n');

  } finally {
    if (client1) await client1.end().catch(() => {});
    if (client2) await client2.end().catch(() => {});

    // تنظيف البيانات
    try {
      await superClient.query('ALTER TABLE public.accounts DISABLE TRIGGER accounts_guard_system');
      await superClient.query(`DELETE FROM public.companies WHERE id = '${companyId}'`);
      await superClient.query(`DELETE FROM auth.users WHERE id = '${userId}'`);
      await superClient.query('ALTER TABLE public.accounts ENABLE TRIGGER accounts_guard_system');
    } catch {}
    await superClient.end().catch(() => {});
  }
}

runConcurrencySuite().catch(err => {
  console.error('❌ فشل اختبار التزامن:', err);
  process.exit(1);
});

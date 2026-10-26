import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  OUTCOMES,
  CHECK_TYPES,
  classifyCheckResult,
} from './verify-engine.mjs';

function getEnvironmentConfig() {
  const envPath = resolve('.env.local');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf8');
  }

  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  const emailMatch = envContent.match(/(?:TEST_USER_EMAIL|VERIFY_USER_EMAIL)=(.*)/);
  const passMatch = envContent.match(/(?:TEST_USER_PASSWORD|VERIFY_USER_PASSWORD)=(.*)/);

  const url = process.env.VITE_SUPABASE_URL || urlMatch?.[1]?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || keyMatch?.[1]?.trim();
  const testEmail = process.env.TEST_USER_EMAIL || process.env.VERIFY_USER_EMAIL || emailMatch?.[1]?.trim();
  const testPassword = process.env.TEST_USER_PASSWORD || process.env.VERIFY_USER_PASSWORD || passMatch?.[1]?.trim();

  return { url, anonKey, testEmail, testPassword };
}

async function runHealthCheck() {
  console.log('================================================================================');
  console.log('🔍 فحص صحة وتكامل قاعدة بيانات Supabase (Database Health & Integrity Audit)');
  console.log('================================================================================\n');

  const { url, anonKey, testEmail, testPassword } = getEnvironmentConfig();

  if (!url || !anonKey) {
    console.error('❌ خطأ بيئة: إعدادات Supabase (VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY) غير متوفرة في .env.local أو بيئة التشغيل.');
    console.error('   لا يمكن التحقق من قاعدة البيانات دون توفير بيانات الاتصال.\n');
    process.exit(1);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // محاولة توثيق مستخدم تجريبي إن وُجدت بياناته
  let isAuthenticated = false;
  if (testEmail && testPassword) {
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (loginError) {
        console.warn(`⚠️ تحذير: تعذر تسجيل الدخول بالحساب التجريبي (${testEmail}): ${loginError.message}`);
      } else {
        isAuthenticated = true;
        console.log(`🔐 تم تسجيل الدخول بنجاح بحساب الفحص التجريبي: ${testEmail}\n`);
      }
    } catch (err) {
      console.warn(`⚠️ تعذر إجراء تسجيل الدخول التجريبي: ${err.message}`);
    }
  } else {
    console.log('ℹ️ ملاحظة: لم يتم تزويد TEST_USER_EMAIL / TEST_USER_PASSWORD. سيتم إجراء فحوصات المخطط والحدود الأمنية، وتصنيف الفحوصات السلوكية التوثيقية كـ [WARN].\n');
  }

  const results = [];

  // قائمة الفحوصات الدقيقة
  const checks = [
    // 1. فحص وجود العرض وأعمدة الخزنة في v_invoice_list
    {
      name: 'v_invoice_list.cash_box_id',
      description: 'التحقق من وجود عرض الفواتير وأعمدة الخزنة (cash_box_id / cash_box_name - هجرة 0020)',
      type: CHECK_TYPES.CATALOG_QUERY,
      run: () => supabase.from('v_invoice_list').select('cash_box_id, cash_box_name').limit(0),
      validateData: (data) => ({
        valid: Array.isArray(data),
        message: 'لم يتم إرجاع مصفوفة من استعلام العرض v_invoice_list',
      }),
    },

    // 2. فحص دالة get_my_access للوصول العام غير الموثق
    {
      name: 'get_my_access (Unauthenticated Safe Handling)',
      description: 'التحقق من وجود الدالة ومعالجتها الآمنة للزائر غير الموثق (إرجاع null بأمان دون تسريب - هجرة 0037)',
      type: CHECK_TYPES.CATALOG_QUERY,
      run: () => supabase.rpc('get_my_access'),
      validateData: (data) => ({
        valid: data === null || typeof data === 'object',
        message: 'الدالة لم تُرجع قيمة آمنة للزائر غير الموثق',
      }),
    },

    // 3. فحص حدود الأمان وحظر الزوار المجهولين: create_invoice_with_cash_box
    {
      name: 'create_invoice_with_cash_box (Access Boundary)',
      description: 'التحقق من وجود الدالة في المخطط وحظر استدعائها من المستخدمين غير الموثقين (هجرة 0020)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('create_invoice_with_cash_box', {
        p_kind: 'sale',
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_invoice_date: '2026-10-25',
        p_paid: 0,
        p_notes: null,
        p_lines: [],
        p_cash_box_id: null,
      }),
    },

    // 4. فحص حدود الأمان: update_invoice_with_cash_box
    {
      name: 'update_invoice_with_cash_box (Access Boundary)',
      description: 'التحقق من وجود الدالة في المخطط وحظر تعديل الفواتير لغير الموثقين (هجرة 0020)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('update_invoice_with_cash_box', {
        p_invoice_id: '00000000-0000-0000-0000-000000000000',
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_invoice_date: '2026-10-25',
        p_paid: 0,
        p_notes: null,
        p_lines: [],
        p_cash_box_id: null,
      }),
    },

    // 5. فحص حدود الأمان: create_free_receipt
    {
      name: 'create_free_receipt (Access Boundary)',
      description: 'التحقق من وجود الدالة في المخطط وحظر تسجيل الإيصالات لغير الموثقين (هجرة 0018)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('create_free_receipt', {
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_cash_box_id: '00000000-0000-0000-0000-000000000000',
        p_amount: 100,
        p_receipt_date: '2026-10-25',
        p_description: 'test',
        p_direction: 'in',
        p_notes: null,
      }),
    },

    // 6. فحص حدود الأمان: create_warehouse_transfer
    {
      name: 'create_warehouse_transfer (Access Boundary)',
      description: 'التحقق من وجود الدالة وحظر التحويلات المخزنية لغير الموثقين (هجرة 0022)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('create_warehouse_transfer', {
        p_source_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_destination_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_transfer_date: '2026-10-25',
        p_notes: null,
        p_lines: [],
      }),
    },

    // 7. فحص حدود الأمان: get_account_statement
    {
      name: 'get_account_statement (Access Boundary)',
      description: 'التحقق من وجود الدالة وحظر استعراض كشوف الحسابات لغير الموثقين (هجرة 0030)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('get_account_statement', {
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31',
      }),
    },

    // 8. فحص حدود الأمان: get_cash_box_statement
    {
      name: 'get_cash_box_statement (Access Boundary)',
      description: 'التحقق من وجود الدالة وحظر استعراض كشوف الخزن لغير الموثقين (هجرة 0031)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('get_cash_box_statement', {
        p_cash_box_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31',
      }),
    },

    // 9. فحص حدود الأمان: get_item_movement_statement
    {
      name: 'get_item_movement_statement (Access Boundary)',
      description: 'التحقق من وجود الدالة وحظر استعراض حركة الأصناف لغير الموثقين (هجرة 0032)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('get_item_movement_statement', {
        p_item_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31',
      }),
    },

    // 10. فحص حدود الأمان: reconcile_item_stock
    {
      name: 'reconcile_item_stock (Tenant Security Boundary)',
      description: 'التحقق من وجود دالة تسوية المخزون وتقييدها الصارم للمستخدمين الموثقين وحظر الوصول العام (هجرة 0039)',
      type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
      run: () => supabase.rpc('reconcile_item_stock'),
    },

    // 11. الفحص السلوكي التوثيقي: get_my_access (Authenticated)
    {
      name: 'get_my_access (Authenticated Execution)',
      description: 'التحقق من سلامة تنفيذ الدالة وإرجاع الصلاحيات للمستخدم الموثق (هجرة 0037)',
      type: CHECK_TYPES.AUTHENTICATED_RPC,
      requiresAuth: true,
      run: () => supabase.rpc('get_my_access'),
      validateData: (data) => ({
        valid: data && typeof data === 'object' && 'role' in data,
        message: 'لم يتم إرجاع هيكل الصلاحيات المطلوب { role, permissions }',
      }),
    },
  ];

  for (const check of checks) {
    if (check.requiresAuth && !isAuthenticated) {
      const classification = classifyCheckResult(check, null, { isAuthenticated: false });
      results.push({
        name: check.name,
        description: check.description,
        outcome: classification.outcome,
        reason: classification.reason,
        diagnostic: classification.diagnostic,
      });
      continue;
    }

    try {
      const response = await check.run();
      const classification = classifyCheckResult(check, response, { isAuthenticated });
      results.push({
        name: check.name,
        description: check.description,
        outcome: classification.outcome,
        reason: classification.reason,
        diagnostic: classification.diagnostic,
      });
    } catch (unexpectedError) {
      results.push({
        name: check.name,
        description: check.description,
        outcome: OUTCOMES.FAIL,
        reason: 'UNHANDLED_EXCEPTION',
        diagnostic: `خطأ استثنائي أثناء تنفيذ الفحص: ${unexpectedError.message}`,
      });
    }
  }

  // طباعة النتائج المنظمة
  console.log('--------------------------------------------------------------------------------');
  console.log('📋 نتائج الفحص التفصيلية:');
  console.log('--------------------------------------------------------------------------------');

  for (const r of results) {
    const symbol =
      r.outcome === OUTCOMES.PASS
        ? '✅ [PASS]'
        : r.outcome === OUTCOMES.WARN
        ? '⚠️ [WARN]'
        : r.outcome === OUTCOMES.SKIP
        ? '⏭️ [SKIP]'
        : '❌ [FAIL]';

    console.log(`${symbol} ${r.name}`);
    console.log(`   الوصف: ${r.description}`);
    console.log(`   النتيجة: ${r.diagnostic}\n`);
  }

  const passCount = results.filter((r) => r.outcome === OUTCOMES.PASS).length;
  const warnCount = results.filter((r) => r.outcome === OUTCOMES.WARN).length;
  const skipCount = results.filter((r) => r.outcome === OUTCOMES.SKIP).length;
  const failCount = results.filter((r) => r.outcome === OUTCOMES.FAIL).length;

  console.log('================================================================================');
  console.log(`📊 ملخص التدقيق: PASS: ${passCount} | WARN: ${warnCount} | SKIP: ${skipCount} | FAIL: ${failCount}`);
  console.log('================================================================================');

  if (failCount > 0) {
    console.error(`\n🚨 فشل التحقق: يوجد عدد (${failCount}) فحص أثبت وجود خلل حقيقي أو كائن مفقود في قاعدة البيانات.`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`\n✨ اكتمل الفحص بنجاح للحدود والمخطط. يوجد (${warnCount}) فحص سلوكي تم تخطيه بأمان لعدم توفر بيانات مستخدم موثق.`);
    process.exit(0);
  } else {
    console.log('\n🎉 كافة الفحوصات المقررة اجتازت التحقق بنسبة 100%!');
    process.exit(0);
  }
}

runHealthCheck().catch((err) => {
  console.error('💥 خطأ غير متوقع أثناء تشغيل فحص قاعدة البيانات:', err);
  process.exit(1);
});

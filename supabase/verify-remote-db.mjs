import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve('.env.local');
if (!existsSync(envPath)) {
  console.error('❌ لم يتم العثور على ملف .env.local');
  process.exit(1);
}

const env = readFileSync(envPath, 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.error('❌ إعدادات Supabase غير مكتملة في .env.local');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function runHealthCheck() {
  console.log('🔍 جارٍ فحص قاعدة بيانات Supabase الحية (Health Check)...\n');

  const checks = [
    {
      name: 'create_invoice_with_cash_box (حفظ الفواتير بالخزنة - هجرة 0020)',
      test: () => supabase.rpc('create_invoice_with_cash_box', {
        p_kind: 'sale',
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_invoice_date: '2026-10-25',
        p_paid: 0,
        p_notes: null,
        p_lines: [],
        p_cash_box_id: null
      })
    },
    {
      name: 'update_invoice_with_cash_box (تعديل الفواتير بالخزنة - هجرة 0020)',
      test: () => supabase.rpc('update_invoice_with_cash_box', {
        p_invoice_id: '00000000-0000-0000-0000-000000000000',
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_invoice_date: '2026-10-25',
        p_paid: 0,
        p_notes: null,
        p_lines: [],
        p_cash_box_id: null
      })
    },
    {
      name: 'v_invoice_list.cash_box_id (أعمدة الخزنة في قائمة الفواتير - هجرة 0020)',
      test: () => supabase.from('v_invoice_list').select('cash_box_id, cash_box_name').limit(1)
    },
    {
      name: 'create_free_receipt (حفظ الإيصالات الحرة - هجرة 0018)',
      test: () => supabase.rpc('create_free_receipt', {
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_cash_box_id: '00000000-0000-0000-0000-000000000000',
        p_amount: 100,
        p_receipt_date: '2026-10-25',
        p_description: 'test',
        p_direction: 'in',
        p_notes: null
      })
    },
    {
      name: 'create_warehouse_transfer (التحويلات المخزنية - هجرة 0022)',
      test: () => supabase.rpc('create_warehouse_transfer', {
        p_source_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_destination_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_transfer_date: '2026-10-25',
        p_notes: null,
        p_lines: []
      })
    },
    {
      name: 'get_account_statement (كشف حساب عميل/مورد - هجرة 0030)',
      test: () => supabase.rpc('get_account_statement', {
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31'
      })
    },
    {
      name: 'get_cash_box_statement (كشف حساب خزنة - هجرة 0031)',
      test: () => supabase.rpc('get_cash_box_statement', {
        p_cash_box_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31'
      })
    },
    {
      name: 'get_item_movement_statement (كشف حركة صنف - هجرة 0032)',
      test: () => supabase.rpc('get_item_movement_statement', {
        p_item_id: '00000000-0000-0000-0000-000000000000',
        p_warehouse_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2026-01-01',
        p_to: '2026-12-31'
      })
    },
    {
      name: 'reconcile_item_stock (تسوية المخزون - هجرة 0038)',
      test: () => supabase.rpc('reconcile_item_stock')
    },
    {
      name: 'get_my_access (صلاحيات المستخدمين - هجرة 0037)',
      test: () => supabase.rpc('get_my_access')
    }
  ];

  let missingCount = 0;

  for (const c of checks) {
    const res = await c.test();
    const err = res.error;
    const isMissing = err && (
      err.code === 'PGRST202' ||
      err.code === 'PGRST205' ||
      err.message?.includes('schema cache') ||
      err.message?.includes('does not exist')
    );

    if (isMissing) {
      missingCount++;
      console.log(`❌ مفقود: ${c.name}`);
      console.log(`   الخطأ: ${err.message}\n`);
    } else {
      console.log(`✅ موجود وسليم: ${c.name}`);
    }
  }

  console.log('--------------------------------------------------');
  if (missingCount > 0) {
    console.log(`⚠️ تنبيه: يوجد عدد (${missingCount}) دالة أو جدول غير موجودة على قاعدة بيانات Supabase الحية.`);
    console.log('يجب تطبيق ملفات الهجرة الناقصة على Supabase.');
    process.exit(1);
  } else {
    console.log('🎉 جميع دوال وجداول قاعدة البيانات الحية مطابقة بنسبة 100%!');
  }
}

runHealthCheck().catch(console.error);

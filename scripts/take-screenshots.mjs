import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  const outDir = path.resolve('docs/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Starting in-process Vite server...');
  const server = await createServer({
    server: { port: 5188 },
  });
  await server.listen();
  console.log('Vite server running on http://localhost:5188');

  try {
    const browser = await chromium.launch({
      executablePath: edgePath,
      headless: true,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock auth & RPCs to render dashboard
    await page.route('**/auth/v1/user', r => r.fulfill({ status: 200, json: { id: 'u1', role: 'authenticated', aud: 'authenticated' } }));
    await page.route('**/rest/v1/rpc/get_my_access', r => r.fulfill({ status: 200, json: { role: 'owner', permissions: ['*'], is_active: true } }));
    await page.route('**/rest/v1/rpc/get_home_dashboard_summary', r => r.fulfill({ status: 200, json: {
      sales: { today: 1850, today_count: 6, week: 14200, week_count: 45, month: 58000, month_count: 180 },
      cash_balance: 32000, receivables_balance: 18500, payables_balance: 9200,
      top_items: [
        { item_id: '1', item_name: 'شيبسي عائلي', unit: 'كرتونة', total_qty: 240, total_amount: 12000 },
        { item_id: '2', item_name: 'كولا لتر ونصف', unit: 'صندوق', total_qty: 180, total_amount: 8500 },
        { item_id: '3', item_name: 'شيكولاتة جالاكسي', unit: 'علبة', total_qty: 95, total_amount: 4750 },
      ],
      top_customers: [
        { account_id: '1', account_name: 'سوبرماركت الأمانة', total_amount: 14500, invoice_count: 12 },
        { account_id: '2', account_name: 'هايبر النور', total_amount: 9800, invoice_count: 8 },
        { account_id: '3', account_name: 'محلات التوحيد', total_amount: 6200, invoice_count: 5 },
      ],
      permissions: { can_view_sales: true, can_view_cash: true, can_view_customers: true, can_view_suppliers: true },
    }}));
    await page.route('**/rest/v1/rpc/get_home_dashboard_charts*', r => r.fulfill({ status: 200, json: {
      daily_trend: [
        { date: '2026-11-01', sales: 1200, sales_count: 4, purchases: 800, purchases_count: 1 },
        { date: '2026-11-02', sales: 1650, sales_count: 5, purchases: 1100, purchases_count: 2 },
        { date: '2026-11-03', sales: 2100, sales_count: 7, purchases: 950, purchases_count: 2 },
        { date: '2026-11-04', sales: 1400, sales_count: 4, purchases: 1400, purchases_count: 3 },
        { date: '2026-11-05', sales: 2800, sales_count: 9, purchases: 600, purchases_count: 1 },
        { date: '2026-11-06', sales: 2450, sales_count: 8, purchases: 1900, purchases_count: 3 },
        { date: '2026-11-07', sales: 3100, sales_count: 11, purchases: 1200, purchases_count: 2 },
      ],
      sales_distribution: { cash_sales: 10500, credit_sales: 4200, returns_total: 500 },
      permissions: { can_view_sales: true, can_view_purchases: true },
    }}));

    await page.addInitScript(() => {
      const payload = { exp: Math.floor(Date.now() / 1000) + 36000, sub: 'u1', email: 'owner@maksab.local', role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'عبدالرحمن عيد' } };
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify(payload)).replace(/=/g, '') + '.fake';
      localStorage.setItem('sb-vnxoliuoxznlwfxalelm-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'r', expires_at: payload.exp, expires_in: 36000, token_type: 'bearer', user: payload }));
    });

    // 1920px screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5188/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'app-1920px.png'), fullPage: false });
    console.log('Saved docs/screenshots/app-1920px.png');

    // 1280px screenshot
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5188/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'app-1280px.png'), fullPage: false });
    console.log('Saved docs/screenshots/app-1280px.png');

    await browser.close();
  } finally {
    await server.close();
  }
}

main().catch(console.error);

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Entirely synthetic session and responses: this check never contacts production.
const user = {
  id: '55555555-5555-4555-8555-000000000002', aud: 'authenticated', role: 'authenticated',
  email: 'layout@example.invalid', app_metadata: {}, user_metadata: {},
};
const warehouse = { id: 'warehouse-1', name: 'مخزن تجريبي', serial_number: 1, is_active: true, is_primary: true };
const routes = [
  ...['sale','purchase','sale_return','purchase_return','waste','warehouse_transfer'].map(tab => `/invoices?tab=${tab}`),
  ...['in','out','cash_box_transfer'].map(tab => `/receipts?tab=${tab}`),
  ...['customers','suppliers','items','warehouses','cashBoxes'].map(tab => `/data?tab=${tab}`),
  ...['customers','suppliers','items','cashBoxes'].map(tab => `/balances?tab=${tab}`),
  ...['customers','suppliers','items','cashBoxes','reconciliations','users'].map(tab => `/management?tab=${tab}`),
];
const screenshots = process.argv.includes('--screenshots');
const outDir = path.resolve('docs/screenshots');
const server = await createServer({
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://layout.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-public-key'),
  },
  server: { port: 5195, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const context = await browser.newContext();
  await context.addInitScript(({ user }) => {
    const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
      btoa(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated' })), 'synthetic'].join('.');
    localStorage.setItem('sb-layout-auth-token', JSON.stringify({
      access_token: token, refresh_token: 'synthetic-refresh', expires_at: 4102444800,
      expires_in: 3600, token_type: 'bearer', user,
    }));
  }, { user });
  await context.route('https://layout.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const resource = url.pathname.split('/').at(-1);
    let data = [];
    if (url.pathname.includes('/auth/')) data = user;
    else if (resource === 'get_my_access') data = { role: 'owner', permissions: ['*'] };
    else if (resource === 'profiles') data = { full_name: 'مستخدم تجريبي', company_id: 'company-1' };
    else if (resource === 'companies') data = { name: 'شركة تجريبية' };
    else if (resource === 'warehouses') data = [warehouse];
    else if (resource === 'v_cash_box_balances' || resource === 'cash_boxes') data = [{
      id: 'cash-1', name: 'خزنة تجريبية', serial_number: 1, is_active: true, balance: 0, opening_balance: 0,
    }];
    else if (resource.endsWith('_kpis')) data = { count: 0 };
    if (req.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0', 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (screenshots) mkdirSync(outDir, { recursive: true });
  let checks = 0;
  for (const [width, height] of [[1280,800], [1920,1080], [1366,768]]) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(`http://localhost:5195${route}`, { waitUntil: 'networkidle' });
      await page.getByText('مستخدم تجريبي', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        viewport: innerHeight, height: document.scrollingElement.scrollHeight,
        width: document.scrollingElement.scrollWidth, viewportWidth: document.documentElement.clientWidth,
        rtl: document.documentElement.dir,
      }));
      assert.equal(dimensions.rtl, 'rtl');
      assert.ok(dimensions.height <= dimensions.viewport, `Unnecessary vertical overflow ${route} @${width}: ${dimensions.height}`);
      assert.ok(dimensions.width <= dimensions.viewportWidth, `Horizontal overflow ${route} @${width}`);
      if (screenshots && width !== 1366) {
        const fileName = route.slice(1).replace('?tab=', '-') + `-${width}px.png`;
        await page.screenshot({ path: path.join(outDir, `workspace-fit-${fileName}`), animations: 'disabled' });
      }
      checks++;
    }
    console.log(`PASS ${routes.length} routes at ${width}x${height}`);
  }
  // A long table must remain reachable instead of being clipped to the viewport.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:5195/invoices?tab=sale', { waitUntil: 'networkidle' });
  await page.locator('.erp-table tbody').evaluate(body => {
    body.innerHTML = Array.from({ length: 40 }, (_, i) => `<tr><td colspan="9">${i + 1}</td></tr>`).join('');
  });
  await page.locator('.erp-table tbody tr').last().scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.erp-table tbody tr').last().isVisible());
  assert.ok(await page.evaluate(() => {
    const row = document.querySelector('.erp-table tbody tr:last-child').getBoundingClientRect();
    return row.top >= 0 && row.bottom <= innerHeight;
  }), 'Last row of a long table must remain reachable');
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks} viewport checks; long-table scrolling remains available`);
} finally {
  await browser?.close();
  await server.close();
}

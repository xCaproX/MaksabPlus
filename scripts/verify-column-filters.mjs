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
const relevantRoutes=routes;
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
let accessRole='owner';
const requests=[];
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
    const rawResource=url.pathname.split('/').at(-1);
    const body=req.method()==='POST'?req.postDataJSON():{};
    const resources={filter_invoice_rows:'v_invoice_list',filter_receipt_rows:'v_receipt_list',filter_warehouse_transfer_rows:'v_warehouse_transfer_list',filter_cash_transfer_rows:'v_cash_box_transfer_list',filter_master_account_rows:'accounts',filter_master_item_rows:'items',filter_account_balance_rows:'v_account_balances',filter_warehouse_item_rows:'v_warehouse_items',filter_reconciliation_rows:'balance_reconciliation_logs'};
    const resource=resources[rawResource]??rawResource.replace(/_columns$/,'');
    if(url.pathname.includes('/rpc/')) requests.push({resource:rawResource,body,url:req.url()});
    let data = [];
    const account={id:'account-1',serial_number:1,name:'عميل تجريبي',kind:'customer',phone:'01048484848',notes:'ملاحظات الحساب',is_active:true,opening_balance:0,invoiced:100,paid:40,balance:60,has_documents:true,system_key:null};
    const item={id:'item-1',serial_number:1,name:'صنف تجريبي',unit:'قطعة',code:'ITM-1',sale_price:100,purchase_price:70,notes:'ملاحظات الصنف',is_active:true};
    const stock={company_id:'company-1',item_id:'item-1',item_number:1,item_code:'ITM-1',item_name:'صنف تجريبي',unit:'قطعة',warehouse_id:warehouse.id,warehouse_name:warehouse.name,warehouse_number:1,current_qty:8,opening_qty:10,unit_cost:70,item_notes:'ملاحظات المخزون',warehouse_notes:'ملاحظات المخزن'};
    const invoice={created_by_name:'منشئ المستند التجريبي',id:'invoice-1',number:'SAL-000001',invoice_date:'2026-11-06',created_at:'2026-11-06T10:30:00Z',kind:body?.p_kind??url.searchParams.get('kind')?.slice(3)??'sale',account_id:account.id,account_name:account.name,account_kind:account.kind,account_phone:account.phone,warehouse_id:warehouse.id,warehouse_name:warehouse.name,total:1234567.5,paid:234567.5,remaining:1000000,profit_total:123.45,cost_total:1234444.05,notes:'تسليم الدور الثاني — ملاحظة طويلة لاختبار التفاف النص دون تغيير محاذاة الأرقام',deleted_at:null};
    const transfer={created_by_name:'منشئ التحويل التجريبي',id:'transfer-1',created_at:invoice.created_at,transfer_date:invoice.invoice_date,number:'WTR-000001',source_warehouse_name:warehouse.name,destination_warehouse_name:'مخزن الفرع',source_cash_box_name:'الخزنة الرئيسية',destination_cash_box_name:'خزنة الفرع',total_qty:2.5,line_count:1,total_value:175,amount:175,notes:'تحويل تجريبي',deleted_at:null};

    if (url.pathname.includes('/auth/')) data = user;
    else if (resource === 'get_my_access') data = { role: accessRole, permissions: ['*'] };
    else if (resource === 'profiles') data = { full_name: 'مستخدم تجريبي', company_id: 'company-1' };
    else if (resource === 'companies') data = { name: 'شركة تجريبية' };
    else if (resource === 'warehouses') data = [warehouse];
    else if (resource === 'v_cash_box_balances' || resource === 'cash_boxes') data = [{
      id: 'cash-1', name: 'خزنة تجريبية', serial_number: 1, is_active: true, balance: 0, opening_balance: 0,
    }];
    else if (['accounts','v_account_balances'].includes(resource)) data=[{...account,kind:body?.p_kind??url.searchParams.get('kind')?.slice(3)??'customer'}];
    else if (['items','v_item_stock'].includes(resource)) data=[item];
    else if (['v_warehouse_items','v_stock_opening_balances'].includes(resource)) data=[stock];
    else if(resource==='v_invoice_list') data=[invoice];
    else if(resource==='v_warehouse_transfer_list'||resource==='v_cash_box_transfer_list') data=[transfer];
    else if(resource==='v_receipt_list') data=[{...invoice,number:'RCP-000001',receipt_date:invoice.invoice_date,amount:100,cash_box_id:'cash-1',cash_box_name:'خزنة تجريبية',direction:'in',statement:'إيصال حر تجريبي',is_free:true,invoice_id:null,invoice_kind:null}];
    else if(resource==='get_invoice_kpis') data={count:1,total_amount:invoice.total,paid_amount:invoice.paid,remaining_amount:invoice.remaining,profit_total:invoice.profit_total};
    else if(resource==='get_receipt_kpis') data={count:1,total_amount:100,invoice_linked:0};
    else if(resource==='get_warehouse_transfer_kpis') data={count:1,total_value:175,total_qty:2.5};
    else if(resource==='get_cash_box_transfer_kpis') data={count:1,total_amount:175};
    else if(resource==='list_creator_filter_options') data=[{value:'منشئ المستند التجريبي',label:'منشئ المستند التجريبي'}];
    else if(resource==='list_company_users') data=[{user_id:user.id,full_name:'مستخدم تجريبي',email:'layout@example.invalid',is_active:true,access_role:'owner',permission_keys:[]}];
    else if(resource==='balance_reconciliation_logs') data=[{id:'log-1',created_at:invoice.created_at,performed_by_name:'مستخدم تجريبي',mode:'simulation',accounts_count:2,cash_boxes_count:1,items_count:2,discrepancies_count:0,status:'clean',notes:'فحص تجريبي',details:{accounts:[],cash_boxes:[],items:[]}}];
    else if(resource==='get_reconciliation_log_kpis') data={count:1,total_discrepancies:0,latest_created_at:invoice.created_at,latest_status:'clean'};
    else if (resource.endsWith('_kpis')) data = {count:1,total_count:1,active_count:1,total_invoiced:100,total_paid:40,total_balance:60};
    if (Object.values(body?.p_columns ?? {}).includes('NO-MATCH')) data=Array.isArray(data)?[]:{count:0,total_count:0};
    if (req.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Content-Range': Object.values(body?.p_columns ?? {}).includes('NO-MATCH') ? '*/0' : '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(data) });
  });

  const page=await context.newPage(); await page.clock.setFixedTime(new Date('2026-11-06T10:00:00Z'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));mkdirSync(outDir,{recursive:true});let checks=0;
  for(const [width,height] of (process.argv.includes('--interactions-only') ? [] : [[1920,1080],[1280,800],[1366,768]])){
    await page.setViewportSize({width,height});
    for(const route of relevantRoutes){
      await page.goto('http://localhost:5195'+route,{waitUntil:'networkidle'});
      await page.getByText('شركة تجريبية', {exact:true}).first().waitFor();await page.evaluate(()=>document.fonts.ready);
      const state=await page.evaluate(()=>{
        const table=document.querySelector('.erp-table:has(.column-filter-row)');
        const heads=[...table?.querySelectorAll('thead tr:first-child > *')??[]],filters=[...table?.querySelectorAll('.column-filter-row > *')??[]];
        const withFilters=heads.map(h=>h.getBoundingClientRect().width);
        const filterRow=table?.querySelector('.column-filter-row');
        const scrollWith=table?.parentElement.scrollWidth;
        filterRow?.remove();
        const withoutFilters=heads.map(h=>h.getBoundingClientRect().width);
        const scrollWithout=table?.parentElement.scrollWidth;
        if(filterRow)table.querySelector('thead').append(filterRow);
        const unchanged=withFilters.every((w,i)=>Math.abs(w-withoutFilters[i])<1)&&scrollWith===scrollWithout;
        const icons=[...table?.querySelectorAll('.column-filter-cell svg')??[]].filter(svg=>!svg.closest('.column-filter-clear, .date-picker-trigger, .searchable-select-arrow')).length;
        const contained=[...table?.querySelectorAll('.column-filter-cell > *')??[]].every(el=>{
          const cell=el.closest('td').getBoundingClientRect(),box=el.getBoundingClientRect();return box.left>=cell.left&&box.right<=cell.right;
        });
        return {unchanged,icons,contained,rtl:document.documentElement.dir,height:document.scrollingElement.scrollHeight,viewport:innerHeight,width:document.scrollingElement.scrollWidth,viewportWidth:document.documentElement.clientWidth,count:heads.length,filterCount:filters.length,aligned:heads.every((h,i)=>Math.abs(h.getBoundingClientRect().width-filters[i]?.getBoundingClientRect().width)<1),row:!!table,bar:!!document.querySelector('.column-filter-bar')};
      });
      assert.equal(state.rtl,'rtl');assert.ok(state.height<=state.viewport,'Vertical overflow '+route+' @'+width+': '+state.height);
      assert.ok(state.width<=state.viewportWidth,'Page horizontal overflow '+route+' @'+width);
      assert.ok(state.row||state.bar,'Missing row '+route);assert.equal(state.count,state.filterCount,'Cell parity '+route);assert.ok(state.aligned,'Widths '+route);assert.ok(state.unchanged,'Filters expanded original columns '+route+' @'+width);assert.equal(state.icons,0,'Field icons '+route);assert.ok(state.contained,'Fields outside cells '+route);
      if(route.startsWith('/invoices')||route.startsWith('/receipts')||route.endsWith('tab=reconciliations')){
        assert.equal(await page.locator('.erp-toolbar input[type=search]').count(),0);
        assert.equal(await page.locator('.erp-toolbar .searchable-select').count(),1,'Only period selector in toolbar');
        const labels=await page.locator('.erp-toolbar .filter-label').evaluateAll(labels=>labels.map(label=>{
          const field=label.parentElement.querySelector('.searchable-select-input-wrap, .date-input-wrap');
          const a=label.getBoundingClientRect(),b=field.getBoundingClientRect();
          return {right:a.left>=b.right-1,aligned:Math.abs((a.top+a.height/2)-(b.top+b.height/2))<2};
        }));
        assert.ok(labels.length===3&&labels.every(l=>l.right&&l.aligned),'Inline RTL date labels '+route+' @'+width);
      }
      const rtl=await page.locator('.erp-table thead th, .erp-table tbody tr:not(:has(td[colspan])) > td').evaluateAll(cells=>cells.every(c=>getComputedStyle(c).direction==='rtl'&&['start','right'].includes(getComputedStyle(c).textAlign)));
      assert.ok(rtl,'Right aligned RTL columns '+route+' @'+width);
      if(screenshots&&width!==1366)await page.screenshot({path:path.join(outDir,'column-filter-toolbar-'+route.slice(1).replace('?tab=','-')+'-'+width+'px.png'),animations:'disabled'});
      checks++;
    }
    console.log('PASS '+relevantRoutes.length+' routes @'+width);
  }

  // A no-results colspan must preserve the populated widths and reset control.
  for(const width of [1280,1920]) {
    await page.setViewportSize({width,height:800});
    for(const route of relevantRoutes.filter(r=>!r.endsWith('tab=users'))) {
      await page.goto('http://localhost:5195'+route,{waitUntil:'networkidle'});
      const measure=()=>page.locator('.erp-table').first().evaluate(table=>({
        widths:[...table.querySelectorAll('thead tr:first-child > *')].map(cell=>cell.getBoundingClientRect().width),
        scroll:table.parentElement.scrollWidth
      }));
      const before=await measure();
      const input=page.locator('.column-filter-row input[type=text]:not(.date-input-text)').first();
      await input.fill('NO-MATCH');
      await page.waitForFunction(()=>{
        const message=document.querySelector('.erp-table tbody .empty');
        return !!message && !/جار/.test(message.textContent);
      });
      const after=await measure();
      // Removing painted record text can reduce the rounded scrollWidth by a
      // pixel; the regression is any increase, with column geometry checked below.
      assert.ok(after.scroll<=before.scroll,'Empty-result overflow '+route+' @'+width);
      assert.ok(after.widths.every((w,i)=>Math.abs(w-before.widths[i])<1),'Empty-result columns '+route+' @'+width);
      assert.ok(await page.locator('.column-filter-row input[placeholder="="]').evaluateAll(inputs=>inputs.every(i=>getComputedStyle(i).direction==='rtl')));
      if(route==='/invoices?tab=sale' && screenshots)await page.screenshot({path:path.join(outDir,'column-filter-toolbar-empty-sales-'+width+'px.png')});
      await page.getByRole('button',{name:'مسح كل الفلاتر'}).click();
    }
  }
  console.log('PASS 46 no-results width/overflow cases');
  await page.setViewportSize({width:1920,height:1080});await page.goto('http://localhost:5195/invoices?tab=sale',{waitUntil:'networkidle'});
  await page.evaluate(() => {
    window.pickerResults = [];
    const native = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () {
      try { native.call(this); window.pickerResults.push(this.type + ':opened'); }
      catch (error) { window.pickerResults.push(this.type + ':failed'); throw error; }
    };
  });
  await page.locator('.column-filter-row').getByRole('button',{name:'اختيار التاريخ من التقويم'}).click();
  await page.keyboard.press('Escape');
  await page.locator('.column-filter-row').getByRole('button',{name:'اختيار الوقت',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>window.pickerResults),['date:opened','time:opened']);
  console.log('PASS native date and time picker buttons');
  await page.getByLabel('بحث في الإجمالي',{exact:true}).fill('0');
  await page.waitForResponse(r=>r.url().includes('/get_invoice_kpis_columns')&&r.request().postDataJSON()?.p_columns?.total==='0');
  assert.ok(requests.some(r=>r.resource==='filter_invoice_rows'&&r.body.p_columns.total==='0'));
  await page.getByLabel('بحث في الحساب',{exact:true}).fill('010');
  await page.waitForResponse(r=>r.url().includes('/get_invoice_kpis_columns')&&r.request().postDataJSON()?.p_columns?.account==='010');
  assert.equal(await page.locator('.erp-toolbar input[type=search]').count(),0);
  assert.equal(await page.getByLabel('حالة السداد',{exact:true}).count(),0);
  await page.getByLabel('بحث في ملاحظات',{exact:true}).fill('منشئ');
  await page.waitForResponse(r=>r.url().includes('/get_invoice_kpis_columns')&&r.request().postDataJSON()?.p_columns?.notes==='منشئ');
  assert.deepEqual(requests.filter(r=>r.resource==='filter_invoice_rows').at(-1).body.p_columns,requests.filter(r=>r.resource==='get_invoice_kpis_columns').at(-1).body.p_columns);
  await page.getByRole('combobox',{name:'بحث في بواسطة'}).click();
  await page.getByRole('option',{name:'منشئ المستند التجريبي'}).click();
  await page.waitForResponse(r=>r.url().includes('/get_invoice_kpis_columns')&&r.request().postDataJSON()?.p_columns?.created_by_name==='منشئ المستند التجريبي');
  await page.getByLabel('الفترة',{exact:true}).click();await page.getByRole('option',{name:'كل الفترات'}).click();
  await Promise.all([
    page.waitForResponse(r=>r.url().includes('/get_invoice_kpis_columns')&&Object.keys(r.request().postDataJSON()?.p_columns??{}).length===0&&r.request().postDataJSON()?.p_search===null&&r.request().postDataJSON()?.p_date_from==='2026-11-06'),
    page.getByRole('button',{name:'مسح كل الفلاتر'}).click(),
  ]);
  assert.equal(await page.getByLabel('بحث في الحساب',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('بحث في الإجمالي',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('بحث في ملاحظات',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('الفترة',{exact:true}).inputValue(),'النهاردة');
  await page.locator('.erp-table tbody').evaluate(body=>{body.innerHTML=Array.from({length:40},(_,i)=>'<tr><td colspan="13">'+(i+1)+'</td></tr>').join('');});
  await page.locator('.erp-table tbody tr').last().scrollIntoViewIfNeeded();assert.ok(await page.locator('.erp-table tbody tr').last().isVisible());

  // Check each server-backed source sends the identical column set to rows and totals.
  const serverCases=[
    ['/invoices?tab=warehouse_transfer','filter_warehouse_transfer_rows','get_warehouse_transfer_kpis_columns','بحث في الرقم','number','WTR'],
    ['/receipts?tab=in','filter_receipt_rows','get_receipt_kpis_columns','بحث في الرقم','number','RCP'],
    ['/receipts?tab=cash_box_transfer','filter_cash_transfer_rows','get_cash_box_transfer_kpis_columns','بحث في الرقم','number','CTR'],
    ['/data?tab=customers','filter_master_account_rows','get_master_accounts_kpis_columns','بحث في الهاتف','phone','010'],
    ['/data?tab=items','filter_master_item_rows','get_master_items_kpis_columns','بحث في سعر البيع','sale_price','0'],
    ['/balances?tab=customers','filter_account_balance_rows','get_account_balances_kpis_columns','بحث في الهاتف','phone','010'],
    ['/balances?tab=items','filter_warehouse_item_rows','get_warehouse_stock_kpis_columns','بحث في الكمية الحالية','current_qty','0'],
    ['/management?tab=reconciliations','filter_reconciliation_rows','get_reconciliation_log_kpis_columns','بحث في ملاحظات','notes','حرفي'],
  ];
  for(const [route,rowRpc,kpiRpc,label,key,value] of serverCases){
    await page.goto('http://localhost:5195'+route,{waitUntil:'networkidle'});
    console.log('Checking server filters '+route);
    const start=requests.length;
    await Promise.all([page.waitForResponse(r=>r.url().includes('/'+kpiRpc)&&r.request().postDataJSON()?.p_columns?.[key]===value),
      page.getByLabel(label,{exact:true}).fill(value)]);
    const rows=requests.slice(start).filter(r=>r.resource===rowRpc).at(-1),kpis=requests.slice(start).filter(r=>r.resource===kpiRpc).at(-1);
    assert.deepEqual(rows.body.p_columns,kpis.body.p_columns,route+' rows/totals');
    await page.getByRole('button',{name:'مسح كل الفلاتر'}).click();
  }
  // Local lists actually remove and restore synthetic records before pagination.
  for(const route of ['/data?tab=warehouses','/data?tab=cashBoxes','/balances?tab=cashBoxes','/management?tab=customers','/management?tab=items','/management?tab=cashBoxes']){
    await page.goto('http://localhost:5195'+route,{waitUntil:'networkidle'});
    const input=page.locator('.column-filter-row input[type=text]:not(.date-input-text)').first();
    await input.fill('لا يوجد بهذا الاسم');
    await page.waitForFunction(()=>!!document.querySelector('.erp-table tbody .empty'));
    await page.getByRole('button',{name:'مسح كل الفلاتر'}).click();
    await page.waitForFunction(()=>!document.querySelector('.erp-table tbody .empty'));
  }
  accessRole='employee';
  for(const width of [1280,1920]){
    await page.setViewportSize({width,height:800});
    for(const route of ['/invoices?tab=sale','/invoices?tab=waste','/invoices?tab=warehouse_transfer','/management?tab=items']){
      await page.goto('http://localhost:5195'+route,{waitUntil:'networkidle'});
      const n=await page.locator('.erp-table thead tr:first-child > *').count();
      assert.equal(n,await page.locator('.column-filter-row > td').count(),'Staff alignment '+route);
      if(route.includes('warehouse_transfer'))assert.equal(n,10);
      if(route.startsWith('/management'))assert.equal(n,5);
      assert.equal(await page.getByLabel('بحث في قيمة التكلفة',{exact:true}).count(),0);
      assert.equal(await page.getByLabel('بحث في تكلفة الوحدة',{exact:true}).count(),0);
    }
  }
  console.log('PASS 8 sibling server request pairs; 6 local filtering/reset flows; 8 employee layouts');
  assert.deepEqual(errors,[]);console.log('PASS '+checks+' layouts; aligned cells; row/KPI filters; creator select; clear all; scrolling');
}finally{await browser?.close();await server.close();}

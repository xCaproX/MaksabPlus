import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const company = '55555555-5555-4555-8555-0000000000a1';
const owner = '55555555-5555-4555-8555-000000000001';
const cashier = '55555555-5555-4555-8555-000000000002';
const warehouse = '55555555-5555-4555-8555-000000000010';
const cashBox = '55555555-5555-4555-8555-000000000020';
const account = '55555555-5555-4555-8555-000000000030';

// Use three connected pg clients on a fresh, migrated, disposable local database.
export async function assertFreeReceiptLockOrder(observer, invoice, receipt) {
  assert.ok([observer, invoice, receipt].every((client) =>
    ['localhost', '127.0.0.1', '::1'].includes(client.host)));

  async function snapshot(item) {
    const { rows: [row] } = await observer.query(`
      select
        (select balance from public.v_account_balances where id=$1)::int as account,
        (select balance from public.v_cash_box_balances where id=$2)::int as cash,
        (select qty from public.item_stock where item_id=$3 and warehouse_id=$4)::int as stock,
        (select count(*) from public.invoices where company_id=$5)::int as invoices,
        (select count(*) from public.invoice_items where company_id=$5)::int as lines,
        (select count(*) from public.receipts where company_id=$5)::int as receipts,
        (select count(distinct number) from public.receipts where company_id=$5)::int as receipt_numbers
    `, [account, cashBox, item, warehouse, company]);
    return row;
  }

  const fixture = await readFile(new URL('./fixtures/document_boundaries.sql', import.meta.url), 'utf8');
  await observer.query(fixture);
  const { rows: [{ item }] } = await observer.query("select current_setting('test.boundary.item') as item");
  await observer.query('commit');

  await observer.query('begin');
  await observer.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await observer.query("select public.set_user_permissions($1,array['money.in.create'])", [cashier]);
  await observer.query('commit');
  const before = await snapshot(item);

  await invoice.query('begin');
  await invoice.query("set local statement_timeout = '6s'");
  await invoice.query('select id from public.accounts where id=$1 for update', [account]);
  await invoice.query('set local role authenticated');
  await invoice.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);

  await receipt.query('begin');
  await receipt.query("set local statement_timeout = '6s'");
  await receipt.query('set local role authenticated');
  await receipt.query("select set_config('request.jwt.claim.sub',$1,true)", [cashier]);
  const receiptResult = receipt.query(
    "select public.create_free_receipt($1,$2,current_date,4,null,null,'in')",
    [account, cashBox],
  ).then(async () => { await receipt.query('commit'); return null; }, async (error) => {
    await receipt.query('rollback');
    return error;
  });

  let invoiceError;
  try {
    // The receipt must reach the account lock before the sale asks for a receipt number.
    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const { rows: [{ blocking }] } = await observer.query(
        'select $1::int = any(pg_blocking_pids($2)) as blocking',
        [invoice.processID, receipt.processID],
      );
      if (blocking) { waiting = true; break; }
      await delay(5);
    }
    assert.ok(waiting, 'The receipt session never reached the held lock');
    await invoice.query(`
      select public.create_invoice_with_cash_box(
        'sale',$1,$2,current_date,3,null,
        jsonb_build_array(jsonb_build_object('item_id',$3::uuid,'qty',1,'unit_price',10)),
        $4
      )
    `, [account, warehouse, item, cashBox]);
    await invoice.query('commit');
  } catch (error) {
    invoiceError = error;
    await invoice.query('rollback');
  }

  const receiptError = await receiptResult;
  assert.equal(invoiceError?.code ?? invoiceError?.message ?? null, null, 'Invoice must commit');
  assert.equal(receiptError?.code ?? null, null, 'Free receipt must commit');
  assert.deepEqual(await snapshot(item), {
    account: before.account + 3, cash: before.cash + 7, stock: before.stock - 1,
    invoices: before.invoices + 1, lines: before.lines + 1,
    receipts: before.receipts + 2, receipt_numbers: before.receipt_numbers + 2,
  });
}

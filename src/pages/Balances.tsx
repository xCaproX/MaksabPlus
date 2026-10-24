import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { entityNumber, money, qty as formatQty, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import type { AccountRow, AccountStatementRow, CashBoxRow, CashBoxStatementRow, ItemMovementStatementRow, StockOpeningRow, WarehouseOption } from '../lib/types';

type BalanceTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes';

const VALID_BALANCE_TABS: BalanceTab[] = ['customers', 'suppliers', 'items', 'cashBoxes'];

export default function Balances() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as BalanceTab | null;
  const initialTab = (tabParam && VALID_BALANCE_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<BalanceTab>(initialTab);

  useEffect(() => {
    const targetTab = (tabParam && VALID_BALANCE_TABS.includes(tabParam)) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
      setStatementAccount(null);
      setCashStatementBox(null);
      setItemStatementRow(null);
    }
  }, [tabParam]);

  function switchTab(next: BalanceTab) {
    setTab(next);
    setSearchParams({ tab: next });
    setStatementAccount(null);
    setCashStatementBox(null);
    setItemStatementRow(null);
  }
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statementAccount, setStatementAccount] = useState<AccountRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(`${today().slice(0, 7)}-01`);
  const [statementTo, setStatementTo] = useState(today());
  const [statementRows, setStatementRows] = useState<AccountStatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');
  const [cashStatementBox, setCashStatementBox] = useState<CashBoxRow | null>(null);
  const [cashStatementRows, setCashStatementRows] = useState<CashBoxStatementRow[]>([]);
  const [cashStatementLoading, setCashStatementLoading] = useState(false);
  const [cashStatementError, setCashStatementError] = useState('');
  const [itemStatementRow, setItemStatementRow] = useState<StockOpeningRow | null>(null);
  const [itemStatementRows, setItemStatementRows] = useState<ItemMovementStatementRow[]>([]);
  const [itemStatementLoading, setItemStatementLoading] = useState(false);
  const [itemStatementError, setItemStatementError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      const [accountsRes, boxesRes, stockRes, warehousesRes] = await Promise.all([
        supabase.from('v_account_balances').select('*').order('name'),
        supabase.from('v_cash_box_balances').select('*').order('name'),
        supabase.from('v_stock_opening_balances').select('*').order('warehouse_name').order('item_name'),
        supabase.from('warehouses').select('id, serial_number, name, notes').eq('is_active', true).order('name'),
      ]);
      if (!alive) return;
      const firstError = accountsRes.error ?? boxesRes.error ?? stockRes.error ?? warehousesRes.error;
      if (firstError) setError(translateDbError(firstError.message));
      else {
        setAccounts((accountsRes.data ?? []) as AccountRow[]);
        setCashBoxes((boxesRes.data ?? []) as CashBoxRow[]);
        setStockRows((stockRes.data ?? []) as StockOpeningRow[]);
        const loadedWarehouses = (warehousesRes.data ?? []) as WarehouseOption[];
        setWarehouses(loadedWarehouses);
        setSelectedWarehouseId((current) => current || loadedWarehouses[0]?.id || '');
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, []);

  const visibleAccounts = accounts.filter((account) => account.system_key === null);
  const customers = visibleAccounts.filter((account) => account.kind === 'customer');
  const suppliers = visibleAccounts.filter((account) => account.kind === 'supplier');
  const selectedStockRows = stockRows.filter((row) => row.warehouse_id === selectedWarehouseId);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);

  function openStatement(account: AccountRow) {
    setStatementAccount(account);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
    setStatementRows([]);
    setStatementError('');
  }

  async function loadStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statementAccount) return;
    setStatementLoading(true);
    setStatementError('');
    const { data, error: rpcError } = await supabase.rpc('get_account_statement', {
      p_account_id: statementAccount.id,
      p_from: statementFrom,
      p_to: statementTo,
    });
    setStatementLoading(false);
    if (rpcError) {
      setStatementError(translateDbError(rpcError.message));
      setStatementRows([]);
    } else {
      setStatementRows((data ?? []) as AccountStatementRow[]);
    }
  }

  function openCashBoxStatement(box: CashBoxRow) {
    setCashStatementBox(box);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
    setCashStatementRows([]);
    setCashStatementError('');
  }

  async function loadCashBoxStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cashStatementBox) return;
    setCashStatementLoading(true);
    setCashStatementError('');
    const { data, error: rpcError } = await supabase.rpc('get_cash_box_statement', {
      p_cash_box_id: cashStatementBox.id,
      p_from: statementFrom,
      p_to: statementTo,
    });
    setCashStatementLoading(false);
    if (rpcError) {
      setCashStatementError(translateDbError(rpcError.message));
      setCashStatementRows([]);
    } else {
      setCashStatementRows((data ?? []) as CashBoxStatementRow[]);
    }
  }

  function openItemStatement(row: StockOpeningRow) {
    setItemStatementRow(row);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
    setItemStatementRows([]);
    setItemStatementError('');
  }

  async function loadItemStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemStatementRow) return;
    setItemStatementLoading(true);
    setItemStatementError('');
    const { data, error: rpcError } = await supabase.rpc('get_item_movement_statement', {
      p_item_id: itemStatementRow.item_id,
      p_warehouse_id: itemStatementRow.warehouse_id,
      p_from: statementFrom,
      p_to: statementTo,
    });
    setItemStatementLoading(false);
    if (rpcError) {
      setItemStatementError(translateDbError(rpcError.message));
      setItemStatementRows([]);
    } else {
      setItemStatementRows((data ?? []) as ItemMovementStatementRow[]);
    }
  }
  const tabs: { id: BalanceTab; label: string }[] = [
    { id: 'customers', label: 'حسابات العملاء' },
    { id: 'suppliers', label: 'حسابات الموردين' },
    { id: 'items', label: 'أرصدة الأصناف' },
    { id: 'cashBoxes', label: 'أرصدة الخزن' },
  ];

  return (
    <div className="stack">
      <div className="page-head"><div><h1>الأرصدة</h1><p className="muted">عرض أرصدة الحسابات والمخزون والخزن.</p></div></div>
      <div className="tabs">
        {tabs.map((entry) => <button key={entry.id} type="button" className={tab === entry.id ? 'tab active' : 'tab'} onClick={() => switchTab(entry.id)}>{entry.label}</button>)}
      </div>
      {error && <p className="alert error">{error}</p>}
      {loading ? <div className="card empty">جارٍ التحميل…</div> : (
        <div className="card table-wrap responsive-table">
          {tab === 'customers' && <table className="table"><thead><tr><th>الرقم</th><th>العميل</th><th>الهاتف</th><th>الرصيد</th><th>ملاحظات</th><th /></tr></thead><tbody>
            {customers.map((account) => <tr key={account.id} className="responsive-row"><td className="num" data-label="الرقم">{entityNumber('CUS', account.serial_number)}</td><td data-label="العميل">{account.name}</td><td data-label="الهاتف">{account.phone ?? '—'}</td><td className="num strong" data-label="الرصيد">{money(account.balance)}</td><td data-label="ملاحظات">{account.notes || '—'}</td><td className="row-actions" data-label="الإجراء"><button type="button" className="btn" onClick={() => openStatement(account)}>كشف حساب</button></td></tr>)}
            {customers.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حسابات عملاء.</td></tr>}
          </tbody></table>}
          {tab === 'suppliers' && <table className="table"><thead><tr><th>الرقم</th><th>المورد</th><th>الهاتف</th><th>الرصيد</th><th>ملاحظات</th><th /></tr></thead><tbody>
            {suppliers.map((account) => <tr key={account.id} className="responsive-row"><td className="num" data-label="الرقم">{entityNumber('SUP', account.serial_number)}</td><td data-label="المورد">{account.name}</td><td data-label="الهاتف">{account.phone ?? '—'}</td><td className="num strong" data-label="الرصيد">{money(account.balance)}</td><td data-label="ملاحظات">{account.notes || '—'}</td><td className="row-actions" data-label="الإجراء"><button type="button" className="btn" onClick={() => openStatement(account)}>كشف حساب</button></td></tr>)}
            {suppliers.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حسابات موردين.</td></tr>}
          </tbody></table>}
          {tab === 'items' && <>
            <div className="filter-row balance-filter-row"><label>المخزن<select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{entityNumber('WH', warehouse.serial_number)} — {warehouse.name}</option>)}</select></label><p className="filter-note"><strong>ملاحظات المخزن:</strong> {selectedWarehouse?.notes || '—'}</p></div>
            <table className="table"><thead><tr><th>رقم الصنف</th><th>كود الصنف</th><th>الصنف</th><th>ملاحظات الصنف</th><th>الكمية الحالية</th><th /></tr></thead><tbody>
              {selectedStockRows.map((row) => <tr key={`${row.warehouse_id}:${row.item_id}`} className="responsive-row"><td className="num" data-label="رقم الصنف">{entityNumber('ITM', row.item_number)}</td><td className="num" data-label="الكود">{row.item_code}</td><td data-label="الصنف">{row.item_name}</td><td data-label="ملاحظات الصنف">{row.item_notes || '—'}</td><td className="num strong" data-label="الكمية الحالية">{formatQty(row.current_qty)} {row.unit}</td><td className="row-actions" data-label="الإجراء"><button type="button" className="btn" onClick={() => openItemStatement(row)}>كشف حركة</button></td></tr>)}
              {selectedStockRows.length === 0 && <tr><td colSpan={6} className="empty">{warehouses.length === 0 ? 'لا توجد مخازن نشطة.' : selectedWarehouseId ? 'لا توجد أصناف لهذا المخزن.' : 'اختر مخزنًا لعرض أصنافه.'}</td></tr>}
            </tbody></table>
          </>}
          {tab === 'cashBoxes' && <table className="table"><thead><tr><th>الرقم</th><th>الخزنة</th><th>الرصيد الحالي</th><th>ملاحظات</th><th /></tr></thead><tbody>
            {cashBoxes.map((box) => <tr key={box.id} className="responsive-row"><td className="num" data-label="الرقم">{entityNumber('CBX', box.serial_number)}</td><td data-label="الخزنة">{box.name}</td><td className="num strong" data-label="الرصيد الحالي">{money(box.balance)}</td><td data-label="ملاحظات">{box.notes || '—'}</td><td className="row-actions" data-label="الإجراء"><button type="button" className="btn" onClick={() => openCashBoxStatement(box)}>كشف حركة</button></td></tr>)}
            {cashBoxes.length === 0 && <tr><td colSpan={5} className="empty">لا توجد خزن.</td></tr>}
          </tbody></table>}
        </div>
      )}
      {statementAccount && <Modal title="كشف حساب" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setStatementAccount(null)}>
        <div className="account-statement-print">
          <div className="account-statement-heading">
            <div><h2>كشف حساب {statementAccount.kind === 'customer' ? 'عميل' : 'مورد'}</h2><strong>{statementAccount.name}</strong><p>{statementAccount.phone || '—'}</p></div>
            <div className="account-statement-period"><label>من تاريخ<input type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} required /></label><label>إلى تاريخ<input type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} required /></label></div>
          </div>
          <div className="actions statement-actions print-hidden">
            <form onSubmit={loadStatement}><button type="submit" className="btn primary" disabled={statementLoading || !statementFrom || !statementTo}>{statementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}</button></form>
            {statementRows.length > 0 && <button type="button" className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>}
          </div>
          {statementError && <p className="alert error print-hidden">{statementError}</p>}
          {statementRows.length > 0 && <>
            <div className="table-wrap responsive-table"><table className="table account-statement-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>
              {statementRows.map((row, index) => <tr key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.invoice_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}><td className="num" data-label="التاريخ">{row.transaction_date}</td><td className="card-wide-cell" data-label="البيان">{row.description}</td><td className="num" data-label="مدين">{Number(row.debit) ? money(row.debit) : '—'}</td><td className="num" data-label="دائن">{Number(row.credit) ? money(row.credit) : '—'}</td><td className="num strong" data-label="الرصيد">{money(row.running_balance)}</td></tr>)}
            </tbody></table></div>
            <div className="account-statement-totals"><p><span>إجمالي المدين:</span><strong>{money(statementRows[0].total_debit)}</strong></p><p><span>إجمالي الدائن:</span><strong>{money(statementRows[0].total_credit)}</strong></p><p><span>رصيد آخر المدة:</span><strong>{money(statementRows[statementRows.length - 1].running_balance)}</strong></p></div>
          </>}
          {!statementRows.length && !statementLoading && !statementError && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
        </div>
      </Modal>}
      {cashStatementBox && <Modal title="كشف حركة خزنة" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setCashStatementBox(null)}>
        <div className="account-statement-print">
          <div className="account-statement-heading">
            <div><h2>كشف حركة خزنة</h2><strong>{cashStatementBox.name}</strong></div>
            <div className="account-statement-period"><label>من تاريخ<input type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} required /></label><label>إلى تاريخ<input type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} required /></label></div>
          </div>
          <div className="actions statement-actions print-hidden">
            <form onSubmit={loadCashBoxStatement}><button type="submit" className="btn primary" disabled={cashStatementLoading || !statementFrom || !statementTo}>{cashStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}</button></form>
            {cashStatementRows.length > 0 && <button type="button" className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>}
          </div>
          {cashStatementError && <p className="alert error print-hidden">{cashStatementError}</p>}
          {cashStatementRows.length > 0 && <>
            <div className="table-wrap responsive-table"><table className="table account-statement-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>
              {cashStatementRows.map((row, index) => <tr key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.transfer_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}><td className="num" data-label="التاريخ">{row.transaction_date}</td><td className="card-wide-cell" data-label="البيان">{row.description}</td><td className="num" data-label="وارد">{Number(row.incoming) ? money(row.incoming) : '—'}</td><td className="num" data-label="صادر">{Number(row.outgoing) ? money(row.outgoing) : '—'}</td><td className="num strong" data-label="الرصيد">{money(row.running_balance)}</td></tr>)}
            </tbody></table></div>
            <div className="account-statement-totals"><p><span>إجمالي الوارد:</span><strong>{money(cashStatementRows[0].total_incoming)}</strong></p><p><span>إجمالي الصادر:</span><strong>{money(cashStatementRows[0].total_outgoing)}</strong></p><p><span>رصيد آخر المدة:</span><strong>{money(cashStatementRows[cashStatementRows.length - 1].running_balance)}</strong></p></div>
          </>}
          {!cashStatementRows.length && !cashStatementLoading && !cashStatementError && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
        </div>
      </Modal>}
      {itemStatementRow && <Modal title="كشف حركة صنف" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setItemStatementRow(null)}>
        <div className="account-statement-print">
          <div className="account-statement-heading">
            <div><h2>كشف حركة صنف</h2><strong>[{entityNumber('ITM', itemStatementRow.item_number)}] {itemStatementRow.item_code} — {itemStatementRow.item_name} ~ {itemStatementRow.unit}</strong><p>{selectedWarehouse?.name ?? itemStatementRow.warehouse_name}</p></div>
            <div className="account-statement-period"><label>من تاريخ<input type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} required /></label><label>إلى تاريخ<input type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} required /></label></div>
          </div>
          <div className="actions statement-actions print-hidden">
            <form onSubmit={loadItemStatement}><button type="submit" className="btn primary" disabled={itemStatementLoading || !statementFrom || !statementTo}>{itemStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}</button></form>
            {itemStatementRows.length > 0 && <button type="button" className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>}
          </div>
          {itemStatementError && <p className="alert error print-hidden">{itemStatementError}</p>}
          {itemStatementRows.length > 0 && <>
            <div className="table-wrap responsive-table"><table className="table account-statement-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>
              {itemStatementRows.map((row, index) => <tr key={`${row.row_type}-${row.transaction_date}-${row.transfer_number ?? row.invoice_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}><td className="num" data-label="التاريخ">{row.transaction_date}</td><td className="card-wide-cell" data-label="البيان">{row.description}</td><td className="num" data-label="وارد">{Number(row.incoming) ? `${formatQty(row.incoming)} ${itemStatementRow.unit}` : '—'}</td><td className="num" data-label="صادر">{Number(row.outgoing) ? `${formatQty(row.outgoing)} ${itemStatementRow.unit}` : '—'}</td><td className="num strong" data-label="الرصيد">{formatQty(row.running_balance)} {itemStatementRow.unit}</td></tr>)}
            </tbody></table></div>
            <div className="account-statement-totals"><p><span>إجمالي الوارد:</span><strong>{formatQty(itemStatementRows[0].total_incoming)} {itemStatementRow.unit}</strong></p><p><span>إجمالي الصادر:</span><strong>{formatQty(itemStatementRows[0].total_outgoing)} {itemStatementRow.unit}</strong></p><p><span>رصيد آخر المدة:</span><strong>{formatQty(itemStatementRows[itemStatementRows.length - 1].running_balance)} {itemStatementRow.unit}</strong></p></div>
          </>}
          {!itemStatementRows.length && !itemStatementLoading && !itemStatementError && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
        </div>
      </Modal>}
    </div>
  );
}

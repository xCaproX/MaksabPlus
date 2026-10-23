import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { entityNumber, money, qty as formatQty } from '../lib/format';
import { translateDbError } from '../lib/errors';
import type { AccountRow, CashBoxRow, StockOpeningRow, WarehouseOption } from '../lib/types';

type ManagementTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes';

export default function Management() {
  const [tab, setTab] = useState<ManagementTab>('customers');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [accountValues, setAccountValues] = useState<Record<string, string>>({});
  const [cashValues, setCashValues] = useState<Record<string, string>>({});
  const [stockValues, setStockValues] = useState<Record<string, { qty: string; cost: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      const [accountsRes, boxesRes, stockRes, warehousesRes] = await Promise.all([
        supabase.from('v_account_balances').select('*').order('name'),
        supabase.from('v_cash_box_balances').select('*').order('name'),
        supabase.from('v_stock_opening_balances').select('*').order('warehouse_name').order('item_name'),
        supabase.from('warehouses').select('id, serial_number, name').eq('is_active', true).order('name'),
      ]);
      if (!alive) return;
      const firstError = accountsRes.error ?? boxesRes.error ?? stockRes.error ?? warehousesRes.error;
      if (firstError) setError(translateDbError(firstError.message));
      else {
        const loadedAccounts = ((accountsRes.data ?? []) as AccountRow[]).filter((account) => account.system_key === null);
        const loadedBoxes = (boxesRes.data ?? []) as CashBoxRow[];
        const loadedStock = (stockRes.data ?? []) as StockOpeningRow[];
        const loadedWarehouses = (warehousesRes.data ?? []) as WarehouseOption[];
        setAccounts(loadedAccounts);
        setCashBoxes(loadedBoxes);
        setStockRows(loadedStock);
        setWarehouses(loadedWarehouses);
        setSelectedWarehouseId((current) =>
          loadedWarehouses.some((warehouse) => warehouse.id === current)
            ? current
            : loadedWarehouses[0]?.id ?? '',
        );
        setAccountValues(Object.fromEntries(loadedAccounts.map((account) => [account.id, String(Number(account.opening_balance))])));
        setCashValues(Object.fromEntries(loadedBoxes.map((box) => [box.id, String(Number(box.opening_balance))])));
        setStockValues(Object.fromEntries(loadedStock.map((row) => [`${row.warehouse_id}:${row.item_id}`, { qty: String(Number(row.opening_qty)), cost: String(Number(row.unit_cost)) }])));
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [version]);

  async function saveAccountOpening(account: AccountRow) {
    const opening = Number(accountValues[account.id] ?? 0);
    if (!Number.isFinite(opening)) { setError('أدخل رصيدًا افتتاحيًا صحيحًا'); return; }
    setSaving(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.rpc('save_account', {
      p_account_id: account.id,
      p_name: account.name,
      p_kind: account.kind,
      p_phone: account.phone,
      p_is_active: account.is_active,
      p_opening_balance: opening,
    });
    setSaving(false);
    if (saveError) setError(translateDbError(saveError.message));
    else { setNotice(`تم حفظ الرصيد الافتتاحي لحساب «${account.name}»`); setVersion((value) => value + 1); }
  }

  async function saveCashAndStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const cash = cashBoxes.map((box) => ({ cash_box_id: box.id, opening_balance: Number(cashValues[box.id] ?? 0) }));
    const stock = stockRows.map((row) => {
      const value = stockValues[`${row.warehouse_id}:${row.item_id}`] ?? { qty: String(row.opening_qty), cost: String(row.unit_cost) };
      return { warehouse_id: row.warehouse_id, item_id: row.item_id, opening_qty: Number(value.qty), unit_cost: Number(value.cost) };
    });
    if (cash.some((line) => !Number.isFinite(line.opening_balance)) || stock.some((line) => !Number.isFinite(line.opening_qty) || line.opening_qty < 0 || !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) {
      setError('راجع أرصدة الخزن وكميات المخزون وتكلفة الوحدة. القيم يجب أن تكون صحيحة وغير سالبة.'); return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.rpc('save_opening_balances', { p_cash_boxes: cash, p_stock: stock });
    setSaving(false);
    if (saveError) setError(translateDbError(saveError.message));
    else { setNotice('تم حفظ الأرصدة الافتتاحية والتعديلات'); setVersion((value) => value + 1); }
  }

  const tabs: { id: ManagementTab; label: string }[] = [
    { id: 'customers', label: 'افتتاحيات العملاء' },
    { id: 'suppliers', label: 'افتتاحيات الموردين' },
    { id: 'items', label: 'افتتاحيات المخزون' },
    { id: 'cashBoxes', label: 'افتتاحيات الخزن' },
  ];
  const visibleAccounts = accounts.filter((account) => account.kind === (tab === 'customers' ? 'customer' : 'supplier'));
  const visibleStockRows = stockRows.filter((row) =>
    row.warehouse_id === selectedWarehouseId &&
    row.item_name.toLocaleLowerCase().includes(itemSearch.trim().toLocaleLowerCase()),
  );

  return (
    <div className="stack">
      <div className="page-head"><div><h1>إدارة</h1><p className="muted">إدخال وتعديل الأرصدة الافتتاحية.</p></div></div>
      <div className="tabs">{tabs.map((entry) => <button key={entry.id} type="button" className={tab === entry.id ? 'tab active' : 'tab'} onClick={() => setTab(entry.id)}>{entry.label}</button>)}</div>
      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}
      {loading ? <div className="card empty">جارٍ التحميل…</div> : (
        <>
          {(tab === 'customers' || tab === 'suppliers') && <div className="card">
            <p className="hint">{tab === 'customers' ? 'للعميل: الموجب يعني عليه، والسالب يعني له.' : 'للمورد: الموجب يعني له، والسالب يعني عليه.'} حفظ أي تعديل يسجل تصحيحًا يحافظ على الحركات السابقة.</p>
            <div className="table-wrap"><table className="table"><thead><tr><th>الرقم</th><th>الحساب</th><th>النوع</th><th>الرصيد الافتتاحي</th><th>الرصيد الحالي</th><th /></tr></thead><tbody>
              {visibleAccounts.map((account) => <tr key={account.id}><td className="num">{entityNumber(tab === 'customers' ? 'CUS' : 'SUP', account.serial_number)}</td><td>{account.name}</td><td>{account.kind === 'customer' ? 'عميل' : 'مورد'}</td><td><input className="table-input num" type="number" step="0.0001" value={accountValues[account.id] ?? '0'} onChange={(event) => setAccountValues((values) => ({ ...values, [account.id]: event.target.value }))} /></td><td className="num">{money(account.balance)}</td><td><button type="button" className="btn" disabled={saving} onClick={() => void saveAccountOpening(account)}>حفظ</button></td></tr>)}
              {visibleAccounts.length === 0 && <tr><td colSpan={6} className="empty">{tab === 'customers' ? 'لا توجد حسابات عملاء.' : 'لا توجد حسابات موردين.'}</td></tr>}
            </tbody></table></div>
          </div>}
          {tab === 'items' && <form className="stack" onSubmit={saveCashAndStock}>
            <div className="card"><p className="hint">اختر مخزنًا وابحث عن الصنف لإدخال كمية البداية وتكلفة الوحدة. عند وجود حركات لاحقة، يمكن تصحيح الكمية، بينما تُقفل تكلفة البداية لحماية أرباح الفواتير السابقة.</p>
              <div className="filter-row balance-filter-row">
                <label>المخزن<select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{entityNumber('WH', warehouse.serial_number)} — {warehouse.name}</option>)}</select></label>
                <label>بحث عن صنف<input type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="اكتب اسم الصنف" disabled={!selectedWarehouseId} /></label>
              </div>
              <div className="table-wrap"><table className="table"><thead><tr><th>رقم الصنف</th><th>الصنف</th><th>كمية البداية</th><th>تكلفة الوحدة</th><th>المتاح الآن</th></tr></thead><tbody>
                {visibleStockRows.map((row) => { const key = `${row.warehouse_id}:${row.item_id}`; const value = stockValues[key] ?? { qty: '0', cost: '0' }; return <tr key={key}><td className="num">{entityNumber('ITM', row.item_number)}</td><td>{row.item_name}</td><td><input className="table-input num" type="number" min="0" step="0.0001" value={value.qty} onChange={(event) => setStockValues((values) => ({ ...values, [key]: { ...value, qty: event.target.value } }))} /></td><td><input className="table-input num" type="number" min="0" step="0.0001" value={value.cost} disabled={row.cost_locked} onChange={(event) => setStockValues((values) => ({ ...values, [key]: { ...value, cost: event.target.value } }))} /></td><td className="num">{formatQty(row.current_qty)} {row.unit}</td></tr>; })}
                {visibleStockRows.length === 0 && <tr><td colSpan={5} className="empty">{warehouses.length === 0 ? 'أضف المخازن والأصناف أولًا.' : !selectedWarehouseId ? 'اختر مخزنًا لعرض أصنافه.' : itemSearch.trim() ? 'لا توجد أصناف تطابق البحث في هذا المخزن.' : 'لا توجد أصناف في هذا المخزن.'}</td></tr>}
              </tbody></table></div>
            </div><div className="actions"><button type="submit" className="btn primary" disabled={saving || !selectedWarehouseId}>حفظ أرصدة المخزون</button></div>
          </form>}
          {tab === 'cashBoxes' && <form className="stack" onSubmit={saveCashAndStock}>
            <div className="card"><p className="hint">أدخل رصيد كل خزنة عند بداية العمل. التعديلات اللاحقة تُسجل كتصحيح محفوظ.</p>
              <div className="table-wrap"><table className="table"><thead><tr><th>الرقم</th><th>الخزنة</th><th>الرصيد الافتتاحي</th><th>الرصيد الحالي</th></tr></thead><tbody>
                {cashBoxes.map((box) => <tr key={box.id}><td className="num">{entityNumber('CBX', box.serial_number)}</td><td>{box.name}</td><td><input className="table-input num" type="number" step="0.0001" value={cashValues[box.id] ?? '0'} onChange={(event) => setCashValues((values) => ({ ...values, [box.id]: event.target.value }))} /></td><td className="num">{money(box.balance)}</td></tr>)}
                {cashBoxes.length === 0 && <tr><td colSpan={4} className="empty">لا توجد خزن.</td></tr>}
              </tbody></table></div>
            </div><div className="actions"><button type="submit" className="btn primary" disabled={saving}>حفظ رصيد الخزن</button></div>
          </form>}
        </>
      )}
    </div>
  );
}

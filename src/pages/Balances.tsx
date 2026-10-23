import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, qty as formatQty } from '../lib/format';
import { translateDbError } from '../lib/errors';
import type { AccountRow, CashBoxRow, StockOpeningRow, WarehouseOption } from '../lib/types';

type BalanceTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes';

export default function Balances() {
  const [tab, setTab] = useState<BalanceTab>('customers');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      const [accountsRes, boxesRes, stockRes, warehousesRes] = await Promise.all([
        supabase.from('v_account_balances').select('*').order('name'),
        supabase.from('v_cash_box_balances').select('*').order('name'),
        supabase.from('v_stock_opening_balances').select('*').order('warehouse_name').order('item_name'),
        supabase.from('warehouses').select('id, name, notes').eq('is_active', true).order('name'),
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
        {tabs.map((entry) => <button key={entry.id} type="button" className={tab === entry.id ? 'tab active' : 'tab'} onClick={() => setTab(entry.id)}>{entry.label}</button>)}
      </div>
      {error && <p className="alert error">{error}</p>}
      {loading ? <div className="card empty">جارٍ التحميل…</div> : (
        <div className="card table-wrap">
          {tab === 'customers' && <table className="table"><thead><tr><th>العميل</th><th>الهاتف</th><th>الرصيد</th><th>ملاحظات</th></tr></thead><tbody>
            {customers.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.phone ?? '—'}</td><td className="num strong">{money(account.balance)}</td><td>{account.notes || '—'}</td></tr>)}
            {customers.length === 0 && <tr><td colSpan={4} className="empty">لا توجد حسابات عملاء.</td></tr>}
          </tbody></table>}
          {tab === 'suppliers' && <table className="table"><thead><tr><th>المورد</th><th>الهاتف</th><th>الرصيد</th><th>ملاحظات</th></tr></thead><tbody>
            {suppliers.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.phone ?? '—'}</td><td className="num strong">{money(account.balance)}</td><td>{account.notes || '—'}</td></tr>)}
            {suppliers.length === 0 && <tr><td colSpan={4} className="empty">لا توجد حسابات موردين.</td></tr>}
          </tbody></table>}
          {tab === 'items' && <>
            <div className="filter-row balance-filter-row"><label>المخزن<select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><p className="filter-note"><strong>ملاحظات المخزن:</strong> {selectedWarehouse?.notes || '—'}</p></div>
            <table className="table"><thead><tr><th>الصنف</th><th>ملاحظات الصنف</th><th>الكمية الحالية</th></tr></thead><tbody>
              {selectedStockRows.map((row) => <tr key={`${row.warehouse_id}:${row.item_id}`}><td>{row.item_name}</td><td>{row.item_notes || '—'}</td><td className="num strong">{formatQty(row.current_qty)} {row.unit}</td></tr>)}
              {selectedStockRows.length === 0 && <tr><td colSpan={3} className="empty">{warehouses.length === 0 ? 'لا توجد مخازن نشطة.' : selectedWarehouseId ? 'لا توجد أصناف لهذا المخزن.' : 'اختر مخزنًا لعرض أصنافه.'}</td></tr>}
            </tbody></table>
          </>}
          {tab === 'cashBoxes' && <table className="table"><thead><tr><th>الخزنة</th><th>الرصيد الحالي</th><th>ملاحظات</th></tr></thead><tbody>
            {cashBoxes.map((box) => <tr key={box.id}><td>{box.name}</td><td className="num strong">{money(box.balance)}</td><td>{box.notes || '—'}</td></tr>)}
            {cashBoxes.length === 0 && <tr><td colSpan={3} className="empty">لا توجد خزن.</td></tr>}
          </tbody></table>}
        </div>
      )}
    </div>
  );
}

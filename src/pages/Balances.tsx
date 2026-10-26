import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { entityNumber, formatDate, money, qty as formatQty, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import DateInput from '../components/DateInput';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { toast } from '../components/Toast';
import { matchesSearchQuery } from '../lib/search';
import type { AccountRow, AccountStatementRow, CashBoxRow, CashBoxStatementRow, ItemMovementStatementRow, StockOpeningRow, WarehouseOption } from '../lib/types';

type BalanceTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes';
type BalanceSort =
  | 'balance-desc'
  | 'balance-asc'
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc';

const PAGE_SIZE = 20;
const VALID_BALANCE_TABS: BalanceTab[] = ['customers', 'suppliers', 'items', 'cashBoxes'];

export default function Balances() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as BalanceTab | null;
  const initialTab = (tabParam && VALID_BALANCE_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<BalanceTab>(initialTab);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  function setError(msg: string) { if (msg) toast.error(msg); }
  function setStatementError(msg: string) { if (msg) toast.error(msg); }
  function setCashStatementError(msg: string) { if (msg) toast.error(msg); }
  function setItemStatementError(msg: string) { if (msg) toast.error(msg); }

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);

  // العناصر المحددة للوحة الجانبية
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedItem, setSelectedItem] = useState<StockOpeningRow | null>(null);
  const [selectedBox, setSelectedBox] = useState<CashBoxRow | null>(null);

  // كشوفات الحساب والنوافذ المخصصة للطباعة
  const [statementAccount, setStatementAccount] = useState<AccountRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(`${today().slice(0, 7)}-01`);
  const [statementTo, setStatementTo] = useState(today());
  const [statementRows, setStatementRows] = useState<AccountStatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const [cashStatementBox, setCashStatementBox] = useState<CashBoxRow | null>(null);
  const [cashStatementRows, setCashStatementRows] = useState<CashBoxStatementRow[]>([]);
  const [cashStatementLoading, setCashStatementLoading] = useState(false);

  const [itemStatementRow, setItemStatementRow] = useState<StockOpeningRow | null>(null);
  const [itemStatementRows, setItemStatementRows] = useState<ItemMovementStatementRow[]>([]);
  const [itemStatementLoading, setItemStatementLoading] = useState(false);

  useEffect(() => {
    const targetTab = (tabParam && VALID_BALANCE_TABS.includes(tabParam)) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
      setSelectedAccount(null);
      setSelectedItem(null);
      setSelectedBox(null);
      setSearchTerm('');
      setPage(1);
    }
  }, [tabParam]);

  function switchTab(next: BalanceTab) {
    setTab(next);
    setSearchParams({ tab: next });
    setSelectedAccount(null);
    setSelectedItem(null);
    setSelectedBox(null);
    setSearchTerm('');
    setPage(1);
  }

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
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);

  // تصفية العملاء
  const filteredCustomers = useMemo(() => {
    const list = customers.filter((account) =>
      matchesSearchQuery([account.name, account.phone, account.serial_number, account.notes], searchTerm),
    );
    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'balance-desc') return Number(secondAccount.balance) - Number(firstAccount.balance);
      if (sortOrder === 'balance-asc') return Number(firstAccount.balance) - Number(secondAccount.balance);
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [customers, searchTerm, sortOrder]);

  // تصفية الموردين
  const filteredSuppliers = useMemo(() => {
    const list = suppliers.filter((account) =>
      matchesSearchQuery([account.name, account.phone, account.serial_number, account.notes], searchTerm),
    );
    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'balance-desc') return Number(secondAccount.balance) - Number(firstAccount.balance);
      if (sortOrder === 'balance-asc') return Number(firstAccount.balance) - Number(secondAccount.balance);
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [suppliers, searchTerm, sortOrder]);

  // تصفية الأصناف
  const filteredItems = useMemo(() => {
    const list = stockRows.filter((stockRow) => {
      const matchWarehouse = !selectedWarehouseId || stockRow.warehouse_id === selectedWarehouseId;
      const matchSearch = matchesSearchQuery(
        [stockRow.item_name, stockRow.item_code, stockRow.item_notes, stockRow.item_number],
        searchTerm,
      );
      return matchWarehouse && matchSearch;
    });
    return list.sort((firstItem, secondItem) => {
      if (sortOrder === 'balance-desc') return Number(secondItem.current_qty) - Number(firstItem.current_qty);
      if (sortOrder === 'balance-asc') return Number(firstItem.current_qty) - Number(secondItem.current_qty);
      if (sortOrder === 'serial-desc') return secondItem.item_number - firstItem.item_number;
      if (sortOrder === 'serial-asc') return firstItem.item_number - secondItem.item_number;
      if (sortOrder === 'name-desc') return secondItem.item_name.localeCompare(firstItem.item_name, 'ar');
      return firstItem.item_name.localeCompare(secondItem.item_name, 'ar');
    });
  }, [stockRows, selectedWarehouseId, searchTerm, sortOrder]);

  // تصفية الخزن
  const filteredCashBoxes = useMemo(() => {
    const list = cashBoxes.filter((box) =>
      matchesSearchQuery([box.name, box.notes, box.serial_number], searchTerm),
    );
    return list.sort((firstBox, secondBox) => {
      if (sortOrder === 'balance-desc') return Number(secondBox.balance) - Number(firstBox.balance);
      if (sortOrder === 'balance-asc') return Number(firstBox.balance) - Number(secondBox.balance);
      if (sortOrder === 'serial-desc') return secondBox.serial_number - firstBox.serial_number;
      if (sortOrder === 'serial-asc') return firstBox.serial_number - secondBox.serial_number;
      if (sortOrder === 'name-desc') return secondBox.name.localeCompare(firstBox.name, 'ar');
      return firstBox.name.localeCompare(secondBox.name, 'ar');
    });
  }, [cashBoxes, searchTerm, sortOrder]);

  const activeTotalCount =
    tab === 'customers' ? filteredCustomers.length :
    tab === 'suppliers' ? filteredSuppliers.length :
    tab === 'items' ? filteredItems.length : filteredCashBoxes.length;

  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));

  const pageCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageSuppliers = filteredSuppliers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortOrder, selectedWarehouseId, tab]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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

  const tabTitle =
    tab === 'customers' ? 'حسابات العملاء' :
    tab === 'suppliers' ? 'حسابات الموردين' :
    tab === 'items' ? 'أرصدة الأصناف' : 'أرصدة الخزن';

  const hasSelection = selectedAccount || selectedItem || selectedBox;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
          <p className="muted">
            {tab === 'customers'
              ? 'متابعة أرصدة العملاء وكشوفات حساباتهم (الموجب يعني عليه، والسالب يعني له).'
              : tab === 'suppliers'
              ? 'متابعة أرصدة الموردين ومستحقاتهم وكشوفات الحساب.'
              : tab === 'items'
              ? 'متابعة كميات الأصناف الحالية في المخازن وحركة الصادر والوارد.'
              : 'متابعة السيولة النقدية والأرصدة الفعلية في خزن الشركة.'}
          </p>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'customers' ? 'tab active' : 'tab'} onClick={() => switchTab('customers')}>حسابات العملاء</button>
        <button type="button" className={tab === 'suppliers' ? 'tab active' : 'tab'} onClick={() => switchTab('suppliers')}>حسابات الموردين</button>
        <button type="button" className={tab === 'items' ? 'tab active' : 'tab'} onClick={() => switchTab('items')}>أرصدة الأصناف</button>
        <button type="button" className={tab === 'cashBoxes' ? 'tab active' : 'tab'} onClick={() => switchTab('cashBoxes')}>أرصدة الخزن</button>
      </div>

      {/* الـ ERP Workspace لقسم الأرصدة */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
          <div className="erp-toolbar">
            <div className="erp-toolbar-title">
              <strong>{tabTitle}</strong>
              <span>{activeTotalCount} نتيجة</span>
            </div>
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={
                    tab === 'customers' ? 'بحث بالاسم أو الهاتف أو الرقم…' :
                    tab === 'suppliers' ? 'بحث باسم المورد أو الهاتف…' :
                    tab === 'items' ? 'بحث باسم الصنف أو الكود…' : 'بحث باسم الخزنة…'
                  }
                />
              </label>

              {tab === 'items' && (
                <SearchableSelect
                  ariaLabel="تصفية حسب المخزن"
                  value={selectedWarehouseId}
                  options={warehouses.map((wh) => ({
                    value: wh.id,
                    label: `${entityNumber('WH', wh.serial_number)} — ${wh.name}`,
                  }))}
                  onChange={setSelectedWarehouseId}
                  searchPlaceholder="بحث عن مخزن…"
                />
              )}
            </div>
          </div>

          <div className="erp-table-wrap">
            {tab === 'customers' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="serial"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                    />
                    <SortableHeader
                      label="العميل"
                      field="name"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      defaultDirection="asc"
                    />
                    <th>الهاتف</th>
                    <SortableHeader
                      label="الرصيد الحالي"
                      field="balance"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      align="end"
                      className="num"
                    />
                    <th>الملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageCustomers.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حسابات عملاء تطابق البحث.</td></tr>}
                  {!loading && pageCustomers.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    return (
                      <tr
                        key={account.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAccount(account); }
                        }}
                      >
                        <td className="num strong">{entityNumber('CUS', account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num">{account.phone || '—'}</td>
                        <td className={`num strong ${Number(account.balance) > 0 ? 'remaining' : ''}`}>{money(account.balance)}</td>
                        <td className="muted">{account.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn compact" onClick={() => openStatement(account)}>كشف حساب</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'suppliers' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="serial"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                    />
                    <SortableHeader
                      label="المورد"
                      field="name"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      defaultDirection="asc"
                    />
                    <th>الهاتف</th>
                    <SortableHeader
                      label="الرصيد الحالي"
                      field="balance"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      align="end"
                      className="num"
                    />
                    <th>الملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageSuppliers.length === 0 && <tr><td colSpan={6} className="empty">لا توجد حسابات موردين تطابق البحث.</td></tr>}
                  {!loading && pageSuppliers.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    return (
                      <tr
                        key={account.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAccount(account); }
                        }}
                      >
                        <td className="num strong">{entityNumber('SUP', account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num">{account.phone || '—'}</td>
                        <td className={`num strong ${Number(account.balance) > 0 ? 'remaining' : ''}`}>{money(account.balance)}</td>
                        <td className="muted">{account.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn compact" onClick={() => openStatement(account)}>كشف حساب</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'items' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="serial"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                    />
                    <th>الكود</th>
                    <SortableHeader
                      label="الصنف"
                      field="name"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      defaultDirection="asc"
                    />
                    <SortableHeader
                      label="الكمية الحالية"
                      field="balance"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      align="end"
                      className="num"
                    />
                    <th>الملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageItems.length === 0 && <tr><td colSpan={6} className="empty">لا توجد أصناف تطابق البحث أو المخزن.</td></tr>}
                  {!loading && pageItems.map((row) => {
                    const isSelected = selectedItem?.item_id === row.item_id && selectedItem?.warehouse_id === row.warehouse_id;
                    return (
                      <tr
                        key={`${row.warehouse_id}:${row.item_id}`}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedItem(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItem(row); }
                        }}
                      >
                        <td className="num strong">{entityNumber('ITM', row.item_number)}</td>
                        <td className="num">{row.item_code}</td>
                        <td className="strong">{row.item_name}</td>
                        <td className="num strong">{formatQty(row.current_qty)} {row.unit}</td>
                        <td className="muted">{row.item_notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn compact" onClick={() => openItemStatement(row)}>كشف حركة</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'cashBoxes' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="serial"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                    />
                    <SortableHeader
                      label="الخزنة"
                      field="name"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      defaultDirection="asc"
                    />
                    <SortableHeader
                      label="الرصيد الحالي"
                      field="balance"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as BalanceSort)}
                      align="end"
                      className="num"
                    />
                    <th>الملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={5} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageBoxes.length === 0 && <tr><td colSpan={5} className="empty">لا توجد خزن تطابق البحث.</td></tr>}
                  {!loading && pageBoxes.map((box) => {
                    const isSelected = selectedBox?.id === box.id;
                    return (
                      <tr
                        key={box.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedBox(box)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBox(box); }
                        }}
                      >
                        <td className="num strong">{entityNumber('CBX', box.serial_number)}</td>
                        <td className="strong">{box.name}</td>
                        <td className="num strong">{money(box.balance)}</td>
                        <td className="muted">{box.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn compact" onClick={() => openCashBoxStatement(box)}>كشف حركة</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="erp-pagination">
            <span>
              عرض {activeTotalCount ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, activeTotalCount)} من {activeTotalCount}
            </span>
            <div>
              <button type="button" className="btn compact" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
              <span>{page} / {pageCount}</span>
              <button type="button" className="btn compact" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>التالي</button>
            </div>
          </div>
        </section>

        {/* اللوحة الجانبية للتفاصيل */}
        <aside className={hasSelection ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل الرصيد">
          {selectedAccount ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>{selectedAccount.kind === 'customer' ? 'حساب عميل' : 'حساب مورد'}</span>
                  <h2>{selectedAccount.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedAccount(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم التسلسلي</dt><dd className="num">{entityNumber(selectedAccount.kind === 'customer' ? 'CUS' : 'SUP', selectedAccount.serial_number)}</dd></div>
                <div><dt>رقم الهاتف</dt><dd className="num">{selectedAccount.phone || '—'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedAccount.is_active ? 'نشط' : 'موقوف'}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>الرصيد الفعلي</span>
                <strong className={`num ${Number(selectedAccount.balance) > 0 ? 'remaining' : ''}`}>{money(selectedAccount.balance)}</strong>
              </div>

              <p className="hint">
                {selectedAccount.kind === 'customer'
                  ? 'الرصيد الموجب يعني مستحق على العميل (مدين)، والرصيد السالب يعني رصيد لصالحه (دائن).'
                  : 'الرصيد الموجب يعني مستحق للمورد (دائن)، والرصيد السالب يعني رصيد للشركة طرفه (مدين).'}
              </p>

              {selectedAccount.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedAccount.notes}</p>}

              <div className="erp-detail-actions">
                <button type="button" className="btn primary" onClick={() => openStatement(selectedAccount)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Printer size={16} />
                  <span>عرض وطباعة كشف الحساب</span>
                </button>
              </div>
            </>
          ) : selectedItem ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الصنف والمخزون</span>
                  <h2>{selectedItem.item_name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedItem(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>رقم الصنف</dt><dd className="num">{entityNumber('ITM', selectedItem.item_number)}</dd></div>
                <div><dt>كود الصنف</dt><dd className="num">{selectedItem.item_code}</dd></div>
                <div><dt>المخزن</dt><dd>{selectedWarehouse?.name || selectedItem.warehouse_name}</dd></div>
                <div><dt>الوحدة</dt><dd>{selectedItem.unit}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>الكمية الحالية</span>
                <strong className="num">{formatQty(selectedItem.current_qty)} {selectedItem.unit}</strong>
              </div>

              {selectedItem.item_notes && <p className="erp-detail-notes"><span>ملاحظات الصنف</span>{selectedItem.item_notes}</p>}

              <div className="erp-detail-actions">
                <button type="button" className="btn primary" onClick={() => openItemStatement(selectedItem)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Printer size={16} />
                  <span>عرض وطباعة كشف حركة الصنف</span>
                </button>
              </div>
            </>
          ) : selectedBox ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الخزنة</span>
                  <h2>{selectedBox.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedBox(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم التسلسلي</dt><dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd></div>
                <div><dt>النوع</dt><dd>{selectedBox.is_primary ? 'الخزنة الرئيسية' : 'خزنة فرعية'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedBox.is_active ? 'نشطة' : 'موقوفة'}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>الرصيد النقدي الحالي</span>
                <strong className="num remaining">{money(selectedBox.balance)}</strong>
              </div>

              {selectedBox.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedBox.notes}</p>}

              <div className="erp-detail-actions">
                <button type="button" className="btn primary" onClick={() => openCashBoxStatement(selectedBox)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Printer size={16} />
                  <span>عرض وطباعة حركة الخزنة</span>
                </button>
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر حسابًا أو صنفًا</strong>
              <span>ستظهر بيانات الرصيد وإمكانية استخراج كشف الحساب من هنا فورًا.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نوافذ الطباعة وكشوفات الحساب المتخصصة */}
      {statementAccount && (
        <Modal title="كشف حساب" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setStatementAccount(null)}>
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div>
                <h2>كشف حساب {statementAccount.kind === 'customer' ? 'عميل' : 'مورد'}</h2>
                <strong>{statementAccount.name}</strong>
                <p>{statementAccount.phone || '—'}</p>
              </div>
              <div className="account-statement-period">
                <label><span>من تاريخ</span><DateInput value={statementFrom} onChange={setStatementFrom} ariaLabel="من تاريخ" required /></label>
                <label><span>إلى تاريخ</span><DateInput value={statementTo} onChange={setStatementTo} ariaLabel="إلى تاريخ" required /></label>
              </div>
            </div>
            <div className="actions statement-actions print-hidden">
              <form onSubmit={loadStatement}>
                <button type="submit" className="btn primary" disabled={statementLoading || !statementFrom || !statementTo}>
                  {statementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {statementRows.length > 0 && (
                <button type="button" className="btn" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Printer size={15} />
                  <span>طباعة / حفظ PDF</span>
                </button>
              )}
            </div>
            {statementRows.length > 0 && (
              <>
                <div className="table-wrap responsive-table">
                  <table className="table account-statement-table">
                    <thead>
                      <tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
                    </thead>
                    <tbody>
                      {statementRows.map((row, index) => (
                        <tr key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.invoice_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}>
                          <td className="num" data-label="التاريخ">{formatDate(row.transaction_date)}</td>
                          <td className="card-wide-cell" data-label="البيان">{row.description}</td>
                          <td className="num" data-label="مدين">{Number(row.debit) ? money(row.debit) : '—'}</td>
                          <td className="num" data-label="دائن">{Number(row.credit) ? money(row.credit) : '—'}</td>
                          <td className="num strong" data-label="الرصيد">{money(row.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="account-statement-totals">
                  <p><span>إجمالي المدين:</span><strong>{money(statementRows[0].total_debit)}</strong></p>
                  <p><span>إجمالي الدائن:</span><strong>{money(statementRows[0].total_credit)}</strong></p>
                  <p><span>رصيد آخر المدة:</span><strong>{money(statementRows[statementRows.length - 1].running_balance)}</strong></p>
                </div>
              </>
            )}
            {!statementRows.length && !statementLoading && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
          </div>
        </Modal>
      )}

      {cashStatementBox && (
        <Modal title="كشف حركة خزنة" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setCashStatementBox(null)}>
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div><h2>كشف حركة خزنة</h2><strong>{cashStatementBox.name}</strong></div>
              <div className="account-statement-period">
                <label><span>من تاريخ</span><DateInput value={statementFrom} onChange={setStatementFrom} ariaLabel="من تاريخ" required /></label>
                <label><span>إلى تاريخ</span><DateInput value={statementTo} onChange={setStatementTo} ariaLabel="إلى تاريخ" required /></label>
              </div>
            </div>
            <div className="actions statement-actions print-hidden">
              <form onSubmit={loadCashBoxStatement}>
                <button type="submit" className="btn primary" disabled={cashStatementLoading || !statementFrom || !statementTo}>
                  {cashStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {cashStatementRows.length > 0 && (
                <button type="button" className="btn" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Printer size={15} />
                  <span>طباعة / حفظ PDF</span>
                </button>
              )}
            </div>
            {cashStatementRows.length > 0 && (
              <>
                <div className="table-wrap responsive-table">
                  <table className="table account-statement-table">
                    <thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead>
                    <tbody>
                      {cashStatementRows.map((row, index) => (
                        <tr key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.transfer_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}>
                          <td className="num" data-label="التاريخ">{formatDate(row.transaction_date)}</td>
                          <td className="card-wide-cell" data-label="البيان">{row.description}</td>
                          <td className="num" data-label="وارد">{Number(row.incoming) ? money(row.incoming) : '—'}</td>
                          <td className="num" data-label="صادر">{Number(row.outgoing) ? money(row.outgoing) : '—'}</td>
                          <td className="num strong" data-label="الرصيد">{money(row.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="account-statement-totals">
                  <p><span>إجمالي الوارد:</span><strong>{money(cashStatementRows[0].total_incoming)}</strong></p>
                  <p><span>إجمالي الصادر:</span><strong>{money(cashStatementRows[0].total_outgoing)}</strong></p>
                  <p><span>رصيد آخر المدة:</span><strong>{money(cashStatementRows[cashStatementRows.length - 1].running_balance)}</strong></p>
                </div>
              </>
            )}
            {!cashStatementRows.length && !cashStatementLoading && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
          </div>
        </Modal>
      )}

      {itemStatementRow && (
        <Modal title="كشف حركة صنف" className="account-statement-modal" backdropClassName="statement-modal-backdrop" onClose={() => setItemStatementRow(null)}>
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div>
                <h2>كشف حركة صنف</h2>
                <strong>[{entityNumber('ITM', itemStatementRow.item_number)}] {itemStatementRow.item_code} — {itemStatementRow.item_name} ~ {itemStatementRow.unit}</strong>
                <p>{selectedWarehouse?.name ?? itemStatementRow.warehouse_name}</p>
              </div>
              <div className="account-statement-period">
                <label><span>من تاريخ</span><DateInput value={statementFrom} onChange={setStatementFrom} ariaLabel="من تاريخ" required /></label>
                <label><span>إلى تاريخ</span><DateInput value={statementTo} onChange={setStatementTo} ariaLabel="إلى تاريخ" required /></label>
              </div>
            </div>
            <div className="actions statement-actions print-hidden">
              <form onSubmit={loadItemStatement}>
                <button type="submit" className="btn primary" disabled={itemStatementLoading || !statementFrom || !statementTo}>
                  {itemStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {itemStatementRows.length > 0 && (
                <button type="button" className="btn" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Printer size={15} />
                  <span>طباعة / حفظ PDF</span>
                </button>
              )}
            </div>
            {itemStatementRows.length > 0 && (
              <>
                <div className="table-wrap responsive-table">
                  <table className="table account-statement-table">
                    <thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead>
                    <tbody>
                      {itemStatementRows.map((row, index) => (
                        <tr key={`${row.row_type}-${row.transaction_date}-${row.transfer_number ?? row.invoice_number ?? index}`} className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}>
                          <td className="num" data-label="التاريخ">{formatDate(row.transaction_date)}</td>
                          <td className="card-wide-cell" data-label="البيان">{row.description}</td>
                          <td className="num" data-label="وارد">{Number(row.incoming) ? formatQty(row.incoming) : '—'}</td>
                          <td className="num" data-label="صادر">{Number(row.outgoing) ? formatQty(row.outgoing) : '—'}</td>
                          <td className="num strong" data-label="الرصيد">{formatQty(row.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="account-statement-totals">
                  <p><span>إجمالي الوارد:</span><strong>{formatQty(itemStatementRows[0].total_incoming)} {itemStatementRow.unit}</strong></p>
                  <p><span>إجمالي الصادر:</span><strong>{formatQty(itemStatementRows[0].total_outgoing)} {itemStatementRow.unit}</strong></p>
                  <p><span>رصيد آخر المدة:</span><strong>{formatQty(itemStatementRows[itemStatementRows.length - 1].running_balance)} {itemStatementRow.unit}</strong></p>
                </div>
              </>
            )}
            {!itemStatementRows.length && !itemStatementLoading && <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

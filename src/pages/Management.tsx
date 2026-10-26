import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { entityNumber, money, qty as formatQty } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import type { AccountRow, CashBoxRow, StockOpeningRow, WarehouseOption } from '../lib/types';
import { useAccess } from '../lib/access';
import UserPermissions from '../components/UserPermissions';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { toast } from '../components/Toast';
import { matchesSearchQuery } from '../lib/search';

type ManagementTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes' | 'users';
type ManagementSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
const PAGE_SIZE = 20;

const MANAGEMENT_TABS: { id: ManagementTab; label: string; permission?: string }[] = [
  { id: 'customers', label: 'افتتاحيات العملاء', permission: 'management.customers.view' },
  { id: 'suppliers', label: 'افتتاحيات الموردين', permission: 'management.suppliers.view' },
  { id: 'items', label: 'افتتاحيات المخزون', permission: 'management.items.view' },
  { id: 'cashBoxes', label: 'افتتاحيات الخزن', permission: 'management.cashBoxes.view' },
  { id: 'users', label: 'المستخدمون والصلاحيات' },
];

const VALID_MANAGEMENT_TABS: ManagementTab[] = ['customers', 'suppliers', 'items', 'cashBoxes', 'users'];

export default function Management() {
  const { access, can } = useAccess();
  const visibleTabs = MANAGEMENT_TABS.filter((t) =>
    t.id === 'users' ? access?.role === 'owner' : can(t.permission!)
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ManagementTab | null;
  const initialTab = (tabParam && VALID_MANAGEMENT_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<ManagementTab>(initialTab);
  const canViewCurrentTab = tab === 'users' ? access?.role === 'owner' : can(`management.${tab}.view`);
  const canEditOpening = can(`management.${tab}.edit`);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [accountValues, setAccountValues] = useState<Record<string, string>>({});
  const [cashValues, setCashValues] = useState<Record<string, string>>({});
  const [stockValues, setStockValues] = useState<Record<string, { qty: string; cost: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  function setError(msg: string) { if (msg) toast.error(msg); }
  function setNotice(msg: string) { if (msg) toast.success(msg); }
  const [version, setVersion] = useState(0);

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<ManagementSort>('name-asc');
  const [page, setPage] = useState(1);

  // العناصر المحددة للوحة الجانبية
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedItemRow, setSelectedItemRow] = useState<StockOpeningRow | null>(null);
  const [selectedBox, setSelectedBox] = useState<CashBoxRow | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  useEffect(() => {
    const targetTab = (tabParam && VALID_MANAGEMENT_TABS.includes(tabParam)) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
      setSelectedAccount(null);
      setSelectedItemRow(null);
      setSelectedBox(null);
      setSearchTerm('');
      setPage(1);
    }
  }, [tabParam]);

  function switchTab(next: ManagementTab) {
    setTab(next);
    setSearchParams({ tab: next });
    setSelectedAccount(null);
    setSelectedItemRow(null);
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

  async function saveAccountsOpening(kind: 'customer' | 'supplier') {
    const list = accounts.filter((a) => a.kind === kind);
    const changed = list.filter((a) => Number(accountValues[a.id] ?? 0) !== Number(a.opening_balance));
    if (changed.length === 0) {
      setNotice(`لم يتم تعديل أي رصيد افتتاحي لـ ${kind === 'customer' ? 'العملاء' : 'الموردين'}.`);
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      for (const account of changed) {
        const opening = Number(accountValues[account.id] ?? 0);
        if (!Number.isFinite(opening)) {
          setError(`الرصيد الافتتاحي لحساب «${account.name}» غير صحيح.`);
          setSaving(false);
          return;
        }
        const { error: saveError } = await supabase.rpc('save_account', {
          p_account_id: account.id,
          p_name: account.name,
          p_kind: account.kind,
          p_phone: account.phone,
          p_is_active: account.is_active,
          p_opening_balance: opening,
        });
        if (saveError) throw new Error(saveError.message);
      }
      setNotice(`تم حفظ الأرصدة الافتتاحية بنجاح (${changed.length} حساب).`);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(translateDbError(errorMessage(err)));
    } finally {
      setSaving(false);
    }
  }

  async function saveCashAndStock(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    setError(''); setNotice('');
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

  const visibleAccounts = accounts.filter((account) => account.kind === (tab === 'customers' ? 'customer' : 'supplier'));

  // تصفية الحسابات
  const filteredAccounts = useMemo(() => {
    const list = visibleAccounts.filter((account) =>
      matchesSearchQuery([account.name, account.phone, account.serial_number], searchTerm),
    );
    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [visibleAccounts, searchTerm, sortOrder]);

  // تصفية المخزون
  const filteredStockRows = useMemo(() => {
    const list = stockRows.filter((row) => {
      const matchWarehouse = row.warehouse_id === selectedWarehouseId;
      const matchSearch = matchesSearchQuery([row.item_name, row.item_code, row.item_number], searchTerm);
      return matchWarehouse && matchSearch;
    });
    return list.sort((firstRow, secondRow) => {
      if (sortOrder === 'serial-desc') return secondRow.item_number - firstRow.item_number;
      if (sortOrder === 'serial-asc') return firstRow.item_number - secondRow.item_number;
      if (sortOrder === 'name-desc') return secondRow.item_name.localeCompare(firstRow.item_name, 'ar');
      return firstRow.item_name.localeCompare(secondRow.item_name, 'ar');
    });
  }, [stockRows, selectedWarehouseId, searchTerm, sortOrder]);

  // تصفية الخزن
  const filteredCashBoxes = useMemo(() => {
    const list = cashBoxes.filter((box) =>
      matchesSearchQuery([box.name, box.serial_number], searchTerm),
    );
    return list.sort((firstBox, secondBox) => {
      if (sortOrder === 'serial-desc') return secondBox.serial_number - firstBox.serial_number;
      if (sortOrder === 'serial-asc') return firstBox.serial_number - secondBox.serial_number;
      if (sortOrder === 'name-desc') return secondBox.name.localeCompare(firstBox.name, 'ar');
      return firstBox.name.localeCompare(secondBox.name, 'ar');
    });
  }, [cashBoxes, searchTerm, sortOrder]);

  const activeTotalCount =
    tab === 'customers' || tab === 'suppliers' ? filteredAccounts.length :
    tab === 'items' ? filteredStockRows.length :
    tab === 'cashBoxes' ? filteredCashBoxes.length : 0;

  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));

  const pageAccounts = filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageStock = filteredStockRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortOrder, selectedWarehouseId, tab]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const tabTitle =
    tab === 'customers' ? 'افتتاحيات العملاء' :
    tab === 'suppliers' ? 'افتتاحيات الموردين' :
    tab === 'items' ? 'افتتاحيات المخزون' :
    tab === 'cashBoxes' ? 'افتتاحيات الخزن' : 'المستخدمون والصلاحيات';

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
  const hasSelection = selectedAccount || selectedItemRow || selectedBox;

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    return <Navigate to={firstAllowedTab ? `/management?tab=${firstAllowedTab.id}` : '/access-denied'} replace />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
          <p className="muted">
            {tab === 'customers' || tab === 'suppliers'
              ? 'إدخال وتعديل الأرصدة الافتتاحية السابقة. حفظ أي تعديل يسجل تصحيحًا يحافظ على الحركات السابقة.'
              : tab === 'items'
              ? 'تحديد كمية البداية وتكلفة الوحدة للمخزون بكل مخزن.'
              : tab === 'cashBoxes'
              ? 'تسجيل الرصيد النقدي الفعلي الموجود في الخزن عند بدء العمل على النظام.'
              : 'إدارة المستخدمين وصلاحيات الدخول لصفحات وأقسام النظام.'}
          </p>
        </div>
        <div className="actions">
          {tab === 'customers' && canEditOpening && (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void saveAccountsOpening('customer')}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ أرصدة العملاء'}
            </button>
          )}
          {tab === 'suppliers' && canEditOpening && (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void saveAccountsOpening('supplier')}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ أرصدة الموردين'}
            </button>
          )}
          {tab === 'items' && canEditOpening && (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void saveCashAndStock()}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ أرصدة المخزون'}
            </button>
          )}
          {tab === 'cashBoxes' && canEditOpening && (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void saveCashAndStock()}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ أرصدة الخزن'}
            </button>
          )}
          {tab === 'users' && access?.role === 'owner' && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setIsInviteOpen(true)}
            >
              + دعوة موظف
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? 'tab active' : 'tab'}
            onClick={() => switchTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'users' && access?.role === 'owner' ? (
        <UserPermissions inviteOpen={isInviteOpen} onInviteOpenChange={setIsInviteOpen} />
      ) : loading ? (
        <div className="card empty">جارٍ التحميل…</div>
      ) : (
        <div className={hasSelection ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
          <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
            <div className="erp-toolbar">
              <div className="erp-filters">
                <label className="erp-search">
                  <span className="sr-only">البحث</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={
                      tab === 'customers' ? 'بحث باسم العميل أو الرقم…' :
                      tab === 'suppliers' ? 'بحث باسم المورد أو الرقم…' :
                      tab === 'items' ? 'بحث باسم الصنف أو كوده…' : 'بحث باسم الخزنة…'
                    }
                  />
                </label>

                {tab === 'items' && (
                  <SearchableSelect
                    ariaLabel="اختيار المخزن"
                    value={selectedWarehouseId}
                    options={[
                      { value: '', label: 'اختر المخزن' },
                      ...warehouses.map((wh) => ({
                        value: wh.id,
                        label: `${entityNumber('WH', wh.serial_number)} — ${wh.name}`,
                      })),
                    ]}
                    onChange={setSelectedWarehouseId}
                    searchPlaceholder="بحث عن مخزن…"
                  />
                )}
              </div>
            </div>

            <div className="erp-table-wrap">
              {(tab === 'customers' || tab === 'suppliers') && (
                <table className="table erp-table">
                  <thead>
                    <tr>
                      <SortableHeader
                        label="الرقم"
                        field="serial"
                        currentSort={sortOrder}
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                      />
                      <SortableHeader
                        label="الحساب"
                        field="name"
                        currentSort={sortOrder}
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                        defaultDirection="asc"
                      />
                      <th className="col-hide-on-detail">النوع</th>
                      <th className="num">الرصيد الافتتاحي</th>
                      <th className="num">الرصيد الحالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageAccounts.length === 0 && <tr><td colSpan={5} className="empty">{tab === 'customers' ? 'لا توجد حسابات عملاء تطابق البحث.' : 'لا توجد حسابات موردين تطابق البحث.'}</td></tr>}
                    {pageAccounts.map((account) => {
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
                          <td className="num strong">{entityNumber(tab === 'customers' ? 'CUS' : 'SUP', account.serial_number)}</td>
                          <td className="strong">{account.name}</td>
                          <td className="muted col-hide-on-detail">{account.kind === 'customer' ? 'عميل' : 'مورد'}</td>
                          <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="table-input num"
                              type="number"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={accountValues[account.id] ?? '0'}
                              onChange={(event) => setAccountValues((values) => ({ ...values, [account.id]: event.target.value }))}
                            />
                          </td>
                          <td className={`num strong ${Number(account.balance) > 0 ? 'remaining' : ''}`}>{money(account.balance)}</td>
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
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                      />
                      <th className="col-hide-on-detail">الكود</th>
                      <SortableHeader
                        label="الصنف"
                        field="name"
                        currentSort={sortOrder}
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                        defaultDirection="asc"
                      />
                      <th className="num">كمية البداية</th>
                      <th className="num">تكلفة الوحدة</th>
                      <th className="num">المتاح الآن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageStock.length === 0 && <tr><td colSpan={6} className="empty">{warehouses.length === 0 ? 'أضف المخازن والأصناف أولًا.' : !selectedWarehouseId ? 'اختر مخزنًا لعرض أصنافه.' : 'لا توجد أصناف تطابق البحث في هذا المخزن.'}</td></tr>}
                    {pageStock.map((row) => {
                      const key = `${row.warehouse_id}:${row.item_id}`;
                      const value = stockValues[key] ?? { qty: String(row.opening_qty), cost: String(row.unit_cost) };
                      const isSelected = selectedItemRow?.item_id === row.item_id && selectedItemRow?.warehouse_id === row.warehouse_id;
                      return (
                        <tr
                          key={key}
                          className={isSelected ? 'selected' : ''}
                          tabIndex={0}
                          onClick={() => setSelectedItemRow(row)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItemRow(row); }
                          }}
                        >
                          <td className="num strong">{entityNumber('ITM', row.item_number)}</td>
                          <td className="num col-hide-on-detail">{row.item_code}</td>
                          <td className="strong">{row.item_name}</td>
                          <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="table-input num"
                              type="number"
                              min="0"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={value.qty}
                              onChange={(event) => setStockValues((values) => ({ ...values, [key]: { ...value, qty: event.target.value } }))}
                            />
                          </td>
                          <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="table-input num"
                              type="number"
                              min="0"
                              step="0.0001"
                              value={value.cost}
                              disabled={!canEditOpening || row.cost_locked}
                              onChange={(event) => setStockValues((values) => ({ ...values, [key]: { ...value, cost: event.target.value } }))}
                            />
                          </td>
                          <td className="num strong">{formatQty(row.current_qty)} {row.unit}</td>
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
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                      />
                      <SortableHeader
                        label="الخزنة"
                        field="name"
                        currentSort={sortOrder}
                        onSort={(s) => setSortOrder(s as ManagementSort)}
                        defaultDirection="asc"
                      />
                      <th className="num">الرصيد الافتتاحي</th>
                      <th className="num">الرصيد الحالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageBoxes.length === 0 && <tr><td colSpan={4} className="empty">لا توجد خزن تطابق البحث.</td></tr>}
                    {pageBoxes.map((box) => {
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
                          <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="table-input num"
                              type="number"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={cashValues[box.id] ?? '0'}
                              onChange={(event) => setCashValues((values) => ({ ...values, [box.id]: event.target.value }))}
                            />
                          </td>
                          <td className="num strong remaining">{money(box.balance)}</td>
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

          {/* اللوحة الجانبية للتفاصيل وإجراءات الحفظ */}
          <aside className={hasSelection ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل الرصيد الافتتاحي">
            {selectedAccount ? (
              <>
                <div className="erp-detail-head">
                  <div>
                    <span>{selectedAccount.kind === 'customer' ? 'افتتاحي عميل' : 'افتتاحي مورد'}</span>
                    <h2>{selectedAccount.name}</h2>
                  </div>
                  <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedAccount(null)}>
                    <X size={18} />
                  </button>
                </div>

                <dl className="erp-detail-summary">
                  <div><dt>الرقم</dt><dd className="num">{entityNumber(selectedAccount.kind === 'customer' ? 'CUS' : 'SUP', selectedAccount.serial_number)}</dd></div>
                  <div><dt>الهاتف</dt><dd className="num">{selectedAccount.phone || '—'}</dd></div>
                  <div><dt>الرصيد الفعلي الحالي</dt><dd className="num strong">{money(selectedAccount.balance)}</dd></div>
                </dl>

                <div className="erp-detail-totals">
                  <span>الرصيد الافتتاحي</span>
                  <strong className="num remaining">{money(Number(accountValues[selectedAccount.id] ?? selectedAccount.opening_balance))}</strong>
                </div>

                <p className="hint">
                  {selectedAccount.kind === 'customer'
                    ? 'للعميل: المبلغ الموجب يعني رصيد مستحق عليه (مدين)، والسالب يعني رصيد لصالحه (دائن).'
                    : 'للمورد: المبلغ الموجب يعني رصيد مستحق له (دائن)، والسالب يعني رصيد لصالحك عنده (مدين).'}
                </p>

                {selectedAccount.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedAccount.notes}</p>}
              </>
            ) : selectedItemRow ? (
              <>
                <div className="erp-detail-head">
                  <div>
                    <span>افتتاحي المخزون</span>
                    <h2>{selectedItemRow.item_name}</h2>
                  </div>
                  <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedItemRow(null)}>
                    <X size={18} />
                  </button>
                </div>

                <dl className="erp-detail-summary">
                  <div><dt>رقم الصنف</dt><dd className="num">{entityNumber('ITM', selectedItemRow.item_number)}</dd></div>
                  <div><dt>كود الصنف</dt><dd className="num">{selectedItemRow.item_code}</dd></div>
                  <div><dt>المخزن</dt><dd>{selectedWarehouse?.name || selectedItemRow.warehouse_name}</dd></div>
                  <div><dt>الرصيد المتاح حاليًا</dt><dd className="num strong">{formatQty(selectedItemRow.current_qty)} {selectedItemRow.unit}</dd></div>
                </dl>

                <div className="erp-detail-totals">
                  <span>كمية البداية</span>
                  <strong className="num">{formatQty(Number(stockValues[`${selectedItemRow.warehouse_id}:${selectedItemRow.item_id}`]?.qty ?? selectedItemRow.opening_qty))} {selectedItemRow.unit}</strong>
                  <span>تكلفة الوحدة</span>
                  <strong className="num">{money(Number(stockValues[`${selectedItemRow.warehouse_id}:${selectedItemRow.item_id}`]?.cost ?? selectedItemRow.unit_cost))}</strong>
                </div>

                {selectedItemRow.cost_locked && (
                  <p className="hint">تكلفة البداية مقفولة لوجود حركات سابقة لحماية حسابات الأرباح، ويمكنك تعديل كمية البداية كتصحيح مخزني.</p>
                )}
              </>
            ) : selectedBox ? (
              <>
                <div className="erp-detail-head">
                  <div>
                    <span>افتتاحي الخزنة</span>
                    <h2>{selectedBox.name}</h2>
                  </div>
                  <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedBox(null)}>
                    <X size={18} />
                  </button>
                </div>

                <dl className="erp-detail-summary">
                  <div><dt>رقم الخزنة</dt><dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd></div>
                  <div><dt>النوع</dt><dd>{selectedBox.is_primary ? 'الخزنة الرئيسية' : 'خزنة فرعية'}</dd></div>
                  <div><dt>الرصيد الفعلي الحالي</dt><dd className="num strong">{money(selectedBox.balance)}</dd></div>
                </dl>

                <div className="erp-detail-totals">
                  <span>الرصيد الافتتاحي</span>
                  <strong className="num remaining">{money(Number(cashValues[selectedBox.id] ?? selectedBox.opening_balance))}</strong>
                </div>
              </>
            ) : (
              <div className="erp-detail-empty">
                <strong>اختر بندًا</strong>
                <span>اضغط على أي سطر لمراجعة رصيده الافتتاحي والفعلي.</span>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

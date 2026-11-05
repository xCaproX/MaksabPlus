import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  X,
  Users,
  ShoppingBag,
  Boxes,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Wallet,
  DollarSign,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import Modal from '../components/Modal';
import KpiBar, { type KpiItem } from '../components/KpiBar';
import { supabase } from '../lib/supabase';
import { entityNumber, getBalanceStatus, money, qty as formatQty } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import type { AccountRow, CashBoxRow, StockOpeningRow } from '../lib/types';
import { useAccess } from '../lib/access';
import UserPermissions from '../components/UserPermissions';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { toast } from '../components/Toast';
import { matchesSearchQuery } from '../lib/search';
import { useMasterData } from '../context/MasterDataContext';

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

  const { accounts: rawAccounts, cashBoxes, stockRows, warehouses: rawWarehouses, loading, refresh } = useMasterData();
  const accounts = useMemo(() => rawAccounts.filter((account) => account.system_key === null), [rawAccounts]);
  const warehouses = useMemo(() => rawWarehouses.filter((w) => w.is_active !== false), [rawWarehouses]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [accountValues, setAccountValues] = useState<Record<string, string>>({});
  const [cashValues, setCashValues] = useState<Record<string, string>>({});
  const [stockValues, setStockValues] = useState<Record<string, { qty: string; cost: string }>>({});
  const [saving, setSaving] = useState(false);
  function setError(msg: string) { if (msg) toast.error(msg); }
  function setNotice(msg: string) { if (msg) toast.success(msg); }
  
  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [selectedWarehouseId, warehouses]);

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<ManagementSort>('name-asc');
  const [page, setPage] = useState(1);

  // العناصر المحددة للوحة الجانبية
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedItemRow, setSelectedItemRow] = useState<StockOpeningRow | null>(null);
  const [selectedBox, setSelectedBox] = useState<CashBoxRow | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileModal, setReconcileModal] = useState<{
    isOpen: boolean;
    accountsCount: number;
    cashBoxesCount: number;
    discrepancies: Array<{
      entity_type: string;
      entity_id: string;
      entity_name: string;
      old_balance: number;
      reconciled_balance: number;
      discrepancy: number;
    }>;
  } | null>(null);

  async function handleReconcileBalances() {
    setIsReconciling(true);
    try {
      const { data, error } = await supabase.rpc('reconcile_all_balances');
      if (error) throw error;
      await refresh();
      const discrepancies = (data || []) as Array<{
        entity_type: string;
        entity_id: string;
        entity_name: string;
        old_balance: number;
        reconciled_balance: number;
        discrepancy: number;
      }>;
      setReconcileModal({
        isOpen: true,
        accountsCount: accounts.length,
        cashBoxesCount: cashBoxes.length,
        discrepancies,
      });
      if (discrepancies.length === 0) {
        toast.success('تم فحص كافة الأرصدة بنجاح، وجميعها متطابقة تماماً مع الدفاتر');
      } else {
        toast.warning(`تم تصحيح فروقات في ${discrepancies.length} رصيد`);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setIsReconciling(false);
    }
  }

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
  }, [tabParam, tab]);

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
    setAccountValues(Object.fromEntries(accounts.map((account) => [account.id, String(Number(account.opening_balance))])));
    setCashValues(Object.fromEntries(cashBoxes.map((box) => [box.id, String(Number(box.opening_balance))])));
    setStockValues(Object.fromEntries(stockRows.map((row) => [`${row.warehouse_id}:${row.item_id}`, { qty: String(Number(row.opening_qty)), cost: String(Number(row.unit_cost)) }])));
  }, [accounts, cashBoxes, stockRows]);

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
            void refresh();
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
    else { setNotice('تم حفظ الأرصدة الافتتاحية والتعديلات'); void refresh(); }
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

  const kpiItems = useMemo<KpiItem[]>(() => {
    if (tab === 'customers') {
      const totalOpening = filteredAccounts.reduce((sum, a) => sum + Number(accountValues[a.id] ?? a.opening_balance ?? 0), 0);
      const debitTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val > 0 ? sum + val : sum;
      }, 0);
      const creditTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val < 0 ? sum + Math.abs(val) : sum;
      }, 0);
      const withOpening = filteredAccounts.filter((a) => Number(accountValues[a.id] ?? a.opening_balance ?? 0) !== 0).length;

      return [
        {
          id: 'mgmt-cus-net',
          label: 'صافي افتتاحيات العملاء',
          value: money(totalOpening),
          unit: 'ج.م',
          variant: totalOpening > 0 ? 'primary' : 'neutral',
          icon: Users,
        },
        {
          id: 'mgmt-cus-debit',
          label: 'إجمالي مدين لنا',
          value: money(debitTotal),
          unit: 'ج.م',
          variant: debitTotal > 0 ? 'warning' : 'neutral',
          icon: AlertCircle,
        },
        {
          id: 'mgmt-cus-credit',
          label: 'إجمالي دائن علينا',
          value: money(creditTotal),
          unit: 'ج.م',
          variant: creditTotal > 0 ? 'info' : 'neutral',
          icon: Wallet,
        },
        {
          id: 'mgmt-cus-with-opening',
          label: 'عملاء برصيد افتتاحي',
          value: withOpening,
          unit: 'عميل',
          variant: 'neutral',
          icon: CheckCircle2,
          subtext: `من إجمالي ${filteredAccounts.length} عميل`,
        },
      ];
    }

    if (tab === 'suppliers') {
      const totalOpening = filteredAccounts.reduce((sum, a) => sum + Number(accountValues[a.id] ?? a.opening_balance ?? 0), 0);
      const payableTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val > 0 ? sum + val : sum;
      }, 0);
      const advanceTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val < 0 ? sum + Math.abs(val) : sum;
      }, 0);
      const withOpening = filteredAccounts.filter((a) => Number(accountValues[a.id] ?? a.opening_balance ?? 0) !== 0).length;

      return [
        {
          id: 'mgmt-sup-net',
          label: 'صافي افتتاحيات الموردين',
          value: money(totalOpening),
          unit: 'ج.م',
          variant: totalOpening > 0 ? 'danger' : 'neutral',
          icon: ShoppingBag,
        },
        {
          id: 'mgmt-sup-payable',
          label: 'مستحق للموردين (علينا)',
          value: money(payableTotal),
          unit: 'ج.م',
          variant: payableTotal > 0 ? 'danger' : 'neutral',
          icon: AlertCircle,
        },
        {
          id: 'mgmt-sup-advance',
          label: 'مدفوع مقدمًا (لنا)',
          value: money(advanceTotal),
          unit: 'ج.م',
          variant: advanceTotal > 0 ? 'info' : 'neutral',
          icon: Wallet,
        },
        {
          id: 'mgmt-sup-with-opening',
          label: 'موردون برصيد افتتاحي',
          value: withOpening,
          unit: 'مورد',
          variant: 'neutral',
          icon: CheckCircle2,
          subtext: `من إجمالي ${filteredAccounts.length} مورد`,
        },
      ];
    }

    if (tab === 'items') {
      const totalOpeningQty = filteredStockRows.reduce((sum, row) => {
        const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
        return sum + Number(val?.qty ?? row.opening_qty ?? 0);
      }, 0);
      const totalOpeningValue = filteredStockRows.reduce((sum, row) => {
        const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
        const qty = Number(val?.qty ?? row.opening_qty ?? 0);
        const cost = Number(val?.cost ?? row.unit_cost ?? 0);
        return sum + qty * cost;
      }, 0);
      const withOpening = filteredStockRows.filter((row) => {
        const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
        return Number(val?.qty ?? row.opening_qty ?? 0) > 0;
      }).length;

      return [
        {
          id: 'mgmt-items-qty',
          label: 'إجمالي كميات أول المدة',
          value: formatQty(totalOpeningQty),
          unit: 'وحدة',
          variant: 'primary',
          icon: Boxes,
        },
        {
          id: 'mgmt-items-val',
          label: 'قيمة بضاعة أول المدة',
          value: money(totalOpeningValue),
          unit: 'ج.م',
          variant: 'info',
          icon: DollarSign,
        },
        {
          id: 'mgmt-items-with-qty',
          label: 'أصناف برصيد أول مدة',
          value: withOpening,
          unit: 'صنف',
          variant: 'success',
          icon: CheckCircle2,
        },
        {
          id: 'mgmt-items-count',
          label: 'عدد الأصناف المعروضة',
          value: filteredStockRows.length,
          unit: 'صنف',
          variant: 'neutral',
          icon: FileText,
        },
      ];
    }

    if (tab === 'cashBoxes') {
      const totalOpening = filteredCashBoxes.reduce((sum, box) => sum + Number(cashValues[box.id] ?? box.opening_balance ?? 0), 0);
      return [
        {
          id: 'mgmt-box-total',
          label: 'إجمالي رصيد الخزن الافتتاحي',
          value: money(totalOpening),
          unit: 'ج.م',
          variant: 'success',
          icon: Wallet,
        },
        {
          id: 'mgmt-box-count',
          label: 'عدد الخزن المتاحة',
          value: filteredCashBoxes.length,
          unit: 'خزينة',
          variant: 'neutral',
          icon: Landmark,
        },
      ];
    }

    return [];
  }, [tab, filteredAccounts, accountValues, filteredStockRows, stockValues, filteredCashBoxes, cashValues]);

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
        </div>
        <div className="actions">
          {access?.role === 'owner' && (
            <button
              type="button"
              className="btn outline"
              disabled={isReconciling}
              onClick={() => void handleReconcileBalances()}
            >
              <ShieldCheck size={16} />
              <span>{isReconciling ? 'جارٍ فحص الأرصدة…' : 'فحص ومطابقة الأرصدة'}</span>
            </button>
          )}
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
        <>
          <KpiBar items={kpiItems} ariaLabel={`مؤشرات ${tabTitle}`} />
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
                              className="table-input num no-spinner"
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={accountValues[account.id] ?? '0'}
                              onFocus={(event) => event.target.select()}
                              onChange={(event) => setAccountValues((values) => ({ ...values, [account.id]: event.target.value }))}
                            />
                          </td>
                          <td className="num">
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
                              {(() => {
                                const status = getBalanceStatus(account.balance, account.kind);
                                return (
                                  <span className={`status-badge-mini status-${status.type}`}>
                                    {status.text}
                                  </span>
                                );
                              })()}
                              <strong dir="ltr" className={`tabular-nums ${Number(account.balance) > 0 ? 'remaining' : ''}`}>
                                {money(Math.abs(Number(account.balance || 0)))}
                              </strong>
                            </div>
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
                              className="table-input num no-spinner"
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              min="0"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={value.qty}
                              onFocus={(event) => event.target.select()}
                              onChange={(event) => setStockValues((values) => ({ ...values, [key]: { ...value, qty: event.target.value } }))}
                            />
                          </td>
                          <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="table-input num no-spinner"
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              min="0"
                              step="0.0001"
                              value={value.cost}
                              disabled={!canEditOpening || row.cost_locked}
                              onFocus={(event) => event.target.select()}
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
                              className="table-input num no-spinner"
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              step="0.0001"
                              disabled={!canEditOpening}
                              value={cashValues[box.id] ?? '0'}
                              onFocus={(event) => event.target.select()}
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
                  <div>
                    <dt>الرصيد الفعلي الحالي</dt>
                    <dd className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      {(() => {
                        const status = getBalanceStatus(selectedAccount.balance, selectedAccount.kind);
                        return (
                          <span className={`status-badge-mini status-${status.type}`}>
                            {status.text}
                          </span>
                        );
                      })()}
                      <strong dir="ltr" className="tabular-nums">
                        {money(Math.abs(Number(selectedAccount.balance || 0)))}
                      </strong>
                    </dd>
                  </div>
                </dl>

                <div className="erp-detail-totals">
                  <span>الرصيد الافتتاحي</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {(() => {
                      const openingVal = Number(accountValues[selectedAccount.id] ?? selectedAccount.opening_balance);
                      const status = getBalanceStatus(openingVal, selectedAccount.kind);
                      return (
                        <span className={`status-badge-mini status-${status.type}`}>
                          {status.text}
                        </span>
                      );
                    })()}
                    <strong dir="ltr" className="num tabular-nums remaining">
                      {money(Math.abs(Number(accountValues[selectedAccount.id] ?? selectedAccount.opening_balance)))}
                    </strong>
                  </div>
                </div>

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
        </>
      )}

      {reconcileModal && (
        <Modal
          onClose={() => setReconcileModal(null)}
          title="نتيجة فحص ومطابقة الأرصدة"
        >
          <div className="stack gap-4">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.85rem' }}>حسابات مفحوصة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }} className="tabular-nums" dir="ltr">
                  <bdi>{reconcileModal.accountsCount}</bdi>
                </div>
              </div>
              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.85rem' }}>خزن مفحوصة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }} className="tabular-nums" dir="ltr">
                  <bdi>{reconcileModal.cashBoxesCount}</bdi>
                </div>
              </div>
              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.85rem' }}>فروقات تم تصحيحها</div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: reconcileModal.discrepancies.length > 0 ? '#d97706' : '#10b981',
                  }}
                  className="tabular-nums"
                  dir="ltr"
                >
                  <bdi>{reconcileModal.discrepancies.length}</bdi>
                </div>
              </div>
            </div>

            {reconcileModal.discrepancies.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'var(--color-success-subtle, #ecfdf5)',
                  border: '1px solid var(--color-success-border, #a7f3d0)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <CheckCircle2 style={{ color: '#059669', flexShrink: 0 }} size={24} />
                <div>
                  <div style={{ fontWeight: 600, color: '#065f46' }}>الأرصدة متطابقة 100%</div>
                  <div style={{ fontSize: '0.875rem', color: '#047857' }}>
                    كافة أرصدة العملاء والموردين والخزن مطابقة تماماً لحركات الدفاتر ولا توجد أي فروقات.
                  </div>
                </div>
              </div>
            ) : (
              <div className="stack gap-2">
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #6b7280)' }}>
                  تم اكتشاف الفروقات التالية وتمت إعادة مزامنتها تلقائياً لتطابق الدفاتر:
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>النوع</th>
                        <th>الاسم</th>
                        <th>الرصيد السابق</th>
                        <th>الرصيد بعد المطابقة</th>
                        <th>مقدار التعديل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconcileModal.discrepancies.map((item) => (
                        <tr key={item.entity_id}>
                          <td>{item.entity_type === 'cash_box' ? 'خزينة' : 'حساب'}</td>
                          <td style={{ fontWeight: 600 }}>{item.entity_name}</td>
                          <td className="tabular-nums" dir="ltr">
                            <bdi>{money(item.old_balance)} ج.م</bdi>
                          </td>
                          <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600 }}>
                            <bdi>{money(item.reconciled_balance)} ج.م</bdi>
                          </td>
                          <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600, color: '#d97706' }}>
                            <bdi>{item.discrepancy > 0 ? `+${money(item.discrepancy)}` : money(item.discrepancy)} ج.م</bdi>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="actions" style={{ justifyContent: 'flex-end', marginBlockStart: '1rem' }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => setReconcileModal(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

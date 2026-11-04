import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDate, money } from '../lib/format';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import CashBoxTransferForm from '../components/CashBoxTransferForm';
import ReceiptForm from '../components/ReceiptForm';
import ConfirmDialog from '../components/ConfirmDialog';
import DateInput from '../components/DateInput';
import StatusBadge from '../components/StatusBadge';
import RowActions from '../components/RowActions';
import SortableHeader from '../components/SortableHeader';
import KpiBar, { type KpiItem } from '../components/KpiBar';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  ShoppingBag,
  DollarSign,
  FileText,
} from 'lucide-react';
import { toast } from '../components/Toast';
import type {
  ReceiptDirection,
  ReceiptRow,
  CashBoxTransferRow,
} from '../lib/types';
import { useAccess } from '../lib/access';
import { useConfirmDialog } from '../lib/useConfirmDialog';
import { matchesSearchQuery } from '../lib/search';
import { useMasterData } from '../context/MasterDataContext';

function linkKind(kind: ReceiptRow['invoice_kind']) {
  return kind === 'sale_return' || kind === 'purchase_return' ? 'مرتجع' : 'فاتورة';
}

type ReceiptSort =
  | 'date-desc'
  | 'date-asc'
  | 'number-desc'
  | 'number-asc'
  | 'amount-desc'
  | 'amount-asc'
  | 'account-asc'
  | 'account-desc';
const PAGE_SIZE = 20;

const VALID_RECEIPT_TABS = ['in', 'out', 'cash_box_transfer'] as const;
type ReceiptTab = typeof VALID_RECEIPT_TABS[number];
const RECEIPT_TABS = [
  { value: 'in', label: 'إيصالات استلام' },
  { value: 'out', label: 'إيصالات صرف' },
  { value: 'cash_box_transfer', label: 'تحويل بين الخزن' },
] as const;

export default function Receipts() {
  const { can } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ReceiptTab | null;
  const initialTab: ReceiptTab = (tabParam && VALID_RECEIPT_TABS.includes(tabParam)) ? tabParam : 'in';
  const [tab, setTab] = useState<ReceiptDirection | 'cash_box_transfer'>(initialTab);
  const [direction, setDirection] = useState<ReceiptDirection>(initialTab === 'cash_box_transfer' ? 'in' : initialTab);

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [transferRows, setTransferRows] = useState<CashBoxTransferRow[]>([]);
  const { accounts: rawAccounts, cashBoxes, refresh } = useMasterData();
  const accounts = useMemo(() => rawAccounts.filter((a) => a.is_active), [rawAccounts]);
  const [loading, setLoading] = useState(true);
  function setError(msg: string) {
    if (msg) toast.error(msg);
  }
  function setNotice(msg: string) {
    if (msg) toast.success(msg);
  }

  // حالة النافذة المنبثقة الموحدة (عرض، تعديل، إنشاء)
  const [formOpen, setFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const openedFromViewRef = useRef(false);
  const openedTransferFromViewRef = useRef(false);

  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<CashBoxTransferRow | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [version, setVersion] = useState(0);
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [cashBoxFilter, setCashBoxFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<ReceiptSort>('date-desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const targetTab = (tabParam && VALID_RECEIPT_TABS.includes(tabParam)) ? tabParam : 'in';
    if (targetTab !== tab) {
      setTab(targetTab);
      if (targetTab === 'in' || targetTab === 'out') {
        setDirection(targetTab);
        resetForm();
      } else {
        resetForm();
      }
      setFormOpen(false);
      setEditing(null);
      setEditingTransfer(null);
      setSearchTerm('');
      setCashBoxFilter('all');
      setDateFrom('');
      setDateTo('');
      setPage(1);
    }
  }, [tabParam]);

  const isCashBoxTransfer = tab === 'cash_box_transfer';
  const isIn = direction === 'in';
  const visibleTabs = RECEIPT_TABS.filter((item) => can(`money.${item.value}.view`));
  const canViewCurrentTab = can(`money.${tab}.view`);

  const tabTitle = isCashBoxTransfer ? 'تحويلات الخزن' : isIn ? 'إيصالات الاستلام' : 'إيصالات الصرف';

  // تصفية إيصالات القبض والصرف
  const filteredReceiptRows = useMemo(() => {
    if (isCashBoxTransfer) return [];
    const next = rows.filter((receipt) => {
      const matchesText = matchesSearchQuery(
        [receipt.number, receipt.account_name, receipt.cash_box_name, receipt.statement, receipt.notes],
        searchTerm,
      );
      const matchesCashBox = cashBoxFilter === 'all' || receipt.cash_box_id === cashBoxFilter;
      const matchesFrom = !dateFrom || receipt.receipt_date >= dateFrom;
      const matchesTo = !dateTo || receipt.receipt_date <= dateTo;
      return matchesText && matchesCashBox && matchesFrom && matchesTo;
    });
    return next.sort((firstReceipt, secondReceipt) => {
      if (sortOrder === 'amount-desc') return Number(secondReceipt.amount) - Number(firstReceipt.amount);
      if (sortOrder === 'amount-asc') return Number(firstReceipt.amount) - Number(secondReceipt.amount);
      if (sortOrder === 'number-desc') return secondReceipt.number.localeCompare(firstReceipt.number, undefined, { numeric: true });
      if (sortOrder === 'number-asc') return firstReceipt.number.localeCompare(secondReceipt.number, undefined, { numeric: true });
      if (sortOrder === 'account-desc') return (secondReceipt.account_name || '').localeCompare(firstReceipt.account_name || '', 'ar');
      if (sortOrder === 'account-asc') return (firstReceipt.account_name || '').localeCompare(secondReceipt.account_name || '', 'ar');
      const comparison = firstReceipt.receipt_date.localeCompare(secondReceipt.receipt_date) || firstReceipt.number.localeCompare(secondReceipt.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [rows, isCashBoxTransfer, searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder]);

  // تصفية تحويلات الخزن
  const filteredTransferRows = useMemo(() => {
    if (!isCashBoxTransfer) return [];
    const next = transferRows.filter((transfer) => {
      const matchesText = matchesSearchQuery(
        [transfer.number, transfer.source_cash_box_name, transfer.destination_cash_box_name, transfer.notes],
        searchTerm,
      );
      const matchesCashBox =
        cashBoxFilter === 'all' ||
        transfer.source_cash_box_id === cashBoxFilter ||
        transfer.destination_cash_box_id === cashBoxFilter;
      const matchesFrom = !dateFrom || transfer.transfer_date >= dateFrom;
      const matchesTo = !dateTo || transfer.transfer_date <= dateTo;
      return matchesText && matchesCashBox && matchesFrom && matchesTo;
    });
    return next.sort((firstTransfer, secondTransfer) => {
      if (sortOrder === 'amount-desc') return Number(secondTransfer.amount) - Number(firstTransfer.amount);
      if (sortOrder === 'amount-asc') return Number(firstTransfer.amount) - Number(secondTransfer.amount);
      if (sortOrder === 'number-desc') return secondTransfer.number.localeCompare(firstTransfer.number, undefined, { numeric: true });
      if (sortOrder === 'number-asc') return firstTransfer.number.localeCompare(secondTransfer.number, undefined, { numeric: true });
      const comparison = firstTransfer.transfer_date.localeCompare(secondTransfer.transfer_date) || firstTransfer.number.localeCompare(secondTransfer.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [transferRows, isCashBoxTransfer, searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder]);

  // عدد السجلات المعروضة والصفحات
  const activeTotalCount = isCashBoxTransfer ? filteredTransferRows.length : filteredReceiptRows.length;
  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));

  const pageReceipts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredReceiptRows.slice(start, start + PAGE_SIZE);
  }, [filteredReceiptRows, page]);

  const pageTransfers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTransferRows.slice(start, start + PAGE_SIZE);
  }, [filteredTransferRows, page]);

  const kpiItems = useMemo<KpiItem[]>(() => {
    if (isCashBoxTransfer) {
      const totalAmount = filteredTransferRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return [
        {
          id: 'cash-transfer-total',
          label: 'إجمالي المبالغ المحولة',
          value: money(totalAmount),
          unit: 'ج.م',
          variant: 'primary',
          icon: ArrowLeftRight,
        },
        {
          id: 'cash-transfer-count',
          label: 'عدد التحويلات بين الخزن',
          value: filteredTransferRows.length,
          unit: 'تحويل',
          variant: 'neutral',
          icon: FileText,
        },
      ];
    }

    const totalAmount = filteredReceiptRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const invoiceLinked = filteredReceiptRows.reduce(
      (sum, r) => (r.invoice_id ? sum + Number(r.amount || 0) : sum),
      0,
    );
    const freeAmount = totalAmount - invoiceLinked;
    const count = filteredReceiptRows.length;

    if (isIn) {
      return [
        {
          id: 'receipt-in-total',
          label: 'إجمالي المقبوضات',
          value: money(totalAmount),
          unit: 'ج.م',
          variant: 'success',
          icon: ArrowDownLeft,
        },
        {
          id: 'receipt-in-invoice',
          label: 'تحصيل فواتير مبيعات',
          value: money(invoiceLinked),
          unit: 'ج.م',
          variant: 'primary',
          icon: CheckCircle2,
          subtext:
            totalAmount > 0 ? (
              <span>
                تمثل <bdi dir="ltr">{Math.round((invoiceLinked / totalAmount) * 100)}%</bdi> من الإجمالي
              </span>
            ) : undefined,
        },
        {
          id: 'receipt-in-free',
          label: 'مقبوضات عامة وحرة',
          value: money(freeAmount),
          unit: 'ج.م',
          variant: 'info',
          icon: DollarSign,
        },
        {
          id: 'receipt-in-count',
          label: 'عدد إيصالات الاستلام',
          value: count,
          unit: 'إيصال',
          variant: 'neutral',
          icon: FileText,
        },
      ];
    }

    // Direction: 'out'
    return [
      {
        id: 'receipt-out-total',
        label: 'إجمالي المدفوعات',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'danger',
        icon: ArrowUpRight,
      },
      {
        id: 'receipt-out-invoice',
        label: 'سداد فواتير موردين',
        value: money(invoiceLinked),
        unit: 'ج.م',
        variant: 'primary',
        icon: ShoppingBag,
        subtext:
          totalAmount > 0 ? (
            <span>
              تمثل <bdi dir="ltr">{Math.round((invoiceLinked / totalAmount) * 100)}%</bdi> من الإجمالي
            </span>
          ) : undefined,
      },
      {
        id: 'receipt-out-free',
        label: 'مصروفات ومدفوعات عامة',
        value: money(freeAmount),
        unit: 'ج.م',
        variant: 'warning',
        icon: DollarSign,
      },
      {
        id: 'receipt-out-count',
        label: 'عدد إيصالات الصرف',
        value: count,
        unit: 'إيصال',
        variant: 'neutral',
        icon: FileText,
      },
    ];
  }, [isCashBoxTransfer, filteredTransferRows, filteredReceiptRows, isIn]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder, tab]);

  useEffect(() => {
    let cancelled = false;
    async function fetchReceipts() {
      setLoading(true);
      setError('');
      try {
        if (!isCashBoxTransfer) {
          const query = showDeleted
            ? supabase.from('v_receipt_list').select('*').eq('direction', direction).not('deleted_at', 'is', null)
            : supabase.from('v_receipt_list').select('*').eq('direction', direction).is('deleted_at', null);
          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          if (!cancelled) setRows(data || []);
        } else {
          const query = showDeleted
            ? supabase.from('v_cash_box_transfer_list').select('*').not('deleted_at', 'is', null)
            : supabase.from('v_cash_box_transfer_list').select('*').is('deleted_at', null);
          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          if (!cancelled) setTransferRows(data || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(translateDbError(err?.message || 'فشل تحميل البيانات'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (canViewCurrentTab) {
      void fetchReceipts();
    }
    return () => {
      cancelled = true;
    };
  }, [tab, direction, isCashBoxTransfer, showDeleted, version, canViewCurrentTab]);

  function resetForm() {
    setEditing(null);
    setError('');
  }

  function switchDirection(next: ReceiptDirection) {
    if (next === tab) return;
    setDirection(next);
    setTab(next);
    setSearchParams({ tab: next });
    closeForm();
  }

  function switchToCashTransfer() {
    setTab('cash_box_transfer');
    setSearchParams({ tab: 'cash_box_transfer' });
    closeForm();
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    closeForm();
  }

  function openNew() {
    openedFromViewRef.current = false;
    openedTransferFromViewRef.current = false;
    if (isCashBoxTransfer) {
      setEditingTransfer(null);
      setEditing(null);
    } else {
      resetForm();
      setEditing(null);
      setEditingTransfer(null);
    }
    setModalMode('create');
    setFormOpen(true);
  }

  function openReceiptModal(receipt: ReceiptRow, mode: 'view' | 'edit' = 'view') {
    setError('');
    openedFromViewRef.current = mode === 'view';
    setEditing(receipt);
    setEditingTransfer(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  function openTransferModal(transfer: CashBoxTransferRow, mode: 'view' | 'edit' = 'view') {
    setError('');
    openedTransferFromViewRef.current = mode === 'view';
    setEditingTransfer(transfer);
    setEditing(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
    setEditing(null);
    setEditingTransfer(null);
    setModalMode('create');
    openedFromViewRef.current = false;
    openedTransferFromViewRef.current = false;
  }

  function handleCancel() {
    if (modalMode === 'edit' && openedFromViewRef.current) {
      setModalMode('view');
      return;
    }
    if (modalMode === 'edit' && openedTransferFromViewRef.current) {
      setModalMode('view');
      return;
    }
    closeForm();
  }

  async function handleSaved(message: string) {
    setNotice(message);
    setVersion((current) => current + 1);
    void refresh();

    // إذا كان الإيصال مفتوحاً من وضع العرض وتم تعديله، نعيده لوضع العرض مع تحديث البيانات فورياً
    if (modalMode === 'edit' && openedFromViewRef.current && editing) {
      const receiptId = editing.id;
      const { data, error: fetchErr } = await supabase
        .from('v_receipt_list')
        .select('*')
        .eq('id', receiptId)
        .maybeSingle();

      if (data && !fetchErr) {
        setEditing(data as ReceiptRow);
        setModalMode('view');
        return;
      }
    }

    // إذا كان تحويل الخزن مفتوحاً من وضع العرض وتم تعديله، نعيده لوضع العرض
    if (modalMode === 'edit' && openedTransferFromViewRef.current && editingTransfer) {
      const transferId = editingTransfer.id;
      const { data, error: fetchErr } = await supabase
        .from('v_cash_box_transfer_list')
        .select('*')
        .eq('id', transferId)
        .maybeSingle();

      if (data && !fetchErr) {
        setEditingTransfer(data as CashBoxTransferRow);
        setModalMode('view');
        return;
      }
    }

    closeForm();
  }

  async function remove(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `حذف الإيصال ${receipt.number}؟\n` +
        'سيُستثنى من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».',
      'حذف',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('delete_free_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم نقل الإيصال ${receipt.number} إلى المحذوفات`);
    if (editing?.id === receipt.id) {
      closeForm();
    }
    setVersion((current) => current + 1);
    void refresh();
  }

  async function restore(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `استعادة الإيصال ${receipt.number}؟\nسيُعاد تأثيره على رصيد الحساب والخزنة.`,
      'استعادة',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('restore_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم استعادة الإيصال ${receipt.number}`);
    setVersion((current) => current + 1);
    void refresh();
  }

  async function removeTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيعود الرصيد إلى الخزنة المصدر.`, 'حذف'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('delete_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    if (editingTransfer?.id === transfer.id) {
      closeForm();
    }
    setVersion((current) => current + 1);
    void refresh();
  }

  async function restoreTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة الخزن.`, 'استعادة'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('restore_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم استعادة التحويل ${transfer.number}`);
    setVersion((current) => current + 1);
    void refresh();
  }

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    if (firstAllowedTab) {
      return <Navigate to={`/receipts?tab=${firstAllowedTab.value}`} replace />;
    }
    return (
      <div className="erp-page" style={{ padding: '24px' }}>
        <p className="danger">عفواً، ليس لديك صلاحية عرض سندات القبض أو الصرف أو التحويلات.</p>
      </div>
    );
  }

  const newLabel = isCashBoxTransfer ? 'تحويل جديد بين الخزن' : `إيصال ${isIn ? 'استلام' : 'صرف'} جديد`;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{showDeleted ? `المحذوفات — ${tabTitle}` : tabTitle}</h1>
        </div>
        <div className="actions">
          {can(`money.${tab}.delete`) && (
            <button
              type="button"
              className="btn outline"
              onClick={toggleDeleted}
            >
              {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
            </button>
          )}
          {!showDeleted && can(`money.${tab}.create`) && (
            <button
              type="button"
              className="btn primary"
              onClick={openNew}
            >
              + {newLabel}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((item) => (
          <button
            key={item.value}
            type="button"
            className={tab === item.value ? 'tab active' : 'tab'}
            onClick={() => (item.value === 'cash_box_transfer' ? switchToCashTransfer() : switchDirection(item.value))}
          >
            {item.label}
          </button>
        ))}
      </div>

      {showDeleted && (
        <p className="hint">
          {isCashBoxTransfer
            ? 'التحويلات المحذوفة لا تؤثر على أرصدة الخزن.'
            : 'هذه الإيصالات محذوفة: لا تؤثر على الأرصدة أو الخزنة. إيصال الفاتورة يُستعاد من صفحة البضاعة مع فاتورته.'}
        </p>
      )}

      {/* شريط المؤشرات والإجماليات المتفاعل مع الفلاتر */}
      <KpiBar items={kpiItems} ariaLabel={`مؤشرات ${tabTitle}`} />

      {/* جدول المعاملات ممتد بكامل العرض 100% بتوافق تام مع فواتير المبيعات */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={isCashBoxTransfer ? 'بحث بالرقم أو الخزنة أو الملاحظات…' : 'بحث بالرقم أو الحساب أو البيان…'}
                />
              </label>

              <SearchableSelect
                ariaLabel="تصفية حسب الخزنة"
                value={cashBoxFilter}
                options={[
                  { value: 'all', label: 'كل الخزن' },
                  ...cashBoxes.map((box) => ({
                    value: box.id,
                    label: `${box.name}${!box.is_active ? ' — موقوفة' : ''}`,
                  })),
                ]}
                onChange={setCashBoxFilter}
                searchPlaceholder="بحث عن خزنة…"
              />

              <div className="erp-date-range">
                <div className="erp-date"><span>من</span><DateInput value={dateFrom} onChange={setDateFrom} ariaLabel="من تاريخ" /></div>
                <div className="erp-date"><span>إلى</span><DateInput value={dateTo} onChange={setDateTo} ariaLabel="إلى تاريخ" /></div>
              </div>
            </div>
          </div>

          <div className="erp-table-wrap">
            {isCashBoxTransfer ? (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="number"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                    />
                    <SortableHeader
                      label="التاريخ"
                      field="date"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                    />
                    <th>من خزنة</th>
                    <th>إلى خزنة</th>
                    <SortableHeader
                      label="المبلغ"
                      field="amount"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                      align="end"
                      className="num"
                    />
                    <th>ملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageTransfers.length === 0 && <tr><td colSpan={7} className="empty">لا توجد تحويلات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageTransfers.map((transfer) => {
                    return (
                      <tr
                        key={transfer.id}
                        tabIndex={0}
                        onClick={() => openTransferModal(transfer, 'view')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTransferModal(transfer, 'view');
                          }
                        }}
                      >
                        <td className="num strong">{transfer.number}</td>
                        <td className="num">{formatDate(transfer.transfer_date)}</td>
                        <td>{transfer.source_cash_box_name}</td>
                        <td>{transfer.destination_cash_box_name}</td>
                        <td className="num strong">{money(transfer.amount)}</td>
                        <td className="muted">{transfer.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                          {showDeleted ? (
                            can(`money.${tab}.delete`) && (
                              <RowActions
                                onRestore={() => void restoreTransfer(transfer)}
                                restoreLabel="استعادة التحويل"
                              />
                            )
                          ) : (
                            <RowActions
                              onEdit={can(`money.${tab}.edit`) ? () => openTransferModal(transfer, 'edit') : undefined}
                              onDelete={can(`money.${tab}.delete`) ? () => void removeTransfer(transfer) : undefined}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="number"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                    />
                    <SortableHeader
                      label="التاريخ"
                      field="date"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                    />
                    <SortableHeader
                      label="الحساب"
                      field="account"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                    />
                    <th>الخزنة</th>
                    <SortableHeader
                      label="المبلغ"
                      field="amount"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as ReceiptSort)}
                      align="end"
                      className="num"
                    />
                    <th>نوع الإيصال</th>
                    <th>البيان</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageReceipts.length === 0 && <tr><td colSpan={8} className="empty">لا توجد إيصالات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageReceipts.map((receipt) => {
                    return (
                      <tr
                        key={receipt.id}
                        tabIndex={0}
                        onClick={() => openReceiptModal(receipt, 'view')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openReceiptModal(receipt, 'view');
                          }
                        }}
                      >
                        <td className="num strong">{receipt.number}</td>
                        <td className="num">{formatDate(receipt.receipt_date)}</td>
                        <td>
                          {receipt.account_name}{' '}
                          <span className="muted">
                            ({receipt.account_kind === 'customer' ? 'عميل' : receipt.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                          </span>
                        </td>
                        <td>{receipt.cash_box_name}</td>
                        <td className="num strong">{money(receipt.amount)}</td>
                        <td>
                          {receipt.is_free ? (
                            <StatusBadge variant="free">إيصال حر</StatusBadge>
                          ) : (
                            <StatusBadge variant="linked">مرتبط بـ{linkKind(receipt.invoice_kind)}</StatusBadge>
                          )}
                        </td>
                        <td className="muted">{receipt.statement || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                          {showDeleted ? (
                            can(`money.${tab}.delete`) ? (
                              receipt.is_free ? (
                                <RowActions
                                  onRestore={() => void restore(receipt)}
                                  restoreLabel="استعادة الإيصال"
                                />
                              ) : (
                                <span className="muted" title="يُستعاد مع الفاتورة">مرتبط</span>
                              )
                            ) : null
                          ) : receipt.is_free ? (
                            <RowActions
                              onEdit={can(`money.${tab}.edit`) ? () => openReceiptModal(receipt, 'edit') : undefined}
                              onDelete={can(`money.${tab}.delete`) ? () => void remove(receipt) : undefined}
                            />
                          ) : (
                            <span className="muted" title={`يُعدَّل من داخل ${linkKind(receipt.invoice_kind)}`}>مرتبط</span>
                          )}
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
      </div>

      {/* نموذج الإضافة والتعديل والعرض الموحد بالكامل داخل النافذة المنبثقة */}
      {formOpen && (
        isCashBoxTransfer ? (
          <Modal
            className="transaction-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title={
              modalMode === 'view'
                ? `${showDeleted ? 'محذوف — ' : ''}تحويل بين الخزن ${editingTransfer?.number ?? ''}`
                : editingTransfer
                ? `تعديل التحويل ${editingTransfer.number}`
                : 'تحويل جديد بين الخزن'
            }
            onClose={closeForm}
          >
            <CashBoxTransferForm
              key={`${editingTransfer?.id ?? 'new-transfer'}-${modalMode}`}
              cashBoxes={cashBoxes}
              editing={editingTransfer}
              readOnly={modalMode === 'view'}
              onEdit={!showDeleted && can(`money.${tab}.edit`) ? () => setModalMode('edit') : undefined}
              onDelete={!showDeleted && can(`money.${tab}.delete`) && editingTransfer ? () => void removeTransfer(editingTransfer) : undefined}
              onRestore={
                showDeleted && can(`money.${tab}.delete`) && editingTransfer
                  ? async () => {
                      await restoreTransfer(editingTransfer);
                      closeForm();
                    }
                  : undefined
              }
              onPrint={() => window.print()}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </Modal>
        ) : (
          <Modal
            className="receipt-entry-modal"
            backdropClassName="receipt-entry-backdrop"
            title={
              modalMode === 'view'
                ? `${showDeleted ? 'محذوف — ' : ''}إيصال ${(editing?.direction ?? direction) === 'in' ? 'استلام' : 'صرف'} ${editing?.number ?? ''}`
                : editing
                ? `تعديل الإيصال ${editing.number}`
                : `إيصال ${isIn ? 'استلام' : 'صرف'} جديد`
            }
            onClose={closeForm}
          >
            <ReceiptForm
              key={`${editing?.id ?? 'new-receipt'}-${modalMode}`}
              direction={editing?.direction ?? direction}
              accounts={accounts}
              cashBoxes={cashBoxes}
              editing={editing}
              readOnly={modalMode === 'view'}
              onEdit={!showDeleted && can(`money.${tab}.edit`) && editing?.is_free ? () => setModalMode('edit') : undefined}
              onDelete={!showDeleted && can(`money.${tab}.delete`) && editing?.is_free && editing ? () => void remove(editing) : undefined}
              onRestore={
                showDeleted && can(`money.${tab}.delete`) && editing?.is_free && editing
                  ? async () => {
                      await restore(editing);
                      closeForm();
                    }
                  : undefined
              }
              onPrint={() => window.print()}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </Modal>
        )
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.confirmLabel === 'حذف'}
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </div>
  );
}

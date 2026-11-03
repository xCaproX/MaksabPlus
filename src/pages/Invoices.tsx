import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDate, money, qty as formatQty } from '../lib/format';
import { translateDbError } from '../lib/errors';
import InvoiceForm from '../components/InvoiceForm';
import WarehouseTransferForm from '../components/WarehouseTransferForm';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import DateInput from '../components/DateInput';
import StatusBadge from '../components/StatusBadge';
import RowActions from '../components/RowActions';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { toast } from '../components/Toast';
import type {
  InvoiceKind,
  InvoiceRow,
  LineDraft,
  WarehouseTransferLine,
  WarehouseTransferRow,
} from '../lib/types';
import { useAccess } from '../lib/access';
import { useConfirmDialog } from '../lib/useConfirmDialog';
import { matchesSearchQuery } from '../lib/search';
import { useMasterData } from '../context/MasterDataContext';

type InvoiceTab = InvoiceKind | 'warehouse_transfer';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

type SaleStatus = 'all' | 'paid' | 'partial' | 'unpaid';
type SaleSort =
  | 'date-desc'
  | 'date-asc'
  | 'number-desc'
  | 'number-asc'
  | 'total-desc'
  | 'total-asc'
  | 'account-asc'
  | 'account-desc'
  | 'remaining-desc'
  | 'remaining-asc';
const PAGE_SIZE = 20;

function saleStatus(invoice: InvoiceRow): Exclude<SaleStatus, 'all'> {
  if (Number(invoice.remaining) <= 0) return 'paid';
  if (Number(invoice.paid) > 0) return 'partial';
  return 'unpaid';
}

function saleStatusLabel(status: Exclude<SaleStatus, 'all'>, isReturn = false): string {
  if (isReturn) {
    return status === 'paid' ? 'مستردة بالكامل' : status === 'partial' ? 'مستردة جزئيًا' : 'غير مستردة';
  }
  return status === 'paid' ? 'مسددة' : status === 'partial' ? 'جزئية' : 'غير مسددة';
}

const VALID_INVOICE_TABS: InvoiceTab[] = ['sale', 'purchase', 'sale_return', 'purchase_return', 'waste', 'warehouse_transfer'];
const INVOICE_TABS = [
  { value: 'sale', label: 'فواتير المبيعات' },
  { value: 'purchase', label: 'فواتير المشتريات' },
  { value: 'sale_return', label: 'مرتجعات المبيعات' },
  { value: 'purchase_return', label: 'مرتجعات المشتريات' },
  { value: 'waste', label: 'الهالك' },
  { value: 'warehouse_transfer', label: 'تحويل بين مخازن' },
] as const;

export default function Invoices() {
  const { can, access } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as InvoiceTab | null;
  const initialKind = (tabParam && VALID_INVOICE_TABS.includes(tabParam)) ? tabParam : 'sale';
  const [kind, setKind] = useState<InvoiceTab>(initialKind);

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [transferRows, setTransferRows] = useState<WarehouseTransferRow[]>([]);
  const {
    accounts: rawAccounts,
    warehouses,
    items: rawItems,
    cashBoxes,
    stockRows,
    refresh,
  } = useMasterData();
  const accounts = useMemo(() => rawAccounts.filter((a) => a.is_active), [rawAccounts]);
  const items = useMemo(() => rawItems.filter((i) => i.is_active), [rawItems]);
  const [loading, setLoading] = useState(true);
  function setError(msg: string) {
    if (msg) toast.error(msg);
  }
  function setNotice(msg: string) {
    if (msg) toast.success(msg);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const openedFromViewRef = useRef(false);
  const openedTransferFromViewRef = useRef(false);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<(WarehouseTransferRow & { lines: WarehouseTransferLine[] }) | null>(null);
  const [version, setVersion] = useState(0);
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();
  const [showDeleted, setShowDeleted] = useState(false);

  // الفلاتر الموحدة
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<SaleSort>('date-desc');
  const [page, setPage] = useState(1);

  const isWarehouseTransfer = kind === 'warehouse_transfer';
  const invoiceKind = isWarehouseTransfer ? null : kind;
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const canViewProfit = access?.role === 'owner';
  const visibleTabs = INVOICE_TABS.filter((tab) => can(`goods.${tab.value}.view`));
  const canViewCurrentTab = can(`goods.${kind}.view`);

  useEffect(() => {
    const targetKind = (tabParam && VALID_INVOICE_TABS.includes(tabParam)) ? tabParam : 'sale';
    if (targetKind !== kind) {
      setKind(targetKind);
      setFormOpen(false);
      setEditing(null);
      setEditingTransfer(null);
      setSearchTerm('');
      setStatusFilter('all');
      setDateFrom('');
      setDateTo('');
      setPage(1);
    }
  }, [tabParam]);

  const newLabel = isWarehouseTransfer ? 'تحويل بين مخازن' :
    kind === 'waste'
      ? 'فاتورة هالك'
      : kind === 'sale'
      ? 'فاتورة مبيعات'
      : kind === 'purchase'
        ? 'فاتورة مشتريات'
        : kind === 'sale_return'
          ? 'مرتجع مبيعات'
          : 'مرتجع مشتريات';

  const tabTitle = isWarehouseTransfer ? 'تحويلات المخازن' :
    kind === 'waste'
      ? 'فواتير الهالك'
      : kind === 'sale'
      ? 'فواتير المبيعات'
      : kind === 'purchase'
        ? 'فواتير المشتريات'
        : kind === 'sale_return'
          ? 'مرتجعات المبيعات'
          : 'مرتجعات المشتريات';

  const partyHeader = kind === 'sale' || kind === 'sale_return' ? 'العميل' : kind === 'purchase' || kind === 'purchase_return' ? 'المورد' : 'الحساب';

  const formTitle = editingTransfer
    ? (modalMode === 'view' ? `تحويل بين مخازن — ${editingTransfer.number}` : `تعديل التحويل ${editingTransfer.number}`)
    : editing
    ? (modalMode === 'view'
        ? `${newLabel} — ${editing.invoice.number}`
        : `تعديل ${isReturn ? 'المرتجع' : 'الفاتورة'} ${editing.invoice.number}`)
    : `${newLabel} ${isWarehouseTransfer ? 'جديد' : 'جديدة'}`;

  // تصفية الفواتير
  const filteredInvoiceRows = useMemo(() => {
    if (isWarehouseTransfer) return [];
    const next = rows.filter((invoice) => {
      const matchesText = matchesSearchQuery(
        [invoice.number, invoice.account_name, invoice.warehouse_name],
        searchTerm,
      );
      const matchesStatus = kind === 'waste' || statusFilter === 'all' || saleStatus(invoice) === statusFilter;
      const matchesFrom = !dateFrom || invoice.invoice_date >= dateFrom;
      const matchesTo = !dateTo || invoice.invoice_date <= dateTo;
      return matchesText && matchesStatus && matchesFrom && matchesTo;
    });
    return next.sort((firstInvoice, secondInvoice) => {
      if (sortOrder === 'total-desc') return Number(secondInvoice.total) - Number(firstInvoice.total);
      if (sortOrder === 'total-asc') return Number(firstInvoice.total) - Number(secondInvoice.total);
      if (sortOrder === 'number-desc') return secondInvoice.number.localeCompare(firstInvoice.number, undefined, { numeric: true });
      if (sortOrder === 'number-asc') return firstInvoice.number.localeCompare(secondInvoice.number, undefined, { numeric: true });
      if (sortOrder === 'account-desc') return (secondInvoice.account_name || '').localeCompare(firstInvoice.account_name || '', 'ar');
      if (sortOrder === 'account-asc') return (firstInvoice.account_name || '').localeCompare(secondInvoice.account_name || '', 'ar');
      if (sortOrder === 'remaining-desc') return Number(secondInvoice.remaining) - Number(firstInvoice.remaining);
      if (sortOrder === 'remaining-asc') return Number(firstInvoice.remaining) - Number(secondInvoice.remaining);
      const comparison = firstInvoice.invoice_date.localeCompare(secondInvoice.invoice_date) || firstInvoice.number.localeCompare(secondInvoice.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [rows, isWarehouseTransfer, searchTerm, statusFilter, dateFrom, dateTo, sortOrder, kind]);

  // تصفية التحويلات المخزنية
  const filteredTransferRows = useMemo(() => {
    if (!isWarehouseTransfer) return [];
    const next = transferRows.filter((transfer) => {
      const matchesText = matchesSearchQuery(
        [transfer.number, transfer.source_warehouse_name, transfer.destination_warehouse_name, transfer.notes],
        searchTerm,
      );
      const matchesFrom = !dateFrom || transfer.transfer_date >= dateFrom;
      const matchesTo = !dateTo || transfer.transfer_date <= dateTo;
      return matchesText && matchesFrom && matchesTo;
    });
    return next.sort((firstTransfer, secondTransfer) => {
      if (sortOrder === 'total-desc') return Number(secondTransfer.total_value) - Number(firstTransfer.total_value);
      if (sortOrder === 'total-asc') return Number(firstTransfer.total_value) - Number(secondTransfer.total_value);
      if (sortOrder === 'number-desc') return secondTransfer.number.localeCompare(firstTransfer.number, undefined, { numeric: true });
      if (sortOrder === 'number-asc') return firstTransfer.number.localeCompare(secondTransfer.number, undefined, { numeric: true });
      const comparison = firstTransfer.transfer_date.localeCompare(secondTransfer.transfer_date) || firstTransfer.number.localeCompare(secondTransfer.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [transferRows, isWarehouseTransfer, searchTerm, dateFrom, dateTo, sortOrder]);

  const activeTotalCount = isWarehouseTransfer ? filteredTransferRows.length : filteredInvoiceRows.length;
  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));
  const pageInvoices = filteredInvoiceRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageTransfers = filteredTransferRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      const [documentsRes, transfersRes] = await Promise.all([
        invoiceKind
          ? (showDeleted
              ? supabase.from('v_invoice_list').select('*').eq('kind', invoiceKind).not('deleted_at', 'is', null)
              : supabase.from('v_invoice_list').select('*').eq('kind', invoiceKind).is('deleted_at', null))
              .order('invoice_date', { ascending: false }).order('number', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isWarehouseTransfer
          ? (showDeleted
              ? supabase.from('v_warehouse_transfer_list').select('*').not('deleted_at', 'is', null)
              : supabase.from('v_warehouse_transfer_list').select('*').is('deleted_at', null))
              .order('transfer_date', { ascending: false }).order('number', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!alive) return;

      const firstError = documentsRes.error ?? transfersRes.error;
      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setRows((documentsRes.data ?? []) as InvoiceRow[]);
      setTransferRows((transfersRes.data ?? []) as WarehouseTransferRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [kind, version, showDeleted]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, dateFrom, dateTo, sortOrder, kind]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function switchKind(next: InvoiceTab) {
    if (next === kind) return;
    setKind(next);
    setSearchParams({ tab: next });
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
  }

  function openNew() {
    setEditing(null);
    setEditingTransfer(null);
    openedFromViewRef.current = false;
    openedTransferFromViewRef.current = false;
    setModalMode('create');
    setFormOpen(true);
  }

  async function openTransferModal(transfer: WarehouseTransferRow, mode: 'view' | 'edit' = 'view') {
    setError('');
    openedTransferFromViewRef.current = mode === 'view';
    const { data, error: linesError } = await supabase.from('warehouse_transfer_items')
      .select('item_id, qty, unit_cost').eq('transfer_id', transfer.id).order('item_id');
    if (linesError) return setError(translateDbError(linesError.message));
    setEditingTransfer({ ...transfer, lines: (data ?? []) as WarehouseTransferLine[] });
    setEditing(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  async function openInvoiceModal(invoice: InvoiceRow, mode: 'view' | 'edit' = 'view') {
    setError('');
    openedFromViewRef.current = mode === 'view';
    const { data, error: linesError } = await supabase
      .from('invoice_items')
      .select('item_id, qty, unit_price')
      .eq('invoice_id', invoice.id)
      .order('created_at');

    if (linesError) {
      setError(translateDbError(linesError.message));
      return;
    }

    const lines = ((data ?? []) as { item_id: string; qty: number; unit_price: number }[]).map(
      (line) => ({
        key: crypto.randomUUID(),
        item_id: line.item_id,
        qty: String(Number(line.qty)),
        unit_price: String(Number(line.unit_price)),
      }),
    );

    setEditing({ invoice, lines });
    setEditingTransfer(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  async function remove(invoice: InvoiceRow) {
    const label =
      invoice.kind === 'sale_return' || invoice.kind === 'purchase_return'
        ? 'المرتجع'
        : invoice.kind === 'waste' ? 'فاتورة الهالك' : 'الفاتورة';
    const confirmed = await askConfirmation(
      `حذف ${label} ${invoice.number}؟\n` +
        `سيُستثنى هو وإيصاله المرتبط من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».`,
      'حذف',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('delete_invoice', { p_invoice_id: invoice.id });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم نقل ${label} ${invoice.number} إلى المحذوفات`);
    setFormOpen(false);
    setEditing(null);
    setVersion((current) => current + 1);
    void refresh();
  }

  async function restore(invoice: InvoiceRow) {
    const label =
      invoice.kind === 'sale_return' || invoice.kind === 'purchase_return'
        ? 'المرتجع'
        : invoice.kind === 'waste' ? 'فاتورة الهالك' : 'الفاتورة';
    const confirmed = await askConfirmation(
      `استعادة ${label} ${invoice.number}؟\n` +
        'سيعود مع إيصاله المرتبط ويُعاد تأثيره على المخزون والأرصدة.',
      'استعادة',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('restore_invoice', {
      p_invoice_id: invoice.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم استعادة ${label} ${invoice.number}`);
    setFormOpen(false);
    setEditing(null);
    setVersion((current) => current + 1);
    void refresh();
  }

  async function removeTransfer(transfer: WarehouseTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيعود المخزون إلى أرصدته السابقة إذا لم توجد حركات لاحقة على هذه الأصناف.`, 'حذف'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('delete_warehouse_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    setFormOpen(false);
    setEditingTransfer(null);
    setVersion((current) => current + 1);
    void refresh();
  }

  async function restoreTransfer(transfer: WarehouseTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة المخزون.`, 'استعادة'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('restore_warehouse_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم استعادة التحويل ${transfer.number}`);
    setFormOpen(false);
    setEditingTransfer(null);
    setVersion((current) => current + 1);
    void refresh();
  }

  async function handleSaved(message: string) {
    setNotice(message);
    setVersion((current) => current + 1);
    void refresh();

    // إذا كانت الفاتورة مفتوحة من وضع العرض وتم تعديلها، نُعيدها لوضع العرض مع تحديث البيانات
    if (modalMode === 'edit' && openedFromViewRef.current && editing) {
      const invoiceId = editing.invoice.id;
      const [invRes, linesRes] = await Promise.all([
        supabase.from('v_invoice_list').select('*').eq('id', invoiceId).maybeSingle(),
        supabase
          .from('invoice_items')
          .select('item_id, qty, unit_price')
          .eq('invoice_id', invoiceId)
          .order('created_at'),
      ]);

      if (invRes.data && !invRes.error && linesRes.data && !linesRes.error) {
        const lines = ((linesRes.data ?? []) as { item_id: string; qty: number; unit_price: number }[]).map(
          (line) => ({
            key: crypto.randomUUID(),
            item_id: line.item_id,
            qty: String(Number(line.qty)),
            unit_price: String(Number(line.unit_price)),
          }),
        );
        setEditing({ invoice: invRes.data as InvoiceRow, lines });
        setModalMode('view');
        return;
      }
    }

    // إذا كان أمر التحويل مفتوحاً من وضع العرض، نُعيده لوضع العرض بعد التعديل (Sibling Parity)
    if (modalMode === 'edit' && openedTransferFromViewRef.current && editingTransfer) {
      const transferId = editingTransfer.id;
      const [trRes, linesRes] = await Promise.all([
        supabase.from('v_warehouse_transfer_list').select('*').eq('id', transferId).maybeSingle(),
        supabase
          .from('warehouse_transfer_items')
          .select('item_id, qty, unit_cost')
          .eq('transfer_id', transferId)
          .order('item_id'),
      ]);

      if (trRes.data && !trRes.error && linesRes.data && !linesRes.error) {
        setEditingTransfer({
          ...(trRes.data as WarehouseTransferRow),
          lines: (linesRes.data ?? []) as WarehouseTransferLine[],
        });
        setModalMode('view');
        return;
      }
    }

    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
  }

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    return <Navigate to={firstAllowedTab ? `/invoices?tab=${firstAllowedTab.value}` : '/access-denied'} replace />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{showDeleted ? `المحذوفات — ${tabTitle}` : tabTitle}</h1>
        </div>
        <div className="actions">
          {can(`goods.${kind}.delete`) && (
            <button type="button" className="btn outline" onClick={toggleDeleted}>
              {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
            </button>
          )}
          {!showDeleted && can(`goods.${kind}.create`) && (
            <button type="button" className="btn primary" onClick={openNew}>
              + {newLabel}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={kind === tab.value ? 'tab active' : 'tab'}
            onClick={() => switchKind(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showDeleted && (
        <p className="hint">
          {isWarehouseTransfer ? 'التحويلات المحذوفة لا تؤثر على المخزون، ويمكن استعادتها ما لم توجد حركات لاحقة.' : 'هذه المستندات محذوفة: لا تؤثر على الأرصدة أو المخزون، ويمكن استعادتها في أي وقت.'}
        </p>
      )}

      {/* جدول البيانات بعرض كامل 100% */}
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
                  placeholder={isWarehouseTransfer ? 'بحث بالرقم أو المخزن…' : `بحث بالرقم أو ${partyHeader}…`}
                />
              </label>

              {!isWarehouseTransfer && kind !== 'waste' && (
                <SearchableSelect
                  ariaLabel="حالة السداد"
                  value={statusFilter}
                  options={[
                    { value: 'all', label: 'كل الحالات' },
                    { value: 'paid', label: isReturn ? 'مستردة' : 'مسددة' },
                    { value: 'partial', label: isReturn ? 'مستردة جزئيًا' : 'مسددة جزئيًا' },
                    { value: 'unpaid', label: isReturn ? 'غير مستردة' : 'غير مسددة' },
                  ]}
                  onChange={(val) => setStatusFilter(val as SaleStatus)}
                />
              )}

              <div className="erp-date-range">
                <div className="erp-date"><span>من</span><DateInput value={dateFrom} onChange={setDateFrom} ariaLabel="من تاريخ" /></div>
                <div className="erp-date"><span>إلى</span><DateInput value={dateTo} onChange={setDateTo} ariaLabel="إلى تاريخ" /></div>
              </div>
            </div>
          </div>

          <div className="erp-table-wrap">
            {isWarehouseTransfer ? (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="الرقم"
                      field="number"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <SortableHeader
                      label="التاريخ"
                      field="date"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <th>من مخزن</th>
                    <th>إلى مخزن</th>
                    <th className="num">عدد الأصناف</th>
                    <th className="num">إجمالي الكميات</th>
                    <SortableHeader
                      label="قيمة التكلفة"
                      field="total"
                      align="end"
                      className="num"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <th>ملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageTransfers.length === 0 && <tr><td colSpan={9} className="empty">لا توجد تحويلات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageTransfers.map((transfer) => (
                    <tr
                      key={transfer.id}
                      tabIndex={0}
                      onClick={() => void openTransferModal(transfer, 'view')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTransferModal(transfer, 'view'); }
                      }}
                    >
                      <td className="num strong">{transfer.number}</td>
                      <td className="num">{formatDate(transfer.transfer_date)}</td>
                      <td>{transfer.source_warehouse_name}</td>
                      <td>{transfer.destination_warehouse_name}</td>
                      <td className="num">{transfer.line_count}</td>
                      <td className="num">{formatQty(transfer.total_qty)}</td>
                      <td className="num strong">{money(transfer.total_value)}</td>
                      <td>{transfer.notes || '—'}</td>
                      <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                        {showDeleted ? (
                          can(`goods.${kind}.delete`) && (
                            <RowActions
                              onRestore={() => void restoreTransfer(transfer)}
                              restoreLabel="استعادة التحويل"
                            />
                          )
                        ) : (
                          <RowActions
                            onEdit={can(`goods.${kind}.edit`) ? () => void openTransferModal(transfer, 'edit') : undefined}
                            onDelete={can(`goods.${kind}.delete`) ? () => void removeTransfer(transfer) : undefined}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
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
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <SortableHeader
                      label="التاريخ"
                      field="date"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <SortableHeader
                      label={partyHeader}
                      field="account"
                      defaultDirection="asc"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    <th>المخزن</th>
                    <SortableHeader
                      label="الإجمالي"
                      field="total"
                      align="end"
                      className="num"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    {(kind === 'sale' || kind === 'sale_return') && canViewProfit && <th className="num">الربح</th>}
                    {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && <th className="num">{kind === 'waste' ? 'الخسارة' : 'التكلفة'}</th>}
                    {kind !== 'waste' && <th>{isReturn ? 'الاسترداد' : 'السداد'}</th>}
                    {kind !== 'waste' && (
                      <SortableHeader
                        label={isReturn ? 'غير المسترد' : 'المتبقي'}
                        field="remaining"
                        align="end"
                        className="num"
                        currentSort={sortOrder}
                        onSort={(s) => setSortOrder(s as SaleSort)}
                      />
                    )}
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageInvoices.length === 0 && <tr><td colSpan={10} className="empty">لا توجد فواتير تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageInvoices.map((invoice) => {
                    const status = saleStatus(invoice);
                    return (
                      <tr
                        key={invoice.id}
                        tabIndex={0}
                        onClick={() => void openInvoiceModal(invoice, 'view')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openInvoiceModal(invoice, 'view'); }
                        }}
                      >
                        <td className="num strong">{invoice.number}</td>
                        <td className="num">{formatDate(invoice.invoice_date)}</td>
                        <td>{invoice.account_name}</td>
                        <td>{invoice.warehouse_name}</td>
                        <td className="num strong">{money(invoice.total)}</td>
                        {(kind === 'sale' || kind === 'sale_return') && canViewProfit && (
                          <td className="num">{money(invoice.profit_total)}</td>
                        )}
                        {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && (
                          <td className="num">{money(invoice.cost_total)}</td>
                        )}
                        {kind !== 'waste' && (
                          <td>
                            <StatusBadge variant={status}>{saleStatusLabel(status, isReturn)}</StatusBadge>
                          </td>
                        )}
                        {kind !== 'waste' && (
                          <td className={Number(invoice.remaining) > 0 ? 'num strong remaining' : 'num'}>{money(invoice.remaining)}</td>
                        )}
                        <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                          {showDeleted ? (
                            can(`goods.${kind}.delete`) && (
                              <RowActions
                                onRestore={() => void restore(invoice)}
                                restoreLabel={`استعادة ${newLabel}`}
                              />
                            )
                          ) : (
                            <RowActions
                              onEdit={can(`goods.${kind}.edit`) ? () => void openInvoiceModal(invoice, 'edit') : undefined}
                              onDelete={can(`goods.${kind}.delete`) ? () => void remove(invoice) : undefined}
                            />
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

      {/* نافذة الفاتورة المنبثقة الموحدة (عرض / إنشاء / تعديل) */}
      {formOpen && (
        <Modal
          className={isWarehouseTransfer ? 'transaction-entry-modal' : 'transaction-entry-modal invoice-entry-modal'}
          backdropClassName="transaction-entry-backdrop"
          title={formTitle}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setEditingTransfer(null);
          }}
        >
          {isWarehouseTransfer ? (
            <WarehouseTransferForm
              key={`${editingTransfer?.id ?? 'new-transfer'}-${modalMode}`}
              warehouses={warehouses}
              items={items}
              stockRows={stockRows}
              editing={editingTransfer}
              readOnly={modalMode === 'view'}
              onSaved={handleSaved}
              onCancel={() => {
                if (modalMode === 'edit' && openedTransferFromViewRef.current) {
                  setModalMode('view');
                } else {
                  setFormOpen(false);
                  setEditingTransfer(null);
                }
              }}
              onEdit={can(`goods.${kind}.edit`) ? () => setModalMode('edit') : undefined}
              onDelete={
                can(`goods.${kind}.delete`) && editingTransfer
                  ? () => void removeTransfer(editingTransfer)
                  : undefined
              }
              onPrint={() => window.print()}
            />
          ) : (
            <InvoiceForm
              key={`${editing?.invoice.id ?? 'new-invoice'}-${modalMode}`}
              kind={kind as InvoiceKind}
              accounts={accounts}
              warehouses={warehouses}
              cashBoxes={cashBoxes}
              items={items}
              stockRows={stockRows}
              editing={editing}
              readOnly={modalMode === 'view'}
              onSaved={handleSaved}
              onCancel={() => {
                if (modalMode === 'edit' && openedFromViewRef.current) {
                  setModalMode('view');
                } else {
                  setFormOpen(false);
                  setEditing(null);
                }
              }}
              onEdit={can(`goods.${kind}.edit`) ? () => setModalMode('edit') : undefined}
              onDelete={
                can(`goods.${kind}.delete`) && editing
                  ? () => void remove(editing.invoice)
                  : undefined
              }
              onPrint={() => window.print()}
            />
          )}
        </Modal>
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

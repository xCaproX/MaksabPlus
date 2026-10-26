import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { X, ExternalLink, Receipt as ReceiptIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { creationTime, formatDate, money, qty as formatQty } from '../lib/format';
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
  AccountRow,
  CashBoxRow,
  InvoiceItemRow,
  InvoiceKind,
  InvoiceRow,
  ItemRow,
  LineDraft,
  StockOpeningRow,
  WarehouseOption,
  WarehouseTransferLine,
  WarehouseTransferRow,
} from '../lib/types';
import { useAccess } from '../lib/access';
import { useConfirmDialog } from '../lib/useConfirmDialog';
import { matchesSearchQuery } from '../lib/search';

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
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [loading, setLoading] = useState(true);
  function setError(msg: string) {
    if (msg) toast.error(msg);
  }
  function setNotice(msg: string) {
    if (msg) toast.success(msg);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<(WarehouseTransferRow & { lines: WarehouseTransferLine[] }) | null>(null);
  const [viewingTransfer, setViewingTransfer] = useState<WarehouseTransferRow | null>(null);
  const [viewingTransferLines, setViewingTransferLines] = useState<(WarehouseTransferLine & { unit: string })[]>([]);
  const [transferDetailsLoading, setTransferDetailsLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();
  const [showDeleted, setShowDeleted] = useState(false);
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [details, setDetails] = useState<InvoiceItemRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

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
      setViewing(null);
      setViewingTransfer(null);
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
    ? `تعديل التحويل ${editingTransfer.number}`
    : editing
    ? `تعديل ${isReturn ? 'المرتجع' : 'الفاتورة'} ${editing.invoice.number}`
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
      const [accountsRes, warehousesRes, itemsRes, cashBoxesRes, stockRowsRes] = await Promise.all([
        supabase
          .from('v_account_balances')
          .select('*')
          .eq('is_active', true)
          .order('kind')
          .order('name'),
        supabase.from('warehouses').select('id, name, is_active, is_primary').order('name'),
        supabase.from('v_item_stock').select('*').eq('is_active', true).order('name'),
        supabase.from('v_cash_box_balances').select('*').order('name'),
        supabase.from('v_stock_opening_balances').select('*').order('warehouse_name').order('item_name'),
      ]);

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

      const firstError =
        documentsRes.error ?? transfersRes.error ?? accountsRes.error ?? warehousesRes.error ?? itemsRes.error ?? cashBoxesRes.error ?? stockRowsRes.error;

      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setRows((documentsRes.data ?? []) as InvoiceRow[]);
      setTransferRows((transfersRes.data ?? []) as WarehouseTransferRow[]);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setWarehouses((warehousesRes.data ?? []) as WarehouseOption[]);
      setItems((itemsRes.data ?? []) as ItemRow[]);
      setCashBoxes((cashBoxesRes.data ?? []) as CashBoxRow[]);
      setStockRows((stockRowsRes.data ?? []) as StockOpeningRow[]);
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
    setViewing(null);
    setViewingTransfer(null);
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
    setViewing(null);
    setViewingTransfer(null);
  }

  function openNew() {
    setEditing(null);
    setEditingTransfer(null);
    setFormOpen(true);
  }

  async function startEditTransfer(transfer: WarehouseTransferRow) {
    setError('');
    const { data, error: linesError } = await supabase.from('warehouse_transfer_items')
      .select('item_id, qty, unit_cost').eq('transfer_id', transfer.id).order('item_id');
    if (linesError) return setError(translateDbError(linesError.message));
    setEditingTransfer({ ...transfer, lines: (data ?? []) as WarehouseTransferLine[] });
    setEditing(null);
    setFormOpen(true);
  }

  async function openTransferDetails(transfer: WarehouseTransferRow) {
    setError('');
    setViewing(null);
    setViewingTransfer(transfer);
    setViewingTransferLines([]);
    setTransferDetailsLoading(true);
    const { data: lines, error: linesError } = await supabase.from('warehouse_transfer_items')
      .select('item_id, qty, unit_cost').eq('transfer_id', transfer.id).order('created_at');
    if (linesError) {
      setError(translateDbError(linesError.message));
      setTransferDetailsLoading(false);
      return;
    }
    const itemIds = (lines ?? []).map((line) => line.item_id);
    const { data: itemRows, error: itemsError } = itemIds.length
      ? await supabase.from('items').select('id, name, unit').in('id', itemIds)
      : { data: [], error: null };
    if (itemsError) {
      setError(translateDbError(itemsError.message));
      setTransferDetailsLoading(false);
      return;
    }
    const itemById = new Map((itemRows ?? []).map((item) => [item.id, item]));
    setViewingTransferLines((lines ?? []).map((line) => ({
      ...line,
      item_name: itemById.get(line.item_id)?.name ?? 'صنف غير متاح',
      unit: itemById.get(line.item_id)?.unit ?? 'قطعة',
    })));
    setTransferDetailsLoading(false);
  }

  async function startEdit(invoice: InvoiceRow) {
    setError('');
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
    setFormOpen(true);
  }

  async function openDetails(invoice: InvoiceRow) {
    setError('');
    setViewingTransfer(null);
    setViewing(invoice);
    setDetails([]);
    setDetailsLoading(true);

    const { data, error: linesError } = await supabase
      .from('v_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('item_name');

    setDetailsLoading(false);

    if (linesError) {
      setError(translateDbError(linesError.message));
      setViewing(null);
      return;
    }

    setDetails((data ?? []) as InvoiceItemRow[]);
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
    setViewing(null);
    setVersion((current) => current + 1);
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
    setVersion((current) => current + 1);
  }

  async function removeTransfer(transfer: WarehouseTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيعود المخزون إلى أرصدته السابقة إذا لم توجد حركات لاحقة على هذه الأصناف.`, 'حذف'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('delete_warehouse_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    setViewingTransfer(null);
    setVersion((current) => current + 1);
  }

  async function restoreTransfer(transfer: WarehouseTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة المخزون.`, 'استعادة'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('restore_warehouse_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم استعادة التحويل ${transfer.number}`);
    setVersion((current) => current + 1);
  }

  function handleSaved(message: string) {
    setNotice(message);
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
    setViewing(null);
    setViewingTransfer(null);
    setVersion((current) => current + 1);
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
          <p className="muted">
            {isWarehouseTransfer
              ? 'انقل الأصناف بين المخازن. يتغير رصيد كل مخزن وتكلفة الوجهة من غير تأثير على الحسابات أو ربح الفواتير.'
              : kind === 'sale'
              ? 'إدارة المبيعات والتحصيل من قائمة واحدة.'
              : kind === 'purchase'
              ? 'إدارة فواتير المشتريات وتكاليف البضاعة الواردة ومتابعة سداد الموردين.'
              : kind === 'sale_return'
              ? 'إدارة مرتجعات المبيعات واسترداد البضاعة إلى المخزون وتعديل حسابات العملاء.'
              : kind === 'purchase_return'
              ? 'إدارة مرتجعات المشتريات ورد البضاعة إلى الموردين واسترداد المستحقات.'
              : 'إثبات هالك وتالف الأصناف وتأثيرها على المخزون وحساب تكلفة الخسائر.'}
          </p>
        </div>
        <div className="actions">
          {can(`goods.${kind}.delete`) && (
            <button type="button" className="btn ghost" onClick={toggleDeleted}>
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

      {/* الـ Workspace الموحد لكل تبويبات البضاعة */}
      <div className={viewing || viewingTransfer ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
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
                    <th className="col-hide-on-detail">إلى مخزن</th>
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
                    <th className="col-hide-on-detail">ملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageTransfers.length === 0 && <tr><td colSpan={9} className="empty">لا توجد تحويلات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageTransfers.map((transfer) => {
                    const isSelected = viewingTransfer?.id === transfer.id;
                    return (
                      <tr
                        key={transfer.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => void openTransferDetails(transfer)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTransferDetails(transfer); }
                        }}
                      >
                        <td className="num strong">{transfer.number}</td>
                        <td className="num">{formatDate(transfer.transfer_date)}</td>
                        <td>{transfer.source_warehouse_name}</td>
                        <td className="col-hide-on-detail">{transfer.destination_warehouse_name}</td>
                        <td className="num">{transfer.line_count}</td>
                        <td className="num">{formatQty(transfer.total_qty)}</td>
                        <td className="num strong">{money(transfer.total_value)}</td>
                        <td className="col-hide-on-detail">{transfer.notes || '—'}</td>
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
                              onEdit={can(`goods.${kind}.edit`) ? () => void startEditTransfer(transfer) : undefined}
                              onDelete={can(`goods.${kind}.delete`) ? () => void removeTransfer(transfer) : undefined}
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
                    <th className="col-hide-on-detail">المخزن</th>
                    <SortableHeader
                      label="الإجمالي"
                      field="total"
                      align="end"
                      className="num"
                      currentSort={sortOrder}
                      onSort={(s) => setSortOrder(s as SaleSort)}
                    />
                    {(kind === 'sale' || kind === 'sale_return') && canViewProfit && <th className="num col-hide-on-detail">الربح</th>}
                    {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && <th className="num col-hide-on-detail">{kind === 'waste' ? 'الخسارة' : 'التكلفة'}</th>}
                    {kind !== 'waste' && <th className="col-hide-on-detail">{isReturn ? 'الاسترداد' : 'السداد'}</th>}
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
                    const isSelected = viewing?.id === invoice.id;
                    return (
                      <tr
                        key={invoice.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => void openDetails(invoice)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openDetails(invoice); }
                        }}
                      >
                        <td className="num strong">{invoice.number}</td>
                        <td className="num">{formatDate(invoice.invoice_date)}</td>
                        <td>{invoice.account_name}</td>
                        <td className="col-hide-on-detail">{invoice.warehouse_name}</td>
                        <td className="num strong">{money(invoice.total)}</td>
                        {(kind === 'sale' || kind === 'sale_return') && canViewProfit && (
                          <td className="num col-hide-on-detail">{money(invoice.profit_total)}</td>
                        )}
                        {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && (
                          <td className="num col-hide-on-detail">{money(invoice.cost_total)}</td>
                        )}
                        {kind !== 'waste' && (
                          <td className="col-hide-on-detail">
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
                              onEdit={can(`goods.${kind}.edit`) ? () => void startEdit(invoice) : undefined}
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

        {/* اللوحة الجانبية للتفاصيل */}
        <aside className={viewing || viewingTransfer ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل المستند">
          {viewingTransfer ? (
            <>
              <div className="erp-detail-head">
                <div><span>تحويل بين مخازن</span><h2 className="num">{viewingTransfer.number}</h2></div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setViewingTransfer(null)}>
                  <X size={18} />
                </button>
              </div>
              {transferDetailsLoading ? <p className="erp-detail-empty">جارٍ تحميل الأصناف…</p> : (
                <>
                  <dl className="erp-detail-summary">
                    <div><dt>من مخزن</dt><dd>{viewingTransfer.source_warehouse_name}</dd></div>
                    <div><dt>إلى مخزن</dt><dd>{viewingTransfer.destination_warehouse_name}</dd></div>
                    <div><dt>التاريخ</dt><dd className="num">{formatDate(viewingTransfer.transfer_date)}</dd></div>
                    <div><dt>وقت الإنشاء</dt><dd className="num">{creationTime(viewingTransfer.created_at)}</dd></div>
                  </dl>

                  <div className="erp-detail-lines">
                    {viewingTransferLines.length === 0 ? <p className="muted">لا توجد أصناف.</p> : (
                      <table className="table subtable">
                        <thead><tr><th>الصنف</th><th className="num">الكمية</th><th className="num">تكلفة الوحدة</th></tr></thead>
                        <tbody>
                          {viewingTransferLines.map((line) => (
                            <tr key={line.item_id}>
                              <td>{line.item_name}</td>
                              <td className="num">{formatQty(line.qty)} {line.unit}</td>
                              <td className="num">{money(line.unit_cost ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="erp-detail-totals">
                    <span>عدد الأصناف</span><strong className="num">{viewingTransfer.line_count}</strong>
                    <span>إجمالي الكميات</span><strong className="num">{formatQty(viewingTransfer.total_qty)}</strong>
                    <span>قيمة التكلفة</span><strong className="num">{money(viewingTransfer.total_value)}</strong>
                  </div>

                  {viewingTransfer.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{viewingTransfer.notes}</p>}

                  <div className="erp-detail-actions">
                    {showDeleted ? (
                      can(`goods.${kind}.delete`) && <button type="button" className="btn" onClick={() => void restoreTransfer(viewingTransfer)}>استعادة التحويل</button>
                    ) : (
                      <>
                        {can(`goods.${kind}.edit`) && <button type="button" className="btn" onClick={() => void startEditTransfer(viewingTransfer)}>تعديل التحويل</button>}
                        {can(`goods.${kind}.delete`) && <button type="button" className="btn danger" onClick={() => void removeTransfer(viewingTransfer)}>حذف</button>}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : viewing ? (
            <>
              <div className="erp-detail-head">
                <div><span>{newLabel}</span><h2 className="num">{viewing.number}</h2></div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setViewing(null)}>
                  <X size={18} />
                </button>
              </div>
              {detailsLoading ? <p className="erp-detail-empty">جارٍ تحميل التفاصيل…</p> : (
                <>
                  <dl className="erp-detail-summary">
                    <div><dt>{partyHeader}</dt><dd>{viewing.account_name}</dd></div>
                    <div><dt>التاريخ</dt><dd className="num">{formatDate(viewing.invoice_date)}</dd></div>
                    <div><dt>المخزن</dt><dd>{viewing.warehouse_name}</dd></div>
                    {viewing.cash_box_name && <div><dt>الخزنة</dt><dd>{viewing.cash_box_name}</dd></div>}
                    {kind !== 'waste' && (
                      <div><dt>{isReturn ? 'الاسترداد' : 'السداد'}</dt><dd><span className={`status-badge ${saleStatus(viewing)}`}>{saleStatusLabel(saleStatus(viewing), isReturn)}</span></dd></div>
                    )}
                  </dl>

                  <div className="erp-detail-lines">
                    {details.length === 0 ? <p className="muted">لا توجد سطور.</p> : (
                      <table className="table subtable">
                        <thead>
                          <tr>
                            <th>الصنف</th>
                            <th className="num">الكمية</th>
                            <th className="num">السعر</th>
                            <th className="num">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.map((line) => (
                            <tr key={line.id}>
                              <td>{line.item_name}</td>
                              <td className="num">{formatQty(line.qty)} {line.unit}</td>
                              <td className="num">{money(line.unit_price)}</td>
                              <td className="num strong">{money(line.line_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="erp-detail-totals">
                    <span>الإجمالي</span><strong className="num">{money(viewing.total)}</strong>
                    {kind === 'waste' ? (
                      <><span>الخسارة</span><strong className="num">{money(viewing.cost_total)}</strong></>
                    ) : (
                      <>
                        <span>{isReturn ? 'المسترد' : 'المدفوع'}</span><strong className="num">{money(viewing.paid)}</strong>
                        <span>{isReturn ? 'غير المسترد' : 'المتبقي'}</span><strong className="num remaining">{money(viewing.remaining)}</strong>
                      </>
                    )}
                  </div>

                  {viewing.receipt_number && (
                    <div className="erp-detail-notes">
                      <span>الإيصال المرتبط</span>
                      <Link
                        to={`/receipts?search=${encodeURIComponent(viewing.receipt_number)}`}
                        className="receipt-linked-link"
                      >
                        <ReceiptIcon size={15} />
                        <span>إيصال {viewing.receipt_number} ({money(viewing.receipt_amount ?? 0)})</span>
                        <ExternalLink size={13} className="link-ext-icon" />
                      </Link>
                    </div>
                  )}

                  {viewing.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{viewing.notes}</p>}

                  <div className="erp-detail-actions">
                    {showDeleted ? (
                      can(`goods.${kind}.delete`) && <button type="button" className="btn" onClick={() => void restore(viewing)}>استعادة {newLabel}</button>
                    ) : (
                      <>
                        {can(`goods.${kind}.edit`) && <button type="button" className="btn" onClick={() => void startEdit(viewing)}>تعديل {newLabel}</button>}
                        {can(`goods.${kind}.delete`) && <button type="button" className="btn danger" onClick={() => void remove(viewing)}>حذف</button>}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر {isWarehouseTransfer ? 'تحويلًا' : 'مستندًا'}</strong>
              <span>ستظهر تفاصيله هنا من دون مغادرة القائمة.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نموذج الإضافة أو التعديل */}
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
              key={editingTransfer?.id ?? 'new-transfer'}
              warehouses={warehouses}
              items={items}
              stockRows={stockRows}
              editing={editingTransfer}
              onSaved={handleSaved}
              onCancel={() => { setFormOpen(false); setEditingTransfer(null); }}
            />
          ) : (
            <InvoiceForm
              key={editing?.invoice.id ?? 'new-invoice'}
              kind={kind as InvoiceKind}
              accounts={accounts}
              warehouses={warehouses}
              cashBoxes={cashBoxes}
              items={items}
              stockRows={stockRows}
              editing={editing}
              onSaved={handleSaved}
              onCancel={() => { setFormOpen(false); setEditing(null); }}
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

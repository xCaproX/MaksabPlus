import { fetchDocumentDetail } from '../lib/documentLinks';
import { loadDocumentSection } from '../lib/loadDocumentSection';
import ColumnFilterRow from '../components/ColumnFilterRow';
import { useColumnFilters } from '../lib/useColumnFilters';
import { useDocumentPageNumber } from '../lib/useDocumentPageNumber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage, translateDbError } from '../lib/errors';
import InvoiceForm from '../components/InvoiceForm';
import WarehouseTransferForm from '../components/WarehouseTransferForm';
import DocumentListPage from '../components/DocumentListPage';
import { collectAllRows } from '../lib/exportRows';
import { documentListQuery } from '../lib/documentListQuery';
import { periodDates } from '../lib/period';
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
import { useMasterData } from '../context/MasterDataContext';
import {
  calculateInvoiceKpis,
  type InvoiceKpiSummary,
  type WarehouseTransferKpiSummary,
  type InvoiceTab,
} from './invoices/invoiceKpis';
import InvoiceTable, { type SaleSort } from './invoices/InvoiceTable';
import WarehouseTransferTable from './invoices/WarehouseTransferTable';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

function loadInvoiceLines(invoiceId: string) {
  return collectAllRows<{ item_id: string; qty: number; unit_price: number }>((from, to) =>
    supabase.from('invoice_items').select('item_id, qty, unit_price', { count: 'exact' })
      .eq('invoice_id', invoiceId).order('created_at').order('id').range(from, to),
  ).then((rows) => rows.map((line) => ({
    key: crypto.randomUUID(),
    item_id: line.item_id,
    qty: String(Number(line.qty)),
    unit_price: String(Number(line.unit_price)),
  })));
}

function loadTransferLines(transferId: string) {
  return collectAllRows<WarehouseTransferLine>((from, to) =>
    supabase.from('v_warehouse_transfer_items').select('item_id, qty, unit_cost', { count: 'exact' })
      .eq('transfer_id', transferId).order('item_id').order('id').range(from, to),
  );
}

const PAGE_SIZE = 20;
const WAREHOUSE_LIST = ['warehouses'] as const;
const TRANSFER_FORM = ['warehouses', 'items', 'stock'] as const;
const INVOICE_FORM = ['warehouses', 'cashBoxes', 'accounts', 'items', 'stock'] as const;
const STOCK_CHANGES = ['items', 'stock'] as const;
const INVOICE_CHANGES = ['accounts', ...STOCK_CHANGES] as const;

function invoiceChanges(affectsCash: boolean) {
  return affectsCash ? [...INVOICE_CHANGES, 'cashBoxes'] as const : INVOICE_CHANGES;
}

const VALID_INVOICE_TABS: InvoiceTab[] = [
  'sale',
  'purchase',
  'sale_return',
  'purchase_return',
  'waste',
  'warehouse_transfer',
];

const INVOICE_TABS = [
  { value: 'sale', label: 'فواتير المبيعات' },
  { value: 'purchase', label: 'فواتير المشتريات' },
  { value: 'sale_return', label: 'مرتجعات المبيعات' },
  { value: 'purchase_return', label: 'مرتجعات المشتريات' },
  { value: 'waste', label: 'الهالك' },
  { value: 'warehouse_transfer', label: 'تحويل بين مخازن' },
] as const;

export default function Invoices() {
  const { can, canViewProfit } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as InvoiceTab | null;
  const initialKind = tabParam && VALID_INVOICE_TABS.includes(tabParam) ? tabParam : 'sale';
  const [kind, setKind] = useState<InvoiceTab>(initialKind);

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [transferRows, setTransferRows] = useState<WarehouseTransferRow[]>([]);
  const [activeRequest, setActiveRequest] = useState<string>();
  const [rowsLoading, setLoading] = useState(true);
  const [kpisLoading, setSummaryLoading] = useState(true);
  const [rowsFailed, setListError] = useState(false);
  const [kpisFailed, setSummaryError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const openedFromViewRef = useRef(false);
  const openedTransferFromViewRef = useRef(false);
  const pendingDeepLinkIdRef = useRef<string | null>(null);
  const modalRequestRef = useRef(0);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<
    (WarehouseTransferRow & { lines: WarehouseTransferLine[] }) | null
  >(null);
  const [version, setVersion] = useState(0);
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();
  const [showDeleted, setShowDeleted] = useState(false);

  // الفلاتر الموحدة
  const [dateFrom, setDateFrom] = useState(() => periodDates().from);
  const [dateTo, setDateTo] = useState(() => periodDates().to);
  const [sortOrder, setSortOrder] = useState<SaleSort>('date-desc');

  const isWarehouseTransfer = kind === 'warehouse_transfer';
  const invoiceKind = isWarehouseTransfer ? null : kind;
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const visibleTabs = INVOICE_TABS.filter((tab) => can(`goods.${tab.value}.view`));
  const canViewCurrentTab = can(`goods.${kind}.view`);
  const formResources = isWarehouseTransfer ? TRANSFER_FORM : INVOICE_FORM;
  const {
    accounts: rawAccounts,
    warehouses,
    items: rawItems,
    cashBoxes,
    stockRows,
    refresh,
    resourceStatus,
  } = useMasterData(canViewCurrentTab ? (formOpen ? formResources : WAREHOUSE_LIST) : undefined);
  const accounts = useMemo(
    () => rawAccounts.filter((a) => a.is_active || a.id === editing?.invoice.account_id),
    [rawAccounts, editing],
  );
  const items = useMemo(() => {
    const editingItemIds = new Set<string>([
      ...(editing?.lines?.map((l) => l.item_id) ?? []),
      ...(editingTransfer?.lines?.map((l) => l.item_id) ?? []),
    ]);
    return rawItems.filter((i) => i.is_active || editingItemIds.has(i.id));
  }, [rawItems, editing, editingTransfer]);


  useEffect(() => {
    const targetKind = tabParam && VALID_INVOICE_TABS.includes(tabParam) ? tabParam : 'sale';
    const action = searchParams.get('action');

    if (targetKind !== kind) {
      setKind(targetKind);
      setEditing(null);
      setEditingTransfer(null);
      setDateFrom(periodDates().from);
      setDateTo(periodDates().to);

      if (action === 'new') {
        const canCreate =
          targetKind === 'warehouse_transfer'
            ? can('goods.warehouse_transfer.create')
            : can(`goods.${targetKind}.create`);
        if (canCreate) {
          openedFromViewRef.current = false;
          openedTransferFromViewRef.current = false;
          setModalMode('create');
          setFormOpen(true);
        } else {
          setFormOpen(false);
        }
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('action');
        setSearchParams(nextParams, { replace: true });
      } else if (pendingDeepLinkIdRef.current === null) {
        setFormOpen(false);
      }
    } else {
      pendingDeepLinkIdRef.current = null;
      if (action === 'new') {
        const canCreate =
          kind === 'warehouse_transfer'
            ? can('goods.warehouse_transfer.create')
            : can(`goods.${kind}.create`);
        if (canCreate) {
          setEditing(null);
          setEditingTransfer(null);
          openedFromViewRef.current = false;
          openedTransferFromViewRef.current = false;
          setModalMode('create');
          setFormOpen(true);
        }
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('action');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [tabParam, kind, searchParams, can, setSearchParams]);

  const newLabel = isWarehouseTransfer
    ? 'تحويل بين مخازن'
    : kind === 'waste'
      ? 'فاتورة هالك'
      : kind === 'sale'
        ? 'فاتورة مبيعات'
        : kind === 'purchase'
          ? 'فاتورة مشتريات'
          : kind === 'sale_return'
            ? 'مرتجع مبيعات'
            : 'مرتجع مشتريات';

  const tabTitle = isWarehouseTransfer
    ? 'تحويلات المخازن'
    : kind === 'waste'
      ? 'فواتير الهالك'
      : kind === 'sale'
        ? 'فواتير المبيعات'
        : kind === 'purchase'
          ? 'فواتير المشتريات'
          : kind === 'sale_return'
            ? 'مرتجعات المبيعات'
            : 'مرتجعات المشتريات';

  const partyHeader =
    kind === 'sale' || kind === 'sale_return'
      ? 'العميل'
      : kind === 'purchase' || kind === 'purchase_return'
        ? 'المورد'
        : 'الحساب';

  const formTitle = editingTransfer
    ? modalMode === 'view'
      ? `${showDeleted ? 'محذوف — ' : ''}تحويل بين مخازن — ${editingTransfer.number}`
      : `تعديل التحويل ${editingTransfer.number}`
    : editing
      ? modalMode === 'view'
        ? `${showDeleted ? 'محذوف — ' : ''}${newLabel} — ${editing.invoice.number}`
        : `تعديل ${isReturn ? 'المرتجع' : 'الفاتورة'} ${editing.invoice.number}`
      : `${newLabel} ${isWarehouseTransfer ? 'جديد' : 'جديدة'}`;

  const [totalCount, setTotalCount] = useState(0);

  const columns = useColumnFilters(kind + String(canViewProfit), () => {
    setDateFrom(periodDates().from); setDateTo(periodDates().to); setShowDeleted(false); setPage(1);
  });
  const setColumnFieldImmediate = columns.setFieldImmediate;
  const { page, setPage } = useDocumentPageNumber([columns.filters, dateFrom, dateTo, sortOrder, kind, showDeleted]);

  useEffect(() => {
    const targetKind = tabParam && VALID_INVOICE_TABS.includes(tabParam) ? tabParam : 'sale';
    if (targetKind !== kind) return;

    const searchParam = searchParams.get('search')?.trim();
    const docParam = searchParams.get('doc')?.trim();
    if (!searchParam && !docParam) return;

    const nextParams = new URLSearchParams(searchParams);
    if (searchParam) nextParams.delete('search');
    if (docParam) nextParams.delete('doc');
    setSearchParams(nextParams, { replace: true });

    if (searchParam) {
      setColumnFieldImmediate('number', searchParam);
      setDateFrom('');
      setDateTo('');
    }

    if (docParam) {
      const reqId = ++modalRequestRef.current;
      const detailScope = targetKind === 'warehouse_transfer' ? 'warehouse_transfer' : 'invoice';
      void (async () => {
        try {
          const result = await fetchDocumentDetail(detailScope, docParam);
          if (modalRequestRef.current !== reqId) return;
          if (!result.ok) {
            toast.warning(result.message);
            return;
          }

          if (detailScope === 'warehouse_transfer') {
            const transfer = result.doc as unknown as WarehouseTransferRow;
            if (transfer.deleted_at) {
              setShowDeleted(true);
              toast.info('تم فتح مستند محذوف للمعاينة');
            }
            const lines = result.lines.map((line) => ({
              item_id: String(line.item_id ?? ''),
              qty: Number(line.qty ?? 0),
              unit_cost: line.unit_cost === null || line.unit_cost === undefined ? null : Number(line.unit_cost),
            })) as WarehouseTransferLine[];
            openedTransferFromViewRef.current = true;
            setEditingTransfer({ ...transfer, lines });
            setEditing(null);
            setModalMode('view');
            setFormOpen(true);
            return;
          }

          const invoice = result.doc as unknown as InvoiceRow;
          if (invoice.deleted_at) {
            setShowDeleted(true);
            toast.info('تم فتح مستند محذوف للمعاينة');
          }
          const lines: LineDraft[] = result.lines.map((line) => ({
            key: crypto.randomUUID(),
            item_id: String(line.item_id ?? ''),
            qty: String(Number(line.qty ?? 0)),
            unit_price: String(Number(line.unit_price ?? 0)),
          }));
          const docKind = invoice.kind;
          openedFromViewRef.current = true;
          if (docKind !== kind) {
            pendingDeepLinkIdRef.current = invoice.id;
            setKind(docKind);
            setSearchParams((prev) => {
              const synced = new URLSearchParams(prev);
              synced.set('tab', docKind);
              synced.delete('doc');
              return synced;
            }, { replace: true });
          }
          setEditing({ invoice, lines });
          setEditingTransfer(null);
          setModalMode('view');
          setFormOpen(true);
        } catch (err) {
          if (modalRequestRef.current === reqId) {
            toast.error(errorMessage(err));
          }
        }
      })();
    }
  }, [tabParam, kind, searchParams, can, setSearchParams, setColumnFieldImmediate]);
  const columnFilter = <ColumnFilterRow scope={isWarehouseTransfer ? 'warehouse_transfer' : 'invoice'} kind={kind}
    owner={canViewProfit} values={columns.values} onChange={columns.setField} onReset={columns.reset}
    options={{ warehouses: warehouses.map((w) => ({ value: w.id, label: w.name })), }} />;

  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceKpiSummary>({
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    profitTotal: 0,
    count: 0,
  });
  const [transferSummary, setTransferSummary] = useState<WarehouseTransferKpiSummary>({
    totalValue: 0,
    totalQty: 0,
    count: 0,
  });


  const activeTotalCount = totalCount;
  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));
  const pageInvoices = rows;
  const pageTransfers = transferRows;

  const kpiItems = useMemo(
    () =>
      calculateInvoiceKpis({
        kind,
        isWarehouseTransfer,
        transferSummary,
        invoiceSummary,
        canViewProfit: Boolean(canViewProfit),
      }),
    [kind, isWarehouseTransfer, transferSummary, invoiceSummary, canViewProfit],
  );

  const requestKey = JSON.stringify([
    kind, invoiceKind, isWarehouseTransfer,
    page, columns.filters, dateFrom, dateTo, showDeleted, sortOrder, version,
  ]);
  const requestChanged = activeRequest !== requestKey;
  const loading = requestChanged || rowsLoading;
  const summaryLoading = requestChanged || kpisLoading;
  const listError = !requestChanged && rowsFailed;
  const summaryError = !requestChanged && kpisFailed;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setActiveRequest(requestKey);
      setLoading(true);
      setSummaryLoading(true);
      setListError(false);
      setSummaryError(false);

      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;

      if (invoiceKind) {
        const query = documentListQuery({ scope: 'invoice', kind: invoiceKind, filters: columns.filters,
          dateFrom, dateTo, showDeleted, sortOrder }).range(from, to, signal);

        await Promise.all([
          loadDocumentSection(signal, query, setLoading, setListError, (docRes) => {
            setRows((docRes.data ?? []) as InvoiceRow[]);
            setTotalCount(docRes.count ?? 0);
          }),
          loadDocumentSection(signal, supabase.rpc('get_invoice_kpis_columns', {
            p_columns: columns.filters,
            p_kind: invoiceKind,
            p_search: null,
            p_status: 'all',
            p_date_from: dateFrom || null,
            p_date_to: dateTo || null,
            p_show_deleted: showDeleted,
          }).abortSignal(signal), setSummaryLoading, setSummaryError, (kpiRes) => {
            const raw = (kpiRes.data ?? {}) as any;
            setInvoiceSummary({
              totalAmount: Number(raw.total_amount || 0),
              paidAmount: Number(raw.paid_amount || 0),
              remainingAmount: Number(raw.remaining_amount || 0),
              profitTotal: Number(raw.profit_total || 0),
              count: Number(raw.count || 0),
            });
          }),
        ]);
      } else if (isWarehouseTransfer) {
        const transferQuery = documentListQuery({ scope: 'warehouse_transfer', kind: kind, filters: columns.filters,
          dateFrom, dateTo, showDeleted, sortOrder }).range(from, to, signal);

        await Promise.all([
          loadDocumentSection(signal, transferQuery, setLoading, setListError, (transRes) => {
            setTransferRows((transRes.data ?? []) as WarehouseTransferRow[]);
            setTotalCount(transRes.count ?? 0);
          }),
          loadDocumentSection(signal, supabase.rpc('get_warehouse_transfer_kpis_columns', {
            p_columns: columns.filters,
            p_search: null,
            p_date_from: dateFrom || null,
            p_date_to: dateTo || null,
            p_show_deleted: showDeleted,
          }).abortSignal(signal), setSummaryLoading, setSummaryError, (kpiRes) => {
            const raw = (kpiRes.data ?? {}) as any;
            setTransferSummary({
              totalValue: Number(raw.total_value || 0),
              totalQty: Number(raw.total_qty || 0),
              count: Number(raw.count || 0),
            });
          }),
        ]);
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [
    requestKey,
    kind,
    invoiceKind,
    isWarehouseTransfer,
    version,
    showDeleted,
    page,
    columns.filters,
    dateFrom,
    dateTo,
    sortOrder,
  ]);

  useEffect(() => {
    if (page > pageCount && pageCount > 0) {
      setPage(pageCount);
    }
  }, [page, pageCount, setPage]);

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
    modalRequestRef.current += 1;
    setEditing(null);
    setEditingTransfer(null);
    openedFromViewRef.current = false;
    openedTransferFromViewRef.current = false;
    setModalMode('create');
    setFormOpen(true);
  }

  async function openTransferModal(transfer: WarehouseTransferRow, mode: 'view' | 'edit' = 'view') {
    const reqId = ++modalRequestRef.current;
    openedTransferFromViewRef.current = mode === 'view';
    try {
      const lines = await loadTransferLines(transfer.id);
      if (modalRequestRef.current !== reqId) return;
      setEditingTransfer({ ...transfer, lines });
      setEditing(null);
    } catch (error) {
      if (modalRequestRef.current !== reqId) return;
      toast.error(errorMessage(error));
      return;
    }
    setModalMode(mode);
    setFormOpen(true);
  }

  async function openInvoiceModal(invoice: InvoiceRow, mode: 'view' | 'edit' = 'view') {
    const reqId = ++modalRequestRef.current;
    openedFromViewRef.current = mode === 'view';
    try {
      const lines = await loadInvoiceLines(invoice.id);
      if (modalRequestRef.current !== reqId) return;
      setEditing({ invoice, lines });
      setEditingTransfer(null);
    } catch (error) {
      if (modalRequestRef.current !== reqId) return;
      toast.error(errorMessage(error));
      return;
    }
    setModalMode(mode);
    setFormOpen(true);
  }

  async function remove(invoice: InvoiceRow) {
    const label =
      invoice.kind === 'sale_return' || invoice.kind === 'purchase_return'
        ? 'المرتجع'
        : invoice.kind === 'waste'
          ? 'فاتورة الهالك'
          : 'الفاتورة';
    const confirmed = await askConfirmation(
      `حذف ${label} ${invoice.number}؟\n` +
        `سيُستثنى هو وإيصاله المرتبط من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».`,
      'حذف',
      { danger: true },
    );
    if (!confirmed) return;

    const { error: rpcError } = await supabase.rpc('delete_invoice', { p_invoice_id: invoice.id });
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    toast.success(`تم نقل ${label} ${invoice.number} إلى المحذوفات`);
    setFormOpen(false);
    setEditing(null);
    setVersion((current) => current + 1);
    void refresh(invoiceChanges(Number(invoice.paid) > 0));
  }

  async function restore(invoice: InvoiceRow) {
    const label =
      invoice.kind === 'sale_return' || invoice.kind === 'purchase_return'
        ? 'المرتجع'
        : invoice.kind === 'waste'
          ? 'فاتورة الهالك'
          : 'الفاتورة';
    const confirmed = await askConfirmation(
      `استعادة ${label} ${invoice.number}؟\n` +
        'سيعود مع إيصاله المرتبط ويُعاد تأثيره على المخزون والأرصدة.',
      'استعادة',
    );
    if (!confirmed) return;

    const { error: rpcError } = await supabase.rpc('restore_invoice', {
      p_invoice_id: invoice.id,
    });
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    toast.success(`تم استعادة ${label} ${invoice.number}`);
    setFormOpen(false);
    setEditing(null);
    setVersion((current) => current + 1);
    void refresh(invoiceChanges(Number(invoice.paid) > 0));
  }

  async function removeTransfer(transfer: WarehouseTransferRow) {
    if (
      !(await askConfirmation(
        `حذف التحويل ${transfer.number}؟ سيعود المخزون إلى أرصدته السابقة إذا لم توجد حركات لاحقة على هذه الأصناف.`,
        'حذف',
        { danger: true },
      ))
    )
      return;

    const { error: rpcError } = await supabase.rpc('delete_warehouse_transfer', {
      p_transfer_id: transfer.id,
    });
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }
    toast.success(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    setFormOpen(false);
    setEditingTransfer(null);
    setVersion((current) => current + 1);
    void refresh(STOCK_CHANGES);
  }

  async function restoreTransfer(transfer: WarehouseTransferRow) {
    if (
      !(await askConfirmation(
        `استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة المخزون.`,
        'استعادة',
      ))
    )
      return;

    const { error: rpcError } = await supabase.rpc('restore_warehouse_transfer', {
      p_transfer_id: transfer.id,
    });
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }
    toast.success(`تم استعادة التحويل ${transfer.number}`);
    setFormOpen(false);
    setEditingTransfer(null);
    setVersion((current) => current + 1);
    void refresh(STOCK_CHANGES);
  }

  async function handleSaved(message: string, affectsCash = false) {
    toast.success(message);
    setVersion((current) => current + 1);
    void refresh(isWarehouseTransfer ? STOCK_CHANGES : invoiceChanges(affectsCash));

    try {
      if (modalMode === 'edit' && openedFromViewRef.current && editing) {
        const invoiceId = editing.invoice.id;
        const [invoice, lines] = await Promise.all([
          supabase.from('v_invoice_list').select('*').eq('id', invoiceId).maybeSingle(),
          loadInvoiceLines(invoiceId),
        ]);
        if (invoice.data && !invoice.error) {
          setEditing({ invoice: invoice.data as InvoiceRow, lines });
          setModalMode('view');
          return;
        }
      }

      if (modalMode === 'edit' && openedTransferFromViewRef.current && editingTransfer) {
        const transferId = editingTransfer.id;
        const [transfer, lines] = await Promise.all([
          supabase.from('v_warehouse_transfer_list').select('*').eq('id', transferId).maybeSingle(),
          loadTransferLines(transferId),
        ]);
        if (transfer.data && !transfer.error) {
          setEditingTransfer({ ...(transfer.data as WarehouseTransferRow), lines });
          setModalMode('view');
          return;
        }
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }

    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
  }

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    return (
      <Navigate
        to={firstAllowedTab ? `/invoices?tab=${firstAllowedTab.value}` : '/access-denied'}
        replace
      />
    );
  }

  return (
    <DocumentListPage
      title={tabTitle}
      tabs={visibleTabs}
      activeTab={kind}
      onTabChange={switchKind}
      kpiItems={kpiItems}
      summaryLoading={summaryLoading}
      listLoading={loading}
      listError={listError}
      summaryError={summaryError}
      onRetry={() => setVersion((current) => current + 1)}
      kpiAriaLabel={`مؤشرات ${tabTitle}`}
      toolbarScope={isWarehouseTransfer ? 'warehouse_transfer' : 'invoice'}
      toolbarKind={kind}
      toolbarFilters={columns.filters}
      canViewProfit={canViewProfit}
      dateFrom={dateFrom}
      dateTo={dateTo}
      onDatesChange={(from, to) => {
        setDateFrom(from);
        setDateTo(to);
      }}
      onResetFilters={columns.reset}
      showDeleted={showDeleted}
      onDeletedToggle={toggleDeleted}
      sortOrder={sortOrder}
      newLabel={`+ ${newLabel}`}
      onNew={!showDeleted && can(`goods.${kind}.create`) ? openNew : undefined}
      toolbarDisabled={listError || loading || columns.values !== columns.filters}
      page={page}
      totalCount={activeTotalCount}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      modalOpen={formOpen}
      modalTitle={formTitle}
      modalOnClose={() => {
        setFormOpen(false);
        setEditing(null);
        setEditingTransfer(null);
      }}
      modalResources={formResources}
      modalOnRetry={() => void refresh(formResources)}
      modalResourceStatus={resourceStatus}
      modalGateKey={
        isWarehouseTransfer
          ? (editingTransfer?.id ?? 'new-transfer') + modalMode
          : (editing?.invoice.id ?? 'new-invoice') + modalMode
      }
      modalClassName="transaction-entry-modal invoice-entry-modal"
      modalBackdropClassName="transaction-entry-backdrop"
      renderModalContent={() =>
        isWarehouseTransfer ? (
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
            onEdit={!showDeleted && can(`goods.${kind}.edit`) ? () => setModalMode('edit') : undefined}
            onDelete={
              !showDeleted && can(`goods.${kind}.delete`) && editingTransfer
                ? () => void removeTransfer(editingTransfer)
                : undefined
            }
            onRestore={
              showDeleted && can(`goods.${kind}.delete`) && editingTransfer
                ? async () => {
                    await restoreTransfer(editingTransfer);
                    setFormOpen(false);
                    setEditingTransfer(null);
                  }
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
            onEdit={!showDeleted && can(`goods.${kind}.edit`) ? () => setModalMode('edit') : undefined}
            onDelete={
              !showDeleted && can(`goods.${kind}.delete`) && editing
                ? () => void remove(editing.invoice)
                : undefined
            }
            onRestore={
              showDeleted && can(`goods.${kind}.delete`) && editing
                ? async () => {
                    await restore(editing.invoice);
                    setFormOpen(false);
                    setEditing(null);
                  }
                : undefined
            }
            onPrint={() => window.print()}
          />
        )
      }
      confirmation={
        confirmation
          ? {
              title: confirmation.title,
              message: confirmation.message,
              confirmLabel: confirmation.confirmLabel,
              danger: confirmation.danger === true,
              onConfirm: () => finishConfirmation(true),
              onCancel: () => finishConfirmation(false),
            }
          : null
      }
    >
      <div className="erp-table-wrap">
        {isWarehouseTransfer ? (
          <WarehouseTransferTable
            columnFilter={columnFilter}
            loading={loading}
            pageTransfers={pageTransfers}
            sortOrder={sortOrder}
            onSort={setSortOrder}
            showDeleted={showDeleted}
            onView={(transfer) => void openTransferModal(transfer, 'view')}
            onEdit={(transfer) => void openTransferModal(transfer, 'edit')}
            onDelete={(transfer) => void removeTransfer(transfer)}
            onRestore={(transfer) => void restoreTransfer(transfer)}
            canEdit={can(`goods.${kind}.edit`)}
            canDelete={can(`goods.${kind}.delete`)}
            canViewProfit={canViewProfit}
          />
        ) : (
          <InvoiceTable
            columnFilter={columnFilter}
            loading={loading}
            pageInvoices={pageInvoices}
            kind={kind}
            partyHeader={partyHeader}
            sortOrder={sortOrder}
            onSort={setSortOrder}
            showDeleted={showDeleted}
            newLabel={newLabel}
            isReturn={isReturn}
            onView={(invoice) => void openInvoiceModal(invoice, 'view')}
            onEdit={(invoice) => void openInvoiceModal(invoice, 'edit')}
            onDelete={(invoice) => void remove(invoice)}
            onRestore={(invoice) => void restore(invoice)}
            canEdit={can(`goods.${kind}.edit`)}
            canDelete={can(`goods.${kind}.delete`)}
          />
        )}
      </div>
    </DocumentListPage>
  );
}

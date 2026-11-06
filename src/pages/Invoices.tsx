import Pagination from '../components/Pagination';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { translateDbError } from '../lib/errors';
import { buildPostgrestOrFilter } from '../lib/search';
import InvoiceForm from '../components/InvoiceForm';
import WarehouseTransferForm from '../components/WarehouseTransferForm';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import PeriodFilter from '../components/PeriodFilter';
import { periodDates } from '../lib/period';
import SearchableSelect from '../components/SearchableSelect';
import KpiBar from '../components/KpiBar';
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
import InvoiceTable, { type SaleSort, type SaleStatus } from './invoices/InvoiceTable';
import WarehouseTransferTable from './invoices/WarehouseTransferTable';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

const PAGE_SIZE = 20;

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

  const [formOpen, setFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const openedFromViewRef = useRef(false);
  const openedTransferFromViewRef = useRef(false);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<
    (WarehouseTransferRow & { lines: WarehouseTransferLine[] }) | null
  >(null);
  const [version, setVersion] = useState(0);
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();
  const [showDeleted, setShowDeleted] = useState(false);

  // الفلاتر الموحدة
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleStatus>('all');
  const [dateFrom, setDateFrom] = useState(() => periodDates().from);
  const [dateTo, setDateTo] = useState(() => periodDates().to);
  const [sortOrder, setSortOrder] = useState<SaleSort>('date-desc');
  const [page, setPage] = useState(1);

  const isWarehouseTransfer = kind === 'warehouse_transfer';
  const invoiceKind = isWarehouseTransfer ? null : kind;
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const visibleTabs = INVOICE_TABS.filter((tab) => can(`goods.${tab.value}.view`));
  const canViewCurrentTab = can(`goods.${kind}.view`);

  useEffect(() => {
    const targetKind = tabParam && VALID_INVOICE_TABS.includes(tabParam) ? tabParam : 'sale';
    const action = searchParams.get('action');

    if (targetKind !== kind) {
      setKind(targetKind);
      setEditing(null);
      setEditingTransfer(null);
      setSearchTerm('');
      setStatusFilter('all');
      setDateFrom(periodDates().from);
      setDateTo(periodDates().to);
      setPage(1);

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
      } else {
        setFormOpen(false);
      }
    } else if (action === 'new') {
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  // تأخير البحث لمنع إرسال طلبات متعددة مع كل حرف (Debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;
      const trimmedSearch = debouncedSearch.trim();

      try {
        if (invoiceKind) {
          let query = supabase
            .from('v_invoice_list')
            .select('*', { count: 'exact' })
            .eq('kind', invoiceKind);

          if (showDeleted) {
            query = query.not('deleted_at', 'is', null);
          } else {
            query = query.is('deleted_at', null);
          }

          if (dateFrom) {
            query = query.gte('invoice_date', dateFrom);
          }
          if (dateTo) {
            query = query.lte('invoice_date', dateTo);
          }
          if (kind !== 'waste' && statusFilter !== 'all') {
            if (statusFilter === 'paid') {
              query = query.lte('remaining', 0);
            } else if (statusFilter === 'partial') {
              query = query.gt('paid', 0).gt('remaining', 0);
            } else if (statusFilter === 'unpaid') {
              query = query.lte('paid', 0).gt('remaining', 0);
            }
          }
          if (trimmedSearch) {
            query = query.or(
              buildPostgrestOrFilter(['number', 'account_name', 'account_phone', 'warehouse_name', 'notes'], trimmedSearch),
            );
          }

          if (sortOrder === 'total-desc') {
            query = query.order('total', { ascending: false }).order('number', { ascending: false });
          } else if (sortOrder === 'total-asc') {
            query = query.order('total', { ascending: true }).order('number', { ascending: true });
          } else if (sortOrder === 'number-desc') {
            query = query.order('number', { ascending: false });
          } else if (sortOrder === 'number-asc') {
            query = query.order('number', { ascending: true });
          } else if (sortOrder === 'account-desc') {
            query = query.order('account_name', { ascending: false }).order('number', { ascending: false });
          } else if (sortOrder === 'account-asc') {
            query = query.order('account_name', { ascending: true }).order('number', { ascending: true });
          } else if (sortOrder === 'remaining-desc') {
            query = query.order('remaining', { ascending: false }).order('number', { ascending: false });
          } else if (sortOrder === 'remaining-asc') {
            query = query.order('remaining', { ascending: true }).order('number', { ascending: true });
          } else if (sortOrder === 'date-asc') {
            query = query.order('invoice_date', { ascending: true }).order('number', { ascending: true });
          } else {
            query = query.order('invoice_date', { ascending: false }).order('number', { ascending: false });
          }

          query = query.range(from, to);

          const [docRes, kpiRes] = await Promise.all([
            query,
            supabase.rpc('get_invoice_kpis', {
              p_kind: invoiceKind,
              p_search: trimmedSearch || null,
              p_status: kind === 'waste' ? 'all' : statusFilter,
              p_date_from: dateFrom || null,
              p_date_to: dateTo || null,
              p_show_deleted: showDeleted,
            }),
          ]);

          if (!alive) return;

          if (docRes.error) {
            toast.error(translateDbError(docRes.error.message));
          } else {
            setRows((docRes.data ?? []) as InvoiceRow[]);
            setTotalCount(docRes.count ?? 0);
          }

          if (kpiRes.data) {
            const raw = kpiRes.data as any;
            setInvoiceSummary({
              totalAmount: Number(raw.total_amount || 0),
              paidAmount: Number(raw.paid_amount || 0),
              remainingAmount: Number(raw.remaining_amount || 0),
              profitTotal: Number(raw.profit_total || 0),
              count: Number(raw.count || 0),
            });
          }
        } else if (isWarehouseTransfer) {
          let transferQuery = supabase
            .from('v_warehouse_transfer_list')
            .select('*', { count: 'exact' });

          if (showDeleted) {
            transferQuery = transferQuery.not('deleted_at', 'is', null);
          } else {
            transferQuery = transferQuery.is('deleted_at', null);
          }

          if (dateFrom) {
            transferQuery = transferQuery.gte('transfer_date', dateFrom);
          }
          if (dateTo) {
            transferQuery = transferQuery.lte('transfer_date', dateTo);
          }
          if (trimmedSearch) {
            transferQuery = transferQuery.or(
              buildPostgrestOrFilter(
                ['number', 'source_warehouse_name', 'destination_warehouse_name', 'notes'],
                trimmedSearch,
              ),
            );
          }

          if (sortOrder === 'total-desc') {
            transferQuery = transferQuery
              .order('total_value', { ascending: false })
              .order('number', { ascending: false });
          } else if (sortOrder === 'total-asc') {
            transferQuery = transferQuery
              .order('total_value', { ascending: true })
              .order('number', { ascending: true });
          } else if (sortOrder === 'number-desc') {
            transferQuery = transferQuery.order('number', { ascending: false });
          } else if (sortOrder === 'number-asc') {
            transferQuery = transferQuery.order('number', { ascending: true });
          } else if (sortOrder === 'date-asc') {
            transferQuery = transferQuery
              .order('transfer_date', { ascending: true })
              .order('number', { ascending: true });
          } else {
            transferQuery = transferQuery
              .order('transfer_date', { ascending: false })
              .order('number', { ascending: false });
          }

          transferQuery = transferQuery.range(from, to);

          const [transRes, kpiRes] = await Promise.all([
            transferQuery,
            supabase.rpc('get_warehouse_transfer_kpis', {
              p_search: trimmedSearch || null,
              p_date_from: dateFrom || null,
              p_date_to: dateTo || null,
              p_show_deleted: showDeleted,
            }),
          ]);

          if (!alive) return;

          if (transRes.error) {
            toast.error(translateDbError(transRes.error.message));
          } else {
            setTransferRows((transRes.data ?? []) as WarehouseTransferRow[]);
            setTotalCount(transRes.count ?? 0);
          }

          if (kpiRes.data) {
            const raw = kpiRes.data as any;
            setTransferSummary({
              totalValue: Number(raw.total_value || 0),
              totalQty: Number(raw.total_qty || 0),
              count: Number(raw.count || 0),
            });
          }
        }
      } catch (err: any) {
        if (alive) {
          toast.error(translateDbError(err?.message || 'فشل تحميل البيانات'));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [
    kind,
    invoiceKind,
    isWarehouseTransfer,
    version,
    showDeleted,
    page,
    debouncedSearch,
    statusFilter,
    dateFrom,
    dateTo,
    sortOrder,
  ]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, sortOrder, kind, showDeleted]);

  useEffect(() => {
    if (page > pageCount && pageCount > 0) {
      setPage(pageCount);
    }
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
    openedTransferFromViewRef.current = mode === 'view';
    const { data, error: linesError } = await supabase
      .from('v_warehouse_transfer_items')
      .select('item_id, qty, unit_cost')
      .eq('transfer_id', transfer.id)
      .order('item_id');
    if (linesError) {
      toast.error(translateDbError(linesError.message));
      return;
    }
    setEditingTransfer({ ...transfer, lines: (data ?? []) as WarehouseTransferLine[] });
    setEditing(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  async function openInvoiceModal(invoice: InvoiceRow, mode: 'view' | 'edit' = 'view') {
    openedFromViewRef.current = mode === 'view';
    const { data, error: linesError } = await supabase
      .from('invoice_items')
      .select('item_id, qty, unit_price')
      .eq('invoice_id', invoice.id)
      .order('created_at');

    if (linesError) {
      toast.error(translateDbError(linesError.message));
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
        : invoice.kind === 'waste'
          ? 'فاتورة الهالك'
          : 'الفاتورة';
    const confirmed = await askConfirmation(
      `حذف ${label} ${invoice.number}؟\n` +
        `سيُستثنى هو وإيصاله المرتبط من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».`,
      'حذف',
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
    void refresh();
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
    void refresh();
  }

  async function removeTransfer(transfer: WarehouseTransferRow) {
    if (
      !(await askConfirmation(
        `حذف التحويل ${transfer.number}؟ سيعود المخزون إلى أرصدته السابقة إذا لم توجد حركات لاحقة على هذه الأصناف.`,
        'حذف',
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
    void refresh();
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
    void refresh();
  }

  async function handleSaved(message: string) {
    toast.success(message);
    setVersion((current) => current + 1);
    void refresh();

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

    if (modalMode === 'edit' && openedTransferFromViewRef.current && editingTransfer) {
      const transferId = editingTransfer.id;
      const [trRes, linesRes] = await Promise.all([
        supabase.from('v_warehouse_transfer_list').select('*').eq('id', transferId).maybeSingle(),
        supabase
          .from('v_warehouse_transfer_items')
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
    return (
      <Navigate
        to={firstAllowedTab ? `/invoices?tab=${firstAllowedTab.value}` : '/access-denied'}
        replace
      />
    );
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
          {isWarehouseTransfer
            ? 'التحويلات المحذوفة لا تؤثر على المخزون، ويمكن استعادتها ما لم توجد حركات لاحقة.'
            : 'هذه المستندات محذوفة: لا تؤثر على الأرصدة أو المخزون، ويمكن استعادتها في أي وقت.'}
        </p>
      )}

      {/* شريط المؤشرات والإجماليات المتفاعل مع الفلاتر */}
      <KpiBar items={kpiItems} ariaLabel={`مؤشرات ${tabTitle}`} />

      {/* جدول البيانات */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
          <div className="erp-toolbar">
            <div className="erp-filters">
              {!isWarehouseTransfer && kind !== 'waste' && (
                <SearchableSelect
                  label="الحالة"
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

              <PeriodFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />

              <label className="erp-search">
                <span className="filter-label">بحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={
                    isWarehouseTransfer
                      ? 'بحث بالرقم أو المخزن أو الملاحظات…'
                      : 'رقم، حساب، هاتف، مخزن، ملاحظات…'
                  }
                />
              </label>
            </div>
          </div>

          <div className="erp-table-wrap">
            {isWarehouseTransfer ? (
              <WarehouseTransferTable
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
                loading={loading}
                pageInvoices={pageInvoices}
                kind={kind}
                partyHeader={partyHeader}
                sortOrder={sortOrder}
                onSort={setSortOrder}
                canViewProfit={Boolean(canViewProfit)}
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

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={activeTotalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            loading={loading}
          />
        </section>
      </div>

      {/* نافذة الفاتورة والتحويل المنبثقة الموحدة */}
      {formOpen && (
        <Modal
          className={
            isWarehouseTransfer
              ? 'transaction-entry-modal'
              : 'transaction-entry-modal invoice-entry-modal'
          }
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

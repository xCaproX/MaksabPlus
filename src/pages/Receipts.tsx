import ColumnFilterRow from '../components/ColumnFilterRow';
import { useColumnFilters } from '../lib/useColumnFilters';
import { useDocumentPageNumber } from '../lib/useDocumentPageNumber';
import Pagination from '../components/Pagination';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import MasterDataGate from '../components/MasterDataGate';
import CashBoxTransferForm from '../components/CashBoxTransferForm';
import ReceiptForm from '../components/ReceiptForm';
import ConfirmDialog from '../components/ConfirmDialog';
import DocumentListToolbar from '../components/DocumentListToolbar';
import { documentListQuery } from '../lib/documentListQuery';
import { periodDates } from '../lib/period';
import KpiBar from '../components/KpiBar';
import { toast } from '../components/Toast';
import type {
  ReceiptDirection,
  ReceiptRow,
  CashBoxTransferRow,
} from '../lib/types';
import { useAccess } from '../lib/access';
import { useConfirmDialog } from '../lib/useConfirmDialog';
import { useMasterData } from '../context/MasterDataContext';
import ReceiptTable, { type ReceiptSort } from './receipts/ReceiptTable';
import CashBoxTransferTable from './receipts/CashBoxTransferTable';
import {
  calculateReceiptKpis,
  RECEIPT_TABS,
  VALID_RECEIPT_TABS,
  type ReceiptTab,
  type ReceiptKpiSummary,
  type CashBoxTransferKpiSummary,
} from './receipts/receiptKpis';

const PAGE_SIZE = 20;
const CASH_BOX_RESOURCES = ['cashBoxes'] as const;
const RECEIPT_RESOURCES = ['cashBoxes', 'accounts'] as const;

export default function Receipts() {
  const { can } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ReceiptTab | null;
  const initialTab: ReceiptTab = tabParam && VALID_RECEIPT_TABS.includes(tabParam) ? tabParam : 'in';
  const [tab, setTab] = useState<ReceiptDirection | 'cash_box_transfer'>(initialTab);
  const [direction, setDirection] = useState<ReceiptDirection>(initialTab === 'cash_box_transfer' ? 'in' : initialTab);

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [transferRows, setTransferRows] = useState<CashBoxTransferRow[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [dateFrom, setDateFrom] = useState(() => periodDates().from);
  const [dateTo, setDateTo] = useState(() => periodDates().to);
  const [sortOrder, setSortOrder] = useState<ReceiptSort>('date-desc');

  useEffect(() => {
    const targetTab = tabParam && VALID_RECEIPT_TABS.includes(tabParam) ? tabParam : 'in';
    const action = searchParams.get('action');

    if (targetTab !== tab) {
      setTab(targetTab);
      if (targetTab === 'in' || targetTab === 'out') {
        setDirection(targetTab);
      }
      resetForm();
      setEditing(null);
      setEditingTransfer(null);
      setDateFrom(periodDates().from);
      setDateTo(periodDates().to);

      if (action === 'new') {
        const canCreate = can(`money.${targetTab}.create`);
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
      const canCreate = can(`money.${tab}.create`);
      if (canCreate) {
        resetForm();
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
  }, [tabParam, tab, searchParams, can, setSearchParams]);

  const isCashBoxTransfer = tab === 'cash_box_transfer';
  const isIn = direction === 'in';
  const visibleTabs = RECEIPT_TABS.filter((item) => can(`money.${item.value}.view`));
  const canViewCurrentTab = can(`money.${tab}.view`);
  const formResources = formOpen && !isCashBoxTransfer ? RECEIPT_RESOURCES : CASH_BOX_RESOURCES;
  const { accounts: rawAccounts, cashBoxes, refresh, resourceStatus } = useMasterData(canViewCurrentTab ? formResources : undefined);
  const accounts = useMemo(() => rawAccounts.filter((a) => a.is_active), [rawAccounts]);


  const tabTitle = isCashBoxTransfer ? 'تحويلات الخزن' : isIn ? 'إيصالات الاستلام' : 'إيصالات الصرف';

  const [totalCount, setTotalCount] = useState(0);

  const columns = useColumnFilters(tab, () => {
    setDateFrom(periodDates().from); setDateTo(periodDates().to); setShowDeleted(false); setPage(1);
  });
  const { page, setPage } = useDocumentPageNumber([columns.filters, dateFrom, dateTo, sortOrder, tab, showDeleted]);
  const columnFilter = <ColumnFilterRow scope={isCashBoxTransfer ? 'cash_transfer' : 'receipt'} kind={direction}
     values={columns.values} onChange={columns.setField} onReset={columns.reset}
    options={{ cashBoxes: cashBoxes.map((b) => ({ value: b.id, label: b.name })) }} />;

  const [receiptSummary, setReceiptSummary] = useState<ReceiptKpiSummary>({
    totalAmount: 0,
    invoiceLinked: 0,
    count: 0,
  });
  const [transferSummary, setTransferSummary] = useState<CashBoxTransferKpiSummary>({
    totalAmount: 0,
    count: 0,
  });


  const activeTotalCount = totalCount;
  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));
  const pageReceipts = rows;
  const pageTransfers = transferRows;

  const kpiItems = useMemo(
    () =>
      calculateReceiptKpis({
        isCashBoxTransfer,
        isIn,
        receiptSummary,
        transferSummary,
      }),
    [isCashBoxTransfer, isIn, receiptSummary, transferSummary],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function fetchReceipts() {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;

      try {
        if (!isCashBoxTransfer) {
          const query = documentListQuery({ scope: 'receipt', kind: direction, filters: columns.filters,
            dateFrom, dateTo, showDeleted, sortOrder }).range(from, to, signal);

          const [dataRes, kpiRes] = await Promise.all([
            query,
            supabase.rpc('get_receipt_kpis_columns', {
              p_columns: columns.filters,
              p_direction: direction,
              p_cash_box_id: null,
              p_search: null,
              p_date_from: dateFrom || null,
              p_date_to: dateTo || null,
              p_show_deleted: showDeleted,
            }).abortSignal(signal),
          ]);

          if (signal.aborted) return;
          if (dataRes.error) throw dataRes.error;

          setRows((dataRes.data || []) as ReceiptRow[]);
          setTotalCount(dataRes.count ?? 0);
          if (kpiRes.error) throw kpiRes.error;
          if (kpiRes.data) {
            const raw = kpiRes.data as {
              total_amount?: number;
              invoice_linked?: number;
              count?: number;
            };
            setReceiptSummary({
              totalAmount: Number(raw.total_amount || 0),
              invoiceLinked: Number(raw.invoice_linked || 0),
              count: Number(raw.count || 0),
            });
          }
        } else {
          const query = documentListQuery({ scope: 'cash_transfer', kind: direction, filters: columns.filters,
            dateFrom, dateTo, showDeleted, sortOrder }).range(from, to, signal);

          const [dataRes, kpiRes] = await Promise.all([
            query,
            supabase.rpc('get_cash_box_transfer_kpis_columns', {
              p_columns: columns.filters,
              p_cash_box_id: null,
              p_search: null,
              p_date_from: dateFrom || null,
              p_date_to: dateTo || null,
              p_show_deleted: showDeleted,
            }).abortSignal(signal),
          ]);

          if (signal.aborted) return;
          if (dataRes.error) throw dataRes.error;

          setTransferRows((dataRes.data || []) as CashBoxTransferRow[]);
          setTotalCount(dataRes.count ?? 0);
          if (kpiRes.error) throw kpiRes.error;
          if (kpiRes.data) {
            const raw = kpiRes.data as {
              total_amount?: number;
              count?: number;
            };
            setTransferSummary({
              totalAmount: Number(raw.total_amount || 0),
              count: Number(raw.count || 0),
            });
          }
        }
      } catch (err: unknown) {
        const errorObj = err as { message?: string };
        if (!signal.aborted) toast.error(translateDbError(errorObj?.message || 'فشل تحميل البيانات'));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    if (canViewCurrentTab) {
      void fetchReceipts();
    }
    return () => {
      controller.abort();
    };
  }, [
    tab,
    direction,
    isCashBoxTransfer,
    showDeleted,
    version,
    canViewCurrentTab,
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

  function resetForm() {
    setEditing(null);
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
    openedFromViewRef.current = mode === 'view';
    setEditing(receipt);
    setEditingTransfer(null);
    setModalMode(mode);
    setFormOpen(true);
  }

  function openTransferModal(transfer: CashBoxTransferRow, mode: 'view' | 'edit' = 'view') {
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
    toast.success(message);
    setVersion((current) => current + 1);
    void refresh(isCashBoxTransfer ? CASH_BOX_RESOURCES : RECEIPT_RESOURCES);

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
      { danger: true },
    );
    if (!confirmed) return;

    const { error: rpcError } = await supabase.rpc('delete_free_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    toast.success(`تم نقل الإيصال ${receipt.number} إلى المحذوفات`);
    if (editing?.id === receipt.id) {
      closeForm();
    }
    setVersion((current) => current + 1);
    void refresh(RECEIPT_RESOURCES);
  }

  async function restore(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `استعادة الإيصال ${receipt.number}؟\nسيُعاد تأثيره على رصيد الحساب والخزنة.`,
      'استعادة',
    );
    if (!confirmed) return;

    const { error: rpcError } = await supabase.rpc('restore_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    toast.success(`تم استعادة الإيصال ${receipt.number}`);
    setVersion((current) => current + 1);
    void refresh(RECEIPT_RESOURCES);
  }

  async function removeTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيعود الرصيد إلى الخزنة المصدر.`, 'حذف', { danger: true }))) return;
    const { error: rpcError } = await supabase.rpc('delete_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return toast.error(translateDbError(rpcError.message));
    toast.success(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    if (editingTransfer?.id === transfer.id) {
      closeForm();
    }
    setVersion((current) => current + 1);
    void refresh(CASH_BOX_RESOURCES);
  }

  async function restoreTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة الخزن.`, 'استعادة'))) return;
    const { error: rpcError } = await supabase.rpc('restore_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return toast.error(translateDbError(rpcError.message));
    toast.success(`تم استعادة التحويل ${transfer.number}`);
    setVersion((current) => current + 1);
    void refresh(CASH_BOX_RESOURCES);
  }

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    if (firstAllowedTab) {
      return <Navigate to={`/receipts?tab=${firstAllowedTab.value}`} replace />;
    }
    return (
      <div className="erp-page" style={{ padding: '24px' }}>
        <p className="danger">عفواً، ليس لديك صلاحية عرض إيصالات الاستلام أو الصرف أو التحويلات.</p>
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

      <DocumentListToolbar options={{ scope: isCashBoxTransfer ? 'cash_transfer' : 'receipt',
        kind: direction, filters: columns.filters, dateFrom, dateTo, showDeleted, sortOrder,
        title: showDeleted ? 'المحذوفات — '+tabTitle : tabTitle, canViewProfit: false }}
        disabled={loading || columns.values !== columns.filters} onDatesChange={(from,to)=>{setDateFrom(from);setDateTo(to);}} />

      {/* جدول المعاملات ممتد بكامل العرض 100% بتوافق تام مع فواتير المبيعات */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
          <div className="erp-table-wrap">
            {isCashBoxTransfer ? (
              <CashBoxTransferTable
                columnFilter={columnFilter}
                loading={loading}
                pageTransfers={pageTransfers}
                sortOrder={sortOrder}
                onSort={setSortOrder}
                showDeleted={showDeleted}
                onView={(transfer) => openTransferModal(transfer, 'view')}
                onEdit={(transfer) => openTransferModal(transfer, 'edit')}
                onDelete={(transfer) => void removeTransfer(transfer)}
                onRestore={(transfer) => void restoreTransfer(transfer)}
                canEdit={Boolean(can(`money.${tab}.edit`))}
                canDelete={Boolean(can(`money.${tab}.delete`))}
              />
            ) : (
              <ReceiptTable
                columnFilter={columnFilter}
                loading={loading}
                pageReceipts={pageReceipts}
                sortOrder={sortOrder}
                onSort={setSortOrder}
                showDeleted={showDeleted}
                onView={(receipt) => openReceiptModal(receipt, 'view')}
                onEdit={(receipt) => openReceiptModal(receipt, 'edit')}
                onDelete={(receipt) => void remove(receipt)}
                onRestore={(receipt) => void restore(receipt)}
                canEdit={Boolean(can(`money.${tab}.edit`))}
                canDelete={Boolean(can(`money.${tab}.delete`))}
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

      {/* نموذج الإضافة والتعديل والعرض الموحد بالكامل داخل النافذة المنبثقة */}
      {formOpen &&
        (isCashBoxTransfer ? (
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
            <MasterDataGate key={(editingTransfer?.id ?? 'new-transfer') + modalMode} resources={formResources} status={resourceStatus}>
              <CashBoxTransferForm
                key={`${editingTransfer?.id ?? 'new-transfer'}-${modalMode}`}
                cashBoxes={cashBoxes}
                editing={editingTransfer}
                readOnly={modalMode === 'view'}
                onEdit={!showDeleted && can(`money.${tab}.edit`) ? () => setModalMode('edit') : undefined}
                onDelete={
                  !showDeleted && can(`money.${tab}.delete`) && editingTransfer
                    ? () => void removeTransfer(editingTransfer)
                    : undefined
                }
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
            </MasterDataGate>
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
            <MasterDataGate key={(editing?.id ?? 'new-receipt') + modalMode} resources={formResources} status={resourceStatus}>
              <ReceiptForm
                key={`${editing?.id ?? 'new-receipt'}-${modalMode}`}
                direction={editing?.direction ?? direction}
                accounts={accounts}
                cashBoxes={cashBoxes}
                editing={editing}
                readOnly={modalMode === 'view'}
                onEdit={
                  !showDeleted && can(`money.${tab}.edit`) && editing?.is_free
                    ? () => setModalMode('edit')
                    : undefined
                }
                onDelete={
                  !showDeleted && can(`money.${tab}.delete`) && editing?.is_free && editing
                    ? () => void remove(editing)
                    : undefined
                }
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
            </MasterDataGate>
          </Modal>
        ))}

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

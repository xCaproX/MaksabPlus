import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { creationTime, money, qty as formatQty } from '../lib/format';
import { translateDbError } from '../lib/errors';
import InvoiceForm from '../components/InvoiceForm';
import WarehouseTransferForm from '../components/WarehouseTransferForm';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
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

type InvoiceTab = InvoiceKind | 'warehouse_transfer';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

interface ConfirmationRequest { title: string; message: string; confirmLabel: string; resolve: (confirmed: boolean) => void }

export default function Invoices() {
  const { can } = useAccess();
  const [kind, setKind] = useState<InvoiceTab>('sale');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [transferRows, setTransferRows] = useState<WarehouseTransferRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<(WarehouseTransferRow & { lines: WarehouseTransferLine[] }) | null>(null);
  const [viewingTransfer, setViewingTransfer] = useState<WarehouseTransferRow | null>(null);
  const [viewingTransferLines, setViewingTransferLines] = useState<(WarehouseTransferLine & { unit: string })[]>([]);
  const [transferDetailsLoading, setTransferDetailsLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [details, setDetails] = useState<InvoiceItemRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  const isWarehouseTransfer = kind === 'warehouse_transfer';

  function askConfirmation(message: string, confirmLabel: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmation({ title: 'تأكيد العملية', message, confirmLabel, resolve }));
  }

  function finishConfirmation(confirmed: boolean) {
    const request = confirmation;
    setConfirmation(null);
    request?.resolve(confirmed);
  }
  const invoiceKind = isWarehouseTransfer ? null : kind;
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const viewingIsWaste = viewing?.kind === 'waste';
  const viewingIsReturn = Boolean(
    viewing && (viewing.kind === 'sale_return' || viewing.kind === 'purchase_return'),
  );
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
  const formTitle = editingTransfer
    ? `تعديل التحويل ${editingTransfer.number}`
    : editing
    ? `تعديل ${isReturn ? 'المرتجع' : 'الفاتورة'} ${editing.invoice.number}`
    : `${newLabel} ${isWarehouseTransfer ? 'جديد' : 'جديدة'}`;
  const filteredRows = warehouseFilter === 'all'
    ? rows
    : rows.filter((invoice) => invoice.warehouse_id === warehouseFilter);

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
        supabase.from('warehouses').select('id, name, is_active').order('name'),
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
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function switchKind(next: InvoiceTab) {
    if (next === kind) return;
    setKind(next);
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

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>البضاعة</h1>
          <p className="muted">
            {isWarehouseTransfer
              ? 'انقل الأصناف بين المخازن. يتغير رصيد كل مخزن وتكلفة الوجهة من غير تأثير على الحسابات أو ربح الفواتير.'
              : 'الفاتورة تزيد رصيد الحساب، والمرتجع يخصمه ويعدّل المخزون. المدفوع/المسترد يُنشئ إيصالًا تلقائيًا مربوطًا بالمستند. تُعرض تكلفة البيع وربحه، والهالك بتكلفته وخسارته.'}
          </p>
        </div>
        <div className="actions">
          {can('goods.delete') && <button type="button" className="btn" onClick={toggleDeleted}>
            {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
          </button>}
          {!showDeleted && can('goods.create') && (
            <button type="button" className="btn primary" onClick={openNew}>
              + {newLabel}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {(
          [
            { value: 'sale', label: 'فواتير المبيعات' },
            { value: 'purchase', label: 'فواتير المشتريات' },
            { value: 'sale_return', label: 'مرتجعات المبيعات' },
            { value: 'purchase_return', label: 'مرتجعات المشتريات' },
            { value: 'waste', label: 'الهالك' },
            { value: 'warehouse_transfer', label: 'تحويل بين مخازن' },
          ] as const
        ).map((tab) => (
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

      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}
      {showDeleted && (
        <p className="hint">
          {isWarehouseTransfer ? 'التحويلات المحذوفة لا تؤثر على المخزون، ويمكن استعادتها ما لم توجد حركات لاحقة.' : 'هذه المستندات محذوفة: لا تؤثر على الأرصدة أو المخزون، ويمكن استعادتها في أي وقت.'}
        </p>
      )}

      {isWarehouseTransfer && <div className="filter-row">
        <label>
          تصفية حسب المخزن
          <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
            <option value="all">كل المخازن</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}{warehouse.is_active === false ? ' — موقوف' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>}

      {formOpen && (
        <Modal
          className={isWarehouseTransfer ? undefined : 'invoice-entry-modal'}
          backdropClassName={isWarehouseTransfer ? undefined : 'invoice-entry-backdrop'}
          title={formTitle}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setEditingTransfer(null);
          }}
        >
          {isWarehouseTransfer ? <WarehouseTransferForm
            key={editingTransfer?.id ?? 'new-transfer'}
            warehouses={warehouses}
            items={items}
            stockRows={stockRows}
            editing={editingTransfer}
            onSaved={handleSaved}
            onCancel={() => { setFormOpen(false); setEditingTransfer(null); }}
          /> : <InvoiceForm
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
          />}
        </Modal>
      )}

      {isWarehouseTransfer ? <div className="card">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>الرقم</th><th>التاريخ</th><th>وقت الإنشاء</th><th>من مخزن</th><th>إلى مخزن</th><th>عدد الأصناف</th><th>إجمالي الكميات</th><th>قيمة التكلفة المنقولة</th><th>ملاحظات</th><th /></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="empty">جارٍ التحميل…</td></tr>}
            {!loading && transferRows.filter((row) => warehouseFilter === 'all' || row.source_warehouse_id === warehouseFilter || row.destination_warehouse_id === warehouseFilter).length === 0 &&
              <tr><td colSpan={10} className="empty">{warehouseFilter !== 'all' ? 'لا توجد تحويلات للمخزن المحدد.' : showDeleted ? 'لا توجد تحويلات محذوفة.' : 'لا توجد تحويلات مخزنية بعد.'}</td></tr>}
            {!loading && transferRows.filter((row) => warehouseFilter === 'all' || row.source_warehouse_id === warehouseFilter || row.destination_warehouse_id === warehouseFilter).map((transfer) => <tr key={transfer.id}>
              <td className="num">{transfer.number}</td><td className="num">{transfer.transfer_date}</td><td className="num">{creationTime(transfer.created_at)}</td>
              <td>{transfer.source_warehouse_name}</td><td>{transfer.destination_warehouse_name}</td>
              <td className="num">{transfer.line_count}</td><td className="num">{formatQty(transfer.total_qty)}</td>
              <td className="num">{money(transfer.total_value)}</td><td>{transfer.notes || '—'}</td>
              <td className="row-actions">{showDeleted
                ? can('goods.delete') && <button type="button" className="link" onClick={() => restoreTransfer(transfer)}>استعادة</button>
                : <>{can('goods.view') && <button type="button" className="link" onClick={() => void openTransferDetails(transfer)}>عرض</button>}{can('goods.edit') && <button type="button" className="link" onClick={() => void startEditTransfer(transfer)}>تعديل</button>}{can('goods.delete') && <button type="button" className="link danger" onClick={() => void removeTransfer(transfer)}>حذف</button>}</>}
              </td>
            </tr>)}
          </tbody>
        </table></div>
      </div> : <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>وقت الإنشاء</th>
                <th>الحساب</th>
                <th>المخزن</th>
                <th>الخزنة</th>
                <th>الإجمالي</th>
                <th>{kind === 'waste' ? 'الخسارة' : kind === 'sale' || kind === 'sale_return' ? 'الربح / الخسارة' : 'تكلفة الأصناف'}</th>
                <th>{isReturn ? 'المسترد' : 'المدفوع'}</th>
                <th>{isReturn ? 'غير المسترد' : 'المتبقي'}</th>
                <th>الإيصال</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="empty">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="empty">
                    {warehouseFilter !== 'all'
                      ? 'لا توجد مستندات في المخزن المحدد.'
                      : showDeleted
                      ? `لا توجد ${isReturn ? 'مرتجعات' : 'فواتير'} محذوفة.`
                      : `لا توجد ${isReturn ? 'مرتجعات' : 'فواتير'} بعد.`}
                  </td>
                </tr>
              )}

              {!loading &&
                filteredRows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="num">{invoice.number}</td>
                    <td className="num">{invoice.invoice_date}</td>
                    <td className="num">{creationTime(invoice.created_at)}</td>
                    <td>
                      {invoice.account_name}{' '}
                      <span className="muted">
                        ({invoice.account_kind === 'customer' ? 'عميل' : invoice.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                      </span>
                    </td>
                    <td>{invoice.warehouse_name}</td>
                    <td>{invoice.cash_box_name ?? '—'}</td>
                    <td className="num">{money(invoice.total)}</td>
                    <td className="num strong">
                      {money(kind === 'waste' || kind === 'purchase' || kind === 'purchase_return' ? invoice.cost_total : invoice.profit_total)}
                    </td>
                    <td className="num">{kind === 'waste' ? '—' : money(invoice.paid)}</td>
                    <td className={Number(invoice.remaining) > 0 && kind !== 'waste' ? 'num strong' : 'num'}>
                      {kind === 'waste' ? '—' : money(invoice.remaining)}
                    </td>
                    <td className="num muted">{invoice.receipt_number ?? '—'}</td>
                    <td className="row-actions">
                      {showDeleted ? can('goods.delete') ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => restore(invoice)}
                        >
                          استعادة
                        </button>
                      ) : null : (
                        <>
                          {can('goods.view') && <button
                            type="button"
                            className="link"
                            onClick={() => openDetails(invoice)}
                          >
                            عرض
                          </button>}
                          {can('goods.edit') && <button type="button" className="link" onClick={() => startEdit(invoice)}>
                            تعديل
                          </button>}
                          {can('goods.delete') && <button
                            type="button"
                            className="link danger"
                            onClick={() => remove(invoice)}
                          >
                            حذف
                          </button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>}

      {viewingTransfer && <Modal title={`تحويل بين مخازن ${viewingTransfer.number}`} onClose={() => setViewingTransfer(null)}>
        <dl className="doc-meta-list">
          <dt>التاريخ</dt><dd>{viewingTransfer.transfer_date}</dd>
          <dt>وقت الإنشاء</dt><dd className="num">{creationTime(viewingTransfer.created_at)}</dd>
          <dt>من مخزن</dt><dd>{viewingTransfer.source_warehouse_name}</dd>
          <dt>إلى مخزن</dt><dd>{viewingTransfer.destination_warehouse_name}</dd>
          <dt>قيمة التكلفة المنقولة</dt><dd className="num">{money(viewingTransfer.total_value)}</dd>
          <dt>ملاحظات</dt><dd>{viewingTransfer.notes || '—'}</dd>
        </dl>
        <h3 className="modal-section">أصناف التحويل</h3>
        {transferDetailsLoading ? <p className="muted">جارٍ تحميل الأصناف…</p> : viewingTransferLines.length === 0 ? <p className="muted">لا توجد أصناف.</p> : (
          <div className="table-wrap">
            <table className="table subtable">
              <thead><tr><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th></tr></thead>
              <tbody>{viewingTransferLines.map((line) => <tr key={line.item_id}>
                <td>{line.item_name}</td>
                <td className="num">{formatQty(line.qty)} {line.unit}</td>
                <td className="num">{money(line.unit_cost ?? 0)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Modal>}

      {viewing && (
        <Modal
          title={`${viewingIsWaste ? 'فاتورة هالك' : viewingIsReturn ? 'مرتجع' : 'فاتورة'} ${viewing.number}`}
          onClose={() => setViewing(null)}
        >
          <dl className="doc-meta-list">
            <dt>الحساب</dt>
            <dd>
              {viewing.account_name}{' '}
              <span className="muted">
                ({viewing.account_kind === 'customer' ? 'عميل' : viewing.account_kind === 'supplier' ? 'مورد' : 'هالك'})
              </span>
            </dd>
            <dt>التاريخ</dt>
            <dd className="num">{viewing.invoice_date}</dd>
            <dt>وقت الإنشاء</dt>
            <dd className="num">{creationTime(viewing.created_at)}</dd>
            <dt>المخزن</dt>
            <dd>{viewing.warehouse_name}</dd>
            {viewing.cash_box_name && <>
              <dt>الخزنة</dt>
              <dd>{viewing.cash_box_name}</dd>
            </>}
            <dt>{viewingIsWaste ? 'قيمة المستند' : 'الإجمالي'}</dt>
            <dd className="num strong">{money(viewing.total)}</dd>
            <dt>{viewingIsWaste ? 'الخسارة' : viewing.kind === 'sale' || viewing.kind === 'sale_return' ? 'الربح / الخسارة' : 'تكلفة الأصناف'}</dt>
            <dd className="num strong">{money(viewingIsWaste || viewing.kind === 'purchase' || viewing.kind === 'purchase_return' ? viewing.cost_total : viewing.profit_total)}</dd>
            {!viewingIsWaste && <>
              <dt>{viewingIsReturn ? 'المسترد' : 'المدفوع'}</dt>
              <dd className="num">{money(viewing.paid)}</dd>
              <dt>{viewingIsReturn ? 'غير المسترد' : 'المتبقي'}</dt>
              <dd className="num">{money(viewing.remaining)}</dd>
            </>}
            <dt>الإيصال</dt>
            <dd className="num">
              {viewing.receipt_number
                ? `${viewing.receipt_number} — ${money(viewing.receipt_amount ?? 0)}`
                : 'لا يوجد إيصال'}
            </dd>
            <dt>ملاحظات</dt>
            <dd>{viewing.notes || '—'}</dd>
          </dl>

          <h3 className="modal-section">أصناف {viewingIsWaste ? 'الهالك' : viewingIsReturn ? 'المرتجع' : 'الفاتورة'}</h3>
          {detailsLoading ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : details.length === 0 ? (
            <p className="muted">لا توجد سطور.</p>
          ) : (
            <div className="table-wrap">
              <table className="table subtable">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>تكلفة الوحدة</th>
                    <th>الإجمالي</th>
                    <th>تكلفة السطر</th>
                    <th>الربح / الخسارة</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((line) => (
                    <tr key={line.id}>
                      <td>{line.item_name}</td>
                      <td className="num">
                        {formatQty(line.qty)} {line.unit}
                      </td>
                      <td className="num">{money(line.unit_price)}</td>
                      <td className="num">{money(line.unit_cost)}</td>
                      <td className="num">{money(line.line_total)}</td>
                      <td className="num">{money(line.line_cost)}</td>
                      <td className="num">{money(line.line_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

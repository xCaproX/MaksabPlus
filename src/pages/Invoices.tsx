import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, qty as formatQty } from '../lib/format';
import { translateDbError } from '../lib/errors';
import InvoiceForm from '../components/InvoiceForm';
import Modal from '../components/Modal';
import type {
  AccountRow,
  InvoiceItemRow,
  InvoiceKind,
  InvoiceRow,
  ItemRow,
  LineDraft,
  WarehouseOption,
} from '../lib/types';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

export default function Invoices() {
  const [kind, setKind] = useState<InvoiceKind>('sale');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingInvoice | null>(null);
  const [version, setVersion] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [details, setDetails] = useState<InvoiceItemRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const viewingIsWaste = viewing?.kind === 'waste';
  const viewingIsReturn = Boolean(
    viewing && (viewing.kind === 'sale_return' || viewing.kind === 'purchase_return'),
  );
  const newLabel =
    kind === 'waste'
      ? 'فاتورة هالك'
      : kind === 'sale'
      ? 'فاتورة مبيعات'
      : kind === 'purchase'
        ? 'فاتورة مشتريات'
        : kind === 'sale_return'
          ? 'مرتجع مبيعات'
          : 'مرتجع مشتريات';

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      let invoicesQuery = supabase.from('v_invoice_list').select('*').eq('kind', kind);
      invoicesQuery = showDeleted
        ? invoicesQuery.not('deleted_at', 'is', null)
        : invoicesQuery.is('deleted_at', null);

      const [invoicesRes, accountsRes, warehousesRes, itemsRes] = await Promise.all([
        invoicesQuery
          .order('invoice_date', { ascending: false })
          .order('number', { ascending: false }),
        supabase
          .from('v_account_balances')
          .select('*')
          .eq('is_active', true)
          .order('kind')
          .order('name'),
        supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
        supabase.from('v_item_stock').select('*').eq('is_active', true).order('name'),
      ]);

      if (!alive) return;

      const firstError =
        invoicesRes.error ?? accountsRes.error ?? warehousesRes.error ?? itemsRes.error;

      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setRows((invoicesRes.data ?? []) as InvoiceRow[]);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setWarehouses((warehousesRes.data ?? []) as WarehouseOption[]);
      setItems((itemsRes.data ?? []) as ItemRow[]);
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

  function switchKind(next: InvoiceKind) {
    if (next === kind) return;
    setKind(next);
    setFormOpen(false);
    setEditing(null);
    setViewing(null);
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    setEditing(null);
    setViewing(null);
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
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
    const confirmed = window.confirm(
      `حذف ${label} ${invoice.number}؟\n` +
        `سيُستثنى هو وإيصاله المرتبط من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».`,
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
    const confirmed = window.confirm(
      `استعادة ${label} ${invoice.number}؟\n` +
        'سيعود مع إيصاله المرتبط ويُعاد تأثيره على المخزون والأرصدة.',
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

  function handleSaved(message: string) {
    setNotice(message);
    setFormOpen(false);
    setEditing(null);
    setViewing(null);
    setVersion((current) => current + 1);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>الفواتير</h1>
          <p className="muted">
            الفاتورة تزيد رصيد الحساب، والمرتجع يخصمه ويعدّل المخزون. المدفوع/المسترد يُنشئ إيصالًا
            تلقائيًا مربوطًا بالمستند. تُعرض تكلفة البيع وربحه، والهالك بتكلفته وخسارته.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={toggleDeleted}>
            {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
          </button>
          {!showDeleted && (
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
          هذه المستندات محذوفة: لا تؤثر على الأرصدة أو المخزون، ويمكن استعادتها في أي وقت.
        </p>
      )}

      {formOpen && (
        <InvoiceForm
          key={editing?.invoice.id ?? 'new'}
          kind={kind}
          accounts={accounts}
          warehouses={warehouses}
          items={items}
          editing={editing}
          onSaved={handleSaved}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>الحساب</th>
                <th>المخزن</th>
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
                  <td colSpan={10} className="empty">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    {showDeleted
                      ? `لا توجد ${isReturn ? 'مرتجعات' : 'فواتير'} محذوفة.`
                      : `لا توجد ${isReturn ? 'مرتجعات' : 'فواتير'} بعد.`}
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="num">{invoice.number}</td>
                    <td className="num">{invoice.invoice_date}</td>
                    <td>
                      {invoice.account_name}{' '}
                      <span className="muted">
                        ({invoice.account_kind === 'customer' ? 'عميل' : invoice.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                      </span>
                    </td>
                    <td>{invoice.warehouse_name}</td>
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
                      {showDeleted ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => restore(invoice)}
                        >
                          استعادة
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="link"
                            onClick={() => openDetails(invoice)}
                          >
                            عرض
                          </button>
                          <button type="button" className="link" onClick={() => startEdit(invoice)}>
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="link danger"
                            onClick={() => remove(invoice)}
                          >
                            حذف
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

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
            <dt>المخزن</dt>
            <dd>{viewing.warehouse_name}</dd>
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
    </div>
  );
}

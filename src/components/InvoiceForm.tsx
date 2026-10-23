import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { money, qty as formatQty, round2, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import type {
  AccountRow,
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

interface InvoiceFormProps {
  kind: InvoiceKind;
  accounts: AccountRow[];
  warehouses: WarehouseOption[];
  items: ItemRow[];
  editing: EditingInvoice | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), item_id: '', qty: '1', unit_price: '' };
}

export default function InvoiceForm({
  kind,
  accounts,
  warehouses,
  items,
  editing,
  onSaved,
  onCancel,
}: InvoiceFormProps) {
  const isPurchase = kind === 'purchase';

  const [date, setDate] = useState(editing?.invoice.invoice_date ?? today());
  const [accountId, setAccountId] = useState(editing?.invoice.account_id ?? '');
  const [warehouseId, setWarehouseId] = useState(
    editing?.invoice.warehouse_id ?? warehouses[0]?.id ?? '',
  );
  const [paid, setPaid] = useState(editing ? String(Number(editing.invoice.paid)) : '0');
  const [notes, setNotes] = useState(editing?.invoice.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(editing ? editing.lines : [emptyLine()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = round2(
    lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0),
  );
  const paidNumber = Number(paid || 0);
  const remaining = round2(total - (Number.isFinite(paidNumber) ? paidNumber : 0));

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectItem(key: string, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    const price = item
      ? isPurchase
        ? Number(item.purchase_price)
        : Number(item.sale_price)
      : undefined;

    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              item_id: itemId,
              unit_price: price === undefined ? line.unit_price : String(price),
            }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!accountId) return setError('اختر الحساب');
    if (!warehouseId) return setError('اختر المخزن');
    if (!date) return setError('أدخل التاريخ');
    if (lines.length === 0) return setError('أضف سطرًا واحدًا على الأقل');

    const hasInvalidLine = lines.some(
      (line) => !line.item_id || !(Number(line.qty) > 0) || !(Number(line.unit_price) >= 0),
    );
    if (hasInvalidLine) return setError('أكمل بيانات كل السطور أو احذف السطور الفارغة');

    if (!(paidNumber >= 0)) return setError('قيمة المدفوع غير صحيحة');
    if (paidNumber > total) return setError('المدفوع أكبر من إجمالي الفاتورة');

    const args = {
      p_account_id: accountId,
      p_warehouse_id: warehouseId,
      p_invoice_date: date,
      p_paid: round2(paidNumber),
      p_notes: notes.trim() || null,
      p_lines: lines.map((line) => ({
        item_id: line.item_id,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price || 0),
      })),
    };

    setBusy(true);
    const { error: rpcError } = editing
      ? await supabase.rpc('update_invoice', { p_invoice_id: editing.invoice.id, ...args })
      : await supabase.rpc('create_invoice', { p_kind: kind, ...args });
    setBusy(false);

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    onSaved(editing ? 'تم تعديل الفاتورة وتحديث الإيصال' : 'تم حفظ الفاتورة وإنشاء الإيصال');
  }

  return (
    <form className="card invoice-form" onSubmit={submit}>
      <div className="card-head">
        <h2>
          {editing ? `تعديل الفاتورة ${editing.invoice.number}` : isPurchase ? 'فاتورة مشتريات جديدة' : 'فاتورة مبيعات جديدة'}
        </h2>
        {!editing && <span className="badge">ترقيم تلقائي</span>}
      </div>

      <div className="form-grid">
        <label>
          التاريخ
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label>
          {isPurchase ? 'المورد' : 'العميل'}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">اختر…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          المخزن
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
            {warehouses.length === 0 && <option value="">لا يوجد مخزن</option>}
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>

        <label className="span-2">
          ملاحظات
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اختياري"
          />
        </label>
      </div>

      <div className="lines">
        <div className="lines-head">
          <h3>الأصناف</h3>
          <button type="button" className="btn ghost" onClick={addLine}>
            + إضافة سطر
          </button>
        </div>

        <div className="table-wrap">
          <table className="table lines-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th className="w-qty">الكمية</th>
                <th className="w-price">السعر</th>
                <th className="w-total">الإجمالي</th>
                <th className="w-action" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const lineTotal = round2(
                  Number(line.qty || 0) * Number(line.unit_price || 0),
                );
                return (
                  <tr key={line.key}>
                    <td>
                      <select
                        value={line.item_id}
                        onChange={(e) => selectItem(line.key, e.target.value)}
                      >
                        <option value="">اختر صنفًا…</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} — متاح: {formatQty(item.qty)} {item.unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="num">{money(lineTotal)}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        title="حذف السطر"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-footer">
        <div className="totals">
          <div>
            <span className="muted">الإجمالي</span>
            <strong className="num">{money(total)}</strong>
          </div>
          <div>
            <span className="muted">المتبقي</span>
            <strong className="num">{money(remaining)}</strong>
          </div>
          <label className="paid-field">
            المدفوع
            <input
              type="number"
              min="0"
              step="0.01"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
          </label>
        </div>

        <p className="hint">
          {paidNumber > 0
            ? 'سيتم إنشاء إيصال تلقائي بقيمة المدفوع وربطه بالفاتورة.'
            : 'لا يوجد مدفوع: لن يتم إنشاء إيصال.'}
        </p>

        {error && <p className="alert error">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            إلغاء
          </button>
        </div>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { qty as formatQty, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import type { ItemRow, StockOpeningRow, WarehouseOption, WarehouseTransferLine, WarehouseTransferRow } from '../lib/types';

interface EditingWarehouseTransfer extends WarehouseTransferRow {
  lines: WarehouseTransferLine[];
}

interface Props {
  warehouses: WarehouseOption[];
  items: ItemRow[];
  stockRows: StockOpeningRow[];
  editing: EditingWarehouseTransfer | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

type DraftLine = Omit<WarehouseTransferLine, 'qty'> & { key: string; qty: string };

export default function WarehouseTransferForm({ warehouses, items, stockRows, editing, onSaved, onCancel }: Props) {
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.is_active !== false);
  const [sourceId, setSourceId] = useState(editing?.source_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.is_primary)?.id ?? activeWarehouses[0]?.id ?? '');
  const [destinationId, setDestinationId] = useState(editing?.destination_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.id !== sourceId)?.id ?? '');
  const [date, setDate] = useState(editing?.transfer_date ?? today());
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(editing?.lines.map((line) => ({ ...line, key: crypto.randomUUID(), qty: String(Number(line.qty)) })) ?? [{ key: crypto.randomUUID(), item_id: '', qty: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choices = warehouses.filter((warehouse) => warehouse.is_active !== false || warehouse.id === sourceId || warehouse.id === destinationId);
  const selectableItems = items.filter((item) => stockRows.some((stock) => stock.item_id === item.id && stock.warehouse_id === sourceId && Number(stock.current_qty) > 0));

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!sourceId || !destinationId || sourceId === destinationId) return setError('اختر مخزنين مختلفين');
    if (lines.length === 0 || lines.some((line) => !line.item_id || !(Number(line.qty) > 0))) return setError('اختر الأصناف وأدخل كمية صحيحة لكل صنف');
    setBusy(true);
    const args = {
      p_source_warehouse_id: sourceId,
      p_destination_warehouse_id: destinationId,
      p_transfer_date: date,
      p_notes: notes.trim() || null,
      p_lines: lines.map((line) => ({ item_id: line.item_id, qty: Number(line.qty) })),
    };
    const { error: rpcError } = editing
      ? await supabase.rpc('update_warehouse_transfer', { p_transfer_id: editing.id, ...args })
      : await supabase.rpc('create_warehouse_transfer', args);
    setBusy(false);
    if (rpcError) return setError(translateDbError(rpcError.message));
    onSaved(editing ? `تم تعديل التحويل ${editing.number}` : 'تم حفظ التحويل المخزني');
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      {error && <p className="alert error">{error}</p>}
      <div className="form-grid">
        <label className="form-grid-col-4">
          من مخزن (المصدر)
          <select value={sourceId} onChange={(event) => {
            const next = event.target.value;
            setSourceId(next);
            setLines((current) => current.map((line) => ({ ...line, item_id: '', qty: '' })));
            if (next === destinationId) setDestinationId(activeWarehouses.find((warehouse) => warehouse.id !== next)?.id ?? '');
          }} required>
            <option value="">اختر مخزن المصدر…</option>
            {choices.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
        <label className="form-grid-col-4">
          إلى مخزن (الوجهة)
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
            <option value="">اختر مخزن الوجهة…</option>
            {choices.filter((warehouse) => warehouse.id !== sourceId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
        <label className="form-grid-col-4">
          التاريخ
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="form-grid-col-12">
          ملاحظات
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات التحويل (اختياري)…" />
        </label>
      </div>

      <div className="lines">
        <div className="lines-head-bar">
          <div className="lines-head-title">
            <h3>الأصناف المنقولة</h3>
            <span className="lines-count-badge">{lines.length} {lines.length === 1 ? 'صنف' : 'أصناف'}</span>
          </div>
          <button type="button" className="add-line-btn" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), item_id: '', qty: '' }])}>
            <span>+</span>
            <span>إضافة صنف</span>
          </button>
        </div>

        <div className="lines-wrap">
          <table className="lines-table">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>الصنف</th>
                <th style={{ width: '22%' }}>المتاح في المصدر</th>
                <th style={{ width: '20%' }}>الكمية المنقولة</th>
                <th style={{ width: '8%' }} className="center">حذف</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const stock = stockRows.find((row) => row.item_id === line.item_id && row.warehouse_id === sourceId);
                const item = items.find((entry) => entry.id === line.item_id);
                const itemChoices = selectableItems.some((entry) => entry.id === line.item_id) || !line.item_id
                  ? selectableItems
                  : [...selectableItems, ...items.filter((entry) => entry.id === line.item_id)];
                return (
                  <tr key={line.key}>
                    <td>
                      <SearchableSelect
                        value={line.item_id}
                        options={itemChoices.map((entry) => ({ value: entry.id, label: entry.name }))}
                        onChange={(item_id) => updateLine(line.key, { item_id })}
                        placeholder="اختر صنفًا…"
                        searchPlaceholder="اكتب للبحث عن صنف…"
                        emptyMessage="لا توجد أصناف متاحة في مخزن المصدر"
                        required
                      />
                    </td>
                    <td className="num">
                      <strong>{formatQty(stock?.current_qty ?? 0)}</strong> {item?.unit ?? ''}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        max={stock?.current_qty ?? undefined}
                        value={line.qty}
                        onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                        required
                      />
                    </td>
                    <td className="center">
                      <button
                        type="button"
                        className="line-delete-btn"
                        title="حذف هذا الصنف"
                        onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
                        disabled={lines.length === 1}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty" style={{ padding: '16px', textAlign: 'center' }}>
                    اضغط على زر «إضافة صنف» لإضافة أصناف للتحويل.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-footer-smart-hint">
        <span>💡 تُنقل الكمية من مخزن المصدر إلى الوجهة بتكلفة متوسط المصدر. لا يتغير إجمالي المخزون أو رصيد الحسابات.</span>
      </div>

      <div className="form-modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ التحويل'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

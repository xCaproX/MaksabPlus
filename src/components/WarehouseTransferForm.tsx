import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabase';
import { qty as formatQty, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import { toast } from './Toast';
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

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), item_id: '', qty: '' };
}

export default function WarehouseTransferForm({ warehouses, items, stockRows, editing, onSaved, onCancel }: Props) {
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.is_active !== false);
  const [sourceId, setSourceId] = useState(
    editing?.source_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.is_primary)?.id ?? activeWarehouses[0]?.id ?? '',
  );
  const [destinationId, setDestinationId] = useState(
    editing?.destination_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.id !== sourceId)?.id ?? '',
  );
  const [date] = useState(editing?.transfer_date ?? today());
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    editing
      ? [...editing.lines.map((line) => ({ ...line, key: crypto.randomUUID(), qty: String(Number(line.qty)) })), emptyLine()]
      : [emptyLine()],
  );
  const [busy, setBusy] = useState(false);
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const choices = warehouses.filter(
    (warehouse) => warehouse.is_active !== false || warehouse.id === sourceId || warehouse.id === destinationId,
  );
  const selectableItems = items.filter((item) =>
    stockRows.some((stock) => stock.item_id === item.id && stock.warehouse_id === sourceId && Number(stock.current_qty) > 0),
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectItem(key: string, itemId: string) {
    setLines((current) => {
      const updated = current.map((line) => (line.key === key ? { ...line, item_id: itemId } : line));
      const lastLine = updated[updated.length - 1];
      if (itemId && lastLine && lastLine.item_id) {
        return [...updated, emptyLine()];
      }
      return updated;
    });
  }

  function removeLine(key: string) {
    setLines((current) => {
      const remaining = current.filter((line) => line.key !== key);
      if (remaining.length === 0 || remaining[remaining.length - 1].item_id) {
        return [...remaining, emptyLine()];
      }
      return remaining;
    });
  }

  function handleQuantityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const row = event.currentTarget.closest('tr');
    const nextRow = row?.nextElementSibling;
    const nextSearch = nextRow?.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (nextSearch) {
      nextSearch.focus();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceId || !destinationId || sourceId === destinationId) return toast.error('اختر مخزنين مختلفين');

    const validLines = lines.filter((line) => line.item_id);
    if (validLines.length === 0) return toast.error('اختر صنفًا واحدًا على الأقل للتحويل');
    if (validLines.some((line) => !(Number(line.qty) > 0))) return toast.error('أدخل كمية صحيحة لكل الأصناف');

    setBusy(true);
    const args = {
      p_source_warehouse_id: sourceId,
      p_destination_warehouse_id: destinationId,
      p_transfer_date: date,
      p_notes: notes.trim() || null,
      p_lines: validLines.map((line) => ({ item_id: line.item_id, qty: Number(line.qty) })),
    };
    const { error: rpcError } = editing
      ? await supabase.rpc('update_warehouse_transfer', { p_transfer_id: editing.id, ...args })
      : await supabase.rpc('create_warehouse_transfer', args);
    setBusy(false);
    if (rpcError) return toast.error(translateDbError(rpcError.message));
    onSaved(editing ? `تم تعديل التحويل ${editing.number}` : 'تم حفظ التحويل المخزني');
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="form-grid-col-6">
          من مخزن (المصدر)
          <select
            value={sourceId}
            onChange={(event) => {
              const next = event.target.value;
              setSourceId(next);
              setLines([emptyLine()]);
              if (next === destinationId) {
                setDestinationId(activeWarehouses.find((warehouse) => warehouse.id !== next)?.id ?? '');
              }
            }}
            required
          >
            <option value="">اختر مخزن المصدر…</option>
            {choices.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-grid-col-6">
          إلى مخزن (الوجهة)
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
            <option value="">اختر مخزن الوجهة…</option>
            {choices
              .filter((warehouse) => warehouse.id !== sourceId)
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
          </select>
        </label>
        <label className="form-grid-col-12">
          ملاحظات
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات التحويل (اختياري)…" />
        </label>
      </div>

      <div className="lines">
        <div className="lines-wrap">
          <table className="lines-table">
            <thead>
              <tr>
                <th className="w-num center" style={{ width: '5%' }}>#</th>
                <th style={{ width: '45%' }}>الصنف</th>
                <th style={{ width: '21%' }}>المتاح في المصدر</th>
                <th style={{ width: '21%' }}>الكمية المنقولة</th>
                <th style={{ width: '8%' }} className="center">حذف</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const stock = stockRows.find((row) => row.item_id === line.item_id && row.warehouse_id === sourceId);
                const item = items.find((entry) => entry.id === line.item_id);
                const itemChoices =
                  selectableItems.some((entry) => entry.id === line.item_id) || !line.item_id
                    ? selectableItems
                    : [...selectableItems, ...items.filter((entry) => entry.id === line.item_id)];
                return (
                  <tr key={line.key}>
                    <td className="w-num center line-index-cell" data-label="#">
                      {index + 1}
                    </td>
                    <td data-label="الصنف">
                      <SearchableSelect
                        value={line.item_id}
                        options={itemChoices.map((entry) => ({
                          value: entry.id,
                          label: `${entry.code ? `${entry.code} — ` : ''}${entry.name} — متاح: ${formatQty(stockRows.find((r) => r.item_id === entry.id && r.warehouse_id === sourceId)?.current_qty ?? 0)} ${entry.unit}`,
                        }))}
                        onChange={(item_id) => {
                          if (lines.some((candidate) => candidate.key !== line.key && candidate.item_id === item_id)) {
                            toast.warning('هذا الصنف موجود بالفعل في التحويل. اختَر صنفًا آخر.');
                            return;
                          }
                          selectItem(line.key, item_id);
                          if (item_id) quantityRefs.current[line.key]?.focus();
                        }}
                        placeholder="اختر صنفًا…"
                        searchPlaceholder="ابحث باسم أو كود الصنف…"
                        emptyMessage="لا توجد أصناف متاحة في مخزن المصدر"
                      />
                    </td>
                    <td className="num" data-label="المتاح في المصدر">
                      <strong>{formatQty(stock?.current_qty ?? 0)}</strong> {item?.unit ?? ''}
                    </td>
                    <td data-label={item ? `الكمية (${item.unit})` : 'الكمية المنقولة'}>
                      <div className="line-qty-cell">
                        <input
                          ref={(element) => { quantityRefs.current[line.key] = element; }}
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          max={stock?.current_qty ?? undefined}
                          value={line.qty}
                          onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                          onKeyDown={handleQuantityKeyDown}
                          placeholder="الكمية…"
                        />
                        {item && <span className="line-unit-badge">{item.unit}</span>}
                      </div>
                    </td>
                    <td className="center" data-label="حذف">
                      <button
                        type="button"
                        className="line-delete-btn"
                        title="حذف هذا الصنف"
                        aria-label="حذف سطر الصنف"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1 && !line.item_id}
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

import { useRef, useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
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

export default function WarehouseTransferForm({ warehouses, items, stockRows, editing, onSaved, onCancel: _onCancel }: Props) {
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.is_active !== false);
  const [sourceId, setSourceId] = useState(
    editing?.source_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.is_primary)?.id ?? activeWarehouses[0]?.id ?? '',
  );
  const [destinationId, setDestinationId] = useState(
    editing?.destination_warehouse_id ?? activeWarehouses.find((warehouse) => warehouse.id !== sourceId)?.id ?? '',
  );
  const [date] = useState(editing?.transfer_date ?? today());
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(() => {
    if (editing?.lines?.length) {
      return editing.lines.map((l) => ({
        ...l,
        key: crypto.randomUUID(),
        qty: String(Number(l.qty)),
      }));
    }
    return [];
  });
  const [busy, setBusy] = useState(false);

  // شريط الإدخال الثابت أعلى الجدول
  const [entryItemId, setEntryItemId] = useState('');
  const [entryQty, setEntryQty] = useState('1');
  const entryItemSearchRef = useRef<HTMLInputElement>(null);
  const entryQtyInputRef = useRef<HTMLInputElement>(null);
  const pendingSaveLines = useRef<DraftLine[] | null>(null);

  const choices = warehouses.filter(
    (warehouse) => warehouse.is_active !== false || warehouse.id === sourceId || warehouse.id === destinationId,
  );

  const entrySelectedItem = items.find((entry) => entry.id === entryItemId);
  const entryStockRow = stockRows.find(
    (row) => row.item_id === entryItemId && row.warehouse_id === sourceId,
  );
  const entryAvailableStock = entryStockRow ? Number(entryStockRow.current_qty) : 0;

  function handleEntryItemSelect(itemId: string) {
    if (!itemId) {
      setEntryItemId('');
      setEntryQty('1');
      return;
    }

    const stock = stockRows.find((row) => row.item_id === itemId && row.warehouse_id === sourceId);
    const available = stock ? Number(stock.current_qty) : 0;

    if (available <= 0) {
      toast.warning('الصنف غير متوفر في مخزن المصدر');
      return;
    }

    setEntryItemId(itemId);
    setEntryQty('1');
    setTimeout(() => {
      entryQtyInputRef.current?.focus();
      entryQtyInputRef.current?.select();
    }, 40);
  }

  function handleEntryQtyChange(val: string) {
    if (val === '') {
      setEntryQty('');
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num)) {
      setEntryQty('1');
      return;
    }
    if (entryAvailableStock > 0 && num > entryAvailableStock) {
      setEntryQty(String(entryAvailableStock));
      toast.warning(`الكمية المتاحة بمخزن المصدر (${formatQty(entryAvailableStock)}) هي الحد الأقصى`);
      return;
    }
    if (num < 1 && val !== '0' && val !== '0.') {
      setEntryQty('1');
      return;
    }
    setEntryQty(val);
  }

  function handleEntryQtyBlur() {
    const num = parseFloat(entryQty);
    if (isNaN(num) || num < 1) {
      setEntryQty('1');
    } else if (entryAvailableStock > 0 && num > entryAvailableStock) {
      setEntryQty(String(entryAvailableStock));
    }
  }

  function handleInsertLine() {
    if (!entryItemId) {
      toast.warning('اختر صنفاً أولاً');
      entryItemSearchRef.current?.focus();
      return;
    }

    let qtyNum = Number(entryQty || 0);
    if (qtyNum < 1) {
      toast.warning('الكمية يجب ألا تقل عن 1');
      setEntryQty('1');
      entryQtyInputRef.current?.focus();
      return;
    }

    if (entryAvailableStock <= 0) {
      toast.warning('الصنف غير متوفر بمخزن المصدر');
      return;
    }

    const existingInList = lines.find((l) => l.item_id === entryItemId);
    const currentInList = existingInList ? Number(existingInList.qty || 0) : 0;
    if (currentInList >= entryAvailableStock) {
      toast.warning(`الكمية المتاحة بالكامل (${formatQty(entryAvailableStock)}) موجودة بالفعل في التحويل`);
      return;
    }

    if (currentInList + qtyNum > entryAvailableStock) {
      qtyNum = entryAvailableStock - currentInList;
      toast.warning(`تم تعديل الكمية المنقولة إلى ${formatQty(qtyNum)} لتتوافق مع المتبقي بمخزن المصدر`);
    }

    setLines((current) => {
      const existingIndex = current.findIndex((l) => l.item_id === entryItemId);
      if (existingIndex >= 0) {
        const updated = [...current];
        const existing = updated[existingIndex];
        const mergedQty = Number(existing.qty || 0) + qtyNum;
        updated[existingIndex] = {
          ...existing,
          qty: String(mergedQty),
        };
        toast.info(`تم تحديث كمية "${entrySelectedItem?.name}" إلى (${formatQty(mergedQty)})`);
        return updated;
      }
      return [
        ...current,
        {
          key: crypto.randomUUID(),
          item_id: entryItemId,
          qty: String(qtyNum),
        },
      ];
    });

    setEntryItemId('');
    setEntryQty('1');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, 40);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function handleReset() {
    setLines([]);
    setEntryItemId('');
    setEntryQty('1');
    setNotes('');
    toast.info('تم تفريغ التحويل للبدء من جديد');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, 40);
  }

  async function executeSave(linesToSave: DraftLine[]) {
    const validLines = linesToSave.filter((line) => line.item_id);

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
    onSaved(editing ? `تم تعديل التحويل ${editing.number}` : 'تم حفظ التحويل المخزني بنجاح');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceId || !destinationId || sourceId === destinationId) {
      return toast.error('اختر مخزنين مختلفين (مخزن المصدر ومخزن الوجهة)');
    }

    let activeLines = [...lines];

    // إدراج الصنف المعلق في شريط الإدخال تلقائياً
    if (entryItemId) {
      let qtyNum = Number(entryQty || 0);
      if (qtyNum >= 1 && entryAvailableStock > 0) {
        if (qtyNum > entryAvailableStock) qtyNum = entryAvailableStock;
        const existingIndex = activeLines.findIndex((l) => l.item_id === entryItemId);
        if (existingIndex >= 0) {
          const existing = activeLines[existingIndex];
          activeLines[existingIndex] = {
            ...existing,
            qty: String(Number(existing.qty || 0) + qtyNum),
          };
        } else {
          activeLines.push({
            key: crypto.randomUUID(),
            item_id: entryItemId,
            qty: String(qtyNum),
          });
        }
        setLines(activeLines);
        setEntryItemId('');
        setEntryQty('1');
      }
    }

    pendingSaveLines.current = activeLines;

    if (activeLines.length === 0) return toast.error('اختر صنفًا واحدًا على الأقل للتحويل');
    if (activeLines.some((line) => !(Number(line.qty) > 0))) return toast.error('أدخل كمية صحيحة لكل الأصناف');

    // تحقق من كفاية الأرصدة
    for (const line of activeLines) {
      const stock = stockRows.find((row) => row.item_id === line.item_id && row.warehouse_id === sourceId);
      const available = stock ? Number(stock.current_qty) : 0;
      if (Number(line.qty) > available) {
        return toast.error(`الكمية المنقولة تتجاوز المتاح بمخزن المصدر (${formatQty(available)})`);
      }
    }

    void executeSave(activeLines);
  }

  return (
    <form className="warehouse-transfer-form" onSubmit={submit}>
      {/* بطاقة المخازن والملاحظات الموحدة */}
      <div className="account-header-card">
        <div className="transfer-header-grid">
          <label className="field-transfer-source">
            <span>من مخزن (المصدر)</span>
            <SearchableSelect
              value={sourceId}
              options={choices.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.name,
              }))}
              onChange={(next) => {
                setSourceId(next);
                setLines([]);
                setEntryItemId('');
                setEntryQty('1');
                if (next === destinationId) {
                  setDestinationId(activeWarehouses.find((warehouse) => warehouse.id !== next)?.id ?? '');
                }
              }}
              placeholder="اختر مخزن المصدر…"
              searchPlaceholder="ابحث باسم مخزن المصدر…"
              emptyMessage="لا توجد مخازن متاحة"
              required
            />
          </label>

          <label className="field-transfer-destination">
            <span>إلى مخزن (الوجهة)</span>
            <SearchableSelect
              value={destinationId}
              options={choices
                .filter((warehouse) => warehouse.id !== sourceId)
                .map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                }))}
              onChange={setDestinationId}
              placeholder="اختر مخزن الوجهة…"
              searchPlaceholder="ابحث باسم مخزن الوجهة…"
              emptyMessage="لا توجد مخازن متاحة"
              required
            />
          </label>
        </div>

        <div className="account-header-row2">
          <div className="field-account-notes">
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ملاحظات اختيارية على أمر التحويل…"
              className="account-notes-input"
              aria-label="ملاحظات التحويل"
            />
          </div>
        </div>
      </div>

      {/* جدول الأصناف وشريط الإدخال الثابت */}
      <div className="transfer-lines-card">
        <div className="lines-wrap">
          <table className="lines-table">
            <thead>
              <tr>
                <th className="w-num center">#</th>
                <th>الصنف</th>
                <th className="w-qty">المتاح بالمصدر</th>
                <th className="w-qty">الكمية المنقولة</th>
                <th className="w-action center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {/* شريط الإدخال الثابت أعلى جدول التحويل */}
              <tr className="entry-line-row">
                <td className="w-num center line-index-cell" data-label="#">
                  <span className="entry-badge" title="سطر إدخال صنف جديد">+</span>
                </td>
                <td data-label="الصنف">
                  <SearchableSelect
                    inputRef={entryItemSearchRef}
                    value={entryItemId}
                    options={items.map((entry) => {
                      const stock = stockRows.find((r) => r.item_id === entry.id && r.warehouse_id === sourceId);
                      const available = stock ? Number(stock.current_qty) : 0;
                      const isOut = available <= 0;
                      return {
                        value: entry.id,
                        label: `${entry.code ? `${entry.code} — ` : ''}${entry.name} — متاح: ${formatQty(available)} ${entry.unit}${isOut ? ' (غير متوفر)' : ''}`,
                      };
                    })}
                    onChange={handleEntryItemSelect}
                    placeholder="اختر صنفاً للتحويل…"
                    searchPlaceholder="ابحث باسم أو كود الصنف…"
                    emptyMessage="لا توجد أصناف مطابقة"
                  />
                </td>
                <td className="num" data-label="المتاح بالمصدر">
                  {entrySelectedItem ? (
                    <span dir="ltr">
                      <strong>{formatQty(entryAvailableStock)}</strong> {entrySelectedItem.unit}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td data-label={entrySelectedItem ? `الكمية (${entrySelectedItem.unit})` : 'الكمية المنقولة'}>
                  <div className="line-qty-group">
                    <input
                      ref={entryQtyInputRef}
                      aria-label="الكمية المنقولة"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="0.0001"
                      dir="ltr"
                      value={entryQty}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleEntryQtyChange(e.target.value)}
                      onBlur={handleEntryQtyBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleInsertLine();
                        }
                      }}
                      className="no-spinner num"
                    />
                    <span className="line-unit-suffix">{entrySelectedItem?.unit ?? 'قطعة'}</span>
                  </div>
                </td>
                <td className="center" data-label="إجراء">
                  <button
                    type="button"
                    className="btn-insert-line"
                    onClick={handleInsertLine}
                    disabled={!entryItemId}
                    title="إدراج الصنف في أمر التحويل"
                  >
                    <Plus size={15} />
                    <span>إدراج</span>
                  </button>
                </td>
              </tr>

              {/* قائمة الأصناف المدرجة بالأسفل */}
              {lines.length === 0 ? (
                <tr className="empty-lines-placeholder-row">
                  <td colSpan={5}>
                    لم يتم إدراج أصناف بعد. اختر صنفاً من الشريط أعلاه واضغط إدراج أو Enter.
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => {
                  const stock = stockRows.find((row) => row.item_id === line.item_id && row.warehouse_id === sourceId);
                  const available = stock ? Number(stock.current_qty) : 0;
                  const item = items.find((entry) => entry.id === line.item_id);

                  return (
                    <tr key={line.key} className="inserted-line-row">
                      <td className="w-num center line-index-cell" data-label="#">
                        {index + 1}
                      </td>
                      <td data-label="الصنف">
                        <div className="inserted-item-info">
                          <span className="item-name">{item?.name ?? '—'}</span>
                          {item?.code && <span className="item-code-tag">{item.code}</span>}
                        </div>
                      </td>
                      <td className="num" data-label="المتاح بالمصدر">
                        <span dir="ltr">
                          <strong>{formatQty(available)}</strong> {item?.unit ?? ''}
                        </span>
                      </td>
                      <td data-label={item ? `الكمية (${item.unit})` : 'الكمية المنقولة'}>
                        <div className="line-qty-group">
                          <input
                            aria-label={`الكمية المنقولة — ${item?.name ?? ''}`}
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.0001"
                            dir="ltr"
                            value={line.qty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                updateLine(line.key, { qty: '' });
                                return;
                              }
                              const num = parseFloat(val);
                              if (isNaN(num)) {
                                updateLine(line.key, { qty: '1' });
                                return;
                              }
                              if (available > 0 && num > available) {
                                updateLine(line.key, { qty: String(available) });
                                toast.warning(`الكمية المتاحة بالمصدر (${formatQty(available)}) هي الحد الأقصى`);
                                return;
                              }
                              if (num < 1 && val !== '0' && val !== '0.') {
                                updateLine(line.key, { qty: '1' });
                                return;
                              }
                              updateLine(line.key, { qty: val });
                            }}
                            onBlur={() => {
                              const num = parseFloat(line.qty);
                              if (isNaN(num) || num < 1) {
                                updateLine(line.key, { qty: '1' });
                              } else if (available > 0 && num > available) {
                                updateLine(line.key, { qty: String(available) });
                              }
                            }}
                            className="no-spinner num"
                          />
                          <span className="line-unit-suffix">{item?.unit ?? 'قطعة'}</span>
                        </div>
                      </td>
                      <td className="center" data-label="إجراء">
                        <button
                          type="button"
                          className="line-delete-btn"
                          title="حذف هذا الصنف من أمر التحويل"
                          aria-label="حذف سطر الصنف"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* أزرار الإجراءات الموحدة */}
      <div className="form-modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          <Save size={16} />
          <span>{busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ التحويل المخزني'}</span>
        </button>
        <button type="button" className="btn" onClick={handleReset} disabled={busy}>
          <RotateCcw size={14} />
          <span>مسح / جديد</span>
        </button>
      </div>
    </form>
  );
}

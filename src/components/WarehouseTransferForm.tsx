import { useRef, useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Save, Trash2, Pencil, Printer } from 'lucide-react';
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
  readOnly?: boolean;
  onSaved: (message: string) => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
}

type DraftLine = Omit<WarehouseTransferLine, 'qty'> & { key: string; qty: string };

export default function WarehouseTransferForm({
  warehouses,
  items,
  stockRows,
  editing,
  readOnly = false,
  onSaved,
  onCancel,
  onEdit,
  onDelete,
  onPrint,
}: Props) {
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

  function getAvailableStock(itemId: string, warehouseId: string): number {
    const stock = stockRows.find((row) => row.item_id === itemId && row.warehouse_id === warehouseId);
    let available = stock ? Number(stock.current_qty) : 0;
    if (editing && editing.source_warehouse_id === warehouseId) {
      const prevLine = editing.lines?.find((l) => l.item_id === itemId);
      if (prevLine) {
        available += Number(prevLine.qty || 0);
      }
    }
    return available;
  }

  const entrySelectedItem = items.find((entry) => entry.id === entryItemId);
  const entryAvailableStock = entryItemId ? getAvailableStock(entryItemId, sourceId) : 0;
  const totalTransferQty = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);

  const selectableItems = items.filter(
    (item) => item.is_active !== false || lines.some((l) => l.item_id === item.id)
  );

  function handleEntryItemSelect(itemId: string) {
    if (!itemId) {
      setEntryItemId('');
      setEntryQty('1');
      return;
    }

    const available = getAvailableStock(itemId, sourceId);
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
    if (num <= 0 && val !== '0' && val !== '0.') {
      setEntryQty('1');
      return;
    }
    setEntryQty(val);
  }

  function handleEntryQtyBlur() {
    const num = parseFloat(entryQty);
    if (isNaN(num) || num <= 0) {
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
    if (!(qtyNum > 0)) {
      toast.warning('الكمية يجب أن تكون أكبر من صفر');
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

  function handleSourceWarehouseChange(nextSourceId: string) {
    setSourceId(nextSourceId);
    if (nextSourceId === destinationId) {
      setDestinationId(activeWarehouses.find((warehouse) => warehouse.id !== nextSourceId)?.id ?? '');
    }

    if (entryItemId) {
      const available = getAvailableStock(entryItemId, nextSourceId);
      if (available <= 0) {
        toast.warning('الصنف قيد الإدخال غير متوفر في مخزن المصدر الجديد');
        setEntryItemId('');
        setEntryQty('1');
      } else if (Number(entryQty) > available) {
        toast.warning(`تم تعديل كمية الصنف قيد الإدخال إلى المتاح بمخزن المصدر (${formatQty(available)})`);
        setEntryQty(String(available));
      }
    }

    if (lines.length > 0) {
      const remainingLines: DraftLine[] = [];
      let removedCount = 0;
      let adjustedCount = 0;

      for (const line of lines) {
        const available = getAvailableStock(line.item_id, nextSourceId);
        if (available <= 0) {
          removedCount++;
        } else {
          let qty = Number(line.qty);
          if (qty > available) {
            qty = available;
            adjustedCount++;
          }
          remainingLines.push({ ...line, qty: String(qty) });
        }
      }

      setLines(remainingLines);
      if (removedCount > 0) {
        toast.warning(`تم استبعاد ${removedCount} أصناف لعدم توفرها في المخزن الجديد`);
      }
      if (adjustedCount > 0) {
        toast.warning(`تم تعديل كميات ${adjustedCount} أصناف لتتوافق مع المتاح بالمخزن الجديد`);
      }
    }
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
      if (qtyNum > 0 && entryAvailableStock > 0) {
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
      const available = getAvailableStock(line.item_id, sourceId);
      if (Number(line.qty) > available) {
        const item = items.find((i) => i.id === line.item_id);
        return toast.error(`الكمية المنقولة من "${item?.name ?? 'الصنف'}" تتجاوز المتاح بمخزن المصدر (${formatQty(available)})`);
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
            {readOnly ? (
              <div className="readonly-val-box">
                {choices.find((w) => w.id === sourceId)?.name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                value={sourceId}
                options={choices.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                }))}
                onChange={handleSourceWarehouseChange}
                placeholder="اختر مخزن المصدر…"
                searchPlaceholder="ابحث باسم مخزن المصدر…"
                emptyMessage="لا توجد مخازن متاحة"
                required
              />
            )}
          </label>

          <label className="field-transfer-destination">
            <span>إلى مخزن (الوجهة)</span>
            {readOnly ? (
              <div className="readonly-val-box">
                {choices.find((w) => w.id === destinationId)?.name ?? '—'}
              </div>
            ) : (
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
            )}
          </label>
        </div>

        <div className="account-header-row2">
          <div className="field-account-notes">
            {readOnly ? (
              <div className="readonly-val-box readonly-notes">
                {notes || 'لا توجد ملاحظات على أمر التحويل'}
              </div>
            ) : (
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات اختيارية على أمر التحويل…"
                className="account-notes-input"
                aria-label="ملاحظات التحويل"
              />
            )}
          </div>

          <div className="account-balance-pills">
            <div className="stat-pill" title="عدد أصناف أمر التحويل">
              <span>عدد الأصناف:</span>
              <strong dir="ltr" className="num">{lines.length}</strong>
            </div>

            <div className="stat-pill" title="إجمالي الكميات المنقولة">
              <span>إجمالي الكميات:</span>
              <strong dir="ltr" className="num">{formatQty(totalTransferQty)}</strong>
            </div>
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
                {!readOnly && <th className="w-action center">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {/* شريط الإدخال الثابت أعلى جدول التحويل */}
              {!readOnly && (
                <tr className="entry-line-row">
                  <td className="w-num center line-index-cell" data-label="#">
                    <span className="entry-badge" title="سطر إدخال صنف جديد">+</span>
                  </td>
                  <td data-label="الصنف">
                    <SearchableSelect
                      inputRef={entryItemSearchRef}
                      value={entryItemId}
                      options={selectableItems.map((entry) => {
                        const available = getAvailableStock(entry.id, sourceId);
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
                        min="0.0001"
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
              )}

              {/* قائمة الأصناف المدرجة بالأسفل */}
              {lines.length === 0 ? (
                <tr className="empty-lines-placeholder-row">
                  <td colSpan={readOnly ? 4 : 5}>
                    {readOnly ? 'لا توجد أصناف في هذا التحويل.' : 'لم يتم إدراج أصناف بعد. اختر صنفاً من الشريط أعلاه واضغط إدراج أو Enter.'}
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => {
                  const available = getAvailableStock(line.item_id, sourceId);
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
                        {readOnly ? (
                          <span className="readonly-line-qty num" dir="ltr">
                            <bdi>{formatQty(line.qty)}</bdi> {item?.unit ?? 'قطعة'}
                          </span>
                        ) : (
                          <div className="line-qty-group">
                            <input
                              aria-label={`الكمية المنقولة — ${item?.name ?? ''}`}
                              type="number"
                              inputMode="decimal"
                              min="0.0001"
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
                                if (num <= 0 && val !== '0' && val !== '0.') {
                                  updateLine(line.key, { qty: '1' });
                                  return;
                                }
                                updateLine(line.key, { qty: val });
                              }}
                              onBlur={() => {
                                const num = parseFloat(line.qty);
                                if (isNaN(num) || num <= 0) {
                                  updateLine(line.key, { qty: '1' });
                                } else if (available > 0 && num > available) {
                                  updateLine(line.key, { qty: String(available) });
                                }
                              }}
                              className="no-spinner num"
                            />
                            <span className="line-unit-suffix">{item?.unit ?? 'قطعة'}</span>
                          </div>
                        )}
                      </td>
                      {!readOnly && (
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
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* أزرار الإجراءات الموحدة */}
      {readOnly ? (
        <div className="form-modal-actions readonly-actions-group" style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: '10px' }}>
          {onEdit && (
            <button type="button" className="btn primary" onClick={onEdit}>
              <Pencil size={15} />
              <span>تعديل التحويل</span>
            </button>
          )}
          <button type="button" className="btn" onClick={onPrint ?? (() => window.print())}>
            <Printer size={15} />
            <span>طباعة</span>
          </button>
          {onDelete && (
            <button type="button" className="btn danger" onClick={onDelete}>
              <Trash2 size={15} />
              <span>حذف</span>
            </button>
          )}
          <button type="button" className="btn" onClick={onCancel}>
            <span>إغلاق</span>
          </button>
        </div>
      ) : (
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
      )}
    </form>
  );
}

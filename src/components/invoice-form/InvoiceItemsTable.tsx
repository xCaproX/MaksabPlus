import { type RefObject } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { qty as formatQty, round2 } from '../../lib/format';
import { clampDocQty, clampDocQtyOnBlur } from '../../lib/docLineEntry';
import SearchableSelect from '../SearchableSelect';
import MoneyDisplay from '../MoneyDisplay';
import { toast } from '../Toast';
import {
  searchWarehouseItemsAsync,
  lookupBarcodeItem,
  type WarehouseItemOption,
} from '../../lib/masterDataQueries';
import type { InvoiceKind, ItemRow, LineDraft } from '../../lib/types';

interface InvoiceItemsTableProps {
  isReadOnly: boolean;
  isWaste: boolean;
  kind: InvoiceKind;
  warehouseId: string;
  items: ItemRow[];
  lines: LineDraft[];
  onUpdateLine: (key: string, patch: Partial<LineDraft>) => void;
  onRemoveLine: (key: string) => void;
  entryItemId: string;
  entryQty: string;
  entryUnitPrice: string;
  entrySelectedItem?: ItemRow;
  entryLineTotal: number;
  entryItemSearchRef: RefObject<HTMLInputElement>;
  entryQtyInputRef: RefObject<HTMLInputElement>;
  entryPriceInputRef: RefObject<HTMLInputElement>;
  onEntryItemSelect: (id: string, option?: WarehouseItemOption) => void;
  onEntryQtyChange: (val: string) => void;
  onEntryQtyBlur: () => void;
  onEntryPriceChange: (val: string) => void;
  onInsertLine: () => void;
  getItemAvailableStock: (itemId: string, targetWarehouseId?: string) => number;
}

export default function InvoiceItemsTable({
  isReadOnly,
  isWaste,
  kind,
  warehouseId,
  items,
  lines,
  onUpdateLine,
  onRemoveLine,
  entryItemId,
  entryQty,
  entryUnitPrice,
  entrySelectedItem,
  entryLineTotal,
  entryItemSearchRef,
  entryQtyInputRef,
  entryPriceInputRef,
  onEntryItemSelect,
  onEntryQtyChange,
  onEntryQtyBlur,
  onEntryPriceChange,
  onInsertLine,
  getItemAvailableStock,
}: InvoiceItemsTableProps) {
  return (
    <div className="right-card items-table-card">
      <div className="lines-wrap">
        <table className="lines-table">
          <thead>
            <tr>
              <th className="w-num center">#</th>
              <th>الصنف</th>
              <th className="w-qty">الكمية</th>
              <th className="w-price">{isWaste ? 'سعر البيع' : 'السعر'}</th>
              <th className="w-total">الإجمالي</th>
              {!isReadOnly && <th className="w-action center">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {/* شريط الإدخال الثابت أعلى الجدول */}
            {!isReadOnly && (
              <tr className="entry-line-row">
                <td className="w-num center line-index-cell" data-label="#">
                  <span className="entry-badge" title="سطر إدخال صنف جديد">
                    +
                  </span>
                </td>
                <td data-label="الصنف">
                  <SearchableSelect
                    inputRef={entryItemSearchRef}
                    value={entryItemId}
                    selectedLabel={entrySelectedItem ? `${entrySelectedItem.code} — ${entrySelectedItem.name}` : undefined}
                    options={
                      items.length <= 50
                        ? items.map((item) => {
                            const stock = getItemAvailableStock(item.id, warehouseId);
                            const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                            const isOut = isStockLimited && Number(stock) <= 0;
                            return {
                              value: item.id,
                              label: `${item.code} — ${item.name} — متاح: ${formatQty(stock)} ${item.unit}${isOut ? ' (غير متوفر)' : ''}`,
                            };
                          })
                        : undefined
                    }
                    loadOptions={async (query) => {
                      const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                      if (items.length > 0 && items.length <= 50) {
                        const q = query.trim().toLowerCase();
                        return items
                          .filter((item) => !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q))
                          .map((item) => {
                            const stock = getItemAvailableStock(item.id, warehouseId);
                            const isOut = isStockLimited && Number(stock) <= 0;
                            return {
                              value: item.id,
                              label: `${item.code} — ${item.name} — متاح: ${formatQty(stock)} ${item.unit}${isOut ? ' (غير متوفر)' : ''}`,
                              stock,
                              salePrice: Number(item.sale_price),
                              purchasePrice: Number(item.purchase_price),
                              unit: item.unit,
                              code: item.code,
                              costLocked: false,
                            };
                          });
                      }
                      return searchWarehouseItemsAsync(warehouseId, query, isStockLimited);
                    }}
                    onBarcodeScan={async (barcode) => {
                      const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                      const found = await lookupBarcodeItem(barcode, warehouseId, isStockLimited);
                      if (!found) {
                        toast.warning(`لم يتم العثور على صنف بالباركود: ${barcode}`);
                        return;
                      }
                      onEntryItemSelect(found.value, found);
                    }}
                    onSelectOption={(opt) => onEntryItemSelect(opt.value, opt as unknown as WarehouseItemOption)}
                    onChange={(id) => onEntryItemSelect(id)}
                    placeholder="اختر صنفاً للإدراج أو امسح الباركود…"
                    searchPlaceholder="ابحث باسم أو كود أو باركود الصنف…"
                    emptyMessage="لا توجد أصناف مطابقة"
                  />
                </td>
                <td data-label={entrySelectedItem ? `الكمية (${entrySelectedItem.unit})` : 'الكمية'}>
                  <div className="line-qty-group">
                    <input
                      ref={entryQtyInputRef}
                      aria-label={`كمية الصنف${entrySelectedItem ? ` — ${entrySelectedItem.name} (${entrySelectedItem.unit})` : ''}`}
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="0.0001"
                      value={entryQty}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onEntryQtyChange(e.target.value)}
                      onBlur={onEntryQtyBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          entryPriceInputRef.current?.focus();
                          entryPriceInputRef.current?.select();
                        }
                      }}
                      className="no-spinner num"
                    />
                    <span className="line-unit-suffix">
                      {entrySelectedItem ? entrySelectedItem.unit : 'قطعة'}
                    </span>
                  </div>
                </td>
                <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                  <input
                    ref={entryPriceInputRef}
                    aria-label={isWaste ? 'سعر البيع' : 'سعر الوحدة'}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={entryUnitPrice}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onEntryPriceChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onInsertLine();
                      }
                    }}
                    disabled={isWaste}
                    className="no-spinner num"
                  />
                </td>
                <td className="line-total" data-label="الإجمالي">
                  <MoneyDisplay value={entryLineTotal} />
                </td>
                <td className="center" data-label="إجراء">
                  <button
                    type="button"
                    className="btn-insert-line"
                    onClick={onInsertLine}
                    disabled={!entryItemId}
                    title="إدراج الصنف في الفاتورة"
                  >
                    <Plus size={15} />
                    <span>إدراج</span>
                  </button>
                </td>
              </tr>
            )}

            {/* قائمة الأصناف المدرجة أسفل شريط الإدخال */}
            {lines.length === 0 ? (
              <tr className="empty-lines-placeholder-row">
                <td colSpan={isReadOnly ? 5 : 6}>
                  {isReadOnly
                    ? 'لا توجد بنود في هذه الفاتورة.'
                    : 'لم يتم إدراج أصناف بعد. اختر صنفاً من الشريط أعلاه واضغط إدراج أو Enter.'}
                </td>
              </tr>
            ) : (
              lines.map((line, index) => {
                const selectedItem = items.find((item) => item.id === line.item_id);
                const itemNameDisplay = selectedItem?.name ?? line.item_name ?? '—';
                const itemUnitDisplay = selectedItem?.unit ?? line.unit ?? 'قطعة';
                const lineTotal = round2(Number(line.qty || 0) * Number(line.unit_price || 0));

                const availableStock = getItemAvailableStock(line.item_id, warehouseId);
                const isStockExceeded =
                  Boolean(line.item_id) &&
                  (kind === 'sale' || kind === 'waste' || kind === 'purchase_return') &&
                  Number(line.qty) > availableStock;

                return (
                  <tr key={line.key} className="inserted-line-row">
                    <td className="w-num center line-index-cell" data-label="#">
                      {index + 1}
                    </td>
                    <td data-label="الصنف">
                      <div className="inserted-item-info">
                        <span className="item-name">{itemNameDisplay}</span>
                        {selectedItem?.code && (
                          <span className="item-code-tag">{selectedItem.code}</span>
                        )}
                      </div>
                    </td>
                    <td data-label={`الكمية (${itemUnitDisplay})`}>
                      {isReadOnly ? (
                        <div className="readonly-line-qty-box">
                          <bdi className="num" dir="ltr">
                            {formatQty(line.qty)}
                          </bdi>
                          <span className="readonly-unit-text">
                            {itemUnitDisplay}
                          </span>
                        </div>
                      ) : (
                        <div className="line-qty-group">
                          <input
                            aria-label={`الكمية — ${itemNameDisplay} (${itemUnitDisplay})`}
                            type="number"
                            inputMode="decimal"
                            min="0.0001"
                            step="0.0001"
                            value={line.qty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const isStockLimited =
                                kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                              const val = clampDocQty(
                                e.target.value,
                                availableStock,
                                isStockLimited && Boolean(line.item_id),
                              );
                              onUpdateLine(line.key, { qty: val });
                            }}
                            onBlur={() => {
                              const isStockLimited =
                                kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                              const val = clampDocQtyOnBlur(
                                line.qty,
                                availableStock,
                                isStockLimited && Boolean(line.item_id),
                              );
                              onUpdateLine(line.key, { qty: val });
                            }}
                            className="no-spinner num"
                          />
                          <span className="line-unit-suffix">
                            {itemUnitDisplay}
                          </span>
                        </div>
                      )}
                      {!isReadOnly && isStockExceeded && (
                        <span className="stock-warning-text" role="alert">
                          تنبيه: الكمية ({line.qty}) تتجاوز المتاح ({formatQty(availableStock)})
                        </span>
                      )}
                    </td>
                    <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                      {isReadOnly ? (
                        <MoneyDisplay value={line.unit_price} className="readonly-line-price" />
                      ) : (
                        <input
                          aria-label={isWaste ? 'سعر البيع' : 'سعر الوحدة'}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.unit_price}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => onUpdateLine(line.key, { unit_price: e.target.value })}
                          disabled={isWaste}
                          className="no-spinner num"
                        />
                      )}
                    </td>
                    <td className="line-total" data-label="الإجمالي">
                      <MoneyDisplay value={lineTotal} />
                    </td>
                    {!isReadOnly && (
                      <td className="center" data-label="إجراء">
                        <button
                          type="button"
                          className="line-delete-btn"
                          title="حذف هذا الصنف من الفاتورة"
                          aria-label="حذف سطر الصنف"
                          onClick={() => onRemoveLine(line.key)}
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
  );
}

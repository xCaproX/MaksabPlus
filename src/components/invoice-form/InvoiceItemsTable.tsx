import { type RefObject } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { qty as formatQty, round2 } from '../../lib/format';
import { clampDocQty, clampDocQtyOnBlur } from '../../lib/docLineEntry';
import ItemNameDisplay from '../ItemNameDisplay';
import SearchableSelect from '../SearchableSelect';
import MoneyDisplay from '../MoneyDisplay';
import { toast } from '../Toast';
import {
  formatItemAvailabilitySublabel,
  formatItemOptionLabel,
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
  entryAvailableStock: number;
  entryLineTotal: number;
  entryItemSearchRef: RefObject<HTMLInputElement>;
  entryQtyInputRef: RefObject<HTMLInputElement>;
  entryPriceInputRef: RefObject<HTMLInputElement>;
  onEntryItemSelect: (id: string, option?: WarehouseItemOption) => void;
  onEntryQtyChange: (val: string) => void;
  onEntryQtyBlur: () => void;
  onEntryPriceChange: (val: string) => void;
  onInsertLine: () => void;
  getItemAvailableStock: (itemId: string, targetWarehouseId?: string, rawWarehouseStock?: number) => number;
  adjustedHighlightItemId?: string | null;
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
  entryAvailableStock,
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
  adjustedHighlightItemId,
}: InvoiceItemsTableProps) {
  const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
  const isStockDanger = (stock: number, qtyVal: number) =>
    stock < 0 || (isStockLimited && (stock <= 0 || qtyVal > stock));

  return (
    <div className="right-card items-table-card">
      <div className="lines-wrap">
        <table className="lines-table invoice-items-table">
          <thead>
            <tr>
              <th className="w-num center">#</th>
              <th>الصنف</th>
              {!isReadOnly && <th className="w-stock center">المتاح</th>}
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
                    portal
                    inputRef={entryItemSearchRef}
                    value={entryItemId}
                    selectedLabel={
                      entrySelectedItem
                        ? formatItemOptionLabel(entrySelectedItem.name, entrySelectedItem.code, entrySelectedItem.unit)
                        : undefined
                    }
                    options={
                      items.length <= 50
                        ? items.map((item) => {
                            const stock = getItemAvailableStock(item.id, warehouseId);
                            const isOut = isStockLimited && Number(stock) <= 0;
                            return {
                              value: item.id,
                              label: formatItemOptionLabel(item.name, item.code, item.unit),
                              sublabel: formatItemAvailabilitySublabel(Number(stock), isOut),
                              disabled: isOut,
                            };
                          })
                        : undefined
                    }
                    loadOptions={
                      items.length > 50
                        ? async (query) => {
                            const results = await searchWarehouseItemsAsync(warehouseId, query, isStockLimited);
                            return results.map((opt) => {
                              const effectiveStock = getItemAvailableStock(opt.value, warehouseId, opt.stock);
                              const isOut = isStockLimited && Number(effectiveStock) <= 0;
                              const itemName = opt.name ?? opt.label;
                              return {
                                ...opt,
                                disabled: isOut,
                                label: formatItemOptionLabel(itemName, opt.code, opt.unit),
                                sublabel: formatItemAvailabilitySublabel(Number(effectiveStock), isOut),
                              };
                            });
                          }
                        : undefined
                    }
                    onBarcodeScan={async (barcode) => {
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
                <td className="num center stock-available-cell" data-label="المتاح">
                  {entrySelectedItem ? (
                    <bdi
                      dir="ltr"
                      className={`tabular-nums stock-available-val ${
                        isStockDanger(entryAvailableStock, Number(entryQty || 0)) ? 'is-danger' : ''
                      }`.trim()}
                    >
                      {formatQty(entryAvailableStock)}
                    </bdi>
                  ) : (
                    '—'
                  )}
                </td>
                <td data-label="الكمية">
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
                <td colSpan={isReadOnly ? 5 : 7}>
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
                  isStockLimited &&
                  Number(line.qty) > availableStock;

                const isHighlighted = Boolean(adjustedHighlightItemId && line.item_id === adjustedHighlightItemId);

                return (
                  <tr
                    key={line.key}
                    data-adjusted-row={isHighlighted ? line.item_id : undefined}
                    className={isHighlighted ? 'inserted-line-row is-adjusted-highlight' : 'inserted-line-row'}
                  >
                    <td className="w-num center line-index-cell" data-label="#">
                      <bdi dir="ltr" className="tabular-nums">{index + 1}</bdi>
                    </td>
                    <td data-label="الصنف">
                      <ItemNameDisplay
                        code={selectedItem?.code}
                        name={itemNameDisplay}
                        unit={itemUnitDisplay}
                      />
                    </td>
                    {!isReadOnly && (
                      <td className="num center stock-available-cell" data-label="المتاح">
                        <bdi
                          dir="ltr"
                          className={`tabular-nums stock-available-val ${
                            isStockDanger(availableStock, Number(line.qty || 0)) ? 'is-danger' : ''
                          }`.trim()}
                        >
                          {formatQty(availableStock)}
                        </bdi>
                      </td>
                    )}
                    <td data-label="الكمية">
                      {isReadOnly ? (
                        <bdi className="num readonly-line-qty" dir="ltr">
                          {formatQty(line.qty)}
                        </bdi>
                      ) : (
                        <input
                          aria-label={`الكمية — ${itemNameDisplay} (${itemUnitDisplay})`}
                          type="number"
                          inputMode="decimal"
                          min="0.0001"
                          step="0.0001"
                          value={line.qty}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = clampDocQty(
                              e.target.value,
                              availableStock,
                              isStockLimited && Boolean(line.item_id),
                            );
                            onUpdateLine(line.key, { qty: val });
                          }}
                          onBlur={() => {
                            const val = clampDocQtyOnBlur(
                              line.qty,
                              availableStock,
                              isStockLimited && Boolean(line.item_id),
                            );
                            onUpdateLine(line.key, { qty: val });
                          }}
                          className="no-spinner num"
                        />
                      )}
                      {!isReadOnly && isStockExceeded && (
                        <span className="stock-warning-text" role="alert">
                          تنبيه: الكمية (<bdi dir="ltr" className="tabular-nums">{line.qty}</bdi>) تتجاوز المتاح (<bdi dir="ltr" className="tabular-nums">{formatQty(availableStock)}</bdi>)
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccess } from '../../lib/access';
import { Boxes, DollarSign, CheckCircle2, FileText, X } from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import Pagination from '../../components/Pagination';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import { supabase } from '../../lib/supabase';
import { entityNumber, qty as formatQty, money } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import { matchesSearchQuery } from '../../lib/search';
import { toast } from '../../components/Toast';
import type { StockOpeningRow, WarehouseOption } from '../../lib/types';
import type { ManagementSort } from './AccountOpeningTab';

const PAGE_SIZE = 20;

interface StockOpeningTabProps {
  warehouses: WarehouseOption[];
  stockRows: StockOpeningRow[];
  canEditOpening: boolean;
  onRefresh: () => Promise<void>;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  saveTrigger?: number;
}

export default function StockOpeningTab({
  warehouses,
  stockRows,
  canEditOpening,
  onRefresh,
  saving,
  setSaving,
  saveTrigger,
}: StockOpeningTabProps) {
  const { canViewProfit } = useAccess();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [stockValues, setStockValues] = useState<Record<string, { qty: string; cost: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<ManagementSort>('name-asc');
  const [page, setPage] = useState(1);
  const [selectedItemRow, setSelectedItemRow] = useState<StockOpeningRow | null>(null);

  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [selectedWarehouseId, warehouses]);

  useEffect(() => {
    setStockValues(
      Object.fromEntries(
        stockRows.map((row) => [
          `${row.warehouse_id}:${row.item_id}`,
          { qty: String(Number(row.opening_qty)), cost: String(Number(row.unit_cost)) },
        ])
      )
    );
  }, [stockRows]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger && saveTrigger > 0) {
      void handleSaveRef.current();
    }
  }, [saveTrigger]);

  const filteredStockRows = useMemo(() => {
    const list = stockRows.filter((row) => {
      const matchWarehouse = row.warehouse_id === selectedWarehouseId;
      const matchSearch = matchesSearchQuery([row.item_name, row.item_code, row.item_number, row.warehouse_name, row.item_notes, row.warehouse_notes], searchTerm);
      return matchWarehouse && matchSearch;
    });
    return list.sort((firstRow, secondRow) => {
      if (sortOrder === 'serial-desc') return secondRow.item_number - firstRow.item_number;
      if (sortOrder === 'serial-asc') return firstRow.item_number - secondRow.item_number;
      if (sortOrder === 'name-desc') return secondRow.item_name.localeCompare(firstRow.item_name, 'ar');
      return firstRow.item_name.localeCompare(secondRow.item_name, 'ar');
    });
  }, [stockRows, selectedWarehouseId, searchTerm, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(filteredStockRows.length / PAGE_SIZE));
  const pageStock = filteredStockRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortOrder, selectedWarehouseId]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);

  const kpiItems = useMemo<KpiItem[]>(() => {
    const totalOpeningQty = filteredStockRows.reduce((sum, row) => {
      const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
      return sum + Number(val?.qty ?? row.opening_qty ?? 0);
    }, 0);
    const totalOpeningValue = filteredStockRows.reduce((sum, row) => {
      const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
      const qty = Number(val?.qty ?? row.opening_qty ?? 0);
      const cost = Number(val?.cost ?? row.unit_cost ?? 0);
      return sum + qty * cost;
    }, 0);
    const withOpening = filteredStockRows.filter((row) => {
      const val = stockValues[`${row.warehouse_id}:${row.item_id}`];
      return Number(val?.qty ?? row.opening_qty ?? 0) > 0;
    }).length;

    const items: KpiItem[] = [
      {
        id: 'mgmt-items-qty',
        label: 'إجمالي كميات أول المدة',
        value: formatQty(totalOpeningQty),
        unit: 'وحدة',
        variant: 'primary',
        icon: Boxes,
      },
      {
        id: 'mgmt-items-val',
        label: 'قيمة بضاعة أول المدة',
        value: money(totalOpeningValue),
        unit: 'ج.م',
        variant: 'info',
        icon: DollarSign,
      },
      {
        id: 'mgmt-items-with-qty',
        label: 'أصناف برصيد أول مدة',
        value: withOpening,
        unit: 'صنف',
        variant: 'success',
        icon: CheckCircle2,
      },
      {
        id: 'mgmt-items-count',
        label: 'عدد الأصناف المعروضة',
        value: filteredStockRows.length,
        unit: 'صنف',
        variant: 'neutral',
        icon: FileText,
      },
    ];
    return canViewProfit ? items : items.filter((item) => item.id !== 'mgmt-items-val');
  }, [filteredStockRows, stockValues, canViewProfit]);

  async function handleSave() {
    const stock = stockRows.map((row) => {
      const value = stockValues[`${row.warehouse_id}:${row.item_id}`] ?? {
        qty: String(row.opening_qty),
        cost: String(row.unit_cost),
      };
      return {
        warehouse_id: row.warehouse_id,
        item_id: row.item_id,
        opening_qty: Number(value.qty),
        unit_cost: canViewProfit ? Number(value.cost) : null,
      };
    });

    if (
      stock.some(
        (line) =>
          !Number.isFinite(line.opening_qty) ||
          line.opening_qty < 0 ||
          (line.unit_cost !== null && (!Number.isFinite(line.unit_cost) || line.unit_cost < 0))
      )
    ) {
      toast.error('راجع كميات المخزون وتكلفة الوحدة. القيم يجب أن تكون صحيحة وغير سالبة.');
      return;
    }

    setSaving(true);
    try {
      const { error: saveError } = await supabase.rpc('save_opening_balances', {
        p_cash_boxes: [],
        p_stock: stock,
      });
      if (saveError) {
        toast.error(translateDbError(saveError.message));
      } else {
        toast.success('تم حفظ أرصدة وتكلفة المخزون الافتتاحية بنجاح.');
        await onRefresh();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات افتتاحيات المخزون" />

      <div className={selectedItemRow ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة افتتاحيات المخزون">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <SearchableSelect
                ariaLabel="اختيار المخزن"
                value={selectedWarehouseId}
                options={[
                  { value: '', label: 'اختر المخزن' },
                  ...warehouses.map((wh) => ({
                    value: wh.id,
                    label: `${entityNumber('WH', wh.serial_number)} — ${wh.name}`,
                  })),
                ]}
                onChange={setSelectedWarehouseId}
                searchPlaceholder="بحث عن مخزن…"
              />

              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="بحث باسم الصنف أو كوده…"
                />
              </label>
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="table erp-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="الرقم"
                    field="serial"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ManagementSort)}
                  />
                  <th className="col-hide-on-detail" style={{ width: '100px' }}>الكود</th>
                  <SortableHeader
                    label="الصنف"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ManagementSort)}
                    defaultDirection="asc"
                  />
                  <th className="num" style={{ width: '150px' }}>كمية البداية</th>
                  {canViewProfit && <th className="num" style={{ width: '150px' }}>تكلفة الوحدة</th>}
                  <th className="num" style={{ width: '140px' }}>الرصيد الفعلي</th>
                </tr>
              </thead>
              <tbody>
                {pageStock.length === 0 && (
                  <tr>
                    <td colSpan={canViewProfit ? 6 : 5} className="empty">
                      لا توجد أصناف في هذا المخزن تطابق البحث.
                    </td>
                  </tr>
                )}
                {pageStock.map((row) => {
                  const key = `${row.warehouse_id}:${row.item_id}`;
                  const value = stockValues[key] ?? { qty: String(row.opening_qty), cost: String(row.unit_cost) };
                  const isSelected = selectedItemRow?.item_id === row.item_id && selectedItemRow?.warehouse_id === row.warehouse_id;
                  return (
                    <tr
                      key={key}
                      className={isSelected ? 'selected' : ''}
                      tabIndex={0}
                      onClick={() => setSelectedItemRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedItemRow(row);
                        }
                      }}
                    >
                      <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber('ITM', row.item_number)}</bdi></td>
                      <td className="num col-hide-on-detail" style={{ width: '100px' }}>{row.item_code}</td>
                      <td className="strong">{row.item_name}</td>
                      <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()} style={{ width: '150px' }}>
                        <input
                          className="table-input num no-spinner"
                          style={{ width: '100%', maxWidth: '130px' }}
                          type="number"
                          inputMode="decimal"
                          dir="ltr"
                          min="0"
                          step="0.0001"
                          disabled={!canEditOpening || saving}
                          value={value.qty}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) =>
                            setStockValues((values) => ({ ...values, [key]: { ...value, qty: event.target.value } }))
                          }
                        />
                      </td>
                      {canViewProfit && <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()} style={{ width: '150px' }}>
                        <input
                          className="table-input num no-spinner"
                          style={{ width: '100%', maxWidth: '130px' }}
                          type="number"
                          inputMode="decimal"
                          dir="ltr"
                          min="0"
                          step="0.0001"
                          value={value.cost}
                          disabled={!canEditOpening || row.cost_locked || saving}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) =>
                            setStockValues((values) => ({ ...values, [key]: { ...value, cost: event.target.value } }))
                          }
                        />
                      </td>}
                      <td className="num strong" style={{ width: '140px' }}>
                        {formatQty(row.current_qty)} {row.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={filteredStockRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>

        <aside className={selectedItemRow ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل الصنف">
          {selectedItemRow ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>افتتاحي المخزون</span>
                  <h2>{selectedItemRow.item_name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedItemRow(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>رقم الصنف</dt><dd className="num">{entityNumber('ITM', selectedItemRow.item_number)}</dd></div>
                <div><dt>كود الصنف</dt><dd className="num">{selectedItemRow.item_code}</dd></div>
                <div><dt>المخزن</dt><dd>{selectedWarehouse?.name || selectedItemRow.warehouse_name}</dd></div>
                <div><dt>الرصيد المتاح حاليًا</dt><dd className="num strong">{formatQty(selectedItemRow.current_qty)} {selectedItemRow.unit}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>كمية البداية</span>
                <strong className="num">
                  {formatQty(Number(stockValues[`${selectedItemRow.warehouse_id}:${selectedItemRow.item_id}`]?.qty ?? selectedItemRow.opening_qty))} {selectedItemRow.unit}
                </strong>
                {canViewProfit && <><span>تكلفة الوحدة</span>
                <strong className="num">
                  {money(Number(stockValues[`${selectedItemRow.warehouse_id}:${selectedItemRow.item_id}`]?.cost ?? selectedItemRow.unit_cost))}
                </strong></>}
              </div>

              {canViewProfit && selectedItemRow.cost_locked && (
                <p className="hint">
                  تكلفة البداية مقفولة لوجود حركات سابقة لحماية حسابات الأرباح، ويمكنك تعديل كمية البداية كتصحيح مخزني.
                </p>
              )}
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر بندًا</strong>
              <span>اضغط على أي سطر لمراجعة رصيده الافتتاحي والفعلي.</span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

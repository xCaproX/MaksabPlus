import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  X,
  Printer,
  Boxes,
  DollarSign,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber, formatDate, money, qty as formatQty, today } from '../../lib/format';
import { translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import DateInput from '../../components/DateInput';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import { toast } from '../../components/Toast';
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';
import type { ItemMovementStatementRow, StockOpeningRow } from '../../lib/types';

type BalanceSort =
  | 'balance-desc'
  | 'balance-asc'
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc';

const PAGE_SIZE = 20;

export default function ItemBalancesTab() {
  const { stockRows, warehouses: rawWarehouses, loading } = useMasterData();
  const warehouses = useMemo(() => rawWarehouses.filter((w) => w.is_active !== false), [rawWarehouses]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [selectedWarehouseId, warehouses]);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);

  // التحديد والتفاصيل
  const [selectedItem, setSelectedItem] = useState<StockOpeningRow | null>(null);

  // كشف حركة الصنف
  const [itemStatementRow, setItemStatementRow] = useState<StockOpeningRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(`${today().slice(0, 7)}-01`);
  const [statementTo, setStatementTo] = useState(today());
  const [itemStatementRows, setItemStatementRows] = useState<ItemMovementStatementRow[]>([]);
  const [itemStatementLoading, setItemStatementLoading] = useState(false);

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);

  // تصفية وترتيب الأصناف
  const filteredItems = useMemo(() => {
    const list = stockRows.filter((stockRow) => {
      const matchWarehouse = !selectedWarehouseId || stockRow.warehouse_id === selectedWarehouseId;
      const matchSearch = matchesSearchQuery(
        [stockRow.item_name, stockRow.item_code, stockRow.item_notes, stockRow.item_number],
        searchTerm,
      );
      return matchWarehouse && matchSearch;
    });

    return list.sort((firstItem, secondItem) => {
      if (sortOrder === 'balance-desc') return Number(secondItem.current_qty) - Number(firstItem.current_qty);
      if (sortOrder === 'balance-asc') return Number(firstItem.current_qty) - Number(secondItem.current_qty);
      if (sortOrder === 'serial-desc') return secondItem.item_number - firstItem.item_number;
      if (sortOrder === 'serial-asc') return firstItem.item_number - secondItem.item_number;
      if (sortOrder === 'name-desc') return secondItem.item_name.localeCompare(firstItem.item_name, 'ar');
      return firstItem.item_name.localeCompare(secondItem.item_name, 'ar');
    });
  }, [stockRows, selectedWarehouseId, searchTerm, sortOrder]);

  const totalCount = filteredItems.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const totalQty = filteredItems.reduce((sum, it) => sum + Number(it.current_qty || 0), 0);
    const totalVal = filteredItems.reduce(
      (sum, it) => (Number(it.current_qty) > 0 ? sum + Number(it.current_qty) * Number(it.unit_cost || 0) : sum),
      0,
    );
    const outOfStockCount = filteredItems.filter((it) => Number(it.current_qty || 0) <= 0).length;

    return [
      {
        id: 'items-qty',
        label: 'إجمالي كميات المخزون المتوفر',
        value: formatQty(totalQty),
        unit: 'وحدة',
        variant: 'primary',
        icon: Boxes,
      },
      {
        id: 'items-val',
        label: 'قيمة المخزون التقديرية (بالتكلفة)',
        value: money(totalVal),
        unit: 'ج.م',
        variant: 'info',
        icon: DollarSign,
      },
      {
        id: 'items-out-stock',
        label: 'أصناف نفدت كمياتها',
        value: outOfStockCount,
        unit: 'صنف',
        variant: outOfStockCount > 0 ? 'danger' : 'neutral',
        icon: AlertTriangle,
        subtext: outOfStockCount > 0 ? 'بحاجة لإعادة الطلب والتوريد' : 'جميع الأصناف متوفرة بالمخزن',
      },
      {
        id: 'items-count',
        label: 'عدد الأصناف المعروضة',
        value: filteredItems.length,
        unit: 'صنف',
        variant: 'neutral',
        icon: FileText,
      },
    ];
  }, [filteredItems]);

  function openItemStatement(row: StockOpeningRow) {
    setItemStatementRow(row);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
    setItemStatementRows([]);
  }

  async function loadItemStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemStatementRow) return;
    setItemStatementLoading(true);

    const { data, error: rpcError } = await supabase.rpc('get_item_movement_statement', {
      p_item_id: itemStatementRow.item_id,
      p_warehouse_id: itemStatementRow.warehouse_id,
      p_from: statementFrom,
      p_to: statementTo,
    });

    setItemStatementLoading(false);
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      setItemStatementRows([]);
    } else {
      setItemStatementRows((data ?? []) as ItemMovementStatementRow[]);
    }
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات أرصدة الأصناف" />

      <div className={selectedItem ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة أرصدة الأصناف">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  placeholder="بحث باسم الصنف أو الكود…"
                />
              </label>

              <SearchableSelect
                ariaLabel="تصفية حسب المخزن"
                value={selectedWarehouseId}
                options={[
                  { value: '', label: 'كل المخازن' },
                  ...warehouses.map((wh) => ({
                    value: wh.id,
                    label: `${entityNumber('WH', wh.serial_number)} — ${wh.name}`,
                  })),
                ]}
                onChange={(val) => {
                  setSelectedWarehouseId(val);
                  setPage(1);
                }}
                searchPlaceholder="بحث عن مخزن…"
              />
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
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                  />
                  <th className="col-hide-on-detail">الكود</th>
                  <SortableHeader
                    label="الصنف"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                    defaultDirection="asc"
                  />
                  <SortableHeader
                    label="الكمية الحالية"
                    field="balance"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                    align="end"
                    className="num"
                  />
                  <th className="col-hide-on-detail">الملاحظات</th>
                  <th aria-label="الإجراءات" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="empty">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && pagedItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      لا توجد أصناف تطابق البحث أو المخزن.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pagedItems.map((row) => {
                    const isSelected =
                      selectedItem?.item_id === row.item_id && selectedItem?.warehouse_id === row.warehouse_id;
                    return (
                      <tr
                        key={`${row.warehouse_id}:${row.item_id}`}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedItem(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedItem(row);
                          }
                        }}
                      >
                        <td className="num strong">{entityNumber('ITM', row.item_number)}</td>
                        <td className="num col-hide-on-detail">{row.item_code}</td>
                        <td className="strong">{row.item_name}</td>
                        <td className="num strong">
                          {formatQty(row.current_qty)} {row.unit}
                        </td>
                        <td className="muted col-hide-on-detail">{row.item_notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn compact"
                            onClick={() => openItemStatement(row)}
                          >
                            كشف حركة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="erp-pagination">
            <span>
              عرض {totalCount ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, totalCount)} من {totalCount}
            </span>
            <div>
              <button
                type="button"
                className="btn compact"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="btn compact"
                disabled={page === pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </button>
            </div>
          </div>
        </section>

        {/* لوحة التفاصيل الجانبية */}
        <aside
          className={selectedItem ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل الرصيد"
        >
          {selectedItem ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الصنف والمخزون</span>
                  <h2>{selectedItem.item_name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedItem(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>رقم الصنف</dt>
                  <dd className="num">{entityNumber('ITM', selectedItem.item_number)}</dd>
                </div>
                <div>
                  <dt>كود الصنف</dt>
                  <dd className="num">{selectedItem.item_code}</dd>
                </div>
                <div>
                  <dt>المخزن</dt>
                  <dd>{selectedWarehouse?.name || selectedItem.warehouse_name}</dd>
                </div>
                <div>
                  <dt>الوحدة</dt>
                  <dd>{selectedItem.unit}</dd>
                </div>
              </dl>

              <div className="erp-detail-totals">
                <span>الكمية الحالية</span>
                <strong className="num">
                  {formatQty(selectedItem.current_qty)} {selectedItem.unit}
                </strong>
              </div>

              {selectedItem.item_notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات الصنف</span>
                  {selectedItem.item_notes}
                </p>
              )}

              <div className="erp-detail-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => openItemStatement(selectedItem)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Printer size={16} />
                  <span>عرض وطباعة كشف حركة الصنف</span>
                </button>
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر صنفًا</strong>
              <span>ستظهر بيانات الرصيد وإمكانية استخراج كشف الحركة من هنا فورًا.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نافذة كشف حركة صنف */}
      {itemStatementRow && (
        <Modal
          title="كشف حركة صنف"
          className="account-statement-modal"
          backdropClassName="statement-modal-backdrop"
          onClose={() => setItemStatementRow(null)}
        >
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div>
                <h2>كشف حركة صنف</h2>
                <strong>
                  [{entityNumber('ITM', itemStatementRow.item_number)}] {itemStatementRow.item_code} —{' '}
                  {itemStatementRow.item_name} ~ {itemStatementRow.unit}
                </strong>
                <p>{selectedWarehouse?.name ?? itemStatementRow.warehouse_name}</p>
              </div>
              <div className="account-statement-period">
                <label>
                  <span>من تاريخ</span>
                  <DateInput
                    value={statementFrom}
                    onChange={setStatementFrom}
                    ariaLabel="من تاريخ"
                    required
                  />
                </label>
                <label>
                  <span>إلى تاريخ</span>
                  <DateInput
                    value={statementTo}
                    onChange={setStatementTo}
                    ariaLabel="إلى تاريخ"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="actions statement-actions print-hidden">
              <form onSubmit={loadItemStatement}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={itemStatementLoading || !statementFrom || !statementTo}
                >
                  {itemStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {itemStatementRows.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={15} />
                  <span>طباعة / حفظ PDF</span>
                </button>
              )}
            </div>

            {itemStatementRows.length > 0 && (
              <>
                {(() => {
                  const lastRow = itemStatementRows[itemStatementRows.length - 1];
                  const lastQty = Number(lastRow.running_balance || 0);
                  return (
                    <div className="statement-cockpit-strip">
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي الوارد</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {formatQty(itemStatementRows[0].total_incoming)} {itemStatementRow.unit}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي الصادر</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {formatQty(itemStatementRows[0].total_outgoing)} {itemStatementRow.unit}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card primary-card">
                        <span className="card-label">الرصيد المتبقي</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {formatQty(lastQty)} {itemStatementRow.unit}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="table-wrap responsive-table">
                  <table className="table account-statement-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>البيان</th>
                        <th>وارد</th>
                        <th>صادر</th>
                        <th>الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemStatementRows.map((row, index) => (
                        <tr
                          key={`${row.row_type}-${row.transaction_date}-${row.transfer_number ?? row.invoice_number ?? index}`}
                          className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}
                        >
                          <td className="num" data-label="التاريخ">
                            {formatDate(row.transaction_date)}
                          </td>
                          <td className="card-wide-cell" data-label="البيان">
                            {row.description}
                          </td>
                          <td className="num" data-label="وارد">
                            {Number(row.incoming) ? formatQty(row.incoming) : '—'}
                          </td>
                          <td className="num" data-label="صادر">
                            {Number(row.outgoing) ? formatQty(row.outgoing) : '—'}
                          </td>
                          <td className="num strong" data-label="الرصيد">
                            {formatQty(row.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="account-statement-totals">
                  <p>
                    <span>إجمالي الوارد:</span>
                    <strong>
                      {formatQty(itemStatementRows[0].total_incoming)} {itemStatementRow.unit}
                    </strong>
                  </p>
                  <p>
                    <span>إجمالي الصادر:</span>
                    <strong>
                      {formatQty(itemStatementRows[0].total_outgoing)} {itemStatementRow.unit}
                    </strong>
                  </p>
                  <p>
                    <span>رصيد آخر المدة:</span>
                    <strong>
                      {formatQty(itemStatementRows[itemStatementRows.length - 1].running_balance)}{' '}
                      {itemStatementRow.unit}
                    </strong>
                  </p>
                </div>
              </>
            )}
            {!itemStatementRows.length && !itemStatementLoading && (
              <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

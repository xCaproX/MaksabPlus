import { useCompleteStatement } from '../../lib/useCompleteStatement';
import ColumnFilterRow from '../../components/ColumnFilterRow';
import { useColumnFilters } from '../../lib/useColumnFilters';
import Pagination from '../../components/Pagination';
import { useAccess } from '../../lib/access';
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
import { entityNumber, money, qty as formatQty } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import { translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import PeriodFilter from '../../components/PeriodFilter';
import { periodDates } from '../../lib/period';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import { toast } from '../../components/Toast';
import { useMasterData } from '../../context/MasterDataContext';
import type { ItemMovementStatementRow } from '../../lib/types';

export interface WarehouseItemRow {
  item_id: string;
  item_name: string;
  item_code: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  item_number: number;
  item_notes: string | null;
  item_is_active: boolean;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_number: number;
  warehouse_notes: string | null;
  current_qty: number;
  unit_cost: number;
}

interface StockBalancesSummary {
  totalQty: number;
  totalVal: number;
  outOfStockCount: number;
  count: number;
}

type BalanceSort =
  | 'balance-desc'
  | 'balance-asc'
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc';

const PAGE_SIZE = 20;

const REQUIRED_RESOURCES = ['warehouses'] as const;

export default function ItemBalancesTab() {
  const { canViewProfit } = useAccess();
  const { warehouses: rawWarehouses } = useMasterData(REQUIRED_RESOURCES);
  const warehouses = useMemo(() => rawWarehouses.filter((w) => w.is_active !== false), [rawWarehouses]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [items, setItems] = useState<WarehouseItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);
  const columns = useColumnFilters("warehouse_items", () => {
    setSearchTerm(''); setDebouncedSearch(''); setSelectedWarehouseId(''); setPage(1);
  });
  const [totalCount, setTotalCount] = useState(0);

  const [summary, setSummary] = useState<StockBalancesSummary>({
    totalQty: 0,
    totalVal: 0,
    outOfStockCount: 0,
    count: 0,
  });

  // تأخير البحث لمنع إرسال طلبات متعددة مع كل حرف (Debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [selectedWarehouseId, warehouses]);

  // التحديد والتفاصيل
  const [selectedItem, setSelectedItem] = useState<WarehouseItemRow | null>(null);

  // كشف حركة الصنف
  const [itemStatementRow, setItemStatementRow] = useState<WarehouseItemRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(() => periodDates().from);
  const [statementTo, setStatementTo] = useState(() => periodDates().to);
  const { rows: itemStatementRows, loading: itemStatementLoading, load: loadCompleteStatement, reset: resetStatement } =
    useCompleteStatement<ItemMovementStatementRow>();

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);

  // جلب أرصدة الأصناف بالصفحات مع المؤشرات التجميعية من السيرفر
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;
      const trimmed = debouncedSearch.trim();

      try {
        let query = supabase
          .rpc('filter_warehouse_item_rows', { p_columns: columns.filters, p_search: trimmed || null }, { count: 'exact' }).select('*');

        if (selectedWarehouseId) {
          query = query.eq('warehouse_id', selectedWarehouseId);
        }


        if (sortOrder === 'balance-desc') {
          query = query.order('current_qty', { ascending: false });
        } else if (sortOrder === 'balance-asc') {
          query = query.order('current_qty', { ascending: true });
        } else if (sortOrder === 'serial-desc') {
          query = query.order('item_number', { ascending: false });
        } else if (sortOrder === 'serial-asc') {
          query = query.order('item_number', { ascending: true });
        } else if (sortOrder === 'name-desc') {
          query = query.order('item_name', { ascending: false });
        } else {
          query = query.order('item_name', { ascending: true });
        }

        query = query.range(from, to);

        const [dataRes, kpiRes] = await Promise.all([
          query,
          supabase.rpc('get_warehouse_stock_kpis_columns', {
            p_columns: columns.filters,
            p_warehouse_id: selectedWarehouseId || null,
            p_search: trimmed || null,
          }),
        ]);

        if (!alive) return;
        if (dataRes.error) throw dataRes.error;

        setItems((dataRes.data ?? []) as WarehouseItemRow[]);
        setTotalCount(dataRes.count ?? 0);

        if (kpiRes.error) throw kpiRes.error;
        if (kpiRes.data) {
          const raw = kpiRes.data as {
            total_qty?: number;
            total_val?: number;
            out_of_stock_count?: number;
            count?: number;
          };
          setSummary({
            totalQty: Number(raw.total_qty ?? 0),
            totalVal: Number(raw.total_val ?? 0),
            outOfStockCount: Number(raw.out_of_stock_count ?? 0),
            count: Number(raw.count ?? 0),
          });
        }
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        toast.error(translateDbError((err as Error).message));
        setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [columns.filters, page, debouncedSearch, selectedWarehouseId, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [columns.filters, debouncedSearch, selectedWarehouseId, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const items: KpiItem[] = [
      {
        id: 'items-qty',
        label: 'إجمالي كميات المخزون المتوفر',
        value: formatQty(summary.totalQty),
        unit: 'وحدة',
        variant: 'primary',
        icon: Boxes,
      },
      {
        id: 'items-val',
        label: 'قيمة المخزون التقديرية (بالتكلفة)',
        value: money(summary.totalVal),
        unit: 'ج.م',
        variant: 'info',
        icon: DollarSign,
      },
      {
        id: 'items-out-stock',
        label: 'أصناف نفدت كمياتها',
        value: summary.outOfStockCount,
        unit: 'صنف',
        variant: summary.outOfStockCount > 0 ? 'danger' : 'neutral',
        icon: AlertTriangle,
        subtext: summary.outOfStockCount > 0 ? 'بحاجة لإعادة الطلب والتوريد' : 'جميع الأصناف متوفرة بالمخزن',
      },
      {
        id: 'items-count',
        label: 'عدد الأصناف المعروضة',
        value: summary.count,
        unit: 'صنف',
        variant: 'neutral',
        icon: FileText,
      },
    ];
    return canViewProfit ? items : items.filter((item) => item.id !== 'items-val');
  }, [summary, canViewProfit]);

  function openItemStatement(row: WarehouseItemRow) {
    setItemStatementRow(row);
    setStatementFrom(periodDates().from);
    setStatementTo(periodDates().to);
    resetStatement();
  }

  async function loadItemStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemStatementRow) return;
    await loadCompleteStatement((from, to, signal) =>
      supabase.rpc('get_item_movement_statement', {
        p_item_id: itemStatementRow.item_id,
        p_warehouse_id: itemStatementRow.warehouse_id,
        p_from: statementFrom,
        p_to: statementTo,
      }, { count: 'exact' }).range(from, to).abortSignal(signal),
    );
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات أرصدة الأصناف" />

      <div className={selectedItem ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة أرصدة الأصناف">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <SearchableSelect
                label="المخزن"
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

              <label className="erp-search">
                <span className="filter-label">بحث</span>
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
                    className="num"
                  />
                  <th className="col-hide-on-detail col-notes">الملاحظات</th>
                  <th aria-label="الإجراءات" />
                </tr>
                <ColumnFilterRow scope="warehouse_items" values={columns.values} onChange={columns.setField} onReset={columns.reset} />
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="empty">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      لا توجد أصناف تطابق البحث أو المخزن.
                    </td>
                  </tr>
                )}
                {!loading &&
                  items.map((row) => {
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
                        <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber('ITM', row.item_number)}</bdi></td>
                        <td className="num col-hide-on-detail"><bdi dir="ltr" className="tabular-nums">{row.item_code}</bdi></td>
                        <td className="strong">{row.item_name}</td>
                        <td className="num strong">
                          <bdi dir="ltr" className="tabular-nums">{formatQty(row.current_qty)}</bdi> {row.unit}
                        </td>
                        <td className="muted col-hide-on-detail col-notes">{row.item_notes || '—'}</td>
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

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            loading={loading}
          />
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
          onClose={() => { resetStatement(); setItemStatementRow(null); }}
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
                <PeriodFilter from={statementFrom} to={statementTo} required disabled={itemStatementLoading}
                  onChange={(from, to) => { setStatementFrom(from); setStatementTo(to); resetStatement(); }} />
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
                        <th className="col-date">التاريخ</th>
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
                          <td className="num col-date" data-label="التاريخ">
                            <DateDisplay value={row.transaction_date} />
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

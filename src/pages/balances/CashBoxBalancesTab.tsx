import Pagination from '../../components/Pagination';
import { useMemo, useState, type FormEvent } from 'react';
import {
  X,
  Printer,
  DollarSign,
  Wallet,
  Landmark,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber, formatDate, money } from '../../lib/format';
import { translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import PeriodFilter from '../../components/PeriodFilter';
import { periodDates } from '../../lib/period';
import SortableHeader from '../../components/SortableHeader';
import { toast } from '../../components/Toast';
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';
import type { CashBoxRow, CashBoxStatementRow } from '../../lib/types';

type BalanceSort =
  | 'balance-desc'
  | 'balance-asc'
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc';

const PAGE_SIZE = 20;

export default function CashBoxBalancesTab() {
  const { cashBoxes, loading } = useMasterData();

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);

  // التحديد والتفاصيل
  const [selectedBox, setSelectedBox] = useState<CashBoxRow | null>(null);

  // كشف حركة الخزنة
  const [cashStatementBox, setCashStatementBox] = useState<CashBoxRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(() => periodDates().from);
  const [statementTo, setStatementTo] = useState(() => periodDates().to);
  const [cashStatementRows, setCashStatementRows] = useState<CashBoxStatementRow[]>([]);
  const [cashStatementLoading, setCashStatementLoading] = useState(false);

  // تصفية وترتيب الخزن
  const filteredCashBoxes = useMemo(() => {
    const list = cashBoxes.filter((box) =>
      matchesSearchQuery([box.name, box.notes, box.serial_number], searchTerm),
    );

    return list.sort((firstBox, secondBox) => {
      if (sortOrder === 'balance-desc') return Number(secondBox.balance) - Number(firstBox.balance);
      if (sortOrder === 'balance-asc') return Number(firstBox.balance) - Number(secondBox.balance);
      if (sortOrder === 'serial-desc') return secondBox.serial_number - firstBox.serial_number;
      if (sortOrder === 'serial-asc') return firstBox.serial_number - secondBox.serial_number;
      if (sortOrder === 'name-desc') return secondBox.name.localeCompare(firstBox.name, 'ar');
      return firstBox.name.localeCompare(secondBox.name, 'ar');
    });
  }, [cashBoxes, searchTerm, sortOrder]);

  const totalCount = filteredCashBoxes.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const totalLiquidity = filteredCashBoxes.reduce((sum, b) => sum + Number(b.balance || 0), 0);
    const primaryBox = cashBoxes.find((b) => b.is_primary);

    const itemsList: KpiItem[] = [
      {
        id: 'box-liquidity',
        label: 'إجمالي الفلوس بالخزن',
        value: money(totalLiquidity),
        unit: 'ج.م',
        variant: totalLiquidity >= 0 ? 'success' : 'danger',
        icon: Wallet,
      },
      {
        id: 'box-count',
        label: 'عدد الخزن المتاحة',
        value: filteredCashBoxes.length,
        unit: 'خزينة',
        variant: 'neutral',
        icon: Landmark,
      },
    ];

    if (primaryBox) {
      itemsList.push({
        id: 'box-primary',
        label: `الخزينة الرئيسية (${primaryBox.name})`,
        value: money(Number(primaryBox.balance || 0)),
        unit: 'ج.م',
        variant: 'primary',
        icon: DollarSign,
      });
    }

    return itemsList;
  }, [filteredCashBoxes, cashBoxes]);

  function openCashBoxStatement(box: CashBoxRow) {
    setCashStatementBox(box);
    setStatementFrom(periodDates().from);
    setStatementTo(periodDates().to);
    setCashStatementRows([]);
  }

  async function loadCashBoxStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cashStatementBox) return;
    setCashStatementLoading(true);

    const { data, error: rpcError } = await supabase.rpc('get_cash_box_statement', {
      p_cash_box_id: cashStatementBox.id,
      p_from: statementFrom,
      p_to: statementTo,
    });

    setCashStatementLoading(false);
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      setCashStatementRows([]);
    } else {
      setCashStatementRows((data ?? []) as CashBoxStatementRow[]);
    }
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات أرصدة الخزن" />

      <div className={selectedBox ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة أرصدة الخزن">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="filter-label">بحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  placeholder="بحث باسم الخزنة أو الرقم…"
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
                  <SortableHeader
                    label="الخزنة"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                    defaultDirection="asc"
                  />
                  <SortableHeader
                    label="الرصيد الحالي"
                    field="balance"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                    align="end"
                    className="num"
                  />
                  <th className="col-hide-on-detail col-notes">الملاحظات</th>
                  <th aria-label="الإجراءات" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="empty">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && pagedBoxes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      لا توجد خزن تطابق البحث.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pagedBoxes.map((box) => {
                    const isSelected = selectedBox?.id === box.id;
                    return (
                      <tr
                        key={box.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedBox(box)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedBox(box);
                          }
                        }}
                      >
                        <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber('CBX', box.serial_number)}</bdi></td>
                        <td className="strong">{box.name}</td>
                        <td className="num strong"><bdi dir="ltr" className="tabular-nums">{money(box.balance)}</bdi></td>
                        <td className="muted col-hide-on-detail col-notes">{box.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn compact"
                            onClick={() => openCashBoxStatement(box)}
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
          className={selectedBox ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل الرصيد"
        >
          {selectedBox ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الخزنة</span>
                  <h2>{selectedBox.name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedBox(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>الرقم التسلسلي</dt>
                  <dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd>
                </div>
                <div>
                  <dt>النوع</dt>
                  <dd>{selectedBox.is_primary ? 'الخزنة الرئيسية' : 'خزنة فرعية'}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedBox.is_active ? 'نشطة' : 'موقوفة'}</dd>
                </div>
              </dl>

              <div className="erp-detail-totals">
                <span>رصيد الفلوس الحالي</span>
                <strong className="num remaining">{money(selectedBox.balance)}</strong>
              </div>

              {selectedBox.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedBox.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => openCashBoxStatement(selectedBox)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Printer size={16} />
                  <span>عرض وطباعة حركة الخزنة</span>
                </button>
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر خزنة</strong>
              <span>ستظهر بيانات الرصيد وإمكانية استخراج كشف الحركة من هنا فورًا.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نافذة كشف حركة خزنة */}
      {cashStatementBox && (
        <Modal
          title="كشف حركة خزنة"
          className="account-statement-modal"
          backdropClassName="statement-modal-backdrop"
          onClose={() => setCashStatementBox(null)}
        >
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div>
                <h2>كشف حركة خزنة</h2>
                <strong>{cashStatementBox.name}</strong>
              </div>
              <div className="account-statement-period">
                <PeriodFilter from={statementFrom} to={statementTo} required disabled={cashStatementLoading}
                  onChange={(from, to) => { setStatementFrom(from); setStatementTo(to); setCashStatementRows([]); }} />
              </div>
            </div>

            <div className="actions statement-actions print-hidden">
              <form onSubmit={loadCashBoxStatement}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={cashStatementLoading || !statementFrom || !statementTo}
                >
                  {cashStatementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {cashStatementRows.length > 0 && (
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

            {cashStatementRows.length > 0 && (
              <>
                {(() => {
                  const lastRow = cashStatementRows[cashStatementRows.length - 1];
                  const lastBal = Number(lastRow.running_balance || 0);
                  return (
                    <div className="statement-cockpit-strip">
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي الوارد</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {money(cashStatementRows[0].total_incoming)}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي الصادر</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {money(cashStatementRows[0].total_outgoing)}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card primary-card">
                        <span className="card-label">رصيد الخزنة الحالي</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {money(lastBal)}
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
                      {cashStatementRows.map((row, index) => (
                        <tr
                          key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.transfer_number ?? index}`}
                          className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}
                        >
                          <td className="num" data-label="التاريخ">
                            {formatDate(row.transaction_date)}
                          </td>
                          <td className="card-wide-cell" data-label="البيان">
                            {row.description}
                          </td>
                          <td className="num" data-label="وارد">
                            {Number(row.incoming) ? money(row.incoming) : '—'}
                          </td>
                          <td className="num" data-label="صادر">
                            {Number(row.outgoing) ? money(row.outgoing) : '—'}
                          </td>
                          <td className="num strong" data-label="الرصيد">
                            {money(row.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="account-statement-totals">
                  <p>
                    <span>إجمالي الوارد:</span>
                    <strong>{money(cashStatementRows[0].total_incoming)}</strong>
                  </p>
                  <p>
                    <span>إجمالي الصادر:</span>
                    <strong>{money(cashStatementRows[0].total_outgoing)}</strong>
                  </p>
                  <p>
                    <span>رصيد آخر المدة:</span>
                    <strong>{money(cashStatementRows[cashStatementRows.length - 1].running_balance)}</strong>
                  </p>
                </div>
              </>
            )}
            {!cashStatementRows.length && !cashStatementLoading && (
              <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

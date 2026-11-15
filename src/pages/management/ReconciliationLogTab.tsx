import ColumnFilterRow from '../../components/ColumnFilterRow';
import { useColumnFilters } from '../../lib/useColumnFilters';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import { SkeletonRows } from '../../components/LoadingSkeleton';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import PeriodFilter from '../../components/PeriodFilter';
import { periodDates, shiftCalendarDate } from '../../lib/period';
import Pagination from '../../components/Pagination';
import SortableHeader from '../../components/SortableHeader';
import StatusBadge from '../../components/StatusBadge';
import { useDrawerEscape } from '../../lib/useDrawerEscape';
import { supabase } from '../../lib/supabase';
import { creationDate, creationTime, money, qty } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import { errorMessage, translateDbError } from '../../lib/errors';
import { toast } from '../../components/Toast';
import type { ReconciliationLogRow } from '../../lib/types';
import RunReconciliationModal from './RunReconciliationModal';

type ReconciliationSort = 'date-desc' | 'date-asc' | 'discrepancies-desc' | 'discrepancies-asc';

const PAGE_SIZE = 20;

interface ReconciliationLogTabProps {
  onRefreshMasterData?: () => Promise<void>;
}

export default function ReconciliationLogTab({
  onRefreshMasterData,
}: ReconciliationLogTabProps) {
  const [logs, setLogs] = useState<ReconciliationLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [sortOrder, setSortOrder] = useState<ReconciliationSort>('date-desc');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(() => periodDates().from);
  const [dateTo, setDateTo] = useState(() => periodDates().to);
  const [selectedLog, setSelectedLog] = useState<ReconciliationLogRow | null>(null);
  useDrawerEscape(Boolean(selectedLog), () => setSelectedLog(null));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summary, setSummary] = useState<{ total_discrepancies: number; latest_created_at: string | null; latest_status: string | null }>({ total_discrepancies: 0, latest_created_at: null, latest_status: null });
  const [searchParams, setSearchParams] = useSearchParams();
  const columns = useColumnFilters('reconciliations', () => { setDateFrom(periodDates().from); setDateTo(periodDates().to); setPage(1);
  });
  useEffect(() => { setPage(1); }, [columns.filters, sortOrder]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const requestVersion = useRef(0);
  const loadLogs = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .rpc('filter_reconciliation_rows', { p_columns: columns.filters, p_search: null }, { count: 'exact' }).select('*');

      if (dateFrom) query = query.gte('created_at', `${dateFrom} 00:00:00 Africa/Cairo`);
      if (dateTo) query = query.lt('created_at', `${shiftCalendarDate(dateTo, 1)} 00:00:00 Africa/Cairo`);

      if (sortOrder === 'date-asc') {
        query = query.order('created_at', { ascending: true });
      } else if (sortOrder === 'discrepancies-desc') {
        query = query.order('discrepancies_count', { ascending: false }).order('created_at', { ascending: false });
      } else if (sortOrder === 'discrepancies-asc') {
        query = query.order('discrepancies_count', { ascending: true }).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const [result, kpis] = await Promise.all([
        query.range(from, to),
        supabase.rpc('get_reconciliation_log_kpis_columns', { p_columns: columns.filters, p_search: null, p_mode: 'all', p_date_from: dateFrom || null, p_date_to: dateTo || null }),
      ]);
      if (request !== requestVersion.current) return;
      const { data, count, error } = result;
      if (kpis.error) throw kpis.error;
      if (kpis.data) setSummary(kpis.data);

      if (error) throw error;
      setLogs((data || []) as ReconciliationLogRow[]);
      setTotalCount(count || 0);
    } catch (err: unknown) {
      if (request === requestVersion.current) {
        const message = translateDbError(errorMessage(err));
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [page, dateFrom, dateTo, columns.filters, sortOrder]);

  useEffect(() => {
    void loadLogs();
    return () => { requestVersion.current += 1; };
  }, [loadLogs]);

  async function handleConfirmRun(mode: 'reconcile' | 'simulation', notes: string) {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc('run_comprehensive_reconciliation', {
        p_mode: mode,
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      const result = data as {
        log_id: string;
        discrepancies_count: number;
        status: string;
      };

      if (result.discrepancies_count === 0) {
        toast.success('تم فحص كافة الأرصدة والمخزون بنجاح، وجميعها متطابقة تماماً مع الدفاتر');
      } else if (mode === 'reconcile') {
        toast.warning(`تم اكتشاف ${result.discrepancies_count} فروقات وتمت مطابقتها وتصحيحها آلياً`);
      } else {
        toast.info(`فحص استكشافي: تم العثور على ${result.discrepancies_count} فروقات (لم يتم تعديل الأرصدة)`);
      }

      setIsModalOpen(false);
      await loadLogs();
      if (mode === 'reconcile' && result.discrepancies_count > 0 && onRefreshMasterData) {
        await onRefreshMasterData();
      }
    } catch (err: unknown) {
      toast.error(translateDbError(errorMessage(err)));
    } finally {
      setRunning(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const kpiItems = useMemo<KpiItem[]>(() => {
    const latestLog = summary.latest_created_at ? { created_at: summary.latest_created_at, status: summary.latest_status } : null;
    const latestTime = latestLog
      ? `${creationDate(latestLog.created_at)} ${creationTime(latestLog.created_at)}`
      : 'لا يوجد فحص سابق';

    const totalDiscrepancies = Number(summary.total_discrepancies);

    return [
      {
        id: 'reconcile-latest-date',
        label: 'تاريخ آخر فحص',
        value: latestTime,
        variant: latestLog?.status === 'clean' ? 'primary' : latestLog ? 'warning' : 'neutral',
        icon: Clock,
      },
      {
        id: 'reconcile-total-runs',
        label: 'إجمالي عمليات الفحص',
        value: totalCount,
        unit: 'عملية',
        variant: 'neutral',
        icon: History,
        subtext: 'سجل تدقيق تراكمي محفوظ',
      },
      {
        id: 'reconcile-total-discrepancies',
        label: 'فروقات تم رصدها بالسجل',
        value: totalDiscrepancies,
        unit: 'فرق',
        variant: totalDiscrepancies > 0 ? 'warning' : 'primary',
        icon: totalDiscrepancies > 0 ? ShieldAlert : CheckCircle2,
        subtext: totalDiscrepancies === 0 ? 'كافة السجلات نظيفة' : 'تم تدقيقها وتوثيقها',
      },
    ];
  }, [summary, totalCount]);

  return (
    <>
      <KpiBar items={kpiItems} loading={loading} ariaLabel="مؤشرات سجل تدقيق ومطابقة الأرصدة" />

      <div className={selectedLog ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة سجلات المطابقة والتدقيق">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <PeriodFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} />
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="table erp-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="تاريخ وتوقيت الفحص"
                    field="date"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ReconciliationSort)}
                    className="col-datetime"
                  />
                  <th style={{ width: '130px' }}>القائم بالفحص</th>
                  <th style={{ width: '130px' }}>نوع العملية</th>
                  <th style={{ width: '180px' }}>نطاق الفحص</th>
                  <SortableHeader
                    label="نتيجة الفحص"
                    field="discrepancies"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ReconciliationSort)}
                  />
                  <th>الملاحظات</th>
                </tr>
                <ColumnFilterRow scope="reconciliations" owner values={columns.values} onChange={columns.setField} onReset={columns.reset} />
              </thead>
              <tbody>
                {loading && <SkeletonRows columns={6} />}
                {!loading && loadError && (
                  <EmptyState
                    colSpan={6}
                    compact
                    role="alert"
                    icon={AlertCircle}
                    title="تعذّر تحميل سجل المطابقة والتدقيق."
                    description={loadError}
                    action={{
                      label: 'إعادة المحاولة',
                      onClick: () => void loadLogs(),
                      icon: RefreshCw,
                    }}
                  />
                )}
                {!loading && !loadError && logs.length === 0 && (
                  <EmptyState
                    colSpan={6}
                    compact
                    title="لا توجد عمليات فحص ومطابقة مسجلة حتى الآن."
                    description="اضغط على «بدء فحص جديد» للتدقيق."
                  />
                )}
                {!loading && !loadError &&
                  logs.map((row) => {
                    const isSelected = selectedLog?.id === row.id;
                    const isClean = row.status === 'clean' || row.discrepancies_count === 0;
                    return (
                      <tr
                        key={row.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedLog(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedLog(row);
                          }
                        }}
                      >
                        <td className="num strong col-datetime">
                          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <DateDisplay value={row.created_at} />
                            <bdi dir="ltr" className="tabular-nums" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              {creationTime(row.created_at)}
                            </bdi>
                          </span>
                        </td>
                        <td>{row.performed_by_name || 'المالك'}</td>
                        <td>
                          {row.mode === 'reconcile' ? (
                            <StatusBadge variant="completed">
                              <Sparkles size={12} aria-hidden="true" />
                              <span>تصحيح فعلي</span>
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="pending">
                              <ShieldAlert size={12} aria-hidden="true" />
                              <span>استكشافي</span>
                            </StatusBadge>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: '0.85rem' }}>
                          <span>
                            <bdi dir="ltr" className="tabular-nums">{row.accounts_count}</bdi> حساب •{' '}
                            <bdi dir="ltr" className="tabular-nums">{row.cash_boxes_count}</bdi> خزنة •{' '}
                            <bdi dir="ltr" className="tabular-nums">{row.items_count}</bdi> صنف
                          </span>
                        </td>
                        <td>
                          {isClean ? (
                            <StatusBadge variant="active">
                              <bdi dir="ltr" className="tabular-nums">100%</bdi> متطابقة
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="warning">
                              <bdi dir="ltr" className="tabular-nums">{row.discrepancies_count}</bdi> فروقات
                            </StatusBadge>
                          )}
                        </td>
                        <td style={{ color: row.notes ? 'inherit' : 'var(--muted)' }}>
                          {row.notes || '—'}
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
            countsPending={loading}
          />
        </section>

        {selectedLog && (
          <div
            className="erp-drawer-backdrop"
            aria-hidden="true"
            onClick={() => setSelectedLog(null)}
          />
        )}

        <aside
          className={selectedLog ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل عملية التدقيق"
        >
          {selectedLog ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>سجل التدقيق والمطابقة</span>
                  <h2><DateDisplay value={selectedLog.created_at} /> (<bdi dir="ltr" className="tabular-nums">{creationTime(selectedLog.created_at)}</bdi>)</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedLog(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>القائم بالفحص</dt>
                  <dd>{selectedLog.performed_by_name || 'المالك'}</dd>
                </div>
                <div>
                  <dt>نمط العملية</dt>
                  <dd>{selectedLog.mode === 'reconcile' ? 'فحص وتصحيح فوري' : 'فحص استكشافي دون تعديل'}</dd>
                </div>
                <div>
                  <dt>الحسابات المفحوصة</dt>
                  <dd className="num"><bdi dir="ltr" className="tabular-nums">{selectedLog.accounts_count}</bdi> حساب</dd>
                </div>
                <div>
                  <dt>الخزن المفحوصة</dt>
                  <dd className="num"><bdi dir="ltr" className="tabular-nums">{selectedLog.cash_boxes_count}</bdi> خزنة</dd>
                </div>
                <div>
                  <dt>أصناف المخزون</dt>
                  <dd className="num"><bdi dir="ltr" className="tabular-nums">{selectedLog.items_count}</bdi> صنف</dd>
                </div>
                <div>
                  <dt>الفروقات المكتشفة</dt>
                  <dd className="num strong" style={{ color: selectedLog.discrepancies_count > 0 ? '#d97706' : '#10b981' }}>
                    <bdi dir="ltr" className="tabular-nums">{selectedLog.discrepancies_count}</bdi> فرق
                  </dd>
                </div>
              </dl>

              {selectedLog.notes && (
                <p className="erp-detail-notes">
                  <span>الملاحظات</span>
                  {selectedLog.notes}
                </p>
              )}

              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBlockEnd: '10px' }}>
                  بيان الفروقات التي تم رصدها:
                </h3>

                {selectedLog.discrepancies.length === 0 ? (
                  <div className="alert success" role="status">
                    <CheckCircle2 size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <div>
                      <strong>الأرصدة متطابقة 100%</strong>
                      <div>لم تسفر هذه العملية عن أي فروقات في الأرصدة أو كميات المخزون.</div>
                    </div>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>النوع</th>
                          <th>البيان</th>
                          <th>الرصيد السابق</th>
                          <th>بعد التدقيق</th>
                          <th>قيمة الفرق</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLog.discrepancies.map((item, index) => {
                          const isItem = item.entity_type === 'item' || item.entity_type === 'صنف';
                          const formatVal = isItem ? qty : money;
                          const typeLabel =
                            ({ account: 'حساب', cash_box: 'خزنة', item: 'صنف' } as Record<string, string>)[
                              item.entity_type
                            ] ?? item.entity_type;
                          return (
                            <tr key={`${item.entity_id}-${index}`}>
                              <td>{typeLabel}</td>
                              <td style={{ fontWeight: 600 }}>{item.entity_name}</td>
                              <td className="tabular-nums" dir="ltr">
                                <bdi dir="ltr" className="tabular-nums">{formatVal(item.old_balance)}</bdi>
                              </td>
                              <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600 }}>
                                <bdi dir="ltr" className="tabular-nums">{formatVal(item.reconciled_balance)}</bdi>
                              </td>
                              <td
                                className="tabular-nums"
                                dir="ltr"
                                style={{
                                  fontWeight: 700,
                                  color: item.discrepancy > 0 ? '#10b981' : '#ef4444',
                                }}
                              >
                                <bdi dir="ltr" className="tabular-nums">
                                  {item.discrepancy > 0 ? `+${formatVal(item.discrepancy)}` : formatVal(item.discrepancy)}
                                </bdi>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              icon={History}
              title="اختر عملية فحص"
              description="اضغط على أي سطر في السجل لمراجعة تفاصيل الحسابات والفروقات المرصودة."
            />
          )}
        </aside>
      </div>

      {isModalOpen && (
        <RunReconciliationModal
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleConfirmRun}
          loading={running}
        />
      )}
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  History,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import Pagination from '../../components/Pagination';
import SearchableSelect from '../../components/SearchableSelect';
import { supabase } from '../../lib/supabase';
import { creationTime, formatDate, money } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import { toast } from '../../components/Toast';
import type { ReconciliationLogRow } from '../../lib/types';
import RunReconciliationModal from './RunReconciliationModal';

const PAGE_SIZE = 20;

interface ReconciliationLogTabProps {
  onRefreshMasterData?: () => Promise<void>;
  startRunTrigger?: number;
}

export default function ReconciliationLogTab({
  onRefreshMasterData,
  startRunTrigger,
}: ReconciliationLogTabProps) {
  const [logs, setLogs] = useState<ReconciliationLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'reconcile' | 'simulation'>('all');
  const [selectedLog, setSelectedLog] = useState<ReconciliationLogRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (startRunTrigger && startRunTrigger > 0) {
      setIsModalOpen(true);
    }
  }, [startRunTrigger]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('balance_reconciliation_logs')
        .select('*', { count: 'exact' });

      if (modeFilter !== 'all') {
        query = query.eq('mode', modeFilter);
      }
      if (searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`notes.ilike.%${term}%,performed_by_name.ilike.%${term}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setLogs((data || []) as ReconciliationLogRow[]);
      setTotalCount(count || 0);
    } catch (err: unknown) {
      toast.error(translateDbError(errorMessage(err)));
    } finally {
      setLoading(false);
    }
  }, [modeFilter, page, searchTerm]);

  useEffect(() => {
    void loadLogs();
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
      if (onRefreshMasterData) {
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
    const latestLog = logs[0];
    const latestTime = latestLog
      ? `${formatDate(latestLog.created_at)} ${creationTime(latestLog.created_at)}`
      : 'لا يوجد فحص سابق';

    const totalDiscrepancies = logs.reduce((sum, item) => sum + (item.discrepancies_count || 0), 0);

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
  }, [logs, totalCount]);

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات سجل تدقيق ومطابقة الأرصدة" />

      <div className={selectedLog ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة سجلات المطابقة والتدقيق">
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
                  placeholder="بحث باسم المنفذ أو الملاحظات…"
                />
              </label>

              <SearchableSelect
                ariaLabel="تصفية نمط الفحص"
                value={modeFilter}
                options={[
                  { value: 'all', label: 'كافة الأنماط' },
                  { value: 'reconcile', label: 'تصحيح فعلي' },
                  { value: 'simulation', label: 'فحص استكشافي' },
                ]}
                onChange={(val) => {
                  setModeFilter(val as 'all' | 'reconcile' | 'simulation');
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="table erp-table">
              <thead>
                <tr>
                  <th style={{ width: '170px' }}>تاريخ وتوقيت الفحص</th>
                  <th style={{ width: '130px' }}>القائم بالفحص</th>
                  <th style={{ width: '130px' }}>نوع العملية</th>
                  <th className="col-hide-on-detail" style={{ width: '180px' }}>نطاق الفحص</th>
                  <th style={{ width: '140px' }}>نتيجة الفحص</th>
                  <th>الملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="empty">
                      جارٍ تحميل سجل التدقيق…
                    </td>
                  </tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      لا توجد عمليات فحص ومطابقة مسجلة حتى الآن. اضغط على «بدء فحص جديد» للتدقيق.
                    </td>
                  </tr>
                )}
                {!loading &&
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
                        <td className="num strong">
                          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <span>{formatDate(row.created_at)}</span>
                            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              {creationTime(row.created_at)}
                            </span>
                          </span>
                        </td>
                        <td>{row.performed_by_name || 'المالك'}</td>
                        <td>
                          {row.mode === 'reconcile' ? (
                            <span className="status-badge-mini status-completed" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={12} />
                              <span>تصحيح فعلي</span>
                            </span>
                          ) : (
                            <span className="status-badge-mini status-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <ShieldAlert size={12} />
                              <span>استكشافي</span>
                            </span>
                          )}
                        </td>
                        <td className="col-hide-on-detail muted" style={{ fontSize: '0.85rem' }}>
                          <span>
                            <bdi className="tabular-nums">{row.accounts_count}</bdi> حساب •{' '}
                            <bdi className="tabular-nums">{row.cash_boxes_count}</bdi> خزنة •{' '}
                            <bdi className="tabular-nums">{row.items_count}</bdi> صنف
                          </span>
                        </td>
                        <td>
                          {isClean ? (
                            <span className="status-badge-mini status-active">
                              متطابقة 100%
                            </span>
                          ) : (
                            <span className="status-badge-mini status-warning">
                              {row.discrepancies_count} فروقات
                            </span>
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
          />
        </section>

        <aside
          className={selectedLog ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل عملية التدقيق"
        >
          {selectedLog ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>سجل التدقيق والمطابقة</span>
                  <h2>{formatDate(selectedLog.created_at)} ({creationTime(selectedLog.created_at)})</h2>
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
                  <dd className="num"><bdi>{selectedLog.accounts_count}</bdi> حساب</dd>
                </div>
                <div>
                  <dt>الخزن المفحوصة</dt>
                  <dd className="num"><bdi>{selectedLog.cash_boxes_count}</bdi> خزنة</dd>
                </div>
                <div>
                  <dt>أصناف المخزون</dt>
                  <dd className="num"><bdi>{selectedLog.items_count}</bdi> صنف</dd>
                </div>
                <div>
                  <dt>الفروقات المكتشفة</dt>
                  <dd className="num strong" style={{ color: selectedLog.discrepancies_count > 0 ? '#d97706' : '#10b981' }}>
                    <bdi>{selectedLog.discrepancies_count}</bdi> فرق
                  </dd>
                </div>
                {selectedLog.notes && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <dt>الملاحظات</dt>
                    <dd>{selectedLog.notes}</dd>
                  </div>
                )}
              </dl>

              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBlockEnd: '10px' }}>
                  بيان الفروقات التي تم رصدها:
                </h3>

                {selectedLog.discrepancies.length === 0 ? (
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      background: 'var(--color-success-subtle, #ecfdf5)',
                      border: '1px solid var(--color-success-border, #a7f3d0)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <CheckCircle2 style={{ color: '#059669', flexShrink: 0 }} size={24} />
                    <div style={{ fontSize: '0.85rem', color: '#065f46' }}>
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
                        {selectedLog.discrepancies.map((item, index) => (
                          <tr key={`${item.entity_id}-${index}`}>
                            <td>{item.entity_type}</td>
                            <td style={{ fontWeight: 600 }}>{item.entity_name}</td>
                            <td className="tabular-nums" dir="ltr">
                              <bdi>{money(item.old_balance)}</bdi>
                            </td>
                            <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600 }}>
                              <bdi>{money(item.reconciled_balance)}</bdi>
                            </td>
                            <td
                              className="tabular-nums"
                              dir="ltr"
                              style={{
                                fontWeight: 700,
                                color: item.discrepancy > 0 ? '#10b981' : '#ef4444',
                              }}
                            >
                              <bdi>
                                {item.discrepancy > 0 ? `+${money(item.discrepancy)}` : money(item.discrepancy)}
                              </bdi>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر عملية فحص</strong>
              <span>اضغط على أي سطر في السجل لمراجعة تفاصيل الحسابات والفروقات المرصودة.</span>
            </div>
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

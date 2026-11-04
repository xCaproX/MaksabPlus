import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  X,
  Printer,
  Users,
  UserCheck,
  ShoppingBag,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber, formatDate, getBalanceStatus, money, today } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import DateInput from '../../components/DateInput';
import SortableHeader from '../../components/SortableHeader';
import { toast } from '../../components/Toast';
import type { AccountRow, AccountStatementRow } from '../../lib/types';

type BalanceSort =
  | 'balance-desc'
  | 'balance-asc'
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc';

const PAGE_SIZE = 20;

interface AccountBalancesTabProps {
  kind: 'customer' | 'supplier';
}

interface AccountBalancesSummary {
  netBalance: number;
  totalDebit: number;
  totalCredit: number;
  positiveCount: number;
  count: number;
}

export default function AccountBalancesTab({ kind }: AccountBalancesTabProps) {
  const isCustomer = kind === 'customer';
  const entityPrefix = isCustomer ? 'CUS' : 'SUP';
  const entityTitle = isCustomer ? 'عميل' : 'مورد';
  const entityPlural = isCustomer ? 'العملاء' : 'الموردين';

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [summary, setSummary] = useState<AccountBalancesSummary>({
    netBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    positiveCount: 0,
    count: 0,
  });

  // تأخير البحث لمنع إرسال طلبات متعددة مع كل حرف (Debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // التحديد والتفاصيل
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  // كشف الحساب
  const [statementAccount, setStatementAccount] = useState<AccountRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(`${today().slice(0, 7)}-01`);
  const [statementTo, setStatementTo] = useState(today());
  const [statementRows, setStatementRows] = useState<AccountStatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  // جلب الحسابات بالصفحات مع المؤشرات من السيرفر مباشرة
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;
      const trimmed = debouncedSearch.trim();

      try {
        let query = supabase
          .from('v_account_balances')
          .select('*', { count: 'exact' })
          .eq('kind', kind)
          .is('system_key', null);

        if (trimmed) {
          query = query.or(
            `name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,serial_number.ilike.%${trimmed}%,notes.ilike.%${trimmed}%`,
          );
        }

        if (sortOrder === 'balance-desc') {
          query = query.order('balance', { ascending: false }).order('name', { ascending: true });
        } else if (sortOrder === 'balance-asc') {
          query = query.order('balance', { ascending: true }).order('name', { ascending: true });
        } else if (sortOrder === 'serial-desc') {
          query = query.order('serial_number', { ascending: false });
        } else if (sortOrder === 'serial-asc') {
          query = query.order('serial_number', { ascending: true });
        } else if (sortOrder === 'name-desc') {
          query = query.order('name', { ascending: false });
        } else {
          query = query.order('name', { ascending: true });
        }

        query = query.range(from, to);

        const [dataRes, kpiRes] = await Promise.all([
          query,
          supabase.rpc('get_account_balances_kpis', {
            p_kind: kind,
            p_search: trimmed || null,
          }),
        ]);

        if (!alive) return;
        if (dataRes.error) throw dataRes.error;

        setAccounts((dataRes.data ?? []) as AccountRow[]);
        setTotalCount(dataRes.count ?? 0);

        if (kpiRes.data) {
          const raw = kpiRes.data as {
            net_balance?: number;
            total_debit?: number;
            total_credit?: number;
            positive_count?: number;
            count?: number;
          };
          setSummary({
            netBalance: Number(raw.net_balance || 0),
            totalDebit: Number(raw.total_debit || 0),
            totalCredit: Number(raw.total_credit || 0),
            positiveCount: Number(raw.positive_count || 0),
            count: Number(raw.count || 0),
          });
        }
      } catch (err: unknown) {
        if (!alive) return;
        toast.error(errorMessage(err));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [kind, page, debouncedSearch, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedAccounts = accounts;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortOrder]);

  useEffect(() => {
    if (page > pageCount && pageCount > 0) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    if (isCustomer) {
      const netBalance = summary.netBalance;
      const totalDebit = summary.totalDebit;
      const totalCredit = summary.totalCredit;
      const debtorCount = summary.positiveCount;

      return [
        {
          id: 'cus-net',
          label: 'صافي رصيد العملاء',
          value: money(netBalance),
          unit: 'ج.م',
          variant: netBalance > 0 ? 'primary' : 'neutral',
          icon: Users,
          subtext: (
            <span>
              {netBalance > 0
                ? 'إجمالي مستحق لنا طرف العملاء'
                : netBalance < 0
                ? 'إجمالي دفعات مقدمة من العملاء'
                : 'الأرصدة متزنة'}
            </span>
          ),
        },
        {
          id: 'cus-debit',
          label: 'إجمالي مديونيات لنا (مدين)',
          value: money(totalDebit),
          unit: 'ج.م',
          variant: totalDebit > 0 ? 'warning' : 'neutral',
          icon: AlertCircle,
          subtext: (
            <span>
              لدى <bdi dir="ltr">{debtorCount}</bdi> عميل مدين
            </span>
          ),
        },
        {
          id: 'cus-credit',
          label: 'أرصدة دائنة (دفعات مقدمة)',
          value: money(totalCredit),
          unit: 'ج.م',
          variant: totalCredit > 0 ? 'info' : 'neutral',
          icon: Wallet,
        },
        {
          id: 'cus-count',
          label: 'إجمالي العملاء المسجلين',
          value: summary.count,
          unit: 'عميل',
          variant: 'neutral',
          icon: UserCheck,
          subtext: `منهم ${debtorCount} عليهم مديونية`,
        },
      ];
    }

    const netBalance = summary.netBalance;
    const totalPayable = summary.totalDebit;
    const totalAdvance = summary.totalCredit;
    const creditorCount = summary.positiveCount;

    return [
      {
        id: 'sup-net',
        label: 'صافي رصيد الموردين',
        value: money(netBalance),
        unit: 'ج.م',
        variant: netBalance > 0 ? 'danger' : 'neutral',
        icon: ShoppingBag,
        subtext: (
          <span>
            {netBalance > 0
              ? 'إجمالي مستحق للموردين طرفنا'
              : netBalance < 0
              ? 'إجمالي دفعات مقدمة للموردين'
              : 'الأرصدة متزنة'}
          </span>
        ),
      },
      {
        id: 'sup-payable',
        label: 'مستحقات للموردين (دائن)',
        value: money(totalPayable),
        unit: 'ج.م',
        variant: totalPayable > 0 ? 'danger' : 'neutral',
        icon: AlertCircle,
        subtext: (
          <span>
            مستحقة لـ <bdi dir="ltr">{creditorCount}</bdi> مورد
          </span>
        ),
      },
      {
        id: 'sup-advance',
        label: 'دفعات مقدمة للموردين (مدين)',
        value: money(totalAdvance),
        unit: 'ج.م',
        variant: totalAdvance > 0 ? 'info' : 'neutral',
        icon: Wallet,
      },
      {
        id: 'sup-count',
        label: 'إجمالي الموردين المسجلين',
        value: summary.count,
        unit: 'مورد',
        variant: 'neutral',
        icon: UserCheck,
        subtext: `منهم ${creditorCount} لهم مستحقات`,
      },
    ];
  }, [summary, isCustomer]);

  function openStatement(account: AccountRow) {
    setStatementAccount(account);
    setStatementRows([]);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
  }

  async function loadStatement(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!statementAccount || !statementFrom || !statementTo) return;

    setStatementLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_account_statement', {
      p_account_id: statementAccount.id,
      p_from: statementFrom,
      p_to: statementTo,
    });

    setStatementLoading(false);
    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      setStatementRows([]);
    } else {
      setStatementRows((data ?? []) as AccountStatementRow[]);
    }
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel={`مؤشرات ${entityPlural}`} />

      <div className={selectedAccount ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label={`قائمة ${entityPlural}`}>
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`بحث باسم ${entityTitle} أو الهاتف أو الرقم…`}
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
                    label={isCustomer ? 'العميل' : 'المورد'}
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as BalanceSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">الهاتف</th>
                  <SortableHeader
                    label="الرصيد الحالي"
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
                {!loading && pagedAccounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      لا توجد حسابات {entityPlural} تطابق البحث.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pagedAccounts.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    const status = getBalanceStatus(account.balance, account.kind as 'customer' | 'supplier');
                    return (
                      <tr
                        key={account.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedAccount(account);
                          }
                        }}
                      >
                        <td className="num strong">{entityNumber(entityPrefix, account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num col-hide-on-detail">{account.phone || '—'}</td>
                        <td className="num">
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              justifyContent: 'flex-end',
                              width: '100%',
                            }}
                          >
                            <span className={`status-badge-mini status-${status.type}`}>
                              {status.text}
                            </span>
                            <strong
                              dir="ltr"
                              className={`tabular-nums ${Number(account.balance) > 0 ? 'remaining' : ''}`}
                            >
                              {money(Math.abs(Number(account.balance || 0)))}
                            </strong>
                          </div>
                        </td>
                        <td className="muted col-hide-on-detail">{account.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn compact"
                            onClick={() => openStatement(account)}
                          >
                            كشف حساب
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
          className={selectedAccount ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل الرصيد"
        >
          {selectedAccount ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>{isCustomer ? 'حساب عميل' : 'حساب مورد'}</span>
                  <h2>{selectedAccount.name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedAccount(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>الرقم التسلسلي</dt>
                  <dd className="num">{entityNumber(entityPrefix, selectedAccount.serial_number)}</dd>
                </div>
                <div>
                  <dt>رقم الهاتف</dt>
                  <dd className="num">{selectedAccount.phone || '—'}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedAccount.is_active ? 'نشط' : 'موقوف'}</dd>
                </div>
              </dl>

              <div className="erp-detail-totals">
                <span>الرصيد الفعلي</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                  {(() => {
                    const status = getBalanceStatus(selectedAccount.balance, selectedAccount.kind as 'customer' | 'supplier');
                    return (
                      <span className={`status-badge-mini status-${status.type}`}>
                        {status.text}
                      </span>
                    );
                  })()}
                  <strong
                    dir="ltr"
                    className={`num tabular-nums ${Number(selectedAccount.balance) > 0 ? 'remaining' : ''}`}
                  >
                    {money(Math.abs(Number(selectedAccount.balance || 0)))}
                  </strong>
                </div>
              </div>

              {selectedAccount.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedAccount.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => openStatement(selectedAccount)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Printer size={16} />
                  <span>عرض وطباعة كشف الحساب</span>
                </button>
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر حسابًا</strong>
              <span>ستظهر بيانات الرصيد وإمكانية استخراج كشف الحساب من هنا فورًا.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نافذة كشف الحساب */}
      {statementAccount && (
        <Modal
          title="كشف حساب"
          className="account-statement-modal"
          backdropClassName="statement-modal-backdrop"
          onClose={() => setStatementAccount(null)}
        >
          <div className="account-statement-print">
            <div className="account-statement-heading">
              <div>
                <h2>كشف حساب {isCustomer ? 'عميل' : 'مورد'}</h2>
                <strong>{statementAccount.name}</strong>
                <p>{statementAccount.phone || '—'}</p>
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
              <form onSubmit={loadStatement}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={statementLoading || !statementFrom || !statementTo}
                >
                  {statementLoading ? 'جارٍ إعداد الكشف…' : 'عرض الكشف'}
                </button>
              </form>
              {statementRows.length > 0 && (
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

            {statementRows.length > 0 && (
              <>
                {(() => {
                  const lastRow = statementRows[statementRows.length - 1];
                  const lastBal = Number(lastRow.running_balance || 0);
                  const status = getBalanceStatus(lastBal, statementAccount.kind as 'customer' | 'supplier');
                  return (
                    <div className="statement-cockpit-strip">
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي المسحوبات (مدين)</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {money(statementRows[0].total_debit)}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card">
                        <span className="card-label">إجمالي السدادات (دائن)</span>
                        <div className="card-value-wrap">
                          <strong dir="ltr" className="card-value num tabular-nums">
                            {money(statementRows[0].total_credit)}
                          </strong>
                        </div>
                      </div>
                      <div className="statement-cockpit-card primary-card">
                        <span className="card-label">رصيد آخر المدة</span>
                        <div className="card-value-wrap">
                          <span className={`status-badge-mini status-${status.type}`}>
                            {status.text}
                          </span>
                          <strong
                            dir="ltr"
                            className={`card-value num tabular-nums ${lastBal > 0 ? 'due' : ''}`}
                          >
                            {money(Math.abs(lastBal))}
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
                        <th>مدين</th>
                        <th>دائن</th>
                        <th>الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementRows.map((row, index) => (
                        <tr
                          key={`${row.row_type}-${row.transaction_date}-${row.receipt_number ?? row.invoice_number ?? index}`}
                          className={`responsive-row ${row.row_type === 'opening' ? 'statement-opening-row' : ''}`}
                        >
                          <td className="num" data-label="التاريخ">
                            {formatDate(row.transaction_date)}
                          </td>
                          <td className="card-wide-cell" data-label="البيان">
                            {row.description}
                          </td>
                          <td className="num" data-label="مدين">
                            {Number(row.debit) ? money(row.debit) : '—'}
                          </td>
                          <td className="num" data-label="دائن">
                            {Number(row.credit) ? money(row.credit) : '—'}
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
                    <span>إجمالي المدين:</span>
                    <strong>{money(statementRows[0].total_debit)}</strong>
                  </p>
                  <p>
                    <span>إجمالي الدائن:</span>
                    <strong>{money(statementRows[0].total_credit)}</strong>
                  </p>
                  <p>
                    <span>رصيد آخر المدة:</span>
                    <strong>{money(statementRows[statementRows.length - 1].running_balance)}</strong>
                  </p>
                </div>
              </>
            )}
            {!statementRows.length && !statementLoading && (
              <p className="hint print-hidden">اختر الفترة ثم اضغط «عرض الكشف».</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
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
import { translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import DateInput from '../../components/DateInput';
import SortableHeader from '../../components/SortableHeader';
import { toast } from '../../components/Toast';
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';
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

export default function AccountBalancesTab({ kind }: AccountBalancesTabProps) {
  const isCustomer = kind === 'customer';
  const entityPrefix = isCustomer ? 'CUS' : 'SUP';
  const entityTitle = isCustomer ? 'عميل' : 'مورد';
  const entityPlural = isCustomer ? 'العملاء' : 'الموردين';

  const { accounts, loading } = useMasterData();

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<BalanceSort>('balance-desc');
  const [page, setPage] = useState(1);

  // التحديد والتفاصيل
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  // كشف الحساب
  const [statementAccount, setStatementAccount] = useState<AccountRow | null>(null);
  const [statementFrom, setStatementFrom] = useState(`${today().slice(0, 7)}-01`);
  const [statementTo, setStatementTo] = useState(today());
  const [statementRows, setStatementRows] = useState<AccountStatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const relevantAccounts = useMemo(() => {
    return accounts.filter((a) => a.system_key === null && a.kind === kind);
  }, [accounts, kind]);

  // تصفية وترتيب الحسابات
  const filteredAccounts = useMemo(() => {
    const list = relevantAccounts.filter((account) =>
      matchesSearchQuery([account.name, account.phone, account.serial_number, account.notes], searchTerm),
    );

    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'balance-desc') return Number(secondAccount.balance) - Number(firstAccount.balance);
      if (sortOrder === 'balance-asc') return Number(firstAccount.balance) - Number(secondAccount.balance);
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [relevantAccounts, searchTerm, sortOrder]);

  const totalCount = filteredAccounts.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedAccounts = filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    if (isCustomer) {
      const netBalance = filteredAccounts.reduce((sum, c) => sum + Number(c.balance || 0), 0);
      const totalDebit = filteredAccounts.reduce(
        (sum, c) => (Number(c.balance) > 0 ? sum + Number(c.balance) : sum),
        0,
      );
      const totalCredit = filteredAccounts.reduce(
        (sum, c) => (Number(c.balance) < 0 ? sum + Math.abs(Number(c.balance)) : sum),
        0,
      );
      const debtorCount = filteredAccounts.filter((c) => Number(c.balance) > 0).length;

      return [
        {
          id: 'cus-net',
          label: 'صافي رصيد العملاء',
          value: money(netBalance),
          unit: 'ج.م',
          variant: netBalance > 0 ? 'primary' : 'neutral',
          icon: Users,
        },
        {
          id: 'cus-debit',
          label: 'إجمالي مديونيات لنا (مدين)',
          value: money(totalDebit),
          unit: 'ج.م',
          variant: totalDebit > 0 ? 'warning' : 'neutral',
          icon: AlertCircle,
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
          id: 'cus-debtors-count',
          label: 'عملاء عليهم مديونية',
          value: debtorCount,
          unit: 'عميل',
          variant: debtorCount > 0 ? 'danger' : 'neutral',
          icon: UserCheck,
          subtext: `من إجمالي ${filteredAccounts.length} عميل معروض`,
        },
      ];
    }

    const netBalance = filteredAccounts.reduce((sum, s) => sum + Number(s.balance || 0), 0);
    const totalPayable = filteredAccounts.reduce(
      (sum, s) => (Number(s.balance) > 0 ? sum + Number(s.balance) : sum),
      0,
    );
    const totalAdvance = filteredAccounts.reduce(
      (sum, s) => (Number(s.balance) < 0 ? sum + Math.abs(Number(s.balance)) : sum),
      0,
    );
    const creditorCount = filteredAccounts.filter((s) => Number(s.balance) > 0).length;

    return [
      {
        id: 'sup-net',
        label: 'صافي مستحقات الموردين',
        value: money(netBalance),
        unit: 'ج.م',
        variant: netBalance > 0 ? 'danger' : 'neutral',
        icon: ShoppingBag,
      },
      {
        id: 'sup-payable',
        label: 'مستحق للموردين (علينا)',
        value: money(totalPayable),
        unit: 'ج.م',
        variant: totalPayable > 0 ? 'danger' : 'neutral',
        icon: AlertCircle,
      },
      {
        id: 'sup-advance',
        label: 'مدفوع مقدمًا (لنا)',
        value: money(totalAdvance),
        unit: 'ج.م',
        variant: totalAdvance > 0 ? 'info' : 'neutral',
        icon: Wallet,
      },
      {
        id: 'sup-creditor-count',
        label: 'موردون يطالبون بمستحقات',
        value: creditorCount,
        unit: 'مورد',
        variant: creditorCount > 0 ? 'warning' : 'neutral',
        icon: Users,
        subtext: `من إجمالي ${filteredAccounts.length} مورد معروض`,
      },
    ];
  }, [filteredAccounts, isCustomer]);

  function openStatement(account: AccountRow) {
    setStatementAccount(account);
    setStatementFrom(`${today().slice(0, 7)}-01`);
    setStatementTo(today());
    setStatementRows([]);
  }

  async function loadStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statementAccount) return;
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
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
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

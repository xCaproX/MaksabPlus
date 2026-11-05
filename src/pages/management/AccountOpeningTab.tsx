import { useEffect, useMemo, useState } from 'react';
import { Users, ShoppingBag, AlertCircle, Wallet, CheckCircle2, X } from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import Pagination from '../../components/Pagination';
import SortableHeader from '../../components/SortableHeader';
import { supabase } from '../../lib/supabase';
import { entityNumber, getBalanceStatus, money } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import { matchesSearchQuery } from '../../lib/search';
import { toast } from '../../components/Toast';
import type { AccountRow } from '../../lib/types';

export type ManagementSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
const PAGE_SIZE = 20;

interface AccountOpeningTabProps {
  kind: 'customer' | 'supplier';
  accounts: AccountRow[];
  canEditOpening: boolean;
  onRefresh: () => Promise<void>;
  saving: boolean;
  setSaving: (saving: boolean) => void;
}

export default function AccountOpeningTab({
  kind,
  accounts,
  canEditOpening,
  onRefresh,
  saving,
  setSaving,
}: AccountOpeningTabProps) {
  const isCustomer = kind === 'customer';
  const entityPrefix = isCustomer ? 'CUS' : 'SUP';

  const [accountValues, setAccountValues] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<ManagementSort>('name-asc');
  const [page, setPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => account.kind === kind),
    [accounts, kind]
  );

  useEffect(() => {
    setAccountValues(
      Object.fromEntries(
        visibleAccounts.map((account) => [account.id, String(Number(account.opening_balance))])
      )
    );
  }, [visibleAccounts]);

  const filteredAccounts = useMemo(() => {
    const list = visibleAccounts.filter((account) =>
      matchesSearchQuery([account.name, account.phone, account.serial_number], searchTerm)
    );
    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [visibleAccounts, searchTerm, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
  const pageAccounts = filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortOrder, kind]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const kpiItems = useMemo<KpiItem[]>(() => {
    if (isCustomer) {
      const totalOpening = filteredAccounts.reduce(
        (sum, a) => sum + Number(accountValues[a.id] ?? a.opening_balance ?? 0),
        0
      );
      const debitTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val > 0 ? sum + val : sum;
      }, 0);
      const creditTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val < 0 ? sum + Math.abs(val) : sum;
      }, 0);
      const withOpening = filteredAccounts.filter(
        (a) => Number(accountValues[a.id] ?? a.opening_balance ?? 0) !== 0
      ).length;

      return [
        {
          id: 'mgmt-cus-net',
          label: 'صافي افتتاحيات العملاء',
          value: money(totalOpening),
          unit: 'ج.م',
          variant: totalOpening > 0 ? 'primary' : 'neutral',
          icon: Users,
        },
        {
          id: 'mgmt-cus-debit',
          label: 'إجمالي مدين لنا',
          value: money(debitTotal),
          unit: 'ج.م',
          variant: debitTotal > 0 ? 'warning' : 'neutral',
          icon: AlertCircle,
        },
        {
          id: 'mgmt-cus-credit',
          label: 'إجمالي دائن علينا',
          value: money(creditTotal),
          unit: 'ج.م',
          variant: creditTotal > 0 ? 'info' : 'neutral',
          icon: Wallet,
        },
        {
          id: 'mgmt-cus-with-opening',
          label: 'عملاء برصيد افتتاحي',
          value: withOpening,
          unit: 'عميل',
          variant: 'neutral',
          icon: CheckCircle2,
          subtext: `من إجمالي ${filteredAccounts.length} عميل`,
        },
      ];
    } else {
      const totalOpening = filteredAccounts.reduce(
        (sum, a) => sum + Number(accountValues[a.id] ?? a.opening_balance ?? 0),
        0
      );
      const payableTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val > 0 ? sum + val : sum;
      }, 0);
      const advanceTotal = filteredAccounts.reduce((sum, a) => {
        const val = Number(accountValues[a.id] ?? a.opening_balance ?? 0);
        return val < 0 ? sum + Math.abs(val) : sum;
      }, 0);
      const withOpening = filteredAccounts.filter(
        (a) => Number(accountValues[a.id] ?? a.opening_balance ?? 0) !== 0
      ).length;

      return [
        {
          id: 'mgmt-sup-net',
          label: 'صافي افتتاحيات الموردين',
          value: money(totalOpening),
          unit: 'ج.م',
          variant: totalOpening > 0 ? 'danger' : 'neutral',
          icon: ShoppingBag,
        },
        {
          id: 'mgmt-sup-payable',
          label: 'مستحق للموردين (علينا)',
          value: money(payableTotal),
          unit: 'ج.م',
          variant: payableTotal > 0 ? 'danger' : 'neutral',
          icon: AlertCircle,
        },
        {
          id: 'mgmt-sup-advance',
          label: 'مدفوع مقدمًا (لنا)',
          value: money(advanceTotal),
          unit: 'ج.م',
          variant: advanceTotal > 0 ? 'info' : 'neutral',
          icon: Wallet,
        },
        {
          id: 'mgmt-sup-with-opening',
          label: 'موردون برصيد افتتاحي',
          value: withOpening,
          unit: 'مورد',
          variant: 'neutral',
          icon: CheckCircle2,
          subtext: `من إجمالي ${filteredAccounts.length} مورد`,
        },
      ];
    }
  }, [isCustomer, filteredAccounts, accountValues]);

  async function handleSave() {
    const changed = visibleAccounts.filter(
      (a) => Number(accountValues[a.id] ?? 0) !== Number(a.opening_balance)
    );
    if (changed.length === 0) {
      toast.info(`لم يتم تعديل أي رصيد افتتاحي لـ ${isCustomer ? 'العملاء' : 'الموردين'}.`);
      return;
    }
    setSaving(true);
    try {
      for (const account of changed) {
        const opening = Number(accountValues[account.id] ?? 0);
        if (!Number.isFinite(opening)) {
          toast.error(`الرصيد الافتتاحي لحساب «${account.name}» غير صحيح.`);
          setSaving(false);
          return;
        }
        const { error: saveError } = await supabase.rpc('save_account', {
          p_account_id: account.id,
          p_name: account.name,
          p_kind: account.kind,
          p_phone: account.phone,
          p_is_active: account.is_active,
          p_opening_balance: opening,
        });
        if (saveError) throw new Error(saveError.message);
      }
      toast.success(`تم حفظ الأرصدة الافتتاحية بنجاح (${changed.length} حساب).`);
      await onRefresh();
    } catch (err) {
      toast.error(translateDbError(errorMessage(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <KpiBar items={kpiItems} ariaLabel={`مؤشرات افتتاحيات ${isCustomer ? 'العملاء' : 'الموردين'}`} />
        {canEditOpening && (
          <button
            type="button"
            className="btn primary"
            style={{ marginInlineStart: '12px', flexShrink: 0 }}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'جارٍ الحفظ…' : `حفظ أرصدة ${isCustomer ? 'العملاء' : 'الموردين'}`}
          </button>
        )}
      </div>

      <div className={selectedAccount ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label={`قائمة افتتاحيات ${isCustomer ? 'العملاء' : 'الموردين'}`}>
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`بحث باسم ${isCustomer ? 'العميل' : 'المورد'} أو الرقم…`}
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
                  <SortableHeader
                    label="الحساب"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ManagementSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">النوع</th>
                  <th className="num">الرصيد الافتتاحي</th>
                  <th className="num">الرصيد الحالي</th>
                </tr>
              </thead>
              <tbody>
                {pageAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {isCustomer ? 'لا توجد حسابات عملاء تطابق البحث.' : 'لا توجد حسابات موردين تطابق البحث.'}
                    </td>
                  </tr>
                )}
                {pageAccounts.map((account) => {
                  const isSelected = selectedAccount?.id === account.id;
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
                      <td className="muted col-hide-on-detail">{isCustomer ? 'عميل' : 'مورد'}</td>
                      <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="table-input num no-spinner"
                          type="number"
                          inputMode="decimal"
                          dir="ltr"
                          step="0.0001"
                          disabled={!canEditOpening}
                          value={accountValues[account.id] ?? '0'}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) =>
                            setAccountValues((values) => ({ ...values, [account.id]: event.target.value }))
                          }
                        />
                      </td>
                      <td className="num">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
                          {(() => {
                            const status = getBalanceStatus(account.balance, account.kind);
                            return (
                              <span className={`status-badge-mini status-${status.type}`}>
                                {status.text}
                              </span>
                            );
                          })()}
                          <strong dir="ltr" className={`tabular-nums ${Number(account.balance) > 0 ? 'remaining' : ''}`}>
                            {money(Math.abs(Number(account.balance || 0)))}
                          </strong>
                        </div>
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
            totalCount={filteredAccounts.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>

        <aside className={selectedAccount ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل الحساب">
          {selectedAccount ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>{isCustomer ? 'عميل' : 'مورد'}</span>
                  <h2>{selectedAccount.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedAccount(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم</dt><dd className="num">{entityNumber(entityPrefix, selectedAccount.serial_number)}</dd></div>
                <div><dt>الهاتف</dt><dd className="num">{selectedAccount.phone || '—'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedAccount.is_active ? 'نشط' : 'معطل'}</dd></div>
                <div><dt>الرصيد الفعلي الحالي</dt><dd className="num strong">{money(selectedAccount.balance)}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>الرصيد الافتتاحي</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {(() => {
                    const openingVal = Number(accountValues[selectedAccount.id] ?? selectedAccount.opening_balance);
                    const status = getBalanceStatus(openingVal, selectedAccount.kind);
                    return (
                      <span className={`status-badge-mini status-${status.type}`}>
                        {status.text}
                      </span>
                    );
                  })()}
                  <strong dir="ltr" className="num tabular-nums remaining">
                    {money(Math.abs(Number(accountValues[selectedAccount.id] ?? selectedAccount.opening_balance)))}
                  </strong>
                </div>
              </div>

              {selectedAccount.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedAccount.notes}</p>}
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

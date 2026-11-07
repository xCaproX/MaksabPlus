import ColumnFilterRow from '../../components/ColumnFilterRow';
import { useColumnFilters } from '../../lib/useColumnFilters';
import Pagination from '../../components/Pagination';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  X,
  Users,
  UserCheck,
  UserX,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import StatusBadge from '../../components/StatusBadge';
import { toast } from '../../components/Toast';
import type { AccountKind, AccountRow } from '../../lib/types';
import { useAccess } from '../../lib/access';
import { useConfirmDialog } from '../../lib/useConfirmDialog';
import { useMasterData } from '../../context/MasterDataContext';
import { accountOpeningBalance as signedOpeningBalance, defaultAccountOpeningDirection, type AccountOpeningDirection } from '../../lib/accountOpeningBalance';

type AccountSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

interface AccountsTabProps {
  kind: 'customer' | 'supplier';
}

interface MasterAccountsSummary {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  withOpeningCount: number;
}

export default function AccountsTab({ kind }: AccountsTabProps) {
  const isCustomer = kind === 'customer';
  const permissionPrefix = isCustomer ? 'data.customers' : 'data.suppliers';
  const entityPrefix = isCustomer ? 'CUS' : 'SUP';
  const entityTitle = isCustomer ? 'العميل' : 'المورد';
  const entityPlural = isCustomer ? 'العملاء' : 'الموردون';

  const { can } = useAccess();
  const { refresh } = useMasterData();
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<AccountSort>('name-asc');
  const [page, setPage] = useState(1);
  const columns = useColumnFilters("master_accounts" + kind, () => {
    setSearchTerm(''); setDebouncedSearch(''); setStatusFilter('all'); setPage(1);
  });
  const [totalCount, setTotalCount] = useState(0);

  const [summary, setSummary] = useState<MasterAccountsSummary>({
    totalCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    withOpeningCount: 0,
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

  // المودال والإدخال
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountOpeningBalance, setAccountOpeningBalance] = useState('0');
  const [accountOpeningType, setAccountOpeningType] = useState<AccountOpeningDirection>(() => defaultAccountOpeningDirection(kind));
  const [accountPhone, setAccountPhone] = useState('');
  const [accountNotes, setAccountNotes] = useState('');
  const [accountActive, setAccountActive] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const saveInProgress = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // استجابة لفتح نموذج الإضافة عبر الرابط ?action=new
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setEditingAccount(null);
      setAccountName('');
      setAccountOpeningBalance('0');
      setAccountOpeningType(defaultAccountOpeningDirection(kind));
      setAccountPhone('');
      setAccountNotes('');
      setAccountActive(true);
      setIsModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, kind]);

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
          .rpc('filter_master_account_rows', { p_columns: columns.filters, p_search: trimmed || null, p_kind: kind }, { count: 'exact' }).select('*')
          .eq('kind', kind)
          .is('system_key', null);

        if (statusFilter === 'active') {
          query = query.eq('is_active', true);
        } else if (statusFilter === 'inactive') {
          query = query.eq('is_active', false);
        }


        if (sortOrder === 'serial-desc') {
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
          supabase.rpc('get_master_accounts_kpis_columns', {
            p_columns: columns.filters,
            p_kind: kind,
            p_search: trimmed || null,
            p_status: statusFilter,
          }),
        ]);

        if (!alive) return;
        if (dataRes.error) throw dataRes.error;

        setAccounts((dataRes.data ?? []) as AccountRow[]);
        setTotalCount(dataRes.count ?? 0);

        if (kpiRes.error) throw kpiRes.error;
        if (kpiRes.data) {
          const raw = kpiRes.data as {
            total_count?: number;
            active_count?: number;
            inactive_count?: number;
            with_opening_count?: number;
          };
          setSummary({
            totalCount: Number(raw.total_count || 0),
            activeCount: Number(raw.active_count || 0),
            inactiveCount: Number(raw.inactive_count || 0),
            withOpeningCount: Number(raw.with_opening_count || 0),
          });
        }
      } catch (err: unknown) {
        if (!alive) return;
        toast.error(errorMessage(err));
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [columns.filters, kind, version, page, debouncedSearch, statusFilter, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedAccounts = accounts;

  useEffect(() => {
    setPage(1);
  }, [columns.filters, debouncedSearch, statusFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount && pageCount > 0) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    if (isCustomer) {
      return [
        {
          id: 'data-cus-total',
          label: 'إجمالي العملاء',
          value: summary.totalCount,
          unit: 'عميل',
          variant: 'primary',
          icon: Users,
        },
        {
          id: 'data-cus-active',
          label: 'العملاء النشطون',
          value: summary.activeCount,
          unit: 'عميل',
          variant: 'success',
          icon: UserCheck,
        },
        {
          id: 'data-cus-inactive',
          label: 'العملاء المعطلون',
          value: summary.inactiveCount,
          unit: 'عميل',
          variant: summary.inactiveCount > 0 ? 'warning' : 'neutral',
          icon: UserX,
        },
        {
          id: 'data-cus-opening',
          label: 'برصيد افتتاحي',
          value: summary.withOpeningCount,
          unit: 'عميل',
          variant: 'info',
          icon: Wallet,
        },
      ];
    }

    return [
      {
        id: 'data-sup-total',
        label: 'إجمالي الموردين',
        value: summary.totalCount,
        unit: 'مورد',
        variant: 'primary',
        icon: ShoppingBag,
      },
      {
        id: 'data-sup-active',
        label: 'الموردون النشطون',
        value: summary.activeCount,
        unit: 'مورد',
        variant: 'success',
        icon: CheckCircle2,
      },
      {
        id: 'data-sup-inactive',
        label: 'الموردون المعطلون',
        value: summary.inactiveCount,
        unit: 'مورد',
        variant: summary.inactiveCount > 0 ? 'warning' : 'neutral',
        icon: AlertCircle,
      },
      {
        id: 'data-sup-opening',
        label: 'برصيد افتتاحي',
        value: summary.withOpeningCount,
        unit: 'مورد',
        variant: 'info',
        icon: Wallet,
      },
    ];
  }, [summary, isCustomer]);

  function startEdit(account: AccountRow) {
    setEditingAccount(account);
    setAccountName(account.name);
    setAccountOpeningBalance('0');
    setAccountPhone(account.phone ?? '');
    setAccountNotes(account.notes || '');
    setAccountActive(account.is_active);
    setIsModalOpen(true);
  }

  function cancelEdit() {
    if (saveInProgress.current) return;
    setEditingAccount(null);
    setIsModalOpen(false);
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    if (saveInProgress.current) return;
    if (!accountName.trim()) {
      toast.error(`أدخل اسم ${entityTitle}`);
      return;
    }
    saveInProgress.current = true;
    setSavingAccount(true);

    try {
      if (editingAccount) {
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            name: accountName.trim(),
            phone: accountPhone.trim() || null,
            notes: accountNotes.trim() || null,
            is_active: accountActive,
          })
          .eq('id', editingAccount.id);

        if (updateError) {
          toast.error(translateDbError(updateError.message));
          return;
        }
        toast.success(`تم تعديل الحساب «${accountName.trim()}»`);
      } else {
        const { error: rpcError } = await supabase.rpc('save_account_with_notes', {
          p_account_id: null,
          p_name: accountName.trim(),
          p_kind: kind as AccountKind,
          p_phone: accountPhone.trim() || null,
          p_is_active: accountActive,
          p_opening_balance: signedOpeningBalance(kind, accountOpeningBalance, accountOpeningType),
          p_notes: accountNotes.trim() || null,
        });

        if (rpcError) {
          toast.error(translateDbError(rpcError.message));
          return;
        }
        toast.success(`تمت إضافة ${entityTitle} «${accountName.trim()}»`);
      }

      setIsModalOpen(false);
      setEditingAccount(null);
      setSelectedAccount(null);
      setVersion((v) => v + 1);
      void refresh(['accounts']);
    } catch (err: unknown) {
      toast.error(translateDbError(errorMessage(err)));
    } finally {
      saveInProgress.current = false;
      setSavingAccount(false);
    }
  }

  async function toggleActive(account: AccountRow) {
    const nextState = !account.is_active;
    const actionLabel = nextState ? 'تنشيط' : 'إيقاف';
    const confirmed = await askConfirmation(
      `هل تريد ${actionLabel} ${entityTitle} «${account.name}»؟`,
      actionLabel,
      // إيقاف الحساب يغير أرصدته في كل الشاشات → يعتبر عملية خطيرة
      nextState ? undefined : { danger: true },
    );
    if (!confirmed) return;

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ is_active: nextState })
      .eq('id', account.id);

    if (updateError) {
      toast.error(translateDbError(updateError.message));
      return;
    }

    toast.success(`تم ${actionLabel} ${entityTitle} «${account.name}» بنجاح`);
    setVersion((v) => v + 1);
    void refresh(['accounts']);
  }

  async function removeAccount(account: AccountRow) {
    const confirmed = await askConfirmation(
      `هل تريد حذف ${entityTitle} «${account.name}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      'حذف نهائي',
      { danger: true },
    );
    if (!confirmed) return;

    const { error: rpcError } = await supabase.rpc('delete_account', {
      p_account_id: account.id,
    });

    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    toast.success(`تم حذف ${entityTitle} «${account.name}» نهائياً`);
    if (selectedAccount?.id === account.id) {
      setSelectedAccount(null);
    }
    setVersion((v) => v + 1);
    void refresh(['accounts']);
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel={`مؤشرات ${entityPlural}`} />

      <div className={selectedAccount ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label={`قائمة ${entityPlural}`}>
          <div className="erp-toolbar">
            <div className="erp-filters">
              <SearchableSelect
                label="الحالة"
                  ariaLabel="تصفية الحالة"
                value={statusFilter}
                options={[
                  { value: 'all', label: 'كل الحالات' },
                  { value: 'active', label: isCustomer ? 'العملاء النشطون' : 'الموردون النشطون' },
                  { value: 'inactive', label: isCustomer ? 'العملاء المعطلون' : 'الموردون المعطلون' },
                ]}
                onChange={(val) => setStatusFilter(val as StatusFilter)}
              />

              <label className="erp-search">
                <span className="filter-label">بحث</span>
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
                    onSort={(s) => setSortOrder(s as AccountSort)}
                  />
                  <SortableHeader
                    label={isCustomer ? 'العميل' : 'المورد'}
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as AccountSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">الهاتف</th>
                  <th className="col-hide-on-detail">الحالة</th>
                  <th className="col-hide-on-detail col-notes">الملاحظات</th>
                  <th aria-label="الإجراءات" />
                </tr>
                <ColumnFilterRow scope="master_accounts" kind={kind} values={columns.values} onChange={columns.setField} onReset={columns.reset} />
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
                      لا يوجد {entityPlural} يطابقون البحث أو الفلاتر.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pagedAccounts.map((account) => {
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
                        <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber(entityPrefix, account.serial_number)}</bdi></td>
                        <td className="strong">{account.name}</td>
                        <td className="num col-hide-on-detail"><bdi dir="ltr" className="tabular-nums">{account.phone || '—'}</bdi></td>
                        <td className="col-hide-on-detail">
                          <StatusBadge variant={account.is_active ? 'paid' : 'unpaid'}>
                            {account.is_active ? 'نشط' : 'موقوف'}
                          </StatusBadge>
                        </td>
                        <td className="muted col-hide-on-detail col-notes">{account.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={can(`${permissionPrefix}.edit`) ? () => startEdit(account) : undefined}
                            onDelete={can(`${permissionPrefix}.delete`) ? () => void removeAccount(account) : undefined}
                          />
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
          className={selectedAccount ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل الحساب"
        >
          {selectedAccount ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات {entityTitle}</span>
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
                  <dd>
                    <StatusBadge variant={selectedAccount.is_active ? 'paid' : 'unpaid'}>
                      {selectedAccount.is_active ? 'نشط' : 'موقوف'}
                    </StatusBadge>
                  </dd>
                </div>
              </dl>

              {selectedAccount.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedAccount.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                {can(`${permissionPrefix}.edit`) && (
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => startEdit(selectedAccount)}
                  >
                    تعديل البيانات
                  </button>
                )}
                {can(`${permissionPrefix}.edit`) && (
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => void toggleActive(selectedAccount)}
                  >
                    {selectedAccount.is_active ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر حسابًا</strong>
              <span>ستظهر التفاصيل والإجراءات الخاصة بـ{entityTitle} هنا.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نافذة الإضافة والتعديل */}
      {isModalOpen && (
        <Modal
          title={editingAccount ? `تعديل بيانات ${entityTitle}` : `إضافة ${isCustomer ? 'عميل' : 'مورد'} جديد`}
          onClose={cancelEdit}
          className="master-data-modal account-modal"
          backdropClassName="master-data-backdrop"
          dismissible={!savingAccount}
        >
          <form onSubmit={saveAccount} className="stack" aria-busy={savingAccount}>
            <fieldset className="stack form-fields" disabled={savingAccount}>
              <label>
                <span>اسم {entityTitle} *</span>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={`اسم ${entityTitle}`}
                  autoFocus
                />
              </label>

              {!editingAccount && (
                <div className="form-row">
                  <label>
                    <span>رصيد بداية التعامل</span>
                    <div className="input-with-suffix" dir="ltr">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      dir="ltr"
                      className="num no-spinner"
                      value={accountOpeningBalance}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setAccountOpeningBalance(e.target.value)}
                    />
                    <span className="input-suffix" dir="rtl">ج.م</span>
                    </div>
                  </label>
                  <label>
                    <span>الرصيد ده لمين؟</span>
                    <select
                      value={accountOpeningType}
                      onChange={(e) => setAccountOpeningType(e.target.value as AccountOpeningDirection)}
                    >
                      <option value="receivable">لنا عنده</option>
                      <option value="payable">له عندنا</option>
                    </select>
                  </label>
                </div>
              )}

              <label>
                <span>رقم الهاتف</span>
                <input
                  type="tel"
                  value={accountPhone}
                  onChange={(e) => setAccountPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </label>

              <label>
                <span>ملاحظات</span>
                <textarea
                  value={accountNotes}
                  onChange={(e) => setAccountNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية عن الحساب…"
                  rows={3}
                />
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={accountActive}
                  onChange={(e) => setAccountActive(e.target.checked)}
                />
                <span>الحساب نشط</span>
              </label>

            </fieldset>
            <div className="form-modal-actions">
              <button type="submit" className="btn primary" disabled={savingAccount}>
                {savingAccount ? 'جارٍ الحفظ…' : editingAccount ? 'حفظ التعديلات' : `إضافة ${entityTitle}`}
              </button>
              <button type="button" className="btn outline" onClick={cancelEdit} disabled={savingAccount}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.danger === true}
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </>
  );
}

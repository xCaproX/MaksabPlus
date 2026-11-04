import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';

type AccountSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

interface AccountsTabProps {
  kind: 'customer' | 'supplier';
  addTrigger: number;
}

export default function AccountsTab({ kind, addTrigger }: AccountsTabProps) {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<AccountSort>('name-asc');
  const [page, setPage] = useState(1);

  // التحديد والتفاصيل
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  // المودال والإدخال
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountOpeningBalance, setAccountOpeningBalance] = useState('0');
  const [accountOpeningType, setAccountOpeningType] = useState<'debit' | 'credit'>('debit');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountNotes, setAccountNotes] = useState('');
  const [accountActive, setAccountActive] = useState(true);

  // استجابة لزر الإضافة من الرأس
  useEffect(() => {
    if (addTrigger > 0) {
      startAdd();
    }
  }, [addTrigger]);

  // جلب الحسابات
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('kind', kind)
          .is('system_key', null)
          .order('name');

        if (!alive) return;
        if (error) {
          toast.error(translateDbError(error.message));
          setLoading(false);
          return;
        }

        setAccounts((data ?? []) as AccountRow[]);
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        toast.error(errorMessage(err));
        setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [kind, version]);

  // تصفية وترتيب الحسابات
  const filteredAccounts = useMemo(() => {
    const list = accounts.filter((account) => {
      const matchStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? account.is_active : !account.is_active);
      const matchQuery = matchesSearchQuery(
        [account.name, account.phone, account.serial_number, account.notes],
        searchTerm,
      );
      return matchStatus && matchQuery;
    });

    return list.sort((firstAccount, secondAccount) => {
      if (sortOrder === 'serial-desc') return (secondAccount.serial_number ?? 0) - (firstAccount.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstAccount.serial_number ?? 0) - (secondAccount.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondAccount.name.localeCompare(firstAccount.name, 'ar');
      return firstAccount.name.localeCompare(secondAccount.name, 'ar');
    });
  }, [accounts, searchTerm, statusFilter, sortOrder]);

  const totalCount = filteredAccounts.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedAccounts = filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const activeCount = filteredAccounts.filter((a) => a.is_active).length;
    const inactiveCount = filteredAccounts.filter((a) => !a.is_active).length;
    const withOpening = filteredAccounts.filter((a) => Number(a.opening_balance) !== 0).length;

    if (isCustomer) {
      return [
        {
          id: 'data-cus-total',
          label: 'إجمالي العملاء',
          value: filteredAccounts.length,
          unit: 'عميل',
          variant: 'primary',
          icon: Users,
        },
        {
          id: 'data-cus-active',
          label: 'العملاء النشطون',
          value: activeCount,
          unit: 'عميل',
          variant: 'success',
          icon: UserCheck,
        },
        {
          id: 'data-cus-inactive',
          label: 'العملاء المعطلون',
          value: inactiveCount,
          unit: 'عميل',
          variant: inactiveCount > 0 ? 'warning' : 'neutral',
          icon: UserX,
        },
        {
          id: 'data-cus-opening',
          label: 'برصيد افتتاحي',
          value: withOpening,
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
        value: filteredAccounts.length,
        unit: 'مورد',
        variant: 'primary',
        icon: ShoppingBag,
      },
      {
        id: 'data-sup-active',
        label: 'الموردون النشطون',
        value: activeCount,
        unit: 'مورد',
        variant: 'success',
        icon: CheckCircle2,
      },
      {
        id: 'data-sup-inactive',
        label: 'الموردون المعطلون',
        value: inactiveCount,
        unit: 'مورد',
        variant: inactiveCount > 0 ? 'warning' : 'neutral',
        icon: AlertCircle,
      },
      {
        id: 'data-sup-opening',
        label: 'برصيد افتتاحي',
        value: withOpening,
        unit: 'مورد',
        variant: 'info',
        icon: Wallet,
      },
    ];
  }, [filteredAccounts, isCustomer]);

  function startAdd() {
    setEditingAccount(null);
    setAccountName('');
    setAccountOpeningBalance('0');
    setAccountOpeningType('debit');
    setAccountPhone('');
    setAccountNotes('');
    setAccountActive(true);
    setIsModalOpen(true);
  }

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
    setEditingAccount(null);
    setIsModalOpen(false);
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();

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
        p_opening_balance: (() => {
          const raw = Math.abs(Number(accountOpeningBalance) || 0);
          if (raw === 0) return 0;
          if (isCustomer) {
            return accountOpeningType === 'credit' ? -raw : raw;
          }
          return accountOpeningType === 'debit' ? -raw : raw;
        })(),
        p_notes: accountNotes.trim() || null,
      });

      if (rpcError) {
        toast.error(translateDbError(rpcError.message));
        return;
      }
      toast.success(`تمت إضافة ${entityTitle} «${accountName.trim()}»`);
    }

    cancelEdit();
    setSelectedAccount(null);
    setVersion((v) => v + 1);
    void refresh(['accounts']);
  }

  async function removeAccount(account: AccountRow) {
    if (
      !(await askConfirmation(
        `حذف ${entityTitle} «${account.name}»؟ لن يُحذف إذا كانت له حركات سابقة.`,
        'حذف',
      ))
    )
      return;

    const { error: deleteError } = await supabase.rpc('delete_account', { p_account_id: account.id });
    if (deleteError) {
      toast.error(translateDbError(deleteError.message));
      return;
    }

    toast.success(`تم حذف ${entityTitle} «${account.name}»`);
    setSelectedAccount(null);
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
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`بحث باسم ${entityTitle} أو الهاتف أو الرقم…`}
                />
              </label>

              <SearchableSelect
                ariaLabel="تصفية الحالة"
                value={statusFilter}
                options={[
                  { value: 'all', label: 'كل الحالات' },
                  { value: 'active', label: 'النشطة فقط' },
                  { value: 'inactive', label: 'الموقوفة فقط' },
                ]}
                onChange={(val) => setStatusFilter(val as StatusFilter)}
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
                    onSort={(s) => setSortOrder(s as AccountSort)}
                  />
                  <SortableHeader
                    label="الاسم"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as AccountSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">الهاتف</th>
                  <th className="col-hide-on-detail">ملاحظات</th>
                  <th>الحالة</th>
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
                      لا يوجد {entityPlural} يطابقون البحث.
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
                        <td className="num strong">{entityNumber(entityPrefix, account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num muted col-hide-on-detail">{account.phone ?? '—'}</td>
                        <td className="muted col-hide-on-detail">{account.notes || '—'}</td>
                        <td>
                          <StatusBadge variant={account.is_active ? 'paid' : 'unpaid'}>
                            {account.is_active ? 'نشط' : 'موقوف'}
                          </StatusBadge>
                        </td>
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
        <aside className={selectedAccount ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل السجل">
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
                  <dt>الرقم</dt>
                  <dd className="num">{entityNumber(entityPrefix, selectedAccount.serial_number)}</dd>
                </div>
                <div>
                  <dt>الهاتف</dt>
                  <dd className="num">{selectedAccount.phone || '—'}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedAccount.is_active ? 'نشط' : 'موقوف'}</dd>
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
                  <button type="button" className="btn" onClick={() => startEdit(selectedAccount)}>
                    تعديل البيانات
                  </button>
                )}
                {can(`${permissionPrefix}.delete`) && (
                  <button type="button" className="btn danger" onClick={() => void removeAccount(selectedAccount)}>
                    حذف
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر {entityTitle}</strong>
              <span>ستظهر تفاصيل الحساب هنا مع خيارات التعديل السريع.</span>
            </div>
          )}
        </aside>
      </div>

      {/* مودال الإضافة والتعديل */}
      {isModalOpen && (
        <Modal
          title={editingAccount ? `تعديل ${entityTitle}` : `إضافة ${entityTitle}`}
          className="master-data-modal"
          backdropClassName="master-data-backdrop"
          onClose={cancelEdit}
        >
          <form className="stack" onSubmit={saveAccount}>
            <div className="account-header-card">
              <div className="form-grid">
                <label>
                  الاسم
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    required
                  />
                </label>

                <label>
                  الهاتف
                  <input
                    type="text"
                    value={accountPhone}
                    onChange={(e) => setAccountPhone(e.target.value)}
                    placeholder="اختياري"
                  />
                </label>

                {!editingAccount && (
                  <label className="span-2">
                    <span>الرصيد الافتتاحي</span>
                    <div className="opening-balance-input-wrap">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="num no-spinner"
                        dir="ltr"
                        value={accountOpeningBalance}
                        onChange={(e) => setAccountOpeningBalance(e.target.value)}
                        placeholder="0.00"
                      />
                      <div className="opening-type-toggle">
                        <button
                          type="button"
                          className={`btn-toggle-badge ${accountOpeningType === 'debit' ? 'active-debit' : ''}`}
                          onClick={() => setAccountOpeningType('debit')}
                        >
                          {isCustomer ? 'عليه (مستحق على العميل)' : 'عليه (مقدم طرف المورد)'}
                        </button>
                        <button
                          type="button"
                          className={`btn-toggle-badge ${accountOpeningType === 'credit' ? 'active-credit' : ''}`}
                          onClick={() => setAccountOpeningType('credit')}
                        >
                          {isCustomer ? 'له (رصيد لصالحه)' : 'له (مستحق للمورد)'}
                        </button>
                      </div>
                    </div>
                  </label>
                )}

                <label className="span-2">
                  ملاحظات
                  <input
                    type="text"
                    value={accountNotes}
                    onChange={(e) => setAccountNotes(e.target.value)}
                    placeholder="اختياري"
                  />
                </label>

                {editingAccount && (
                  <label className="checkbox span-2">
                    <input
                      type="checkbox"
                      checked={accountActive}
                      onChange={(e) => setAccountActive(e.target.checked)}
                    />
                    حساب نشط (يمكن استخدامه في الفواتير والإيصالات)
                  </label>
                )}
              </div>
            </div>

            <div className="form-modal-actions">
              <button type="submit" className="btn primary">
                {editingAccount ? 'حفظ التعديلات' : `إضافة ${entityTitle}`}
              </button>
              <button type="button" className="btn" onClick={cancelEdit}>
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
          danger
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </>
  );
}

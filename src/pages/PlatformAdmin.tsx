import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Ban,
  Building2,
  CheckCircle2,
  ChevronUp,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ConfirmDialog from '../components/ConfirmDialog';
import DateDisplay from '../components/DateDisplay';
import KpiBar, { type KpiItem } from '../components/KpiBar';
import RowActions from '../components/RowActions';
import StatusBadge from '../components/StatusBadge';
import { toast } from '../components/Toast';
import PlatformAddUserModal from '../components/platform/PlatformAddUserModal';
import PlatformCompanyDetailPanel from '../components/platform/PlatformCompanyDetailPanel';
import PlatformCompanyFormModal from '../components/platform/PlatformCompanyFormModal';
import PlatformDeleteCompanyModal from '../components/platform/PlatformDeleteCompanyModal';
import { useAccess } from '../lib/access';
import {
  fetchPlatformAdminIdentity,
  listPlatformCompanies,
  listPlatformCompanyUsers,
  setPlatformCompanyUserActive,
  setPlatformCompanyUserPassword,
  updatePlatformCompany,
  type PlatformAdminIdentity,
  type PlatformCompany,
  type PlatformCompanyUser,
} from '../lib/platformAdmin';
import { supabase } from '../lib/supabase';

type StatusFilter = 'all' | 'active' | 'suspended';

export default function PlatformAdmin() {
  const { access } = useAccess();

  const [adminIdentity, setAdminIdentity] = useState<PlatformAdminIdentity | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [companyUsers, setCompanyUsers] = useState<PlatformCompanyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [selfPasswordOpen, setSelfPasswordOpen] = useState(false);
  const [addUserCompany, setAddUserCompany] = useState<PlatformCompany | null>(null);
  const [deleteTargetCompany, setDeleteTargetCompany] = useState<PlatformCompany | null>(null);
  const [toggleCompanyTarget, setToggleCompanyTarget] = useState<PlatformCompany | null>(null);
  const [toggleUserTarget, setToggleUserTarget] = useState<PlatformCompanyUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<PlatformCompanyUser | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [identity, list] = await Promise.all([
        fetchPlatformAdminIdentity(),
        listPlatformCompanies(),
      ]);
      setAdminIdentity(identity);
      setCompanies(list);
      setSelectedCompanyId((prev) =>
        prev && list.some((item) => item.id === prev) ? prev : null,
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الشركات.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedCompanyUsers = useCallback(async (companyId: string | null) => {
    if (!companyId) {
      setCompanyUsers([]);
      return;
    }
    setUsersLoading(true);
    try {
      const users = await listPlatformCompanyUsers(companyId);
      setCompanyUsers(users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل مستخدمي الشركة.');
      setCompanyUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'مكسب بلس — لوحة إدارة المنصة';
    if (access?.role === 'platform_admin') {
      void loadCompanies();
    }
  }, [access?.role, loadCompanies]);

  useEffect(() => {
    if (access?.role === 'platform_admin') {
      void loadSelectedCompanyUsers(selectedCompanyId);
    }
  }, [access?.role, loadSelectedCompanyUsers, selectedCompanyId]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return companies.filter((company) => {
      if (statusFilter === 'active' && !company.is_active) return false;
      if (statusFilter === 'suspended' && company.is_active) return false;
      if (!query) return true;
      return (
        company.name.toLowerCase().includes(query) ||
        company.admin_notes.toLowerCase().includes(query)
      );
    });
  }, [companies, search, statusFilter]);

  const kpiItems: KpiItem[] = useMemo(() => {
    const totalCompanies = companies.length;
    const activeCompanies = companies.filter((c) => c.is_active).length;
    const suspendedCompanies = totalCompanies - activeCompanies;
    const totalUsers = companies.reduce((sum, c) => sum + c.users_count, 0);

    return [
      { id: 'total-companies', label: 'إجمالي الشركات', value: totalCompanies },
      { id: 'active-companies', label: 'الشركات النشطة', value: activeCompanies, statusVariant: 'ok' },
      {
        id: 'suspended-companies',
        label: 'الشركات الموقوفة',
        value: suspendedCompanies,
        statusVariant: suspendedCompanies > 0 ? 'danger' : 'neutral',
      },
      { id: 'total-users', label: 'إجمالي المستخدمين', value: totalUsers },
    ];
  }, [companies]);

  if (access?.role !== 'platform_admin') {
    return <Navigate to="/" replace />;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleSaveCompany(params: {
    companyId: string;
    name: string;
    adminNotes: string;
    isActive: boolean;
  }) {
    await updatePlatformCompany(params);
    toast.success(`تم حفظ تعديلات شركة «${params.name}».`);
    await loadCompanies();
  }

  async function handleConfirmToggleCompany() {
    if (!toggleCompanyTarget) return;
    const target = toggleCompanyTarget;
    const nextActive = !target.is_active;
    try {
      await updatePlatformCompany({
        companyId: target.id,
        name: target.name,
        adminNotes: target.admin_notes,
        isActive: nextActive,
      });
      toast.success(
        nextActive
          ? `تمت إعادة تفعيل شركة «${target.name}» بنجاح.`
          : `تم إيقاف شركة «${target.name}» مؤقتًا.`,
      );
      setToggleCompanyTarget(null);
      await loadCompanies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث حالة الشركة.');
    }
  }

  async function handleConfirmToggleUser() {
    if (!toggleUserTarget || !selectedCompany) return;
    const target = toggleUserTarget;
    const nextActive = !target.is_active;
    try {
      await setPlatformCompanyUserActive({
        companyId: selectedCompany.id,
        userId: target.user_id,
        isActive: nextActive,
      });
      toast.success(
        nextActive
          ? `تم تفعيل حساب «${target.full_name || target.email}».`
          : `تم تعطيل حساب «${target.full_name || target.email}».`,
      );
      setToggleUserTarget(null);
      await Promise.all([
        loadCompanies(),
        loadSelectedCompanyUsers(selectedCompany.id),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث حالة المستخدم.');
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/maksab-sidebar-logo.png" alt="مكسب بلس" />
        </div>

        <nav className="nav" aria-label="تنقل لوحة المنصة">
          <div className="nav-group">
            <button type="button" className="nav-link active">
              <span className="nav-link-main">
                <Building2 className="nav-icon" size={18} aria-hidden="true" />
                <span>إدارة الشركات</span>
              </span>
            </button>
          </div>
        </nav>

        <RowActions
          className="sidebar-footer"
          triggerClassName="sidebar-user-block"
          triggerLabel={`خيارات حساب ${adminIdentity?.full_name || 'مطور المنصة'}`}
          placement="top"
          trigger={
            <>
              <span className="sidebar-user-avatar" aria-hidden="true">
                <UserRound size={19} />
              </span>
              <span className="sidebar-user-details">
                <span className="sidebar-user-name" title={adminIdentity?.full_name || 'مطور المنصة'}>
                  {adminIdentity?.full_name || 'مطور المنصة'}
                </span>
                <span className="sidebar-company-name" title={adminIdentity?.email || 'مطور المنصة'}>
                  مطور المنصة
                </span>
              </span>
              <ChevronUp size={16} className="sidebar-user-chevron" aria-hidden="true" />
            </>
          }
          customActions={[
            { label: 'تغيير كلمة المرور', icon: KeyRound, onClick: () => setSelfPasswordOpen(true) },
            { label: 'تسجيل الخروج', icon: LogOut, danger: true, onClick: () => { void handleSignOut(); } },
          ]}
        />
      </header>

      <main className="main">
        <div className="stack">
          <div className="page-head">
            <div>
              <h1>لوحة إدارة الشركات</h1>
              <p className="hint">إنشاء وإدارة شركات العملاء، الملاحظات الخاصة، وحسابات الملاك والمستخدمين.</p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn outline"
                onClick={() => void loadCompanies()}
                disabled={loading}
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span>تحديث</span>
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} aria-hidden="true" />
                <span>شركة جديدة</span>
              </button>
            </div>
          </div>

          <KpiBar items={kpiItems} ariaLabel="مؤشرات المنصة" loading={loading && companies.length === 0} />

          {loadError && <div className="alert error" role="alert">{loadError}</div>}

          <div className={`erp-sales-workspace${selectedCompany ? ' panel-open' : ''}`}>
            <section className="erp-list-panel" aria-label="قائمة الشركات">
              <div className="erp-toolbar">
                <div className="erp-filters">
                  <label className="erp-search">
                    <span>بحث</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ابحث باسم الشركة أو ملاحظات المطور..."
                    />
                  </label>

                  <label>
                    <span>الحالة</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    >
                      <option value="all">جميع الشركات</option>
                      <option value="active">الشركات النشطة</option>
                      <option value="suspended">الشركات الموقوفة</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>اسم الشركة</th>
                        <th>الحالة</th>
                        <th>المستخدمون</th>
                        {!selectedCompany && <th>الفواتير</th>}
                        {!selectedCompany && <th className="col-date">تاريخ الإنشاء</th>}
                        <th className="col-date">آخر نشاط</th>
                        {!selectedCompany && <th>ملاحظات المطور</th>}
                        <th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && companies.length === 0 ? (
                        <tr>
                          <td colSpan={selectedCompany ? 5 : 8} className="empty">
                            جارٍ تحميل الشركات…
                          </td>
                        </tr>
                      ) : filteredCompanies.length === 0 ? (
                        <tr>
                          <td colSpan={selectedCompany ? 5 : 8} className="empty">
                            {companies.length === 0
                              ? 'لا توجد شركات مسجلة بعد. ابدأ بإنشاء أول شركة.'
                              : 'لا توجد شركات مطابقة للبحث الحالي.'}
                          </td>
                        </tr>
                      ) : (
                        filteredCompanies.map((company) => {
                          const isSelected = selectedCompany?.id === company.id;
                          return (
                            <tr
                              key={company.id}
                              className={isSelected ? 'platform-row-selected' : undefined}
                            >
                              <td>
                                <button
                                  type="button"
                                  className="table-record-link"
                                  onClick={() => setSelectedCompanyId(company.id)}
                                >
                                  {company.name}
                                </button>
                              </td>
                              <td>
                                <StatusBadge variant={company.is_active ? 'paid' : 'unpaid'}>
                                  {company.is_active ? 'نشطة' : 'موقوفة'}
                                </StatusBadge>
                              </td>
                              <td>
                                <span dir="ltr" className="tabular-nums">
                                  {company.active_users_count} / {company.users_count}
                                </span>
                              </td>
                              {!selectedCompany && (
                                <td>
                                  <span dir="ltr" className="tabular-nums">{company.invoices_count}</span>
                                </td>
                              )}
                              {!selectedCompany && (
                                <td className="col-date">
                                  <DateDisplay value={company.created_at} />
                                </td>
                              )}
                              <td className="col-date">
                                {company.last_activity_at ? (
                                  <DateDisplay value={company.last_activity_at} />
                                ) : (
                                  '—'
                                )}
                              </td>
                              {!selectedCompany && (
                                <td className="platform-notes-cell" title={company.admin_notes || undefined}>
                                  {company.admin_notes ? company.admin_notes : '—'}
                                </td>
                              )}
                              <td>
                                <RowActions
                                  triggerLabel={`إجراءات شركة ${company.name}`}
                                  editLabel="إدارة وتفاصيل"
                                  deleteLabel="حذف الشركة…"
                                  onEdit={() => setSelectedCompanyId(company.id)}
                                  onDelete={() => setDeleteTargetCompany(company)}
                                  customActions={[
                                    {
                                      label: company.is_active ? 'إيقاف الشركة مؤقتًا' : 'إعادة تفعيل الشركة',
                                      icon: company.is_active ? Ban : CheckCircle2,
                                      onClick: () => setToggleCompanyTarget(company),
                                    },
                                  ]}
                                  portal
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {selectedCompany && (
              <>
                <div
                  className="erp-drawer-backdrop"
                  aria-hidden="true"
                  onClick={() => setSelectedCompanyId(null)}
                />
                <PlatformCompanyDetailPanel
                  key={`${selectedCompany.id}:${selectedCompany.updated_at}`}
                  company={selectedCompany}
                  users={companyUsers}
                  usersLoading={usersLoading}
                  onClose={() => setSelectedCompanyId(null)}
                  onSaveCompany={handleSaveCompany}
                  onRequestToggleCompanyStatus={(company) => setToggleCompanyTarget(company)}
                  onRequestDeleteCompany={(company) => setDeleteTargetCompany(company)}
                  onOpenAddUser={(company) => setAddUserCompany(company)}
                  onRequestToggleUserActive={(user) => setToggleUserTarget(user)}
                  onRequestResetUserPassword={(user) => setResetPasswordUser(user)}
                />
              </>
            )}
          </div>
        </div>
      </main>

      {createOpen && (
        <PlatformCompanyFormModal
          onClose={() => setCreateOpen(false)}
          onCreated={async (companyId) => {
            await loadCompanies();
            setSelectedCompanyId(companyId);
          }}
        />
      )}

      {addUserCompany && (
        <PlatformAddUserModal
          companyId={addUserCompany.id}
          companyName={addUserCompany.name}
          onClose={() => setAddUserCompany(null)}
          onAdded={async () => {
            await Promise.all([
              loadCompanies(),
              loadSelectedCompanyUsers(addUserCompany.id),
            ]);
          }}
        />
      )}

      {deleteTargetCompany && (
        <PlatformDeleteCompanyModal
          company={deleteTargetCompany}
          onClose={() => setDeleteTargetCompany(null)}
          onDeleted={async (deletedId) => {
            if (selectedCompanyId === deletedId) {
              setSelectedCompanyId(null);
            }
            await loadCompanies();
          }}
        />
      )}

      {toggleCompanyTarget && (
        <ConfirmDialog
          title={
            toggleCompanyTarget.is_active
              ? `إيقاف شركة «${toggleCompanyTarget.name}»`
              : `تفعيل شركة «${toggleCompanyTarget.name}»`
          }
          message={
            toggleCompanyTarget.is_active
              ? `هل تريد إيقاف شركة «${toggleCompanyTarget.name}» مؤقتًا؟ سيتم حجب الدخول والعمليات فورًا عن جميع مستخدمي الشركة لحين إعادة التفعيل.`
              : `هل تريد إعادة تفعيل شركة «${toggleCompanyTarget.name}»؟ سيستعيد المستخدمون النشطون داخل الشركة صلاحياتهم فورًا.`
          }
          confirmLabel={toggleCompanyTarget.is_active ? 'إيقاف مؤقت' : 'تفعيل الشركة'}
          danger={toggleCompanyTarget.is_active}
          onConfirm={() => void handleConfirmToggleCompany()}
          onCancel={() => setToggleCompanyTarget(null)}
        />
      )}

      {toggleUserTarget && selectedCompany && (
        <ConfirmDialog
          title={toggleUserTarget.is_active ? 'تعطيل حساب مستخدم' : 'تفعيل حساب مستخدم'}
          message={
            toggleUserTarget.is_active
              ? `هل تريد تعطيل دخول «${toggleUserTarget.full_name || toggleUserTarget.email}» في شركة «${selectedCompany.name}»؟`
              : `هل تريد تفعيل دخول «${toggleUserTarget.full_name || toggleUserTarget.email}» في شركة «${selectedCompany.name}»؟`
          }
          confirmLabel={toggleUserTarget.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
          danger={toggleUserTarget.is_active}
          onConfirm={() => void handleConfirmToggleUser()}
          onCancel={() => setToggleUserTarget(null)}
        />
      )}

      <ChangePasswordModal
        isOpen={Boolean(resetPasswordUser && selectedCompany)}
        onClose={() => setResetPasswordUser(null)}
        targetUser={
          resetPasswordUser
            ? {
                id: resetPasswordUser.user_id,
                name: resetPasswordUser.full_name,
                email: resetPasswordUser.email,
              }
            : null
        }
        targetDescription={
          resetPasswordUser && selectedCompany
            ? `أدخل كلمة المرور الجديدة لحساب «${resetPasswordUser.full_name || resetPasswordUser.email}» في شركة «${selectedCompany.name}».`
            : undefined
        }
        onSubmitPassword={async (newPassword) => {
          if (!selectedCompany || !resetPasswordUser) return;
          await setPlatformCompanyUserPassword({
            companyId: selectedCompany.id,
            userId: resetPasswordUser.user_id,
            password: newPassword,
          });
        }}
      />

      <ChangePasswordModal
        isOpen={selfPasswordOpen}
        onClose={() => setSelfPasswordOpen(false)}
      />
    </div>
  );
}

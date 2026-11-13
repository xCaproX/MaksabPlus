import { useState, type FormEvent } from 'react';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react';
import DateDisplay from '../DateDisplay';
import RowActions from '../RowActions';
import StatusBadge from '../StatusBadge';
import type { PlatformCompany, PlatformCompanyUser } from '../../lib/platformAdmin';

interface PlatformCompanyDetailPanelProps {
  company: PlatformCompany | null;
  users: PlatformCompanyUser[];
  usersLoading: boolean;
  onClose: () => void;
  onSaveCompany: (params: {
    companyId: string;
    name: string;
    adminNotes: string;
    isActive: boolean;
    suspensionReason?: string;
  }) => Promise<void>;
  onRequestToggleCompanyStatus: (company: PlatformCompany) => void;
  onRequestDeleteCompany: (company: PlatformCompany) => void;
  onOpenAddUser: (company: PlatformCompany) => void;
  onRequestEditUser: (user: PlatformCompanyUser) => void;
  onRequestUserActivation: (user: PlatformCompanyUser) => void;
  onRequestToggleUserActive: (user: PlatformCompanyUser) => void;
  onRequestResetUserPassword: (user: PlatformCompanyUser) => void;
  onRequestDeleteUser: (user: PlatformCompanyUser) => void;
}

export default function PlatformCompanyDetailPanel({
  company,
  users,
  usersLoading,
  onClose,
  onSaveCompany,
  onRequestToggleCompanyStatus,
  onRequestDeleteCompany,
  onOpenAddUser,
  onRequestEditUser,
  onRequestUserActivation,
  onRequestToggleUserActive,
  onRequestResetUserPassword,
  onRequestDeleteUser,
}: PlatformCompanyDetailPanelProps) {
  const [name, setName] = useState(company?.name ?? '');
  const [adminNotes, setAdminNotes] = useState(company?.admin_notes ?? '');
  const [suspensionReason, setSuspensionReason] = useState(company?.suspension_reason ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!company) {
    return null;
  }

  const activeOwnersCount = users.filter((u) => u.access_role === 'owner' && u.is_active).length;

  const hasChanges =
    name.trim() !== company.name.trim() ||
    adminNotes.trim() !== company.admin_notes.trim() ||
    (!company.is_active && suspensionReason.trim() !== company.suspension_reason.trim());

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError('أدخل اسم الشركة.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSaveCompany({
        companyId: company.id,
        name: trimmedName,
        adminNotes: adminNotes.trim(),
        isActive: company.is_active,
        suspensionReason: company.is_active ? '' : suspensionReason.trim(),
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'تعذر حفظ تعديلات الشركة.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="erp-detail-panel open platform-detail-drawer" aria-label={`تفاصيل شركة ${company.name}`}>
      <div className="erp-detail-head">
        <div>
          <span>تفاصيل الشركة</span>
          <h2>{company.name}</h2>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="إغلاق لوحة التفاصيل"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <dl className="erp-detail-summary">
        <div>
          <dt>الحالة</dt>
          <dd>
            <StatusBadge variant={company.is_active ? 'paid' : 'unpaid'}>
              {company.is_active ? 'نشطة' : 'موقوفة'}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt>تاريخ الإنشاء</dt>
          <dd><DateDisplay value={company.created_at} /></dd>
        </div>
        <div>
          <dt>المستخدمون النشطون</dt>
          <dd>
            <bdi dir="ltr" className="tabular-nums">
              {company.active_users_count} / {company.users_count}
            </bdi>
          </dd>
        </div>
        <div>
          <dt>عدد الفواتير</dt>
          <dd>
            <bdi dir="ltr" className="tabular-nums">
              {company.invoices_count}
            </bdi>
          </dd>
        </div>
        <div>
          <dt>آخر نشاط</dt>
          <dd>
            {company.last_activity_at ? <DateDisplay value={company.last_activity_at} /> : '—'}
          </dd>
        </div>
        <div>
          <dt>العملة</dt>
          <dd><bdi dir="ltr">{company.currency}</bdi></dd>
        </div>
      </dl>

      <div className="erp-detail-lines stack">
        <form className="stack platform-edit-form" onSubmit={handleSave}>
          <h3>بيانات الشركة والملاحظات الخاصة</h3>

          <label>
            <span>اسم الشركة</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label>
            <span>ملاحظات المطور (سرية للمنصة فقط)</span>
            <textarea
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="ملاحظاتك الخاصة حول العميل أو الباقة أو المتابعة..."
            />
          </label>

          {!company.is_active && (
            <label>
              <span>سبب الإيقاف الظاهر لمستخدمي الشركة</span>
              <textarea
                rows={2}
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="مثال: برجاء تجديد الاشتراك الشهري والتواصل مع الدعم الفني..."
              />
            </label>
          )}

          {saveError && <div className="alert error" role="alert">{saveError}</div>}

          <div className="platform-inline-actions">
            <button type="submit" className="btn outline sm" disabled={saving || !hasChanges}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </button>

            <button
              type="button"
              className="btn outline sm"
              onClick={() => onRequestToggleCompanyStatus(company)}
            >
              {company.is_active ? (
                <>
                  <Ban size={15} aria-hidden="true" />
                  <span>إيقاف الشركة مؤقتًا</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>إعادة تفعيل الشركة</span>
                </>
              )}
            </button>
          </div>
        </form>

        <section className="stack platform-users-section" aria-label="مستخدمو الشركة">
          <div className="platform-section-head">
            <h3>مستخدمو الشركة</h3>
            <button
              type="button"
              className="btn outline sm"
              onClick={() => onOpenAddUser(company)}
            >
              <Plus size={15} aria-hidden="true" />
              <span>إضافة مستخدم</span>
            </button>
          </div>

          {usersLoading ? (
            <p className="hint">جارٍ تحميل المستخدمين…</p>
          ) : users.length === 0 ? (
            <p className="empty">لا يوجد مستخدمون مسجلون في هذه الشركة.</p>
          ) : (
            <ul className="platform-users-list">
              {users.map((user) => (
                <li key={user.user_id} className="platform-user-card">
                  <div className="platform-user-top">
                    <div className="platform-user-identity">
                      <strong>{user.full_name || 'بدون اسم'}</strong>
                      <div className="platform-user-badges">
                        <StatusBadge variant={user.access_role === 'owner' ? 'linked' : 'neutral'}>
                          {user.access_role === 'owner' ? 'مالك' : 'موظف'}
                        </StatusBadge>
                        <StatusBadge variant={user.is_active ? 'paid' : 'unpaid'}>
                          {user.is_active ? 'نشط' : 'موقوف'}
                        </StatusBadge>
                        {!user.email_confirmed_at && (
                          <StatusBadge variant="partial">بانتظار التفعيل</StatusBadge>
                        )}
                        {user.access_role === 'owner' && user.is_active && activeOwnersCount <= 1 && (
                          <StatusBadge variant="neutral">آخر مالك نشط</StatusBadge>
                        )}
                      </div>
                    </div>

                    <RowActions
                      triggerLabel={`خيارات ${user.full_name || user.email}`}
                      portal
                      customActions={[
                        {
                          label: 'تعديل البيانات والدور',
                          icon: Pencil,
                          onClick: () => onRequestEditUser(user),
                        },
                        ...(!user.email_confirmed_at
                          ? [
                              {
                                label: 'رابط التفعيل / إعادة الإرسال',
                                icon: Link2,
                                onClick: () => onRequestUserActivation(user),
                              },
                            ]
                          : []),
                        {
                          label: 'تغيير كلمة المرور',
                          icon: KeyRound,
                          onClick: () => onRequestResetUserPassword(user),
                        },
                        {
                          label: user.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب',
                          icon: user.is_active ? ShieldOff : ShieldCheck,
                          onClick: () => onRequestToggleUserActive(user),
                        },
                        {
                          label: 'حذف المستخدم…',
                          icon: Trash2,
                          danger: true,
                          onClick: () => onRequestDeleteUser(user),
                        },
                      ]}
                    />
                  </div>

                  <div className="platform-user-meta">
                    <bdi dir="ltr" className="tabular-nums">{user.email}</bdi>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="erp-detail-actions platform-danger-zone">
        <button
          type="button"
          className="btn danger sm"
          onClick={() => onRequestDeleteCompany(company)}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>حذف الشركة بالكامل…</span>
        </button>
      </div>
    </aside>
  );
}

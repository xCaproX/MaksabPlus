import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import {
  updatePlatformCompanyUser,
  type CompanyUserRole,
  type PlatformCompanyUser,
} from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformEditUserModalProps {
  companyId: string;
  companyName: string;
  user: PlatformCompanyUser;
  isLastActiveOwner: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}

export default function PlatformEditUserModal({
  companyId,
  companyName,
  user,
  isLastActiveOwner,
  onClose,
  onUpdated,
}: PlatformEditUserModalProps) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [accessRole, setAccessRole] = useState<CompanyUserRole>(user.access_role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const hasChanges =
    trimmedName !== user.full_name.trim() ||
    trimmedEmail !== user.email.trim().toLowerCase() ||
    accessRole !== user.access_role;

  const downgradingOwner = user.access_role === 'owner' && accessRole === 'employee';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!trimmedName) {
      setError('أدخل الاسم الكامل للمستخدم.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا.');
      return;
    }
    if (isLastActiveOwner && accessRole !== 'owner') {
      setError('لا يمكن تحويل آخر مالك نشط للشركة إلى موظف. أضف مالكًا نشطًا آخر أولًا.');
      return;
    }

    setBusy(true);
    try {
      await updatePlatformCompanyUser({
        companyId,
        userId: user.user_id,
        fullName: trimmedName,
        email: trimmedEmail,
        accessRole,
      });
      toast.success(`تم تحديث بيانات «${trimmedName}» في شركة «${companyName}».`);
      await onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث بيانات المستخدم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`تعديل بيانات «${user.full_name || user.email}»`}
      onClose={onClose}
      dismissible={!busy}
      isDirty={hasChanges}
    >
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          <span>الاسم الكامل</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label>
          <span>البريد الإلكتروني للدخول</span>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          <span>الدور داخل الشركة</span>
          <select
            value={accessRole}
            onChange={(e) => setAccessRole(e.target.value === 'employee' ? 'employee' : 'owner')}
            disabled={isLastActiveOwner}
          >
            <option value="owner">مالك (صلاحيات كاملة للشركة)</option>
            <option value="employee">موظف (يضبط المالك صلاحياته)</option>
          </select>
        </label>

        {isLastActiveOwner && (
          <div className="alert warning" role="note">
            هذا المستخدم هو آخر مالك نشط في الشركة؛ لا يمكن تحويله إلى موظف إلا بعد إضافة أو تفعيل مالك آخر.
          </div>
        )}

        {!isLastActiveOwner && downgradingOwner && (
          <div className="alert info" role="note">
            عند تحويل المالك إلى موظف ستُلغى صلاحيات المالك الكاملة ويبدأ بصلاحيات فارغة يضبطها مالك الشركة من شاشة الإدارة.
          </div>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn primary" disabled={busy || !hasChanges}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

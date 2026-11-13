import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import PasswordInput from '../PasswordInput';
import {
  addPlatformCompanyUser,
  type AuthProvisionMode,
  type CompanyUserRole,
} from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformAddUserModalProps {
  companyId: string;
  companyName: string;
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}

export default function PlatformAddUserModal({
  companyId,
  companyName,
  onClose,
  onAdded,
}: PlatformAddUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [accessRole, setAccessRole] = useState<CompanyUserRole>('owner');
  const [authMode, setAuthMode] = useState<AuthProvisionMode>('password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isDirty = Boolean(fullName || email || password || confirmPassword);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedName) {
      setError('أدخل الاسم الكامل للمستخدم.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا.');
      return;
    }
    if (authMode === 'password') {
      if (trimmedPassword.length < 8) {
        setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        return;
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        setError('كلمتا المرور غير متطابقتين.');
        return;
      }
    }

    setBusy(true);
    try {
      await addPlatformCompanyUser({
        companyId,
        fullName: trimmedName,
        email: trimmedEmail,
        accessRole,
        authMode,
        password: trimmedPassword,
      });
      toast.success(`تمت إضافة «${trimmedName}» إلى شركة «${companyName}».`);
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذرت إضافة المستخدم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`إضافة مستخدم لشركة «${companyName}»`} onClose={onClose} dismissible={!busy} isDirty={isDirty}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            <span>الاسم الكامل</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثال: سارة علي"
              required
              autoFocus
            />
          </label>

          <label>
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              autoComplete="off"
              required
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            <span>الدور داخل الشركة</span>
            <select
              value={accessRole}
              onChange={(e) => setAccessRole(e.target.value === 'employee' ? 'employee' : 'owner')}
            >
              <option value="owner">مالك (صلاحيات كاملة للشركة)</option>
              <option value="employee">موظف (يضبط المالك صلاحياته)</option>
            </select>
          </label>

          <div>
            <span className="platform-field-caption">طريقة التفعيل</span>
            <div className="tabs platform-mode-tabs" role="tablist" aria-label="طريقة تفعيل المستخدم">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'password'}
                className={authMode === 'password' ? 'tab active' : 'tab'}
                onClick={() => setAuthMode('password')}
              >
                كلمة مرور مباشرة
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'invite'}
                className={authMode === 'invite' ? 'tab active' : 'tab'}
                onClick={() => setAuthMode('invite')}
              >
                رابط دعوة
              </button>
            </div>
          </div>
        </div>

        {authMode === 'password' ? (
          <div className="form-row">
            <label>
              <span>كلمة المرور (8 أحرف على الأقل)</span>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                revealed={showPassword}
                onToggleReveal={() => setShowPassword((prev) => !prev)}
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              <span>تأكيد كلمة المرور</span>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                revealed={showPassword}
                onToggleReveal={() => setShowPassword((prev) => !prev)}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
        ) : (
          <p className="alert info">
            سيصل المستخدم رابط عبر البريد الإلكتروني لتعيين كلمة مروره عند التفعيل.
          </p>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'جارٍ الإضافة…' : 'إضافة المستخدم'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

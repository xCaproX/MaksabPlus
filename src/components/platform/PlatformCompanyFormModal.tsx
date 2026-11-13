import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import PasswordInput from '../PasswordInput';
import { createPlatformCompany, type AuthProvisionMode } from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformCompanyFormModalProps {
  onClose: () => void;
  onCreated: (companyId: string) => Promise<void> | void;
}

export default function PlatformCompanyFormModal({ onClose, onCreated }: PlatformCompanyFormModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [authMode, setAuthMode] = useState<AuthProvisionMode>('password');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isDirty = Boolean(companyName || adminNotes || ownerFullName || ownerEmail || ownerPassword || confirmPassword);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedCompany = companyName.trim();
    const trimmedOwnerName = ownerFullName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();
    const trimmedPassword = ownerPassword.trim();

    if (!trimmedCompany) {
      setError('أدخل اسم الشركة.');
      return;
    }
    if (!trimmedOwnerName) {
      setError('أدخل الاسم الكامل لمالك الشركة.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا للمالك.');
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
      const result = await createPlatformCompany({
        companyName: trimmedCompany,
        adminNotes: adminNotes.trim(),
        ownerFullName: trimmedOwnerName,
        ownerEmail: trimmedEmail,
        authMode,
        ownerPassword: trimmedPassword,
      });
      toast.success(`تم إنشاء شركة «${trimmedCompany}» وتجهيز المخزن والخزنة الرئيسيين وحساب المالك.`);
      await onCreated(result.company_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الشركة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="إنشاء شركة جديدة" onClose={onClose} dismissible={!busy} isDirty={isDirty}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="span-2">
            <span>اسم الشركة</span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="مثال: شركة النور للتجارة"
              required
              autoFocus
            />
          </label>

          <label className="span-2">
            <span>ملاحظات المطور الخاصة (لا تظهر لأصحاب الشركة)</span>
            <textarea
              rows={2}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="تفاصيل الباقة، رقم التليفون، ملاحظات المتابعة..."
            />
          </label>
        </div>

        <fieldset className="form-fields stack">
          <legend className="platform-fieldset-legend">بيانات المالك الأول للشركة</legend>

          <div className="form-row">
            <label>
              <span>الاسم الكامل للمالك</span>
              <input
                type="text"
                value={ownerFullName}
                onChange={(e) => setOwnerFullName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                required
              />
            </label>

            <label>
              <span>البريد الإلكتروني للدخول</span>
              <input
                type="email"
                dir="ltr"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@company.com"
                autoComplete="off"
                required
              />
            </label>
          </div>

          <div className="tabs platform-mode-tabs" role="tablist" aria-label="طريقة تفعيل حساب المالك">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'password'}
              className={authMode === 'password' ? 'tab active' : 'tab'}
              onClick={() => setAuthMode('password')}
            >
              تعيين كلمة مرور مباشرة
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'invite'}
              className={authMode === 'invite' ? 'tab active' : 'tab'}
              onClick={() => setAuthMode('invite')}
            >
              إرسال رابط دعوة بالبريد
            </button>
          </div>

          {authMode === 'password' ? (
            <div className="form-row">
              <label>
                <span>كلمة المرور الأولية (8 أحرف على الأقل)</span>
                <PasswordInput
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  revealed={showPassword}
                  onToggleReveal={() => setShowPassword((prev) => !prev)}
                  autoComplete="new-password"
                  placeholder="أدخل كلمة مرور قوية"
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
                  placeholder="أعد إدخال كلمة المرور"
                  required
                />
              </label>
            </div>
          ) : (
            <p className="alert info">
              سيتم إرسال رسالة دعوة إلى بريد المالك تحتوي على رابط لتعيين كلمة المرور وتفعيل الدخول (تأكد من إعداد البريد في مشروع Supabase).
            </p>
          )}
        </fieldset>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء الشركة'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

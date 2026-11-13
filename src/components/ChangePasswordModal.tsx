import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import Modal from './Modal';
import PasswordInput from './PasswordInput';
import { toast } from './Toast';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;
  onSuccess?: () => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: ChangePasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const isTargetMode = Boolean(targetUser);
  const title = isTargetMode
    ? `تغيير كلمة مرور «${targetUser?.name || targetUser?.email}»`
    : 'تغيير كلمة المرور';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      toast.error('كلمتا المرور غير متطابقتين.');
      return;
    }

    setBusy(true);
    try {
      if (isTargetMode && targetUser) {
        const { error: rpcError } = await supabase.rpc('set_company_user_password', {
          p_user_id: targetUser.id,
          p_password: trimmedPassword,
        });

        if (rpcError) {
          const { data, error: edgeError } = await supabase.functions.invoke('manage-users', {
            body: {
              action: 'password',
              user_id: targetUser.id,
              password: trimmedPassword,
            },
          });
          if (edgeError) throw new Error(errorMessage(edgeError));
          if (data?.error) throw new Error(data.error);
        }

        toast.success(`تم تغيير كلمة مرور «${targetUser.name || targetUser.email}» بنجاح.`);
      } else {
        const { error: updateError } = await supabase.auth.updateUser({
          password: trimmedPassword,
        });

        if (updateError) {
          throw updateError;
        }

        toast.success('تم تغيير كلمة المرور لحسابك بنجاح.');
      }

      setPassword('');
      setConfirmPassword('');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    setPassword('');
    setConfirmPassword('');
    onClose();
  }

  return (
    <Modal title={title} onClose={handleClose} dismissible={!busy} isDirty={Boolean(password || confirmPassword)}>
      <form className="stack change-password-form" onSubmit={handleSubmit}>
        <div className="account-header-card">
          <p className="hint change-password-hint">
            {isTargetMode
              ? `أدخل كلمة المرور الجديدة للموظف (${targetUser?.email}). سيتمكن من تسجيل الدخول بها فورًا.`
              : 'أدخل كلمة المرور الجديدة لتسجيل الدخول إلى حسابك في مكسب بلس.'}
          </p>

          <div className="pwd-fields-stack">
            <label className="pwd-field-label">
              <span>كلمة المرور الجديدة</span>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                dir="ltr"
                placeholder="••••••••"
                disabled={busy}
                autoFocus
                revealed={showPassword}
                onToggleReveal={() => setShowPassword((prev) => !prev)}
              />
              <span className="pwd-min-length-hint">
                يجب ألا تقل عن 8 أحرف أو أرقام.
              </span>
            </label>

            <label className="pwd-field-label">
              <span>تأكيد كلمة المرور الجديدة</span>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                dir="ltr"
                placeholder="••••••••"
                disabled={busy}
                revealed={showPassword}
                onToggleReveal={() => setShowPassword((prev) => !prev)}
              />
            </label>
          </div>
        </div>

        <div className="form-modal-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            <KeyRound size={16} />
            <span>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</span>
          </button>
          <button type="button" className="btn" onClick={handleClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import Modal from './Modal';
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
    <Modal title={title} onClose={handleClose}>
      <form className="stack change-password-form" onSubmit={handleSubmit}>
        <p className="hint" style={{ margin: 0, fontSize: '13px', color: 'var(--erp-muted, #64748b)' }}>
          {isTargetMode
            ? `أدخل كلمة المرور الجديدة للموظف (${targetUser?.email}). سيتمكن من تسجيل الدخول بها فورًا.`
            : 'أدخل كلمة المرور الجديدة لتسجيل الدخول إلى حسابك في مكسب بلس.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650 }}>كلمة المرور الجديدة</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                dir="ltr"
                placeholder="••••••••"
                disabled={busy}
                style={{ width: '100%', paddingInlineEnd: '40px' }}
                autoFocus
              />
              <button
                type="button"
                className="icon-btn"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                style={{
                  position: 'absolute',
                  insetInlineEnd: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--erp-muted, #64748b)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--erp-muted, #64748b)' }}>
              يجب ألا تقل عن 8 أحرف أو أرقام.
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650 }}>تأكيد كلمة المرور الجديدة</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              dir="ltr"
              placeholder="••••••••"
              disabled={busy}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div className="form-modal-actions" style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
          <button type="submit" className="btn primary" disabled={busy} style={{ flex: 1 }}>
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

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import PasswordInput from '../components/PasswordInput';
import { toast } from '../components/Toast';

export default function SetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPassword = password.trim();
    const cleanConfirmation = confirmation.trim();
    if (cleanPassword.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (cleanPassword !== cleanConfirmation) {
      toast.error('كلمتا المرور غير متطابقتين.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: cleanPassword });
    setBusy(false);
    if (updateError) {
      toast.error(errorMessage(updateError));
      return;
    }
    toast.success('تم تعيين كلمة المرور وتفعيل الحساب بنجاح.');
    navigate('/', { replace: true });
  }

  return (
    <div className="config-screen">
      <form className="card login-card" onSubmit={submit} aria-busy={busy}>
        <h1>تعيين كلمة المرور وتفعيل الحساب</h1>
        <label>
          كلمة المرور
          <PasswordInput
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            revealed={showPassword}
            onToggleReveal={() => setShowPassword((prev) => !prev)}
            required
            dir="ltr"
            placeholder="••••••••"
            disabled={busy}
          />
        </label>
        <label>
          تأكيد كلمة المرور
          <PasswordInput
            autoComplete="new-password"
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            revealed={showPassword}
            onToggleReveal={() => setShowPassword((prev) => !prev)}
            required
            dir="ltr"
            placeholder="••••••••"
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="spin" />
              <span>جارٍ الحفظ…</span>
            </>
          ) : (
            <span>حفظ كلمة المرور</span>
          )}
        </button>
      </form>
    </div>
  );
}

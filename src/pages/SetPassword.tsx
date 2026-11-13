import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import PasswordInput from '../components/PasswordInput';
import { toast } from '../components/Toast';

export default function SetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'); return; }
    if (password !== confirmation) { toast.error('كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) toast.error(errorMessage(updateError));
    else navigate('/', { replace: true });
  }

  return <div className="config-screen">
    <form className="card login-card" onSubmit={submit}>
      <h1>تعيين كلمة المرور وتفعيل الحساب</h1>
      <label>كلمة المرور<PasswordInput autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required dir="ltr" placeholder="••••••••" disabled={busy} /></label>
      <label>تأكيد كلمة المرور<PasswordInput autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required dir="ltr" placeholder="••••••••" disabled={busy} /></label>
      <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</button>
    </form>
  </div>;
}

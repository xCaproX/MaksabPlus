import { useState, type FormEvent } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { toast } from '../components/Toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) toast.error(errorMessage(authError));
    setBusy(false);
  }

  return (
    <div className="config-screen">
      <form className="card login-card" onSubmit={submit}>
        <img className="login-logo" src="/maksab-logo.png" alt="مكسب بلس" />
        <div className="login-intro">
          <h1>مرحبًا بعودتك</h1>
          <p className="muted">سجّل دخولك لمتابعة أعمالك</p>
        </div>

        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            dir="ltr"
            placeholder="name@company.com"
          />
        </label>

        <label>
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            dir="ltr"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          className="btn primary block"
          disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {busy ? (
            <>
              <Loader2 size={18} className="spin" />
              <span>جارٍ تسجيل الدخول…</span>
            </>
          ) : (
            <>
              <LogIn size={18} />
              <span>تسجيل الدخول</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

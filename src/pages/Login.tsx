import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) setError(errorMessage(authError));
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
          />
        </label>

        {error && <p className="alert error">{error}</p>}

        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  );
}

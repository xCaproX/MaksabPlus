import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Invoices from './pages/Invoices';
import Receipts from './pages/Receipts';
import MasterData from './pages/MasterData';
import Balances from './pages/Balances';
import Management from './pages/Management';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      document.title = 'مكسب بلس — فواتير وإيصالات';
      return;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="config-screen">
        <div className="card config-card">
          <h1>مكسب بلس</h1>
          <p>لم يتم إعداد الاتصال بـSupabase بعد.</p>
          <ol>
            <li>انسخ ملف <code>.env.example</code> إلى <code>.env.local</code>.</li>
            <li>
              ضع <code>VITE_SUPABASE_URL</code> و<code>VITE_SUPABASE_ANON_KEY</code> من
              Project Settings &gt; API.
            </li>
            <li>أعد تشغيل السيرفر (<code>npm run dev</code>).</li>
          </ol>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return <div className="config-screen">جارٍ التحميل…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/invoices" replace /> : <Login />}
        />
        <Route element={session ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/data" element={<MasterData />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/management" element={<Management />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/invoices' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

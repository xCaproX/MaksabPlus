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
import SetPassword from './pages/SetPassword';
import { AccessProvider, AccessRoute, HomeRedirect } from './lib/access';

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
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/set-password" element={session ? <SetPassword /> : <Navigate to="/login" replace />} />
        <Route element={session ? <AccessProvider key={session.user.id}><Layout /></AccessProvider> : <Navigate to="/login" replace />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/invoices" element={<AccessRoute permissions={['goods.view','goods.create','goods.edit','goods.delete']}><Invoices /></AccessRoute>} />
          <Route path="/receipts" element={<AccessRoute permissions={['money.view','money.create','money.edit','money.delete']}><Receipts /></AccessRoute>} />
          <Route path="/data" element={<AccessRoute permissions={['data.view','data.create','data.edit','data.delete']}><MasterData /></AccessRoute>} />
          <Route path="/balances" element={<AccessRoute permissions={['balances.view']}><Balances /></AccessRoute>} />
          <Route path="/management" element={<AccessRoute permissions={['management.view','management.edit']}><Management /></AccessRoute>} />
          <Route path="/access-denied" element={<div className="card empty">هذا المستخدم غير نشط أو لا يملك صلاحية دخول أي صفحة. تواصل مع مدير الشركة.</div>} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

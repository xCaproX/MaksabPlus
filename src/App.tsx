import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import Layout from './components/Layout';
import { AccessProvider, AccessRoute, HomeRedirect } from './lib/access';
import { ToastContainer } from './components/Toast';

const Login = lazy(() => import('./pages/Login'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Receipts = lazy(() => import('./pages/Receipts'));
const MasterData = lazy(() => import('./pages/MasterData'));
const Balances = lazy(() => import('./pages/Balances'));
const Management = lazy(() => import('./pages/Management'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
import PreviewInvoice from './pages/PreviewInvoice';
import PreviewReceipt from './pages/PreviewReceipt';
import PreviewPhase3And4 from './pages/PreviewPhase3And4';

const DevComponents = import.meta.env.DEV ? lazy(() => import('./pages/DevComponents')) : null;

function PageSuspense({ children, fullScreen = false }: { children: ReactNode; fullScreen?: boolean }) {
  return (
    <Suspense fallback={fullScreen ? <div className="config-screen">جارٍ تحميل الصفحة…</div> : <div className="card empty" role="status">جارٍ تحميل الصفحة…</div>}>
      {children}
    </Suspense>
  );
}

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

  if (window.location.pathname === '/preview-invoice') {
    return (
      <PageSuspense fullScreen>
        <PreviewInvoice />
      </PageSuspense>
    );
  }

  if (window.location.pathname === '/preview-receipt') {
    return (
      <PageSuspense fullScreen>
        <PreviewReceipt />
      </PageSuspense>
    );
  }

  if (window.location.pathname === '/preview-phase3-4') {
    return (
      <PageSuspense fullScreen>
        <PreviewPhase3And4 />
      </PageSuspense>
    );
  }

  if (import.meta.env.DEV && window.location.pathname === '/dev/components' && DevComponents) {
    return (
      <PageSuspense fullScreen>
        <DevComponents />
      </PageSuspense>
    );
  }

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
      <ToastContainer />
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <PageSuspense fullScreen><Login /></PageSuspense>}
        />
        <Route path="/set-password" element={session ? <PageSuspense fullScreen><SetPassword /></PageSuspense> : <Navigate to="/login" replace />} />
        <Route element={session ? <AccessProvider key={session.user.id}><Layout /></AccessProvider> : <Navigate to="/login" replace />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/invoices" element={<AccessRoute permissions={['goods.view','goods.create','goods.edit','goods.delete']}><PageSuspense><Invoices /></PageSuspense></AccessRoute>} />
          <Route path="/receipts" element={<AccessRoute permissions={['money.view','money.create','money.edit','money.delete']}><PageSuspense><Receipts /></PageSuspense></AccessRoute>} />
          <Route path="/data" element={<AccessRoute permissions={['data.view','data.create','data.edit','data.delete']}><PageSuspense><MasterData /></PageSuspense></AccessRoute>} />
          <Route path="/balances" element={<AccessRoute permissions={['balances.view']}><PageSuspense><Balances /></PageSuspense></AccessRoute>} />
          <Route path="/management" element={<AccessRoute permissions={['management.view','management.edit']}><PageSuspense><Management /></PageSuspense></AccessRoute>} />
          <Route path="/access-denied" element={<div className="card empty">هذا المستخدم غير نشط أو لا يملك صلاحية دخول أي صفحة. تواصل مع مدير الشركة.</div>} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">م</span>
          مكسب بلس
        </div>

        <nav className="nav">
          <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : '')}>
            الفواتير
          </NavLink>
          <NavLink to="/receipts" className={({ isActive }) => (isActive ? 'active' : '')}>
            الإيصالات
          </NavLink>
          <NavLink to="/data" className={({ isActive }) => (isActive ? 'active' : '')}>
            البيانات
          </NavLink>
        </nav>

        <button type="button" className="btn ghost" onClick={signOut}>
          تسجيل الخروج
        </button>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

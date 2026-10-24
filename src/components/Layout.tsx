import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/access';

export default function Layout() {
  const navigate = useNavigate();
  const { can } = useAccess();

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="مكسب بلس — الصفحة الرئيسية">
          <img src="/maksab-logo.png" alt="مكسب بلس" />
        </Link>

        <nav className="nav" aria-label="التنقل الرئيسي">
          {can('goods.view','goods.create','goods.edit','goods.delete') && <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : '')}>
            البضاعة
          </NavLink>}
          {can('money.view','money.create','money.edit','money.delete') && <NavLink to="/receipts" className={({ isActive }) => (isActive ? 'active' : '')}>
            الفلوس
          </NavLink>}
          {can('data.view','data.create','data.edit','data.delete') && <NavLink to="/data" className={({ isActive }) => (isActive ? 'active' : '')}>
            البيانات
          </NavLink>}
          {can('balances.view') && <NavLink to="/balances" className={({ isActive }) => (isActive ? 'active' : '')}>
            الأرصدة
          </NavLink>}
          {can('management.view','management.edit') && <NavLink to="/management" className={({ isActive }) => (isActive ? 'active' : '')}>
            إدارة
          </NavLink>}
        </nav>

        <button type="button" className="btn ghost sign-out" onClick={signOut}>
          تسجيل الخروج
        </button>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

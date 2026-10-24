import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/access';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can, access } = useAccess();

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  const isGoods = location.pathname.startsWith('/invoices');
  const isMoney = location.pathname.startsWith('/receipts');
  const isData = location.pathname.startsWith('/data');
  const isBalances = location.pathname.startsWith('/balances');
  const isManagement = location.pathname.startsWith('/management');

  const currentTab = new URLSearchParams(location.search).get('tab');

  const goodsTabs = [
    { id: 'sale', label: 'فواتير المبيعات' },
    { id: 'purchase', label: 'فواتير المشتريات' },
    { id: 'sale_return', label: 'مرتجعات المبيعات' },
    { id: 'purchase_return', label: 'مرتجعات المشتريات' },
    { id: 'waste', label: 'الهالك' },
    { id: 'warehouse_transfer', label: 'تحويل بين مخازن' },
  ];

  const moneyTabs = [
    { id: 'in', label: 'إيصالات استلام' },
    { id: 'out', label: 'إيصالات صرف' },
    { id: 'cash_box_transfer', label: 'تحويل بين الخزن' },
  ];

  const dataTabs = [
    { id: 'customers', label: 'العملاء' },
    { id: 'suppliers', label: 'الموردون' },
    { id: 'items', label: 'الأصناف' },
    { id: 'warehouses', label: 'المخازن' },
    { id: 'cashBoxes', label: 'الخزن' },
  ];

  const balanceTabs = [
    { id: 'customers', label: 'حسابات العملاء' },
    { id: 'suppliers', label: 'حسابات الموردين' },
    { id: 'items', label: 'أرصدة الأصناف' },
    { id: 'cashBoxes', label: 'أرصدة الخزن' },
  ];

  const managementTabs = [
    { id: 'customers', label: 'افتتاحيات العملاء' },
    { id: 'suppliers', label: 'افتتاحيات الموردين' },
    { id: 'items', label: 'افتتاحيات المخزون' },
    { id: 'cashBoxes', label: 'افتتاحيات الخزن' },
    ...(access?.role === 'owner' ? [{ id: 'users', label: 'المستخدمون والصلاحيات' }] : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="مكسب بلس — الصفحة الرئيسية">
          <img src="/maksab-logo.png" alt="مكسب بلس" />
        </Link>

        <nav className="nav" aria-label="التنقل الرئيسي">
          {can('goods.view','goods.create','goods.edit','goods.delete') && (
            <div className="nav-group">
              <NavLink to="/invoices" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span>البضاعة</span>
                <span className="nav-chevron">{isGoods ? '▴' : '▾'}</span>
              </NavLink>
              {isGoods && (
                <div className="subnav">
                  {goodsTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === 'sale');
                    return (
                      <Link
                        key={item.id}
                        to={`/invoices?tab=${item.id}`}
                        className={`subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="subnav-dot" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {can('money.view','money.create','money.edit','money.delete') && (
            <div className="nav-group">
              <NavLink to="/receipts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span>الفلوس</span>
                <span className="nav-chevron">{isMoney ? '▴' : '▾'}</span>
              </NavLink>
              {isMoney && (
                <div className="subnav">
                  {moneyTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === 'in');
                    return (
                      <Link
                        key={item.id}
                        to={`/receipts?tab=${item.id}`}
                        className={`subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="subnav-dot" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {can('data.view','data.create','data.edit','data.delete') && (
            <div className="nav-group">
              <NavLink to="/data" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span>البيانات</span>
                <span className="nav-chevron">{isData ? '▴' : '▾'}</span>
              </NavLink>
              {isData && (
                <div className="subnav">
                  {dataTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === 'customers');
                    return (
                      <Link
                        key={item.id}
                        to={`/data?tab=${item.id}`}
                        className={`subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="subnav-dot" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {can('balances.view') && (
            <div className="nav-group">
              <NavLink to="/balances" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span>الأرصدة</span>
                <span className="nav-chevron">{isBalances ? '▴' : '▾'}</span>
              </NavLink>
              {isBalances && (
                <div className="subnav">
                  {balanceTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === 'customers');
                    return (
                      <Link
                        key={item.id}
                        to={`/balances?tab=${item.id}`}
                        className={`subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="subnav-dot" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {can('management.view','management.edit') && (
            <div className="nav-group">
              <NavLink to="/management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span>إدارة</span>
                <span className="nav-chevron">{isManagement ? '▴' : '▾'}</span>
              </NavLink>
              {isManagement && (
                <div className="subnav">
                  {managementTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === 'customers');
                    return (
                      <Link
                        key={item.id}
                        to={`/management?tab=${item.id}`}
                        className={`subnav-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="subnav-dot" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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

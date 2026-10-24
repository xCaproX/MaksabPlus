import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Package, Wallet, Database, Scale, ShieldCheck, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
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
    { id: 'sale', label: 'فواتير المبيعات', permission: 'goods.sale.view' },
    { id: 'purchase', label: 'فواتير المشتريات', permission: 'goods.purchase.view' },
    { id: 'sale_return', label: 'مرتجعات المبيعات', permission: 'goods.sale_return.view' },
    { id: 'purchase_return', label: 'مرتجعات المشتريات', permission: 'goods.purchase_return.view' },
    { id: 'waste', label: 'الهالك', permission: 'goods.waste.view' },
    { id: 'warehouse_transfer', label: 'تحويل بين مخازن', permission: 'goods.warehouse_transfer.view' },
  ];
  const visibleGoodsTabs = goodsTabs.filter((t) => can(t.permission, 'goods.view'));

  const moneyTabs = [
    { id: 'in', label: 'إيصالات استلام', permission: 'money.in.view' },
    { id: 'out', label: 'إيصالات صرف', permission: 'money.out.view' },
    { id: 'cash_box_transfer', label: 'تحويل بين الخزن', permission: 'money.cash_box_transfer.view' },
  ];
  const visibleMoneyTabs = moneyTabs.filter((t) => can(t.permission, 'money.view'));

  const dataTabs = [
    { id: 'customers', label: 'العملاء', permission: 'data.customers.view' },
    { id: 'suppliers', label: 'الموردون', permission: 'data.suppliers.view' },
    { id: 'items', label: 'الأصناف', permission: 'data.items.view' },
    { id: 'warehouses', label: 'المخازن', permission: 'data.warehouses.view' },
    { id: 'cashBoxes', label: 'الخزن', permission: 'data.cashBoxes.view' },
  ];
  const visibleDataTabs = dataTabs.filter((t) => can(t.permission, 'data.view'));

  const balanceTabs = [
    { id: 'customers', label: 'حسابات العملاء', permission: 'balances.customers.view' },
    { id: 'suppliers', label: 'حسابات الموردين', permission: 'balances.suppliers.view' },
    { id: 'items', label: 'أرصدة الأصناف', permission: 'balances.items.view' },
    { id: 'cashBoxes', label: 'أرصدة الخزن', permission: 'balances.cashBoxes.view' },
  ];
  const visibleBalanceTabs = balanceTabs.filter((t) => can(t.permission, 'balances.view'));

  const managementTabs = [
    { id: 'customers', label: 'افتتاحيات العملاء', permission: 'management.customers.view' },
    { id: 'suppliers', label: 'افتتاحيات الموردين', permission: 'management.suppliers.view' },
    { id: 'items', label: 'افتتاحيات المخزون', permission: 'management.items.view' },
    { id: 'cashBoxes', label: 'افتتاحيات الخزن', permission: 'management.cashBoxes.view' },
    ...(access?.role === 'owner' ? [{ id: 'users', label: 'المستخدمون والصلاحيات', permission: 'management.users.view' }] : []),
  ];
  const visibleManagementTabs = managementTabs.filter((t) =>
    t.id === 'users' ? access?.role === 'owner' : can(t.permission, 'management.view'),
  );

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="مكسب بلس — الصفحة الرئيسية">
          <img src="/maksab-logo.png" alt="مكسب بلس" />
        </Link>

        <nav className="nav" aria-label="التنقل الرئيسي">
          {visibleGoodsTabs.length > 0 && (
            <div className="nav-group">
              <NavLink to={`/invoices?tab=${visibleGoodsTabs[0].id}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-link-main">
                  <Package size={17} className="nav-icon" />
                  <span>البضاعة</span>
                </span>
                <span className="nav-chevron">{isGoods ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
              </NavLink>
              {isGoods && (
                <div className="subnav">
                  {visibleGoodsTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === visibleGoodsTabs[0].id);
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

          {visibleMoneyTabs.length > 0 && (
            <div className="nav-group">
              <NavLink to={`/receipts?tab=${visibleMoneyTabs[0].id}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-link-main">
                  <Wallet size={17} className="nav-icon" />
                  <span>الفلوس</span>
                </span>
                <span className="nav-chevron">{isMoney ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
              </NavLink>
              {isMoney && (
                <div className="subnav">
                  {visibleMoneyTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === visibleMoneyTabs[0].id);
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

          {visibleDataTabs.length > 0 && (
            <div className="nav-group">
              <NavLink to={`/data?tab=${visibleDataTabs[0].id}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-link-main">
                  <Database size={17} className="nav-icon" />
                  <span>البيانات</span>
                </span>
                <span className="nav-chevron">{isData ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
              </NavLink>
              {isData && (
                <div className="subnav">
                  {visibleDataTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === visibleDataTabs[0].id);
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

          {visibleBalanceTabs.length > 0 && (
            <div className="nav-group">
              <NavLink to={`/balances?tab=${visibleBalanceTabs[0].id}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-link-main">
                  <Scale size={17} className="nav-icon" />
                  <span>الأرصدة</span>
                </span>
                <span className="nav-chevron">{isBalances ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
              </NavLink>
              {isBalances && (
                <div className="subnav">
                  {visibleBalanceTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === visibleBalanceTabs[0].id);
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

          {visibleManagementTabs.length > 0 && (
            <div className="nav-group">
              <NavLink to={`/management?tab=${visibleManagementTabs[0].id}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-link-main">
                  <ShieldCheck size={17} className="nav-icon" />
                  <span>إدارة</span>
                </span>
                <span className="nav-chevron">{isManagement ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
              </NavLink>
              {isManagement && (
                <div className="subnav">
                  {visibleManagementTabs.map((item) => {
                    const isActive = currentTab === item.id || (!currentTab && item.id === visibleManagementTabs[0].id);
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
          <LogOut size={16} />
          <span>تسجيل الخروج</span>
        </button>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

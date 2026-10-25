import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Package, Wallet, Database, Scale, ShieldCheck, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/access';

type NavSection = 'goods' | 'money' | 'data' | 'balances' | 'management';

function getInitialSection(pathname: string): NavSection | null {
  if (pathname.startsWith('/invoices')) return 'goods';
  if (pathname.startsWith('/receipts')) return 'money';
  if (pathname.startsWith('/data')) return 'data';
  if (pathname.startsWith('/balances')) return 'balances';
  if (pathname.startsWith('/management')) return 'management';
  return null;
}

function makeSingleOpen(section: NavSection | null): Record<NavSection, boolean> {
  return {
    goods: section === 'goods',
    money: section === 'money',
    data: section === 'data',
    balances: section === 'balances',
    management: section === 'management',
  };
}

function getStoredOpenSection(uid: string | null): NavSection | null {
  if (!uid) return 'goods';
  try {
    const raw = localStorage.getItem(`maksab_active_nav_section_${uid}`);
    if (raw && ['goods', 'money', 'data', 'balances', 'management'].includes(raw)) {
      return raw as NavSection;
    }
  } catch {}
  return 'goods';
}

function saveOpenSection(uid: string | null, section: NavSection | null) {
  if (!uid) return;
  try {
    if (section) {
      localStorage.setItem(`maksab_active_nav_section_${uid}`, section);
    } else {
      localStorage.removeItem(`maksab_active_nav_section_${uid}`);
    }
  } catch {}
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can, access } = useAccess();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [openSections, setOpenSections] = useState<Record<NavSection, boolean>>(() => {
    const current = getInitialSection(location.pathname);
    return makeSingleOpen(current || 'goods');
  });

  useEffect(() => {
    let alive = true;
    async function loadUser() {
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes?.session?.user;
      if (!user || !alive) return;
      setUserId(user.id);

      const [profileRes, companyRes] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('companies').select('name').maybeSingle(),
      ]);

      if (!alive) return;

      const displayName =
        profileRes?.data?.full_name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'المستخدم';

      const compDisplayName = companyRes?.data?.name || 'مكسب بلس';

      setUserName(displayName);
      setCompanyName(compDisplayName);

      const stored = getStoredOpenSection(user.id);
      const current = getInitialSection(location.pathname);
      const active = current || stored || 'goods';
      setOpenSections(makeSingleOpen(active));
    }

    void loadUser();
    return () => {
      alive = false;
    };
  }, []);

  // When location changes, ensure current active section is open and all others closed
  useEffect(() => {
    const current = getInitialSection(location.pathname);
    if (!current) return;
    setOpenSections(makeSingleOpen(current));
    saveOpenSection(userId, current);
  }, [location.pathname, userId]);

  function toggleSection(section: NavSection) {
    setOpenSections((prev) => {
      const willBeOpen = !prev[section];
      const nextSection = willBeOpen ? section : null;
      saveOpenSection(userId, nextSection);
      return makeSingleOpen(nextSection);
    });
  }

  function ensureSectionOpen(section: NavSection) {
    setOpenSections(() => {
      saveOpenSection(userId, section);
      return makeSingleOpen(section);
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

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
          <img src="/maksab-sidebar-logo.png" alt="مكسب بلس" />
        </Link>

        <nav className="nav" aria-label="التنقل الرئيسي">
          {visibleGoodsTabs.length > 0 && (
            <div className="nav-group">
              <NavLink
                to={`/invoices?tab=${visibleGoodsTabs[0].id}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => ensureSectionOpen('goods')}
              >
                <span className="nav-link-main">
                  <Package size={17} className="nav-icon" />
                  <span>البضاعة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  tabIndex={0}
                  aria-label="طي أو فتح قسم البضاعة"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection('goods');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection('goods');
                    }
                  }}
                >
                  {openSections.goods ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </NavLink>
              {openSections.goods && (
                <div className="subnav">
                  {visibleGoodsTabs.map((item) => {
                    const isActive = location.pathname.startsWith('/invoices') && (currentTab === item.id || (!currentTab && item.id === visibleGoodsTabs[0].id));
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
              <NavLink
                to={`/receipts?tab=${visibleMoneyTabs[0].id}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => ensureSectionOpen('money')}
              >
                <span className="nav-link-main">
                  <Wallet size={17} className="nav-icon" />
                  <span>الفلوس</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  tabIndex={0}
                  aria-label="طي أو فتح قسم الفلوس"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection('money');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection('money');
                    }
                  }}
                >
                  {openSections.money ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </NavLink>
              {openSections.money && (
                <div className="subnav">
                  {visibleMoneyTabs.map((item) => {
                    const isActive = location.pathname.startsWith('/receipts') && (currentTab === item.id || (!currentTab && item.id === visibleMoneyTabs[0].id));
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
              <NavLink
                to={`/data?tab=${visibleDataTabs[0].id}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => ensureSectionOpen('data')}
              >
                <span className="nav-link-main">
                  <Database size={17} className="nav-icon" />
                  <span>البيانات</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  tabIndex={0}
                  aria-label="طي أو فتح قسم البيانات"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection('data');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection('data');
                    }
                  }}
                >
                  {openSections.data ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </NavLink>
              {openSections.data && (
                <div className="subnav">
                  {visibleDataTabs.map((item) => {
                    const isActive = location.pathname.startsWith('/data') && (currentTab === item.id || (!currentTab && item.id === visibleDataTabs[0].id));
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
              <NavLink
                to={`/balances?tab=${visibleBalanceTabs[0].id}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => ensureSectionOpen('balances')}
              >
                <span className="nav-link-main">
                  <Scale size={17} className="nav-icon" />
                  <span>الأرصدة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  tabIndex={0}
                  aria-label="طي أو فتح قسم الأرصدة"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection('balances');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection('balances');
                    }
                  }}
                >
                  {openSections.balances ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </NavLink>
              {openSections.balances && (
                <div className="subnav">
                  {visibleBalanceTabs.map((item) => {
                    const isActive = location.pathname.startsWith('/balances') && (currentTab === item.id || (!currentTab && item.id === visibleBalanceTabs[0].id));
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
              <NavLink
                to={`/management?tab=${visibleManagementTabs[0].id}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => ensureSectionOpen('management')}
              >
                <span className="nav-link-main">
                  <ShieldCheck size={17} className="nav-icon" />
                  <span>إدارة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  tabIndex={0}
                  aria-label="طي أو فتح قسم الإدارة"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection('management');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection('management');
                    }
                  }}
                >
                  {openSections.management ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </NavLink>
              {openSections.management && (
                <div className="subnav">
                  {visibleManagementTabs.map((item) => {
                    const isActive = location.pathname.startsWith('/management') && (currentTab === item.id || (!currentTab && item.id === visibleManagementTabs[0].id));
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

        <div className="sidebar-footer">
          <div className="sidebar-user-block">
            <div className="sidebar-user-name" title={userName || 'المستخدم'}>{userName || 'المستخدم'}</div>
            <div className="sidebar-company-name" title={companyName || 'مكسب بلس'}>{companyName || 'مكسب بلس'}</div>
          </div>
          <button type="button" className="btn ghost sign-out" onClick={signOut} title="تسجيل الخروج">
            <LogOut size={16} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

import { getCurrentUserIdentity } from '../lib/company';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Wallet, Database, Scale, ShieldCheck, LogOut, ChevronDown, ChevronUp, KeyRound, UserRound, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/access';
import ChangePasswordModal from './ChangePasswordModal';
import { useNavigationGuard } from './NavigationGuardContext';
import RowActions from './RowActions';

type NavSection = 'goods' | 'money' | 'balances' | 'data' | 'management';

interface NavTab {
  id: string;
  label: string;
}

interface NavGroupDef {
  section: NavSection;
  basePath: string;
  label: string;
  icon: LucideIcon;
  /** الاسم المعرب المذكور في aria-label (مثلاً: الإدارة) — عن default بيُستخدم label */
  sectionName?: string;
}

/** أقسام التنقل بمساراتها وأيقوناتها — المصدر الواحد لبنية الشريط العلوي. */
const NAV_GROUPS: NavGroupDef[] = [
  { section: 'goods', basePath: '/invoices', label: 'البضاعة', icon: Package },
  { section: 'money', basePath: '/receipts', label: 'الفلوس', icon: Wallet },
  { section: 'balances', basePath: '/balances', label: 'الأرصدة', icon: Scale },
  { section: 'data', basePath: '/data', label: 'البيانات', icon: Database },
  { section: 'management', basePath: '/management', label: 'إدارة', icon: ShieldCheck, sectionName: 'الإدارة' },
];

function getInitialSection(pathname: string): NavSection | null {
  return NAV_GROUPS.find((group) => pathname.startsWith(group.basePath))?.section ?? null;
}

const DEFAULT_SECTIONS: Record<NavSection, boolean> = {
  goods: false,
  money: false,
  balances: false,
  data: false,
  management: false,
};

function getStoredOpenSection(uid: string): NavSection | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`maksab_nav_sections_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return (Object.keys(DEFAULT_SECTIONS) as NavSection[]).find((section) => parsed[section]) ?? null;
      }
    }
  } catch {}
  return null;
}

function saveOpenSection(uid: string | null, section: NavSection | null) {
  if (!uid) return;
  try {
    const sections = { ...DEFAULT_SECTIONS, ...(section ? { [section]: true } : {}) };
    localStorage.setItem(`maksab_nav_sections_${uid}`, JSON.stringify(sections));
  } catch {}
}

interface NavGroupSectionProps {
  group: NavGroupDef;
  tabs: NavTab[];
  open: boolean;
  currentTab: string | null;
  pathname: string;
  onOpen: (section: NavSection) => void;
  onToggle: (section: NavSection) => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, to: string, after?: () => void) => void;
}

/** مجموعة قسم واحد في الشريط: رابط القسم + سهم الطي + قائمة التبويبات الفرعية. */
function NavGroupSection({ group, tabs, open, currentTab, pathname, onOpen, onToggle, onNavigate }: NavGroupSectionProps) {
  if (tabs.length === 0) return null;
  const Icon = group.icon;
  const sectionDefaultTarget = `${group.basePath}?tab=${tabs[0].id}`;

  return (
    <div className="nav-group">
      <NavLink
        to={sectionDefaultTarget}
        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        onClick={(e) => onNavigate(e, sectionDefaultTarget, () => onOpen(group.section))}
      >
        <span className="nav-link-main">
          <Icon size={17} className="nav-icon" />
          <span>{group.label}</span>
        </span>
        <span
          className="nav-chevron"
          role="button"
          tabIndex={0}
          aria-label={`طي أو فتح قسم ${group.sectionName ?? group.label}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(group.section);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggle(group.section);
            }
          }}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </NavLink>
      {open && (
        <div className="subnav">
          {tabs.map((item) => {
            const isActive = pathname.startsWith(group.basePath) && (currentTab === item.id || (!currentTab && item.id === tabs[0].id));
            return (
              <Link
                key={item.id}
                to={`${group.basePath}?tab=${item.id}`}
                className={`subnav-link ${isActive ? 'active' : ''}`}
                onClick={(e) => onNavigate(e, `${group.basePath}?tab=${item.id}`)}
              >
                <span className="subnav-dot" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can, access } = useAccess();
  const navGuard = useNavigationGuard();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const [openSection, setOpenSection] = useState<NavSection | null>(() => getInitialSection(location.pathname));

  useEffect(() => {
    let alive = true;
    async function loadUser() {
      const identity = await getCurrentUserIdentity();
      if (!identity || !alive) return;

      setUserId(identity.userId);
      setUserName(identity.userName);
      setCompanyName(identity.companyName);

      const stored = getStoredOpenSection(identity.userId);
      const current = getInitialSection(pathnameRef.current);
      const initial = current ?? stored;
      setOpenSection(initial);
      saveOpenSection(identity.userId, initial);
    }

    void loadUser();
    return () => {
      alive = false;
    };
  }, []);

  const ensureSectionOpen = useCallback((section: NavSection | null) => {
    setOpenSection((previous) => {
      if (previous === section) return previous;
      saveOpenSection(userId, section);
      return section;
    });
  }, [userId]);

  // Opening a route or a section always closes the other sections.
  useEffect(() => {
    const current = getInitialSection(location.pathname);
    if (!current) return;
    ensureSectionOpen(current);
  }, [location.pathname, ensureSectionOpen]);

  function toggleSection(section: NavSection) {
    setOpenSection((previous) => {
      const next = previous === section ? null : section;
      saveOpenSection(userId, next);
      return next;
    });
  }

  const guardNavigate = useCallback(async (e: MouseEvent, targetPath: string) => {
    if (!navGuard?.isDirty) return;
    e.preventDefault();
    const ok = await navGuard.confirmNavigationIfDirty();
    if (ok) {
      navigate(targetPath);
    }
  }, [navGuard, navigate]);

  async function signOut() {
    if (navGuard?.isDirty) {
      const ok = await navGuard.confirmNavigationIfDirty();
      if (!ok) return;
    }
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
  const visibleGoodsTabs = goodsTabs.filter((t) => can(t.permission));

  const moneyTabs = [
    { id: 'in', label: 'إيصالات استلام', permission: 'money.in.view' },
    { id: 'out', label: 'إيصالات صرف', permission: 'money.out.view' },
    { id: 'cash_box_transfer', label: 'تحويل بين الخزن', permission: 'money.cash_box_transfer.view' },
  ];
  const visibleMoneyTabs = moneyTabs.filter((t) => can(t.permission));

  const balanceTabs = [
    { id: 'customers', label: 'حسابات العملاء', permission: 'balances.customers.view' },
    { id: 'suppliers', label: 'حسابات الموردين', permission: 'balances.suppliers.view' },
    { id: 'items', label: 'أرصدة الأصناف', permission: 'balances.items.view' },
    { id: 'cashBoxes', label: 'أرصدة الخزن', permission: 'balances.cashBoxes.view' },
  ];
  const visibleBalanceTabs = balanceTabs.filter((t) => can(t.permission));

  const dataTabs = [
    { id: 'customers', label: 'العملاء', permission: 'data.customers.view' },
    { id: 'suppliers', label: 'الموردون', permission: 'data.suppliers.view' },
    { id: 'items', label: 'الأصناف', permission: 'data.items.view' },
    { id: 'warehouses', label: 'المخازن', permission: 'data.warehouses.view' },
    { id: 'cashBoxes', label: 'الخزن', permission: 'data.cashBoxes.view' },
  ];
  const visibleDataTabs = dataTabs.filter((t) => can(t.permission));

  const managementTabs = [
    { id: 'customers', label: 'افتتاحيات العملاء', permission: 'management.customers.view' },
    { id: 'suppliers', label: 'افتتاحيات الموردين', permission: 'management.suppliers.view' },
    { id: 'items', label: 'افتتاحيات المخزون', permission: 'management.items.view' },
    { id: 'cashBoxes', label: 'افتتاحيات الخزن', permission: 'management.cashBoxes.view' },
    ...(access?.role === 'owner' ? [{ id: 'reconciliations', label: 'سجل مطابقة الأرصدة' }, { id: 'users', label: 'المستخدمون والصلاحيات', permission: 'management.users.view' }] : []),
  ];
  const visibleManagementTabs = managementTabs.filter((t) =>
    t.id === 'users' || t.id === 'reconciliations' ? access?.role === 'owner' : can(t.permission!),
  );

  return (
    <div className="app">
      <header className="topbar">
        <Link
          className="brand"
          to="/"
          aria-label="مكسب بلس — الصفحة الرئيسية"
          onClick={(e) => {
            ensureSectionOpen(null);
            void guardNavigate(e, '/');
          }}
        >
          <img src="/maksab-sidebar-logo.png" alt="مكسب بلس" />
        </Link>

        <nav className="nav" aria-label="التنقل الرئيسي">
          <div className="nav-group">
            <NavLink
              to="/"
              end
              onClick={(e) => {
                ensureSectionOpen(null);
                void guardNavigate(e, '/');
              }}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-link-main">
                <LayoutDashboard size={17} className="nav-icon" />
                <span>الرئيسية</span>
              </span>
            </NavLink>
          </div>
          {NAV_GROUPS.map((group) => {
            const visibleTabsBySection: Record<NavSection, NavTab[]> = {
              goods: visibleGoodsTabs,
              money: visibleMoneyTabs,
              balances: visibleBalanceTabs,
              data: visibleDataTabs,
              management: visibleManagementTabs,
            };
            return (
              <NavGroupSection
                key={group.section}
                group={group}
                tabs={visibleTabsBySection[group.section]}
                open={openSection === group.section}
                currentTab={currentTab}
                pathname={location.pathname}
                onOpen={ensureSectionOpen}
                onToggle={toggleSection}
                onNavigate={guardNavigate}
              />
            );
          })}
        </nav>

        <RowActions
          portal={false}
          className="sidebar-footer"
          triggerClassName="sidebar-user-block"
          triggerLabel={`خيارات حساب ${userName || 'المستخدم'}`}
          placement="top"
          trigger={<>
            <span className="sidebar-user-avatar" aria-hidden="true"><UserRound size={19} /></span>
            <span className="sidebar-user-details">
              <span className="sidebar-user-name" title={userName || 'المستخدم'}>{userName || 'المستخدم'}</span>
              <span className="sidebar-company-name" title={companyName || 'مكسب بلس'}>{companyName || 'مكسب بلس'}</span>
            </span>
            <ChevronUp size={16} className="sidebar-user-chevron" aria-hidden="true" />
          </>}
          customActions={[
            { label: 'تغيير كلمة المرور', icon: KeyRound, onClick: () => setChangePasswordOpen(true) },
            { label: 'تسجيل الخروج', icon: LogOut, danger: true, onClick: () => { void signOut(); } },
          ]}
        />
      </header>

      <main className="content">
        <Outlet />
      </main>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}

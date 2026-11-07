import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useAccess } from '../lib/access';
import UserPermissions from '../components/UserPermissions';
import { useMasterData, type MasterDataResource } from '../context/MasterDataContext';
import AccountOpeningTab from './management/AccountOpeningTab';
import StockOpeningTab from './management/StockOpeningTab';
import CashBoxOpeningTab from './management/CashBoxOpeningTab';
import ReconciliationLogTab from './management/ReconciliationLogTab';

type ManagementTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes' | 'reconciliations' | 'users';

const MANAGEMENT_TABS: { id: ManagementTab; label: string; permission?: string }[] = [
  { id: 'customers', label: 'افتتاحيات العملاء', permission: 'management.customers.view' },
  { id: 'suppliers', label: 'افتتاحيات الموردين', permission: 'management.suppliers.view' },
  { id: 'items', label: 'افتتاحيات المخزون', permission: 'management.items.view' },
  { id: 'cashBoxes', label: 'افتتاحيات الخزن', permission: 'management.cashBoxes.view' },
  { id: 'reconciliations', label: 'سجل مطابقة الأرصدة' },
  { id: 'users', label: 'المستخدمون والصلاحيات' },
];

const VALID_MANAGEMENT_TABS: ManagementTab[] = [
  'customers',
  'suppliers',
  'items',
  'cashBoxes',
  'reconciliations',
  'users',
];

const TAB_RESOURCES: Record<ManagementTab, readonly MasterDataResource[]> = {
  customers: ['accounts'], suppliers: ['accounts'], items: ['stock', 'warehouses'],
  cashBoxes: ['cashBoxes'], reconciliations: [], users: [],
};

export default function Management() {
  const { access, can } = useAccess();
  const visibleTabs = MANAGEMENT_TABS.filter((t) =>
    t.id === 'users' || t.id === 'reconciliations' ? access?.role === 'owner' : can(t.permission!)
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ManagementTab | null;
  const initialTab = (tabParam && VALID_MANAGEMENT_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<ManagementTab>(initialTab);
  const canViewCurrentTab =
    tab === 'users' || tab === 'reconciliations' ? access?.role === 'owner' : can(`management.${tab}.view`);
  const canEditOpening = can(`management.${tab}.edit`);

  const { accounts: rawAccounts, cashBoxes, stockRows, warehouses: rawWarehouses, resourceStatus, refresh } = useMasterData(canViewCurrentTab ? TAB_RESOURCES[tab] : undefined);
  const resources = TAB_RESOURCES[tab].map((key) => resourceStatus[key]);
  const loading = resources.some((resource) => resource.loading);
  const hasLoaded = resources.every((resource) => resource.hasLoaded);
  const loadError = resources.find((resource) => resource.error)?.error;
  const accounts = useMemo(() => rawAccounts.filter((account) => account.system_key === null), [rawAccounts]);
  const warehouses = useMemo(() => rawWarehouses.filter((w) => w.is_active !== false), [rawWarehouses]);
  const [saving, setSaving] = useState(false);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  useEffect(() => {
    const targetTab = (tabParam && VALID_MANAGEMENT_TABS.includes(tabParam)) ? tabParam : 'customers';
    if (targetTab !== tab && visibleTabs.some((t) => t.id === targetTab)) {
      setTab(targetTab);
    }
  }, [tabParam, tab, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  function handleTabChange(nextTab: ManagementTab) {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

  const tabTitle =
    tab === 'customers'
      ? 'افتتاحيات العملاء'
      : tab === 'suppliers'
        ? 'افتتاحيات الموردين'
        : tab === 'items'
          ? 'افتتاحيات المخزون'
          : tab === 'cashBoxes'
            ? 'افتتاحيات الخزن'
            : tab === 'reconciliations'
              ? 'سجل مطابقة الأرصدة والمخزون'
              : 'المستخدمون والصلاحيات';

  const saveBtnLabel =
    tab === 'customers'
      ? 'حفظ أرصدة العملاء'
      : tab === 'suppliers'
        ? 'حفظ أرصدة الموردين'
        : tab === 'items'
          ? 'حفظ افتتاحيات المخزون'
          : 'حفظ أرصدة الخزن';

  if (visibleTabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
        </div>
        <div className="actions">
          {tab === 'reconciliations' && access?.role === 'owner' && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('action', 'new');
                setSearchParams(nextParams);
              }}
            >
              <Play size={16} />
              <span>بدء فحص جديد</span>
            </button>
          )}
          {canEditOpening && tab !== 'users' && tab !== 'reconciliations' && (
            <button
              type="button"
              className="btn primary"
              disabled={saving || loading || Boolean(loadError)}
              onClick={() => setSaveTrigger((count) => count + 1)}
            >
              {saving ? 'جارٍ الحفظ…' : saveBtnLabel}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'tab active' : 'tab'}
            onClick={() => handleTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {canViewCurrentTab && loadError && (
        <div className="empty-state" role="alert">
          <p>تعذّر تحميل البيانات كاملة. حدّث الصفحة وحاول مرة أخرى.</p>
        </div>
      )}

      {!canViewCurrentTab ? (
        <div className="empty-state">
          <p>ليس لديك صلاحية لعرض هذا القسم.</p>
        </div>
      ) : !hasLoaded && loadError ? null : !hasLoaded ? (
        <div className="loading-state">
          <p>جاري تحميل البيانات...</p>
        </div>
      ) : (
        <>
          {tab === 'customers' && (
            <AccountOpeningTab
              kind="customer"
              accounts={accounts}
              canEditOpening={canEditOpening}
              onRefresh={() => refresh(['accounts'])}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
            />
          )}
          {tab === 'suppliers' && (
            <AccountOpeningTab
              kind="supplier"
              accounts={accounts}
              canEditOpening={canEditOpening}
              onRefresh={() => refresh(['accounts'])}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
            />
          )}
          {tab === 'items' && (
            <StockOpeningTab
              warehouses={warehouses}
              stockRows={stockRows}
              canEditOpening={canEditOpening}
              onRefresh={() => refresh(['stock', 'items'])}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
            />
          )}
          {tab === 'cashBoxes' && (
            <CashBoxOpeningTab
              cashBoxes={cashBoxes}
              canEditOpening={canEditOpening}
              onRefresh={() => refresh(['cashBoxes'])}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
            />
          )}
          {tab === 'reconciliations' && (
            <ReconciliationLogTab
              onRefreshMasterData={() => refresh(['accounts', 'cashBoxes', 'stock', 'items'])}
            />
          )}
          {tab === 'users' && (
            <UserPermissions
              inviteOpen={isInviteOpen}
              onInviteOpenChange={setIsInviteOpen}
            />
          )}
        </>
      )}
    </div>
  );
}

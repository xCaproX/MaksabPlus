import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAccess } from '../lib/access';
import AccountsTab from './master-data/AccountsTab';
import ItemsTab from './master-data/ItemsTab';
import WarehousesTab from './master-data/WarehousesTab';
import CashBoxesTab from './master-data/CashBoxesTab';

type Tab = 'customers' | 'suppliers' | 'items';
type LocationsTab = Tab | 'warehouses' | 'cashBoxes';

const DATA_TABS: { id: LocationsTab; label: string; permission: string }[] = [
  { id: 'customers', label: 'العملاء', permission: 'data.customers.view' },
  { id: 'suppliers', label: 'الموردون', permission: 'data.suppliers.view' },
  { id: 'items', label: 'الأصناف', permission: 'data.items.view' },
  { id: 'warehouses', label: 'المخازن', permission: 'data.warehouses.view' },
  { id: 'cashBoxes', label: 'الخزن', permission: 'data.cashBoxes.view' },
];

const VALID_DATA_TABS: LocationsTab[] = ['customers', 'suppliers', 'items', 'warehouses', 'cashBoxes'];

export default function MasterData() {
  const { can } = useAccess();
  const visibleTabs = DATA_TABS.filter((t) => can(t.permission));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as LocationsTab | null;
  const initialTab = tabParam && VALID_DATA_TABS.includes(tabParam) ? tabParam : 'customers';
  const [tab, setTab] = useState<LocationsTab>(initialTab);

  useEffect(() => {
    const targetTab = tabParam && VALID_DATA_TABS.includes(tabParam) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
    }
  }, [tabParam, tab]);
  const canViewCurrentTab = can(`data.${tab}.view`);

  // مشغل فتح نافذة الإضافة في التبويب النشط
  const [addTrigger, setAddTrigger] = useState(0);

  function switchTab(next: LocationsTab) {
    setTab(next);
    setSearchParams({ tab: next });
  }

  const tabTitle =
    tab === 'customers'
      ? 'العملاء'
      : tab === 'suppliers'
        ? 'الموردون'
        : tab === 'items'
          ? 'الأصناف'
          : tab === 'warehouses'
            ? 'المخازن'
            : 'الخزن';

  const newBtnLabel =
    tab === 'customers'
      ? '+ إضافة عميل'
      : tab === 'suppliers'
        ? '+ إضافة مورد'
        : tab === 'items'
          ? '+ إضافة صنف'
          : tab === 'warehouses'
            ? '+ إضافة مخزن'
            : '+ إضافة خزنة';

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    return <Navigate to={firstAllowedTab ? `/data?tab=${firstAllowedTab.id}` : '/access-denied'} replace />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
        </div>
        {can(`data.${tab}.create`) && (
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setAddTrigger((count) => count + 1)}
            >
              {newBtnLabel}
            </button>
          </div>
        )}
      </div>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'customers' && <AccountsTab key="customers" kind="customer" addTrigger={addTrigger} />}
      {tab === 'suppliers' && <AccountsTab key="suppliers" kind="supplier" addTrigger={addTrigger} />}
      {tab === 'items' && <ItemsTab key="items" addTrigger={addTrigger} />}
      {tab === 'warehouses' && <WarehousesTab key="warehouses" addTrigger={addTrigger} />}
      {tab === 'cashBoxes' && <CashBoxesTab key="cashBoxes" addTrigger={addTrigger} />}
    </div>
  );
}

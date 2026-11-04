import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAccess } from '../lib/access';
import AccountBalancesTab from './balances/AccountBalancesTab';
import ItemBalancesTab from './balances/ItemBalancesTab';
import CashBoxBalancesTab from './balances/CashBoxBalancesTab';

type BalanceTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes';

const BALANCE_TABS: { id: BalanceTab; label: string; permission: string }[] = [
  { id: 'customers', label: 'حسابات العملاء', permission: 'balances.customers.view' },
  { id: 'suppliers', label: 'حسابات الموردين', permission: 'balances.suppliers.view' },
  { id: 'items', label: 'أرصدة الأصناف', permission: 'balances.items.view' },
  { id: 'cashBoxes', label: 'أرصدة الخزن', permission: 'balances.cashBoxes.view' },
];

const VALID_BALANCE_TABS: BalanceTab[] = ['customers', 'suppliers', 'items', 'cashBoxes'];

export default function Balances() {
  const { can } = useAccess();
  const visibleTabs = BALANCE_TABS.filter((t) => can(t.permission));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as BalanceTab | null;
  const initialTab = tabParam && VALID_BALANCE_TABS.includes(tabParam) ? tabParam : 'customers';
  const [tab, setTab] = useState<BalanceTab>(initialTab);

  useEffect(() => {
    const targetTab = tabParam && VALID_BALANCE_TABS.includes(tabParam) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
    }
  }, [tabParam, tab]);
  const canViewCurrentTab = can(`balances.${tab}.view`);

  function switchTab(next: BalanceTab) {
    setTab(next);
    setSearchParams({ tab: next });
  }

  const tabTitle =
    tab === 'customers'
      ? 'حسابات العملاء'
      : tab === 'suppliers'
        ? 'حسابات الموردين'
        : tab === 'items'
          ? 'أرصدة الأصناف'
          : 'أرصدة الخزن';

  if (!canViewCurrentTab) {
    const firstAllowedTab = visibleTabs[0];
    return <Navigate to={firstAllowedTab ? `/balances?tab=${firstAllowedTab.id}` : '/access-denied'} replace />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
        </div>
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

      {tab === 'customers' && <AccountBalancesTab key="customers" kind="customer" />}
      {tab === 'suppliers' && <AccountBalancesTab key="suppliers" kind="supplier" />}
      {tab === 'items' && <ItemBalancesTab key="items" />}
      {tab === 'cashBoxes' && <CashBoxBalancesTab key="cashBoxes" />}
    </div>
  );
}

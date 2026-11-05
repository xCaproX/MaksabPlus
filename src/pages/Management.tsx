import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAccess } from '../lib/access';
import UserPermissions from '../components/UserPermissions';
import { toast } from '../components/Toast';
import { useMasterData } from '../context/MasterDataContext';
import AccountOpeningTab from './management/AccountOpeningTab';
import StockOpeningTab from './management/StockOpeningTab';
import CashBoxOpeningTab from './management/CashBoxOpeningTab';
import ReconcileBalancesModal, { type DiscrepancyItem, type ReconcileModalData } from './management/ReconcileBalancesModal';

type ManagementTab = 'customers' | 'suppliers' | 'items' | 'cashBoxes' | 'users';

const MANAGEMENT_TABS: { id: ManagementTab; label: string; permission?: string }[] = [
  { id: 'customers', label: 'افتتاحيات العملاء', permission: 'management.customers.view' },
  { id: 'suppliers', label: 'افتتاحيات الموردين', permission: 'management.suppliers.view' },
  { id: 'items', label: 'افتتاحيات المخزون', permission: 'management.items.view' },
  { id: 'cashBoxes', label: 'افتتاحيات الخزن', permission: 'management.cashBoxes.view' },
  { id: 'users', label: 'المستخدمون والصلاحيات' },
];

const VALID_MANAGEMENT_TABS: ManagementTab[] = ['customers', 'suppliers', 'items', 'cashBoxes', 'users'];

export default function Management() {
  const { access, can } = useAccess();
  const visibleTabs = MANAGEMENT_TABS.filter((t) =>
    t.id === 'users' ? access?.role === 'owner' : can(t.permission!)
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ManagementTab | null;
  const initialTab = (tabParam && VALID_MANAGEMENT_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<ManagementTab>(initialTab);
  const canViewCurrentTab = tab === 'users' ? access?.role === 'owner' : can(`management.${tab}.view`);
  const canEditOpening = can(`management.${tab}.edit`);

  const { accounts: rawAccounts, cashBoxes, stockRows, warehouses: rawWarehouses, loading, refresh } = useMasterData();
  const accounts = useMemo(() => rawAccounts.filter((account) => account.system_key === null), [rawAccounts]);
  const warehouses = useMemo(() => rawWarehouses.filter((w) => w.is_active !== false), [rawWarehouses]);
  const [saving, setSaving] = useState(false);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileModal, setReconcileModal] = useState<ReconcileModalData | null>(null);

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

  async function handleReconcileBalances() {
    setIsReconciling(true);
    try {
      const { data, error } = await supabase.rpc('reconcile_all_balances');
      if (error) throw error;
      await refresh();
      const discrepancies = (data || []) as DiscrepancyItem[];
      setReconcileModal({
        isOpen: true,
        accountsCount: accounts.length,
        cashBoxesCount: cashBoxes.length,
        discrepancies,
      });
      if (discrepancies.length === 0) {
        toast.success('تم فحص كافة الأرصدة بنجاح، وجميعها متطابقة تماماً مع الدفاتر');
      } else {
        toast.warning(`تم تصحيح فروقات في ${discrepancies.length} رصيد`);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setIsReconciling(false);
    }
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
          {access?.role === 'owner' && (
            <button
              type="button"
              className="btn outline"
              onClick={handleReconcileBalances}
              disabled={isReconciling}
            >
              <ShieldCheck size={16} />
              <span>{isReconciling ? 'جارٍ فحص الأرصدة…' : 'فحص ومطابقة الأرصدة'}</span>
            </button>
          )}
          {canEditOpening && tab !== 'users' && (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
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

      {!canViewCurrentTab ? (
        <div className="empty-state">
          <p>ليس لديك صلاحية لعرض هذا القسم.</p>
        </div>
      ) : loading ? (
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
              onRefresh={refresh}
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
              onRefresh={refresh}
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
              onRefresh={refresh}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
            />
          )}
          {tab === 'cashBoxes' && (
            <CashBoxOpeningTab
              cashBoxes={cashBoxes}
              canEditOpening={canEditOpening}
              onRefresh={refresh}
              saving={saving}
              setSaving={setSaving}
              saveTrigger={saveTrigger}
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

      {reconcileModal && (
        <ReconcileBalancesModal
          data={reconcileModal}
          onClose={() => setReconcileModal(null)}
        />
      )}
    </div>
  );
}

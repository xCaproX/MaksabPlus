import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { getCurrentUserIdentity } from '../lib/company';
import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { ChartNoAxesColumnIncreasing, Package, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/access';
import { money, qty } from '../lib/format';
import { errorMessage } from '../lib/errors';
import QuickActions from './home/QuickActions';
import SalesMetricCards, { type DashboardSales } from './home/SalesMetricCards';
import FinancialPulseCards from './home/FinancialPulseCards';
import TopRankedList, { type RankedItem } from './home/TopRankedList';
import HomeSection from './home/HomeSection';
import type { DailyTrendPoint } from '../components/charts/SalesTrendChart';

const DashboardChartsSection = lazy(() => import('../components/charts/DashboardChartsSection'));

interface DashboardSummaryData {
  sales: DashboardSales | null;
  cash_balance: number | null;
  receivables_balance: number | null;
  payables_balance: number | null;
  top_items: Array<{
    item_id: string;
    item_name: string;
    unit: string;
    total_qty: number;
    total_amount: number;
  }> | null;
  top_customers: Array<{
    account_id: string;
    account_name: string;
    total_amount: number;
    invoice_count: number;
  }> | null;
  permissions: {
    can_view_sales: boolean;
    can_view_cash: boolean;
    can_view_customers: boolean;
    can_view_suppliers: boolean;
  };
}

export default function Home() {
  const { access, loading: accessLoading } = useAccess();
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');

  const [sparklines, setSparklines] = useState<{ week?: number[]; month?: number[] }>({});

  const handleTrendLoaded = useCallback((trend: DailyTrendPoint[]) => {
    if (!trend || trend.length === 0) return;
    const monthSales = trend.map((t) => Number(t.sales || 0));
    const weekSales = monthSales.slice(-7);
    setSparklines({
      week: weekSales,
      month: monthSales,
    });
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, identity] = await Promise.all([
        supabase.rpc('get_home_dashboard_summary'),
        getCurrentUserIdentity(),
      ]);

      if (summaryRes.error) {
        throw summaryRes.error;
      }

      setData(summaryRes.data as DashboardSummaryData);

      if (identity) {
        setUserName(identity.userName);
        setCompanyName(identity.companyName);
      }
    } catch (err: unknown) {
      const msg = errorMessage(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (accessLoading || (loading && !data)) {
    return <LoadingSkeleton layout="dashboard" label="جارٍ تحميل بيانات الشاشة الرئيسية…" />;
  }

  if (!access?.role) {
    return <Navigate to="/access-denied" replace />;
  }

  if (error) {
    return (
      <div className="card empty" role="alert">
        <p>حدث خطأ أثناء تحميل الشاشة الرئيسية: {error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void loadDashboard()} style={{ marginTop: 12 }}>
          <RefreshCw size={14} style={{ marginInlineEnd: 6 }} />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const topItems: RankedItem[] = (data?.top_items ?? []).map((it) => ({
    id: it.item_id,
    label: it.item_name,
    value: Number(it.total_qty),
    formattedValue: qty(it.total_qty),
    unit: it.unit,
  }));

  const topCustomers: RankedItem[] = (data?.top_customers ?? []).map((c) => ({
    id: c.account_id,
    label: c.account_name,
    value: Number(c.total_amount),
    formattedValue: money(c.total_amount),
    unit: 'ج.م',
  }));

  return (
    <div className="home-dashboard" dir="rtl">
      {/* 1. ترحيب وإجراءات سريعة */}
      <QuickActions userName={userName} companyName={companyName} />

      {/* 2. بطاقات إجمالي المبيعات مع خطوط المسار (Sparklines) */}
      <SalesMetricCards sales={data?.sales ?? null} sparklines={sparklines} />

      {/* 3. النبض المالي والأرصدة */}
      <FinancialPulseCards
        cashBalance={data?.cash_balance ?? null}
        receivablesBalance={data?.receivables_balance ?? null}
        payablesBalance={data?.payables_balance ?? null}
      />

      {data?.permissions.can_view_sales && (
        <HomeSection title="الإحصائيات" icon={ChartNoAxesColumnIncreasing}>
          {/* الرسوم البيانية التفاعلية (تحميل كسول) */}
          <Suspense
            fallback={
              <div
                className="skeleton"
                style={{
                  height: 280,
                  width: '100%',
                  borderRadius: 'var(--radius)',
                  marginBottom: 16,
                }}
              />
            }
          >
            <DashboardChartsSection onTrendLoaded={handleTrendLoaded} />
          </Suspense>

          {/* قوائم الأكثر طلباً وكبار العملاء */}
          <div className="home-insights-grid" style={{ marginTop: 16 }}>
            <TopRankedList
              title="أكثر الأصناف مبيعاً (آخر 30 يوماً)"
              icon={Package}
              items={topItems}
              barVariant="items"
              emptyText="لا توجد مبيعات مسجلة خلال آخر 30 يوماً"
              linkTo="/invoices?tab=sale"
              linkText="عرض فواتير المبيعات"
            />
            <TopRankedList
              title="أكثر العملاء شراءً (آخر 30 يوماً)"
              icon={Users}
              items={topCustomers}
              barVariant="customers"
              emptyText="لا توجد مشتريات عملاء مسجلة خلال آخر 30 يوماً"
              linkTo="/balances?tab=customers"
              linkText="عرض كشوف العملاء"
            />
          </div>
        </HomeSection>
      )}
    </div>
  );
}

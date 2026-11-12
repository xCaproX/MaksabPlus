import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, PieChart, BarChart2, Package, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { money, qty } from '../../lib/format';
import ChartContainer from './ChartContainer';
import SalesTrendChart, { type DailyTrendPoint } from './SalesTrendChart';
import SalesVsPurchasesChart from './SalesVsPurchasesChart';
import SalesDistributionChart, { type SalesDistributionData } from './SalesDistributionChart';
import TopRankedList, { type RankedItem } from '../../pages/home/TopRankedList';

export interface TopItemData {
  item_id: string;
  item_name: string;
  unit: string;
  total_qty: number;
  total_amount: number;
}

export interface TopCustomerData {
  account_id: string;
  account_name: string;
  total_amount: number;
  invoice_count: number;
}

interface DashboardChartsData {
  daily_trend: DailyTrendPoint[];
  sales_distribution: SalesDistributionData | null;
  top_items: TopItemData[] | null;
  top_customers: TopCustomerData[] | null;
  permissions: {
    can_view_sales: boolean;
    can_view_purchases: boolean;
  };
}

interface DashboardChartsSectionProps {
  onTrendLoaded?: (trend: DailyTrendPoint[]) => void;
}

export type ChartRange = 7 | 30 | 90 | 180 | 365 | 0;

export const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: 7, label: 'آخر أسبوع' },
  { value: 30, label: 'آخر شهر' },
  { value: 90, label: 'آخر 3 أشهر' },
  { value: 180, label: 'آخر 6 أشهر' },
  { value: 365, label: 'آخر سنة' },
  { value: 0, label: 'طول الوقت' },
];

function getRangeLabel(rangeValue: ChartRange): string {
  switch (rangeValue) {
    case 7:
      return 'آخر أسبوع';
    case 30:
      return 'آخر شهر';
    case 90:
      return 'آخر 3 أشهر';
    case 180:
      return 'آخر 6 أشهر';
    case 365:
      return 'آخر سنة';
    case 0:
      return 'طول الوقت';
  }
}

export default function DashboardChartsSection({ onTrendLoaded }: DashboardChartsSectionProps) {
  const [range, setRange] = useState<ChartRange>(30);
  const [data, setData] = useState<DashboardChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCharts = useCallback(async (selectedRange: ChartRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.rpc('get_home_dashboard_charts', { p_days: selectedRange });
      if (res.error) throw res.error;
      const chartData = res.data as DashboardChartsData;
      setData(chartData);
      if (onTrendLoaded && chartData?.daily_trend && selectedRange === 30) {
        onTrendLoaded(chartData.daily_trend);
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onTrendLoaded]);

  useEffect(() => {
    void loadCharts(range);
  }, [range, loadCharts]);

  if (!loading && !error && (!data?.permissions.can_view_sales && !data?.permissions.can_view_purchases)) {
    return null;
  }

  const hasSalesData = (data?.daily_trend ?? []).some((d) => (d.sales ?? 0) > 0);
  const hasPurchasesData = (data?.daily_trend ?? []).some((d) => (d.purchases ?? 0) > 0);
  const hasDistributionData = Boolean(
    data?.sales_distribution &&
    (Number(data.sales_distribution.cash_sales) > 0 ||
     Number(data.sales_distribution.credit_sales) > 0)
  );

  const rangeLabel = getRangeLabel(range);

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
    <div className="dashboard-charts-wrapper">
      <div className="dashboard-charts-header-toolbar">
        <div className="chart-range-picker" role="group" aria-label="فترة الرسوم البيانية">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn-range ${range === opt.value ? 'is-active' : ''}`}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="home-charts-grid">
        {/* 1. مسار المبيعات */}
        {data?.permissions.can_view_sales && (
          <ChartContainer
            title="حركة المبيعات اليومية"
            subtitle={`إجمالي صافي المبيعات خلال ${rangeLabel}`}
            icon={TrendingUp}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(range)}
            isEmpty={!hasSalesData}
            emptyMessage="لا توجد مبيعات مسجلة خلال الفترة المختارة"
            height={280}
            className="chart-card-trend"
          >
            {data && <SalesTrendChart data={data.daily_trend} />}
          </ChartContainer>
        )}

        {/* 2. توزيع المبيعات (نقدي مقابل آجل) */}
        {data?.permissions.can_view_sales && (
          <ChartContainer
            title="توزيع المبيعات (نقدي / آجل)"
            subtitle={`نسبة التحصيل النقدي مقارنة بالآجل خلال ${rangeLabel}`}
            icon={PieChart}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(range)}
            isEmpty={!hasDistributionData}
            emptyMessage="لا توجد بيانات توزيع مبيعات كافية"
            height={280}
            className="chart-card-distribution"
          >
            {data?.sales_distribution && (
              <SalesDistributionChart distribution={data.sales_distribution} />
            )}
          </ChartContainer>
        )}

        {/* 3. مقارنة المبيعات بالمشتريات (إذا كانت الصلاحيتان متوفرتين) */}
        {data?.permissions.can_view_sales && data?.permissions.can_view_purchases && (
          <ChartContainer
            title="مقارنة المبيعات بالمشتريات"
            subtitle={`مقارنة بين إجمالي التوريدات والمبيعات اليومية خلال ${rangeLabel}`}
            icon={BarChart2}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(range)}
            isEmpty={!hasSalesData && !hasPurchasesData}
            emptyMessage="لا توجد مبيعات أو مشتريات مسجلة خلال الفترة"
            height={280}
            className="chart-card-comparison"
          >
            {data && <SalesVsPurchasesChart data={data.daily_trend} />}
          </ChartContainer>
        )}
      </div>

      {/* 4. كبار العملاء والأصناف الأكثر طلباً (مرتبطة بفترة الفلتر وتصل لـ 10 عناصر) */}
      {data?.permissions.can_view_sales && (
        <div className="home-insights-grid" style={{ marginTop: 16 }}>
          <TopRankedList
            title="أكثر الأصناف طلباً"
            subtitle={`أعلى 10 أصناف حسب الكمية المباعة خلال ${rangeLabel}`}
            icon={Package}
            items={topItems}
            barVariant="items"
            emptyText={`لا توجد مبيعات أصناف مسجلة خلال ${rangeLabel}`}
            linkTo="/invoices?tab=sale"
            linkText="عرض فواتير المبيعات"
            loading={loading && !data}
          />
          <TopRankedList
            title="كبار العملاء"
            subtitle={`أعلى 10 عملاء حسب قيمة المشتريات خلال ${rangeLabel}`}
            icon={Users}
            items={topCustomers}
            barVariant="customers"
            emptyText={`لا توجد مشتريات عملاء مسجلة خلال ${rangeLabel}`}
            linkTo="/balances?tab=customers"
            linkText="عرض كشوف العملاء"
            loading={loading && !data}
          />
        </div>
      )}
    </div>
  );
}

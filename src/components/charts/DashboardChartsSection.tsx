import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, PieChart, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import ChartContainer from './ChartContainer';
import SalesTrendChart, { type DailyTrendPoint } from './SalesTrendChart';
import SalesVsPurchasesChart from './SalesVsPurchasesChart';
import SalesDistributionChart, { type SalesDistributionData } from './SalesDistributionChart';

interface DashboardChartsData {
  daily_trend: DailyTrendPoint[];
  sales_distribution: SalesDistributionData | null;
  permissions: {
    can_view_sales: boolean;
    can_view_purchases: boolean;
  };
}

interface DashboardChartsSectionProps {
  onTrendLoaded?: (trend: DailyTrendPoint[]) => void;
}

export default function DashboardChartsSection({ onTrendLoaded }: DashboardChartsSectionProps) {
  const [days, setDays] = useState<7 | 30>(30);
  const [data, setData] = useState<DashboardChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCharts = useCallback(async (selectedDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.rpc('get_home_dashboard_charts', { p_days: selectedDays });
      if (res.error) throw res.error;
      const chartData = res.data as DashboardChartsData;
      setData(chartData);
      if (onTrendLoaded && chartData?.daily_trend && selectedDays === 30) {
        onTrendLoaded(chartData.daily_trend);
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onTrendLoaded]);

  useEffect(() => {
    void loadCharts(days);
  }, [days, loadCharts]);

  if (!loading && !error && (!data?.permissions.can_view_sales && !data?.permissions.can_view_purchases)) {
    return null;
  }

  const rangeButtons = (
    <div className="chart-range-picker" role="group" aria-label="فترة الرسم البياني">
      <button
        type="button"
        className={`btn-range ${days === 7 ? 'is-active' : ''}`}
        onClick={() => setDays(7)}
      >
        آخر 7 أيام
      </button>
      <button
        type="button"
        className={`btn-range ${days === 30 ? 'is-active' : ''}`}
        onClick={() => setDays(30)}
      >
        آخر 30 يوماً
      </button>
    </div>
  );

  const hasSalesData = (data?.daily_trend ?? []).some((d) => (d.sales ?? 0) > 0);
  const hasPurchasesData = (data?.daily_trend ?? []).some((d) => (d.purchases ?? 0) > 0);
  const hasDistributionData = Boolean(
    data?.sales_distribution &&
    (Number(data.sales_distribution.cash_sales) > 0 ||
     Number(data.sales_distribution.credit_sales) > 0 ||
     Number(data.sales_distribution.returns_total) > 0)
  );

  return (
    <div className="dashboard-charts-wrapper">
      <div className="home-charts-grid">
        {/* 1. مسار المبيعات */}
        {data?.permissions.can_view_sales && (
          <ChartContainer
            title="حركة المبيعات اليومية"
            subtitle={`إجمالي صافي المبيعات خلال ${days === 7 ? 'آخر 7 أيام' : 'آخر 30 يوماً'}`}
            icon={TrendingUp}
            actions={rangeButtons}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(days)}
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
            subtitle="نسبة التحصيل النقدي مقارنة بالآجل"
            icon={PieChart}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(days)}
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
            subtitle="مقارنة بين إجمالي التوريدات والمبيعات اليومية"
            icon={BarChart2}
            loading={loading}
            error={error}
            onRetry={() => void loadCharts(days)}
            isEmpty={!hasSalesData && !hasPurchasesData}
            emptyMessage="لا توجد مبيعات أو مشتريات مسجلة خلال الفترة"
            height={280}
            className="chart-card-comparison"
          >
            {data && <SalesVsPurchasesChart data={data.daily_trend} />}
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

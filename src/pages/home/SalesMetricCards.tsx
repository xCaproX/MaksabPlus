import { ShoppingCart } from 'lucide-react';
import MoneyDisplay from '../../components/MoneyDisplay';
import HomeSection from './HomeSection';
import { qty } from '../../lib/format';
import SparklineSvg from '../../components/charts/SparklineSvg';

export interface DashboardSales {
  today: number;
  today_count: number;
  week: number;
  week_count?: number;
  month: number;
  month_count?: number;
}

interface SalesMetricCardsProps {
  sales: DashboardSales | null;
  sparklines?: {
    week?: number[];
    month?: number[];
  };
}

export default function SalesMetricCards({ sales, sparklines }: SalesMetricCardsProps) {
  if (!sales) return null;

  const periods = [
    { key: 'today', label: 'مبيعات اليوم', amount: sales.today, count: sales.today_count, sparkline: undefined },
    { key: 'week', label: <>مبيعات آخر <bdi dir="ltr" className="num tabular-nums">7</bdi> أيام</>, amount: sales.week, count: sales.week_count, sparkline: sparklines?.week },
    { key: 'month', label: <>مبيعات آخر <bdi dir="ltr" className="num tabular-nums">30</bdi> يوم</>, amount: sales.month, count: sales.month_count, sparkline: sparklines?.month },
  ];

  return (
    <HomeSection title="المبيعات" icon={ShoppingCart}>
      <div className="home-sales-grid">
        {periods.map(({ key, label, amount, count, sparkline }) => (
          <div key={key} className="sales-kpi-card metric-card metric-card-primary">
            <div className="sales-kpi-content">
              <div className="sales-kpi-header">
                <span className="sales-kpi-icon-wrap" aria-hidden="true">
                  <ShoppingCart size={15} />
                </span>
                <h3 className="sales-kpi-label">{label}</h3>
              </div>
              <MoneyDisplay value={amount} currency className="sales-kpi-amount" />
              {count !== undefined && (
                <div className="sales-kpi-meta">
                  <span className="sales-kpi-count-badge">
                    <span className="sales-kpi-count-label">الفواتير</span>
                    <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(count)}</bdi>
                  </span>
                </div>
              )}
            </div>
            {sparkline && sparkline.length > 0 && (
              <div className="sales-kpi-chart-side" aria-hidden="true" title="مسار الحركة">
                <SparklineSvg data={sparkline} color="var(--primary)" fillColor="var(--primary)" width={100} height={36} />
              </div>
            )}
          </div>
        ))}
      </div>
    </HomeSection>
  );
}

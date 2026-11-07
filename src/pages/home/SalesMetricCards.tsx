import { ShoppingCart } from 'lucide-react';
import MoneyDisplay from '../../components/MoneyDisplay';
import HomeSection from './HomeSection';
import { qty } from '../../lib/format';

export interface DashboardSales {
  today: number;
  today_count: number;
  week: number;
  week_count?: number;
  month: number;
  month_count?: number;
}

export default function SalesMetricCards({ sales }: { sales: DashboardSales | null }) {
  if (!sales) return null;

  const periods = [
    { key: 'today', label: 'مبيعات اليوم', amount: sales.today, count: sales.today_count },
    { key: 'week', label: <>مبيعات آخر <bdi dir="ltr" className="num tabular-nums">7</bdi> أيام</>, amount: sales.week, count: sales.week_count },
    { key: 'month', label: <>مبيعات آخر <bdi dir="ltr" className="num tabular-nums">30</bdi> يوم</>, amount: sales.month, count: sales.month_count },
  ];

  return (
    <HomeSection title="المبيعات">
      <div className="home-sales-grid">
        {periods.map(({ key, label, amount, count }) => (
          <div key={key} className={`sales-kpi-card metric-card metric-card-primary${count === undefined ? '' : ' sales-kpi-card-with-count'}`}>
            <div className="sales-kpi-main">
              <h3 className="sales-kpi-label">{label}</h3>
              <span className="metric-card-icon" aria-hidden="true">
                <ShoppingCart size={16} />
              </span>
              <MoneyDisplay value={amount} currency className="sales-kpi-amount" />
            </div>
            {count !== undefined && (
              <div className="sales-kpi-count">
                <span>الفواتير</span>
                <bdi dir="ltr" className="num tabular-nums">{qty(count)}</bdi>
              </div>
            )}
          </div>
        ))}
      </div>
    </HomeSection>
  );
}

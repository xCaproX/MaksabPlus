import { Receipt } from 'lucide-react';
import { money } from '../../lib/format';

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
    { key: 'week', label: <>مبيعات آخر <bdi className="num tabular-nums">7</bdi> أيام</>, amount: sales.week, count: sales.week_count },
    { key: 'month', label: <>مبيعات آخر <bdi className="num tabular-nums">30</bdi> يوم</>, amount: sales.month, count: sales.month_count },
  ];

  return (
    <section aria-label="مبيعات الفترات">
      <div className="home-sales-grid">
        {periods.map(({ key, label, amount, count }) => (
          <div key={key} className={`sales-kpi-card sales-${key}`}>
            <div className="sales-kpi-head">
              <span className="sales-kpi-label">{label}</span>
              {count !== undefined && (
                <span className="sales-kpi-tag">
                  <Receipt size={12} aria-hidden="true" />
                  <span>عدد الفواتير</span>
                  <bdi dir="ltr" className="num tabular-nums">{count}</bdi>
                </span>
              )}
            </div>
            <div className="sales-kpi-value-row">
              <bdi dir="ltr" className="sales-kpi-amount num tabular-nums">{money(amount)}</bdi>
              <span className="sales-kpi-unit">ج.م</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { TrendingUp, Calendar, Clock, Receipt } from 'lucide-react';
import { money } from '../../lib/format';

interface SalesMetricCardsProps {
  sales: {
    today: number;
    today_count: number;
    week: number;
    month: number;
  } | null;
}

export default function SalesMetricCards({ sales }: SalesMetricCardsProps) {
  if (!sales) return null;

  return (
    <section className="home-sales-section" aria-label="إجمالي المبيعات">
      <div className="home-section-head">
        <h2 className="home-section-title">
          <TrendingUp size={16} className="text-primary" />
          <span>إجمالي المبيعات</span>
        </h2>
      </div>

      <div className="home-sales-grid">
        {/* اليوم */}
        <div className="sales-kpi-card sales-today">
          <div className="sales-kpi-head">
            <span className="sales-kpi-label">اليوم</span>
            <span className="sales-kpi-tag">
              <Clock size={11} style={{ display: 'inline', marginInlineEnd: 3 }} />
              لحظي
            </span>
          </div>
          <div className="sales-kpi-value-row">
            <bdi dir="ltr" className="sales-kpi-amount num tabular-nums">
              {money(sales.today)}
            </bdi>
            <span className="sales-kpi-unit">ج.م</span>
          </div>
          <div className="sales-kpi-footer">
            <span>عدد الفواتير</span>
            <span className="sales-kpi-count-badge">
              <Receipt size={12} className="text-muted" />
              <bdi dir="ltr" className="num tabular-nums">{sales.today_count}</bdi>
            </span>
          </div>
        </div>

        {/* آخر 7 أيام */}
        <div className="sales-kpi-card sales-week">
          <div className="sales-kpi-head">
            <span className="sales-kpi-label">آخر 7 أيام</span>
            <span className="sales-kpi-tag">
              <Calendar size={11} style={{ display: 'inline', marginInlineEnd: 3 }} />
              أسبوعي
            </span>
          </div>
          <div className="sales-kpi-value-row">
            <bdi dir="ltr" className="sales-kpi-amount num tabular-nums">
              {money(sales.week)}
            </bdi>
            <span className="sales-kpi-unit">ج.م</span>
          </div>
          <div className="sales-kpi-footer">
            <span>مبيعات الأسبوع</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>صافي البيع</span>
          </div>
        </div>

        {/* آخر 30 يوماً */}
        <div className="sales-kpi-card sales-month">
          <div className="sales-kpi-head">
            <span className="sales-kpi-label">آخر 30 يوماً</span>
            <span className="sales-kpi-tag">
              <Calendar size={11} style={{ display: 'inline', marginInlineEnd: 3 }} />
              شهري
            </span>
          </div>
          <div className="sales-kpi-value-row">
            <bdi dir="ltr" className="sales-kpi-amount num tabular-nums">
              {money(sales.month)}
            </bdi>
            <span className="sales-kpi-unit">ج.م</span>
          </div>
          <div className="sales-kpi-footer">
            <span>مبيعات الشهر</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>صافي البيع</span>
          </div>
        </div>
      </div>
    </section>
  );
}

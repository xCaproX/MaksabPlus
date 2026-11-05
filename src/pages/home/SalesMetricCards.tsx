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
      <h2 className="home-section-title">
        <TrendingUp size={20} className="text-primary" />
        <span>إجمالي المبيعات</span>
      </h2>

      <div className="home-sales-grid">
        {/* اليوم */}
        <div className="sales-pulse-card card-today">
          <div className="sales-card-header">
            <span className="sales-card-label">اليوم</span>
            <span className="sales-card-badge">
              <Clock size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
              لحظي
            </span>
          </div>
          <div className="sales-card-value">
            <bdi dir="ltr" className="sales-amount num tabular-nums">
              {money(sales.today)}
            </bdi>
            <span className="sales-currency">ج.م</span>
          </div>
          <div className="sales-card-footer">
            <span>عدد الفواتير المنفذة</span>
            <span className="badge neutral" style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
              <Receipt size={12} style={{ display: 'inline', marginInlineEnd: 3 }} />
              <bdi dir="ltr" className="num tabular-nums">{sales.today_count}</bdi>
            </span>
          </div>
        </div>

        {/* آخر أسبوع */}
        <div className="sales-pulse-card card-week">
          <div className="sales-card-header">
            <span className="sales-card-label">آخر 7 أيام</span>
            <span className="sales-card-badge">
              <Calendar size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
              أسبوعي
            </span>
          </div>
          <div className="sales-card-value">
            <bdi dir="ltr" className="sales-amount num tabular-nums">
              {money(sales.week)}
            </bdi>
            <span className="sales-currency">ج.م</span>
          </div>
          <div className="sales-card-footer">
            <span>مبيعات الأسبوع المنصرم</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>صافي البيع</span>
          </div>
        </div>

        {/* آخر شهر */}
        <div className="sales-pulse-card card-month">
          <div className="sales-card-header">
            <span className="sales-card-label">آخر 30 يوماً</span>
            <span className="sales-card-badge">
              <Calendar size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
              شهري
            </span>
          </div>
          <div className="sales-card-value">
            <bdi dir="ltr" className="sales-amount num tabular-nums">
              {money(sales.month)}
            </bdi>
            <span className="sales-currency">ج.م</span>
          </div>
          <div className="sales-card-footer">
            <span>مبيعات الشهر بالكامل</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>صافي البيع</span>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useMemo } from 'react';
import { ShoppingCart, Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import MoneyDisplay from '../../components/MoneyDisplay';
import HomeSection from './HomeSection';
import { qty, formatFullArabicDate } from '../../lib/format';

export interface DashboardSales {
  today: number;
  today_count: number;
  yesterday?: number;
  yesterday_count?: number;
  week?: number;
  week_count?: number;
  month?: number;
  month_count?: number;
}

interface SalesMetricCardsProps {
  sales: DashboardSales | null;
  sparklines?: {
    week?: number[];
    month?: number[];
  };
}

export default function SalesMetricCards({ sales }: SalesMetricCardsProps) {
  const todayDate = useMemo(() => formatFullArabicDate(new Date()), []);
  const yesterdayDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatFullArabicDate(d);
  }, []);

  if (!sales) return null;

  const todayAmount = Number(sales.today ?? 0);
  const yesterdayAmount = Number(sales.yesterday ?? 0);
  const todayCount = Number(sales.today_count ?? 0);
  const yesterdayCount = Number(sales.yesterday_count ?? 0);

  // حساب مؤشر الأداء النسبي مقارنة بأمس
  let perfDiffPercent: number | null = null;
  let perfType: 'up' | 'down' | 'neutral' | 'initial';

  if (yesterdayAmount > 0) {
    const diff = ((todayAmount - yesterdayAmount) / yesterdayAmount) * 100;
    perfDiffPercent = Math.abs(diff);
    if (diff > 0.05) {
      perfType = 'up';
    } else if (diff < -0.05) {
      perfType = 'down';
    } else {
      perfType = 'neutral';
    }
  } else if (todayAmount > 0) {
    perfType = 'initial';
  } else {
    perfType = 'neutral';
  }

  return (
    <HomeSection title="المبيعات" icon={ShoppingCart}>
      <div className="home-sales-grid">
        {/* 1. كارت اليوم (القسم الأكبر - Hero Card) */}
        <div className="sales-kpi-card sales-kpi-card-today metric-card metric-card-primary">
          <div className="sales-kpi-card-header">
            <div className="sales-kpi-title-group">
              <span className="sales-kpi-icon-wrap" aria-hidden="true">
                <ShoppingCart size={15} />
              </span>
              <div className="sales-kpi-heading-text">
                <h3 className="sales-kpi-title">مبيعات اليوم</h3>
                <span className="sales-kpi-date">({todayDate})</span>
              </div>
            </div>

            <div className={`sales-perf-badge sales-perf-${perfType}`} title="مؤشر الأداء مقارنة بأمس">
              {perfType === 'up' && <TrendingUp size={13} aria-hidden="true" />}
              {perfType === 'down' && <TrendingDown size={13} aria-hidden="true" />}
              {perfType === 'initial' && <TrendingUp size={13} aria-hidden="true" />}
              {perfType === 'neutral' && <Minus size={13} aria-hidden="true" />}
              <span className="sales-perf-text">
                {perfType === 'up' && `+${perfDiffPercent?.toFixed(1)}% عن أمس`}
                {perfType === 'down' && `-${perfDiffPercent?.toFixed(1)}% عن أمس`}
                {perfType === 'initial' && 'بداية مبيعات اليوم'}
                {perfType === 'neutral' && '0.0% عن أمس'}
              </span>
            </div>
          </div>

          <div className="sales-kpi-card-body">
            <MoneyDisplay value={todayAmount} currency className="sales-kpi-amount" />
          </div>

          <div className="sales-kpi-footer">
            <span className="sales-kpi-count-badge">
              <span className="sales-kpi-count-label">الفواتير</span>
              <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(todayCount)}</bdi>
            </span>
            {todayCount > 0 && (
              <span className="sales-kpi-avg">
                <span className="sales-kpi-avg-label">متوسط الفاتورة</span>
                <MoneyDisplay value={todayAmount / todayCount} className="sales-kpi-avg-val" />
              </span>
            )}
          </div>
        </div>

        {/* 2. كارت أمس (القسم الأصغر - Reference Card) */}
        <div className="sales-kpi-card sales-kpi-card-yesterday metric-card">
          <div className="sales-kpi-card-header">
            <div className="sales-kpi-title-group">
              <span className="sales-kpi-icon-wrap sales-kpi-icon-yesterday" aria-hidden="true">
                <Calendar size={15} />
              </span>
              <div className="sales-kpi-heading-text">
                <h3 className="sales-kpi-title">مبيعات أمس</h3>
                <span className="sales-kpi-date">({yesterdayDate})</span>
              </div>
            </div>
          </div>

          <div className="sales-kpi-card-body">
            <MoneyDisplay value={yesterdayAmount} currency className="sales-kpi-amount sales-kpi-amount-secondary" />
          </div>

          <div className="sales-kpi-footer">
            <span className="sales-kpi-count-badge">
              <span className="sales-kpi-count-label">الفواتير</span>
              <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(yesterdayCount)}</bdi>
            </span>
            {yesterdayCount > 0 && (
              <span className="sales-kpi-avg">
                <span className="sales-kpi-avg-label">متوسط الفاتورة</span>
                <MoneyDisplay value={yesterdayAmount / yesterdayCount} className="sales-kpi-avg-val" />
              </span>
            )}
          </div>
        </div>
      </div>
    </HomeSection>
  );
}

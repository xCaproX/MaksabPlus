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
        {/* 1. كارت اليوم (القسم الأكبر - Hero Card: توزيع ثلاثي متوازن) */}
        <div className="sales-kpi-card sales-kpi-card-today metric-card metric-card-primary">
          <div className="sales-kpi-layout-today">
            {/* الكتلة الأولى (اليمين): الأيقونة والاسم والتاريخ */}
            <div className="sales-kpi-col-identity">
              <div className="sales-kpi-title-row">
                <span className="sales-kpi-icon-wrap" aria-hidden="true">
                  <ShoppingCart size={15} />
                </span>
                <h3 className="sales-kpi-title">مبيعات اليوم</h3>
              </div>
              <span className="sales-kpi-date">({todayDate})</span>
            </div>

            {/* الكتلة الثانية (الوسط): المبلغ وعدد الفواتير */}
            <div className="sales-kpi-col-metric">
              <MoneyDisplay value={todayAmount} currency className="sales-kpi-amount" />
              <div className="sales-kpi-meta">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الفواتير</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(todayCount)}</bdi>
                </span>
              </div>
            </div>

            {/* الكتلة الثالثة (اليسار): جزء مستقطع لمؤشر الأداء */}
            <div className={`sales-kpi-col-perf sales-perf-${perfType}`} title="مؤشر الأداء مقارنة بأمس">
              <div className="sales-perf-stat">
                {perfType === 'up' && <TrendingUp size={14} aria-hidden="true" />}
                {perfType === 'down' && <TrendingDown size={14} aria-hidden="true" />}
                {perfType === 'initial' && <TrendingUp size={14} aria-hidden="true" />}
                {perfType === 'neutral' && <Minus size={14} aria-hidden="true" />}
                <span className="sales-perf-val" dir="ltr">
                  {perfType === 'up' && `+${perfDiffPercent?.toFixed(1)}%`}
                  {perfType === 'down' && `-${perfDiffPercent?.toFixed(1)}%`}
                  {perfType === 'initial' && 'جديد'}
                  {perfType === 'neutral' && '0.0%'}
                </span>
              </div>
              <span className="sales-perf-sublabel">
                {perfType === 'initial' ? 'بداية اليوم' : 'عن أمس'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. كارت أمس (القسم الأصغر - Reference Card: كتلتان بدون مؤشر الأداء) */}
        <div className="sales-kpi-card sales-kpi-card-yesterday metric-card">
          <div className="sales-kpi-layout-yesterday">
            {/* الكتلة الأولى (اليمين): الأيقونة والاسم والتاريخ */}
            <div className="sales-kpi-col-identity">
              <div className="sales-kpi-title-row">
                <span className="sales-kpi-icon-wrap sales-kpi-icon-yesterday" aria-hidden="true">
                  <Calendar size={15} />
                </span>
                <h3 className="sales-kpi-title">مبيعات أمس</h3>
              </div>
              <span className="sales-kpi-date">({yesterdayDate})</span>
            </div>

            {/* الكتلة الثانية (اليسار): المبلغ وعدد الفواتير */}
            <div className="sales-kpi-col-metric">
              <MoneyDisplay value={yesterdayAmount} currency className="sales-kpi-amount sales-kpi-amount-secondary" />
              <div className="sales-kpi-meta">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الفواتير</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(yesterdayCount)}</bdi>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}

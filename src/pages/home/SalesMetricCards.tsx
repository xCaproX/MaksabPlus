import { useMemo } from 'react';
import { ShoppingCart, Calendar, TrendingUp, TrendingDown, Minus, ArrowDownLeft } from 'lucide-react';
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

export interface DashboardCollections {
  today: number;
  today_count: number;
  yesterday?: number;
  yesterday_count?: number;
}

interface SalesMetricCardsProps {
  sales: DashboardSales | null;
  collections?: DashboardCollections | null;
  sparklines?: {
    week?: number[];
    month?: number[];
  };
}

function computePerf(today: number, yesterday: number) {
  let diffPercent: number | null = null;
  let type: 'up' | 'down' | 'neutral' | 'initial';

  if (yesterday > 0) {
    const diff = ((today - yesterday) / yesterday) * 100;
    diffPercent = Math.abs(diff);
    if (diff > 0.05) {
      type = 'up';
    } else if (diff < -0.05) {
      type = 'down';
    } else {
      type = 'neutral';
    }
  } else if (today > 0) {
    type = 'initial';
  } else {
    type = 'neutral';
  }

  return { diffPercent, type };
}

export default function SalesMetricCards({ sales, collections }: SalesMetricCardsProps) {
  const todayDate = useMemo(() => formatFullArabicDate(new Date()), []);
  const yesterdayDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatFullArabicDate(d);
  }, []);

  if (!sales && !collections) return null;

  // Sales metrics
  const todaySalesAmount = Number(sales?.today ?? 0);
  const yesterdaySalesAmount = Number(sales?.yesterday ?? 0);
  const todaySalesCount = Number(sales?.today_count ?? 0);
  const yesterdaySalesCount = Number(sales?.yesterday_count ?? 0);
  const salesPerf = computePerf(todaySalesAmount, yesterdaySalesAmount);

  // Collections metrics
  const todayCollAmount = Number(collections?.today ?? 0);
  const yesterdayCollAmount = Number(collections?.yesterday ?? 0);
  const todayCollCount = Number(collections?.today_count ?? 0);
  const yesterdayCollCount = Number(collections?.yesterday_count ?? 0);
  const collPerf = computePerf(todayCollAmount, yesterdayCollAmount);

  const hasSales = Boolean(sales);
  const hasCollections = Boolean(collections);

  return (
    <HomeSection title="المبيعات والتحصيلات" icon={ShoppingCart}>
      <div className="home-sales-grid">
        {/* 1. مجموعة اليوم (Hero Group: كارتان توأم لمبيعات وتحصيلات النهاردة) */}
        <div className="home-pulse-group home-pulse-group-today">
          {hasSales && (
            <div className="sales-kpi-card sales-kpi-card-today metric-card metric-card-primary">
              <div className="sales-kpi-card-header">
                <div className="sales-kpi-title-group">
                  <span className="sales-kpi-icon-wrap" aria-hidden="true">
                    <ShoppingCart size={15} />
                  </span>
                  <div className="sales-kpi-heading-text">
                    <h3 className="sales-kpi-title">مبيعات النهاردة</h3>
                    <span className="sales-kpi-date">({todayDate})</span>
                  </div>
                </div>

                <div className={`sales-perf-badge sales-perf-${salesPerf.type}`} title="مؤشر مبيعات النهاردة مقارنة بأمس">
                  {salesPerf.type === 'up' && <TrendingUp size={13} aria-hidden="true" />}
                  {salesPerf.type === 'down' && <TrendingDown size={13} aria-hidden="true" />}
                  {salesPerf.type === 'initial' && <TrendingUp size={13} aria-hidden="true" />}
                  {salesPerf.type === 'neutral' && <Minus size={13} aria-hidden="true" />}
                  <span className="sales-perf-text">
                    {salesPerf.type === 'up' && (
                      <><bdi dir="ltr">{`+${salesPerf.diffPercent?.toFixed(1)}%`}</bdi> عن أمس</>
                    )}
                    {salesPerf.type === 'down' && (
                      <><bdi dir="ltr">{`-${salesPerf.diffPercent?.toFixed(1)}%`}</bdi> عن أمس</>
                    )}
                    {salesPerf.type === 'initial' && 'بداية مبيعات النهاردة'}
                    {salesPerf.type === 'neutral' && (
                      <><bdi dir="ltr">0.0%</bdi> عن أمس</>
                    )}
                  </span>
                </div>
              </div>

              <div className="sales-kpi-card-body">
                <MoneyDisplay value={todaySalesAmount} currency className="sales-kpi-amount" />
              </div>

              <div className="sales-kpi-footer">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الفواتير</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(todaySalesCount)}</bdi>
                </span>
              </div>
            </div>
          )}

          {hasCollections && (
            <div className="sales-kpi-card sales-kpi-card-collections-today metric-card metric-card-success">
              <div className="sales-kpi-card-header">
                <div className="sales-kpi-title-group">
                  <span className="sales-kpi-icon-wrap sales-kpi-icon-collections" aria-hidden="true">
                    <ArrowDownLeft size={16} />
                  </span>
                  <div className="sales-kpi-heading-text">
                    <h3 className="sales-kpi-title">تحصيلات النهاردة</h3>
                    <span className="sales-kpi-date">({todayDate})</span>
                  </div>
                </div>

                <div className={`sales-perf-badge sales-perf-${collPerf.type}`} title="مؤشر تحصيلات النهاردة مقارنة بأمس">
                  {collPerf.type === 'up' && <TrendingUp size={13} aria-hidden="true" />}
                  {collPerf.type === 'down' && <TrendingDown size={13} aria-hidden="true" />}
                  {collPerf.type === 'initial' && <TrendingUp size={13} aria-hidden="true" />}
                  {collPerf.type === 'neutral' && <Minus size={13} aria-hidden="true" />}
                  <span className="sales-perf-text">
                    {collPerf.type === 'up' && (
                      <><bdi dir="ltr">{`+${collPerf.diffPercent?.toFixed(1)}%`}</bdi> عن أمس</>
                    )}
                    {collPerf.type === 'down' && (
                      <><bdi dir="ltr">{`-${collPerf.diffPercent?.toFixed(1)}%`}</bdi> عن أمس</>
                    )}
                    {collPerf.type === 'initial' && 'بداية تحصيلات النهاردة'}
                    {collPerf.type === 'neutral' && (
                      <><bdi dir="ltr">0.0%</bdi> عن أمس</>
                    )}
                  </span>
                </div>
              </div>

              <div className="sales-kpi-card-body">
                <MoneyDisplay value={todayCollAmount} currency className="sales-kpi-amount sales-kpi-amount-collections" />
              </div>

              <div className="sales-kpi-footer">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الإيصالات</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(todayCollCount)}</bdi>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2. مجموعة أمس (Reference Group: كارتان مرجعيان لمبيعات وتحصيلات أمس) */}
        <div className="home-pulse-group home-pulse-group-yesterday">
          {hasSales && (
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
                <MoneyDisplay value={yesterdaySalesAmount} currency className="sales-kpi-amount sales-kpi-amount-secondary" />
              </div>

              <div className="sales-kpi-footer">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الفواتير</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(yesterdaySalesCount)}</bdi>
                </span>
              </div>
            </div>
          )}

          {hasCollections && (
            <div className="sales-kpi-card sales-kpi-card-yesterday sales-kpi-card-collections-yesterday metric-card metric-card-success">
              <div className="sales-kpi-card-header">
                <div className="sales-kpi-title-group">
                  <span className="sales-kpi-icon-wrap sales-kpi-icon-collections-yesterday" aria-hidden="true">
                    <ArrowDownLeft size={16} />
                  </span>
                  <div className="sales-kpi-heading-text">
                    <h3 className="sales-kpi-title">تحصيلات أمس</h3>
                    <span className="sales-kpi-date">({yesterdayDate})</span>
                  </div>
                </div>
              </div>

              <div className="sales-kpi-card-body">
                <MoneyDisplay value={yesterdayCollAmount} currency className="sales-kpi-amount sales-kpi-amount-secondary" />
              </div>

              <div className="sales-kpi-footer">
                <span className="sales-kpi-count-badge">
                  <span className="sales-kpi-count-label">الإيصالات</span>
                  <bdi dir="ltr" className="sales-kpi-count-val tabular-nums">{qty(yesterdayCollCount)}</bdi>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </HomeSection>
  );
}

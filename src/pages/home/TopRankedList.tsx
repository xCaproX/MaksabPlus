import type { LucideIcon } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import DashboardCardAction from './DashboardCardAction';

export interface RankedItem {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  unit?: string;
  sublabel?: string;
}

interface TopRankedListProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  items: RankedItem[];
  barVariant: 'items' | 'customers';
  emptyText: string;
  linkTo?: string;
  linkText?: string;
  loading?: boolean;
}

export default function TopRankedList({
  title,
  subtitle,
  icon: Icon,
  items,
  barVariant,
  emptyText,
  linkTo,
  linkText = 'عرض الكل',
  loading = false,
}: TopRankedListProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="dashboard-card chart-container-card">
      <div className="dashboard-card-head">
        <div className="chart-header-titles">
          <h3 className="dashboard-card-title">
            <Icon size={16} className="text-primary" aria-hidden="true" />
            <span>{title}</span>
          </h3>
          {subtitle && <p className="chart-header-subtitle">{subtitle}</p>}
        </div>
        {linkTo && (
          <div className="chart-header-actions">
            <DashboardCardAction to={linkTo} label={linkText} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="chart-loading-state" role="status" style={{ minHeight: 180 }}>
          <RefreshCw className="spin" size={20} />
          <span className="chart-empty-text">جارٍ التحميل…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state-card">
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="ranked-list" role="list">
          {items.map((item, index) => {
            const rank = index + 1;
            const percentage = Math.min(Math.round((item.value / maxValue) * 100), 100);

            return (
              <div key={item.id} className="ranked-item" role="listitem">
                <div className="ranked-item-info">
                  <div className="ranked-item-name-group">
                    <span className={`ranked-badge rank-${rank}`}>
                      <bdi dir="ltr" className="num tabular-nums">{rank}</bdi>
                    </span>
                    <span className="ranked-item-title" title={item.label}>
                      {item.label}
                    </span>
                  </div>

                  <div className="ranked-item-val">
                    <bdi dir="ltr" className="num tabular-nums">
                      {item.formattedValue}
                    </bdi>
                    {item.unit && <span className="kpi-unit">{item.unit}</span>}
                  </div>
                </div>

                <div className="ranked-bar-track">
                  <div
                    className={`ranked-bar-fill bar-fill-${barVariant}${rank === 1 ? ' is-top' : ''}`}
                    style={{ width: `${percentage}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

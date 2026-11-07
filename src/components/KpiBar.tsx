import { LoadingMessage, Skeleton } from './LoadingSkeleton';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface KpiItem {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  subtext?: ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon?: LucideIcon;
  badge?: {
    text: string;
    variant?: 'ok' | 'danger' | 'neutral' | 'info';
  };
}

interface KpiBarProps {
  items: KpiItem[];
  ariaLabel?: string;
  className?: string;
  loading?: boolean;
}

export default function KpiBar({
  items,
  ariaLabel = 'مؤشرات وإجماليات الصفحة',
  className = '',
  loading = false,
}: KpiBarProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`erp-kpi-bar ${className}`.trim()} role="region" aria-label={ariaLabel}>
      {loading && <LoadingMessage>جارٍ تحميل الملخص…</LoadingMessage>}
      <div className="erp-kpi-grid">
        {items.map((item) => {
          const Icon = item.icon;
          const variant = item.variant;

          return (
            <div key={item.id} className={`erp-kpi-card metric-card${variant ? ` metric-card-${variant}` : ''}`}>
              {Icon && (
                <span className="metric-card-icon" aria-hidden="true">
                  <Icon size={24} />
                </span>
              )}
              <div className="kpi-card-content">
                <span className="kpi-card-label" title={item.label}>
                  {item.label}
                </span>
                <div className="kpi-card-body">
                  {loading ? <Skeleton width="5rem" /> : (
                    <div className="kpi-value-group">
                      <bdi dir="ltr" className="kpi-value num tabular-nums">
                        {item.value}
                      </bdi>
                      {item.unit && <span className="kpi-unit">{item.unit}</span>}
                    </div>
                  )}
                </div>
                {!loading && (item.subtext || item.badge) && (
                  <div className="kpi-card-footer">
                    {item.badge && (
                      <span className={`badge ${item.badge.variant ?? 'neutral'}`}>
                        {item.badge.text}
                      </span>
                    )}
                    {item.subtext && <span className="kpi-subtext">{item.subtext}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

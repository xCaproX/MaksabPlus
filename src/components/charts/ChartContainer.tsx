import { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RefreshCw, Inbox } from 'lucide-react';

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  height?: number | string;
  className?: string;
}

export default function ChartContainer({
  title,
  subtitle,
  icon: Icon,
  actions,
  loading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyMessage = 'لا توجد بيانات كافية لعرض الرسم البياني',
  children,
  height = 280,
  className = '',
}: ChartContainerProps) {
  const chartHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className={`dashboard-card chart-container-card ${className}`.trim()}>
      <div className="dashboard-card-head">
        <div className="chart-header-titles">
          <h3 className="dashboard-card-title">
            {Icon && <Icon size={16} className="text-primary" aria-hidden="true" />}
            <span>{title}</span>
          </h3>
          {subtitle && <p className="chart-header-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="chart-header-actions">{actions}</div>}
      </div>

      <div className="chart-body" style={{ minHeight: chartHeight, height: chartHeight, position: 'relative' }}>
        {loading ? (
          <div className="chart-loading-state" aria-busy="true" aria-label="جارٍ تحميل الرسم البياني">
            <div className="skeleton chart-skeleton" style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-sm, 8px)' }} />
          </div>
        ) : error ? (
          <div className="chart-error-state" role="alert">
            <p>{error}</p>
            {onRetry && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
                <RefreshCw size={13} style={{ marginInlineEnd: 4 }} />
                إعادة المحاولة
              </button>
            )}
          </div>
        ) : isEmpty ? (
          <div className="chart-empty-state">
            <Inbox size={32} className="text-muted" style={{ opacity: 0.6 }} aria-hidden="true" />
            <p className="chart-empty-text">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

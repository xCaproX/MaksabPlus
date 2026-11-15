import type { ElementType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ElementType;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface EmptyStateProps {
  icon?: ElementType | null;
  title: string;
  description?: ReactNode;
  action?: EmptyStateAction;
  compact?: boolean;
  className?: string;
  role?: 'alert' | 'status';
  /**
   * عند تمرير colSpan، يتم تغليف المكوّن تلقائياً داخل <tr> و <td> ليناسب جداول HTML
   */
  colSpan?: number;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className = '',
  role,
  colSpan,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  const actionVariantClass =
    action?.variant === 'primary' ? 'primary' : action?.variant === 'ghost' ? 'ghost' : '';

  const content = (
    <div
      role={role}
      className={`empty-state ${compact ? 'is-compact' : ''} ${className}`.trim()}
    >
      {Icon && (
        <div className="empty-state-icon" aria-hidden="true">
          <Icon className="empty-state-icon-svg" />
        </div>
      )}
      <div className="empty-state-text">
        <h3 className="empty-state-title">{title}</h3>
        {description && <p className="empty-state-description">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`btn ${actionVariantClass} compact empty-state-action`.trim()}
        >
          {ActionIcon && <ActionIcon className="empty-state-action-icon" aria-hidden="true" />}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );

  if (colSpan !== undefined) {
    return (
      <tr className="empty-state-row">
        <td colSpan={colSpan} className="empty-state-cell">
          {content}
        </td>
      </tr>
    );
  }

  return content;
}

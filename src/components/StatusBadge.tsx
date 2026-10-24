import type { ReactNode } from 'react';

export type StatusBadgeVariant =
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'linked'
  | 'free'
  | 'neutral';

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
}

export default function StatusBadge({ variant, children, className = '' }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge-${variant} ${className}`.trim()}>
      {children}
    </span>
  );
}

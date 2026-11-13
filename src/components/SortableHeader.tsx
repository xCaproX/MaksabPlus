import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  onSort: (nextSort: string) => void;
  ascSuffix?: string;
  descSuffix?: string;
  defaultDirection?: 'asc' | 'desc';
  className?: string;
  align?: 'start' | 'center' | 'end';
  children?: ReactNode;
}

export default function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
  ascSuffix = '-asc',
  descSuffix = '-desc',
  defaultDirection = 'desc',
  className = '',
  align,
  children,
}: SortableHeaderProps) {
  const isAsc = currentSort === `${field}${ascSuffix}`;
  const isDesc = currentSort === `${field}${descSuffix}`;
  const isActive = isAsc || isDesc;
  const direction = isAsc ? 'asc' : isDesc ? 'desc' : undefined;

  function handleClick() {
    if (!isActive) {
      onSort(`${field}${defaultDirection === 'asc' ? ascSuffix : descSuffix}`);
    } else if (direction === 'desc') {
      onSort(`${field}${ascSuffix}`);
    } else {
      onSort(`${field}${descSuffix}`);
    }
  }

  return (
    <th
      className={`sortable-th ${isActive ? 'active' : ''} ${className}`.trim()}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) {
          handleClick();
        }
      }}
    >
      <button
        type="button"
        className={`sortable-header-btn sortable-header-content ${align ? `align-${align}` : ''}`.trim()}
        onClick={handleClick}
        title={`ترتيب حسب ${label}`}
      >
        <span>{children ?? label}</span>
        <span className={`sort-icon-box ${isActive ? 'active' : ''}`} aria-hidden="true">
          {isActive ? (
            direction === 'asc' ? (
              <ArrowUp size={13} className="sort-icon" />
            ) : (
              <ArrowDown size={13} className="sort-icon" />
            )
          ) : (
            <ArrowUpDown size={12} className="sort-icon inactive" />
          )}
        </span>
      </button>
    </th>
  );
}

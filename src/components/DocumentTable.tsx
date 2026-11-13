import { SkeletonRows } from './LoadingSkeleton';
import type { ReactNode } from 'react';
import SortableHeader from './SortableHeader';
import EmptyState from './EmptyState';

export interface DocumentTableColumn<T> {
  key: string;
  header: ReactNode;
  headerClassName?: string;
  render?: (row: T) => ReactNode;
  renderCell?: (row: T) => ReactNode;
  cellClassName?: string | ((row: T) => string | undefined);
  sortField?: string;
  defaultSortDirection?: 'asc' | 'desc';
  align?: 'start' | 'center' | 'end';
}

export interface DocumentTableProps<T extends { id: string }> {
  className?: string;
  columns: DocumentTableColumn<T>[];
  rows: T[];
  loading: boolean;
  columnFilter?: ReactNode;
  sortOrder?: string;
  onSort?: (sort: string) => void;
  onView: (row: T) => void;
  renderRowActions?: (row: T) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
}

export default function DocumentTable<T extends { id: string }>({
  className = 'table erp-table document-table',
  columns,
  rows,
  loading,
  columnFilter,
  sortOrder,
  onSort,
  onView,
  renderRowActions,
  emptyTitle,
  emptyDescription,
}: DocumentTableProps<T>) {
  const totalCols = columns.length + (renderRowActions ? 1 : 0);

  return (
    <table className={className}>
      <thead>
        <tr>
          {columns.map((col) => {
            if (col.sortField && sortOrder && onSort) {
              return (
                <SortableHeader
                  key={col.key}
                  label={typeof col.header === 'string' ? col.header : ''}
                  field={col.sortField}
                  currentSort={sortOrder}
                  onSort={onSort}
                  defaultDirection={col.defaultSortDirection ?? 'desc'}
                  className={col.headerClassName}
                  align={col.align}
                >
                  {typeof col.header !== 'string' ? col.header : undefined}
                </SortableHeader>
              );
            }
            return (
              <th key={col.key} className={col.headerClassName}>
                {col.header}
              </th>
            );
          })}
          {renderRowActions && <th key="_actions" aria-label="الإجراءات" />}
        </tr>
        {columnFilter}
      </thead>
      <tbody>
        {loading && <SkeletonRows columns={totalCols} />}
        {!loading && rows.length === 0 && (
          <EmptyState
            colSpan={totalCols}
            title={emptyTitle}
            description={emptyDescription}
          />
        )}
        {!loading &&
          rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onView(row)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onView(row);
                }
              }}
            >
              {columns.map((col) => {
                if (col.renderCell) {
                  return col.renderCell(row);
                }
                const cellClass =
                  typeof col.cellClassName === 'function'
                    ? col.cellClassName(row)
                    : col.cellClassName;
                const cellContent = col.render ? col.render(row) : null;
                return (
                  <td key={col.key} className={cellClass}>
                    {col.key === 'number' ? (
                      <button
                        type="button"
                        className="table-record-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onView(row);
                        }}
                      >
                        {cellContent}
                      </button>
                    ) : (
                      cellContent
                    )}
                  </td>
                );
              })}
              {renderRowActions && (
                <td
                  className="row-actions erp-row-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  {renderRowActions(row)}
                </td>
              )}
            </tr>
          ))}
      </tbody>
    </table>
  );
}

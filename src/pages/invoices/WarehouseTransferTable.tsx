import { useMemo, type ReactNode } from 'react';
import { creationTime, qty as formatQty } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import RowActions from '../../components/RowActions';
import DocumentTable, { type DocumentTableColumn } from '../../components/DocumentTable';
import type { WarehouseTransferRow } from '../../lib/types';
import type { SaleSort } from './InvoiceTable';

interface WarehouseTransferTableProps {
  columnFilter?: ReactNode;
  loading: boolean;
  pageTransfers: WarehouseTransferRow[];
  sortOrder: SaleSort;
  onSort: (s: SaleSort) => void;
  showDeleted: boolean;
  onView: (transfer: WarehouseTransferRow) => void;
  onEdit: (transfer: WarehouseTransferRow) => void;
  onDelete: (transfer: WarehouseTransferRow) => void;
  onRestore: (transfer: WarehouseTransferRow) => void;
  canEdit: boolean;
  canDelete: boolean;
  canViewProfit: boolean;
}

export default function WarehouseTransferTable({
  columnFilter,
  loading,
  pageTransfers,
  sortOrder,
  onSort,
  showDeleted,
  onView,
  onEdit,
  onDelete,
  onRestore,
  canEdit,
  canDelete,
  canViewProfit,
}: WarehouseTransferTableProps) {
  const columns = useMemo<DocumentTableColumn<WarehouseTransferRow>[]>(() => {
    const cols: DocumentTableColumn<WarehouseTransferRow>[] = [
      {
        key: 'number',
        header: 'الرقم',
        sortField: 'number',
        headerClassName: 'col-number',
        cellClassName: 'col-number strong',
        render: (transfer) => (
          <bdi dir="ltr" className="tabular-nums">
            {transfer.number}
          </bdi>
        ),
      },
      {
        key: 'date',
        header: 'التاريخ',
        sortField: 'date',
        headerClassName: 'col-date',
        cellClassName: 'col-date',
        render: (transfer) => <DateDisplay value={transfer.transfer_date} />,
      },
      {
        key: 'time',
        header: 'الوقت',
        headerClassName: 'col-time',
        cellClassName: 'col-time',
        render: (transfer) => (
          <bdi dir="ltr" className="tabular-nums">
            {creationTime(transfer.created_at)}
          </bdi>
        ),
      },
      {
        key: 'source_warehouse',
        header: 'من مخزن',
        render: (transfer) => transfer.source_warehouse_name,
      },
      {
        key: 'destination_warehouse',
        header: 'إلى مخزن',
        render: (transfer) => transfer.destination_warehouse_name,
      },
      {
        key: 'line_count',
        header: 'عدد الأصناف',
        headerClassName: 'num',
        cellClassName: 'num',
        render: (transfer) => (
          <bdi dir="ltr" className="tabular-nums">
            {transfer.line_count}
          </bdi>
        ),
      },
      {
        key: 'total_qty',
        header: 'إجمالي الكميات',
        headerClassName: 'num',
        cellClassName: 'num',
        render: (transfer) => (
          <bdi dir="ltr" className="tabular-nums">
            {formatQty(transfer.total_qty)}
          </bdi>
        ),
      },
    ];

    if (canViewProfit) {
      cols.push({
        key: 'total_value',
        header: 'قيمة التكلفة',
        sortField: 'total',
        headerClassName: 'num',
        align: 'end',
        render: (transfer) => (
          <MoneyDisplay value={transfer.total_value} strong />
        ),
      });
    }

    cols.push(
      {
        key: 'notes',
        header: 'ملاحظات',
        headerClassName: 'col-notes',
        cellClassName: 'col-notes',
        render: (transfer) => transfer.notes || '—',
      },
      {
        key: 'creator',
        header: 'بواسطة',
        headerClassName: 'col-creator',
        renderCell: (transfer) => (
          <DocumentCreatorCell key="creator" name={transfer.created_by_name} />
        ),
      },
    );

    return cols;
  }, [canViewProfit]);

  return (
    <DocumentTable
      className="table erp-table document-table"
      columns={columns}
      rows={pageTransfers}
      loading={loading}
      columnFilter={columnFilter}
      sortOrder={sortOrder}
      onSort={(s) => onSort(s as SaleSort)}
      onView={onView}
      renderRowActions={(transfer) =>
        showDeleted ? (
          canDelete && (
            <RowActions
              onRestore={() => onRestore(transfer)}
              restoreLabel="استعادة التحويل"
            />
          )
        ) : (
          <RowActions
            onEdit={canEdit ? () => onEdit(transfer) : undefined}
            onDelete={canDelete ? () => onDelete(transfer) : undefined}
          />
        )
      }
      emptyTitle="لا توجد تحويلات مخزنية تطابق البحث أو الفلاتر"
      emptyDescription="جرّب تعديل كلمات البحث أو تصفير الفلاتر المختارة."
    />
  );
}

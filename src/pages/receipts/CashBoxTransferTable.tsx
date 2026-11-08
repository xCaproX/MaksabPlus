import { useMemo, type ReactNode } from 'react';
import { creationTime } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import RowActions from '../../components/RowActions';
import DocumentTable, { type DocumentTableColumn } from '../../components/DocumentTable';
import type { CashBoxTransferRow } from '../../lib/types';
import type { ReceiptSort } from './ReceiptTable';

interface CashBoxTransferTableProps {
  columnFilter?: ReactNode;
  loading: boolean;
  pageTransfers: CashBoxTransferRow[];
  sortOrder: ReceiptSort;
  onSort: (s: ReceiptSort) => void;
  showDeleted: boolean;
  onView: (transfer: CashBoxTransferRow) => void;
  onEdit: (transfer: CashBoxTransferRow) => void;
  onDelete: (transfer: CashBoxTransferRow) => void;
  onRestore: (transfer: CashBoxTransferRow) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function CashBoxTransferTable({
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
}: CashBoxTransferTableProps) {
  const columns = useMemo<DocumentTableColumn<CashBoxTransferRow>[]>(() => [
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
      key: 'source_cash_box',
      header: 'من خزنة',
      render: (transfer) => transfer.source_cash_box_name,
    },
    {
      key: 'destination_cash_box',
      header: 'إلى خزنة',
      render: (transfer) => transfer.destination_cash_box_name,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      sortField: 'amount',
      headerClassName: 'num',
      align: 'end',
      render: (transfer) => (
        <MoneyDisplay value={transfer.amount} strong />
      ),
    },
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
  ], []);

  return (
    <DocumentTable
      className="table erp-table document-table"
      columns={columns}
      rows={pageTransfers}
      loading={loading}
      columnFilter={columnFilter}
      sortOrder={sortOrder}
      onSort={(s) => onSort(s as ReceiptSort)}
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
      emptyTitle="لا توجد تحويلات تطابق البحث أو الفلاتر"
      emptyDescription="جرّب تعديل كلمات البحث أو تصفير الفلاتر المختارة."
    />
  );
}

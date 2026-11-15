import { useMemo, type ReactNode } from 'react';
import { accountKindLabel, creationTime, receiptTypeLabel } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import StatusBadge from '../../components/StatusBadge';
import RowActions from '../../components/RowActions';
import DocumentTable, { type DocumentTableColumn } from '../../components/DocumentTable';
import type { ReceiptRow } from '../../lib/types';

export type ReceiptSort =
  | 'date-desc'
  | 'date-asc'
  | 'number-desc'
  | 'number-asc'
  | 'amount-desc'
  | 'amount-asc'
  | 'account-asc'
  | 'account-desc';

interface ReceiptTableProps {
  columnFilter?: ReactNode;
  loading: boolean;
  pageReceipts: ReceiptRow[];
  sortOrder: ReceiptSort;
  onSort: (s: ReceiptSort) => void;
  showDeleted: boolean;
  onView: (receipt: ReceiptRow) => void;
  onEdit: (receipt: ReceiptRow) => void;
  onDelete: (receipt: ReceiptRow) => void;
  onRestore: (receipt: ReceiptRow) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ReceiptTable({
  columnFilter,
  loading,
  pageReceipts,
  sortOrder,
  onSort,
  showDeleted,
  onView,
  onEdit,
  onDelete,
  onRestore,
  canEdit,
  canDelete,
}: ReceiptTableProps) {
  const columns = useMemo<DocumentTableColumn<ReceiptRow>[]>(() => [
    {
      key: 'number',
      header: 'الرقم',
      sortField: 'number',
      headerClassName: 'col-number',
      cellClassName: 'col-number strong',
      render: (receipt) => (
        <bdi dir="ltr" className="tabular-nums">
          {receipt.number}
        </bdi>
      ),
    },
    {
      key: 'date',
      header: 'التاريخ',
      sortField: 'date',
      headerClassName: 'col-date',
      cellClassName: 'col-date',
      render: (receipt) => <DateDisplay value={receipt.receipt_date} />,
    },
    {
      key: 'time',
      header: 'الوقت',
      headerClassName: 'col-time',
      cellClassName: 'col-time',
      render: (receipt) => (
        <bdi dir="ltr" className="tabular-nums">
          {creationTime(receipt.created_at)}
        </bdi>
      ),
    },
    {
      key: 'cash_box',
      header: 'الخزنة',
      headerClassName: 'col-location',
      cellClassName: 'col-location',
      render: (receipt) => receipt.cash_box_name,
    },
    {
      key: 'account_kind',
      header: 'نوع الحساب',
      headerClassName: 'col-kind',
      cellClassName: 'col-kind',
      render: (receipt) => accountKindLabel(receipt.account_kind),
    },
    {
      key: 'account',
      header: 'الحساب',
      sortField: 'account',
      defaultSortDirection: 'asc',
      headerClassName: 'col-account',
      cellClassName: 'col-account',
      render: (receipt) => receipt.account_name,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      sortField: 'amount',
      headerClassName: 'col-money',
      cellClassName: 'col-money',
      render: (receipt) => <MoneyDisplay value={receipt.amount} strong />,
    },
    {
      key: 'receipt_type',
      header: 'نوع الإيصال',
      headerClassName: 'col-receipt-type',
      cellClassName: 'col-receipt-type',
      render: (receipt) => (
        <StatusBadge variant={receipt.is_free ? 'free' : 'linked'}>
          {receiptTypeLabel(receipt.is_free)}
        </StatusBadge>
      ),
    },
    {
      key: 'statement',
      header: 'البيان',
      headerClassName: 'col-notes',
      cellClassName: 'col-notes',
      render: (receipt) => receipt.statement || '—',
    },
    {
      key: 'notes',
      header: 'ملاحظات',
      headerClassName: 'col-notes',
      cellClassName: 'col-notes',
      render: (receipt) => receipt.notes || '—',
    },
    {
      key: 'creator',
      header: 'بواسطة',
      headerClassName: 'col-creator',
      renderCell: (receipt) => (
        <DocumentCreatorCell key="creator" name={receipt.created_by_name} />
      ),
    },
  ], []);

  return (
    <DocumentTable
      className="table erp-table document-table document-table--receipts"
      columns={columns}
      rows={pageReceipts}
      loading={loading}
      columnFilter={columnFilter}
      sortOrder={sortOrder}
      onSort={(s) => onSort(s as ReceiptSort)}
      onView={onView}
      renderRowActions={(receipt) =>
        !receipt.is_free
          ? null
          : showDeleted
            ? canDelete
              ? (
                <RowActions
                  onRestore={() => onRestore(receipt)}
                  restoreLabel="استعادة الإيصال"
                />
              )
              : null
            : (
              <RowActions
                onEdit={canEdit ? () => onEdit(receipt) : undefined}
                onDelete={canDelete ? () => onDelete(receipt) : undefined}
              />
            )
      }
      emptyTitle="لا توجد إيصالات تطابق الفلاتر"
      emptyDescription="جرّب تعديل الفلاتر المختارة أو تصفيرها."
    />
  );
}

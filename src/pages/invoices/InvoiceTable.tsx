import { useMemo, type ReactNode } from 'react';
import { accountKindLabel, creationTime, saleStatus, saleStatusLabel } from '../../lib/format';
import DateDisplay from '../../components/DateDisplay';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import StatusBadge from '../../components/StatusBadge';
import RowActions from '../../components/RowActions';
import DocumentTable, { type DocumentTableColumn } from '../../components/DocumentTable';
import type { InvoiceRow } from '../../lib/types';
import type { InvoiceTab } from './invoiceKpis';

export type SaleSort =
  | 'date-desc'
  | 'date-asc'
  | 'number-desc'
  | 'number-asc'
  | 'total-desc'
  | 'total-asc'
  | 'account-asc'
  | 'account-desc'
  | 'remaining-desc'
  | 'remaining-asc';

interface InvoiceTableProps {
  columnFilter?: ReactNode;
  loading: boolean;
  pageInvoices: InvoiceRow[];
  kind: InvoiceTab;
  partyHeader: string;
  sortOrder: SaleSort;
  onSort: (s: SaleSort) => void;
  showDeleted: boolean;
  newLabel: string;
  isReturn: boolean;
  onView: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => void;
  onRestore: (invoice: InvoiceRow) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function InvoiceTable({
  columnFilter,
  loading,
  pageInvoices,
  kind,
  partyHeader: _partyHeader,
  sortOrder,
  onSort,
  showDeleted,
  newLabel,
  isReturn,
  onView,
  onEdit,
  onDelete,
  onRestore,
  canEdit,
  canDelete,
}: InvoiceTableProps) {
  const isWaste = kind === 'waste';

  const columns = useMemo<DocumentTableColumn<InvoiceRow>[]>(() => {
    const cols: DocumentTableColumn<InvoiceRow>[] = [
      {
        key: 'number',
        header: 'الرقم',
        sortField: 'number',
        headerClassName: 'col-number',
        cellClassName: 'col-number strong',
        render: (invoice) => (
          <bdi dir="ltr" className="tabular-nums">
            {invoice.number}
          </bdi>
        ),
      },
      {
        key: 'date',
        header: 'التاريخ',
        sortField: 'date',
        headerClassName: 'col-date',
        cellClassName: 'col-date',
        render: (invoice) => <DateDisplay value={invoice.invoice_date} />,
      },
      {
        key: 'time',
        header: 'الوقت',
        headerClassName: 'col-time',
        cellClassName: 'col-time',
        render: (invoice) => (
          <bdi dir="ltr" className="tabular-nums">
            {creationTime(invoice.created_at)}
          </bdi>
        ),
      },
      {
        key: 'warehouse',
        header: 'المخزن',
        headerClassName: 'col-location',
        cellClassName: 'col-location',
        render: (invoice) => invoice.warehouse_name,
      },
      {
        key: 'account_kind',
        header: 'نوع الحساب',
        headerClassName: 'col-kind',
        cellClassName: 'col-kind',
        render: (invoice) => accountKindLabel(invoice.account_kind),
      },
      {
        key: 'account',
        header: 'الحساب',
        sortField: 'account',
        defaultSortDirection: 'asc',
        headerClassName: 'col-account',
        cellClassName: 'col-account',
        render: (invoice) => invoice.account_name,
      },
      {
        key: 'total',
        header: 'الإجمالي',
        sortField: 'total',
        headerClassName: 'num',
        align: 'end',
        render: (invoice) => <MoneyDisplay value={invoice.total} strong />,
      },
    ];

    if (!isWaste) {
      cols.push(
        {
          key: 'paid',
          header: isReturn ? 'المسترد' : 'المسدد',
          headerClassName: 'col-money',
          cellClassName: 'col-money',
          render: (invoice) => <MoneyDisplay value={invoice.paid} />,
        },
        {
          key: 'remaining',
          header: isReturn ? 'غير المسترد' : 'الآجل',
          sortField: 'remaining',
          headerClassName: 'num',
          align: 'end',
          render: (invoice) => <MoneyDisplay value={invoice.remaining} />,
        },
        {
          key: 'status',
          header: 'الحالة',
          headerClassName: 'col-status',
          cellClassName: 'col-status',
          render: (invoice) => {
            const status = saleStatus(invoice);
            return (
              <StatusBadge variant={status}>
                {saleStatusLabel(status, isReturn)}
              </StatusBadge>
            );
          },
        },
      );
    }

    cols.push(
      {
        key: 'notes',
        header: 'ملاحظات',
        headerClassName: 'col-notes',
        cellClassName: 'col-notes',
        render: (invoice) => invoice.notes || '—',
      },
      {
        key: 'creator',
        header: 'بواسطة',
        headerClassName: 'col-creator',
        renderCell: (invoice) => (
          <DocumentCreatorCell key="creator" name={invoice.created_by_name} />
        ),
      },
    );

    return cols;
  }, [isWaste, isReturn]);

  return (
    <DocumentTable
      className={`table erp-table document-table document-table--invoices${isReturn ? ' document-table--returns' : ''}`}
      columns={columns}
      rows={pageInvoices}
      loading={loading}
      columnFilter={columnFilter}
      sortOrder={sortOrder}
      onSort={(s) => onSort(s as SaleSort)}
      onView={onView}
      renderRowActions={(invoice) =>
        showDeleted ? (
          canDelete && (
            <RowActions
              onRestore={() => onRestore(invoice)}
              restoreLabel={`استعادة ${newLabel}`}
            />
          )
        ) : (
          <RowActions
            onEdit={canEdit ? () => onEdit(invoice) : undefined}
            onDelete={canDelete ? () => onDelete(invoice) : undefined}
          />
        )
      }
      emptyTitle="لا توجد فواتير تطابق البحث أو الفلاتر"
      emptyDescription="جرّب تعديل كلمات البحث أو تصفير الفلاتر المختارة."
    />
  );
}

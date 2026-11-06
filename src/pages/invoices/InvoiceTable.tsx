import { accountKindLabel, creationTime, formatDate } from '../../lib/format';
import MoneyDisplay from '../../components/MoneyDisplay';
import SortableHeader from '../../components/SortableHeader';
import StatusBadge from '../../components/StatusBadge';
import RowActions from '../../components/RowActions';
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

export type SaleStatus = 'all' | 'paid' | 'partial' | 'unpaid';

export function saleStatus(invoice: InvoiceRow): Exclude<SaleStatus, 'all'> {
  if (Number(invoice.remaining) <= 0) return 'paid';
  if (Number(invoice.paid) > 0) return 'partial';
  return 'unpaid';
}

export function saleStatusLabel(status: Exclude<SaleStatus, 'all'>, isReturn = false): string {
  if (isReturn) {
    return status === 'paid' ? 'مستردة بالكامل' : status === 'partial' ? 'مستردة جزئيًا' : 'غير مستردة';
  }
  return status === 'paid' ? 'مسددة' : status === 'partial' ? 'جزئية' : 'غير مسددة';
}

interface InvoiceTableProps {
  loading: boolean;
  pageInvoices: InvoiceRow[];
  kind: InvoiceTab;
  partyHeader: string;
  sortOrder: SaleSort;
  onSort: (s: SaleSort) => void;
  canViewProfit: boolean;
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
  loading,
  pageInvoices,
  kind,
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
  return (
    <table className="table erp-table document-table">
      <thead>
        <tr>
          <SortableHeader
            label="الرقم"
            field="number"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <SortableHeader
            label="التاريخ"
            field="date"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <th className="col-time">الوقت</th>
          <th className="col-location">المخزن</th>
          <th className="col-kind">نوع الحساب</th>
          <SortableHeader label="الحساب" field="account" defaultDirection="asc" currentSort={sortOrder}
            className="col-account" onSort={(s) => onSort(s as SaleSort)} />
          <SortableHeader
            label="الإجمالي"
            field="total"
            align="end"
            className="num"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          {kind !== 'waste' && <th className="col-money">{isReturn ? 'المسترد' : 'المسدد'}</th>}
          {kind !== 'waste' && (
            <SortableHeader
              label={isReturn ? 'غير المسترد' : 'الآجل'}
              field="remaining"
              align="end"
              className="num"
              currentSort={sortOrder}
              onSort={(s) => onSort(s as SaleSort)}
            />
          )}
          {kind !== 'waste' && <th className="col-status">الحالة</th>}
          <th className="col-notes">ملاحظات</th>
          <th aria-label="الإجراءات" />
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={kind === 'waste' ? 9 : 12} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageInvoices.length === 0 && (
          <tr>
            <td colSpan={kind === 'waste' ? 9 : 12} className="empty">
              لا توجد فواتير تطابق البحث أو الفلاتر.
            </td>
          </tr>
        )}
        {!loading &&
          pageInvoices.map((invoice) => {
            const status = saleStatus(invoice);
            return (
              <tr
                key={invoice.id}
                tabIndex={0}
                onClick={() => onView(invoice)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onView(invoice);
                  }
                }}
              >
                <td className="col-number strong"><bdi dir="ltr" className="tabular-nums">{invoice.number}</bdi></td>
                <td className="col-date"><bdi dir="ltr" className="tabular-nums">{formatDate(invoice.invoice_date)}</bdi></td>
                <td className="col-time"><bdi dir="ltr" className="tabular-nums">{creationTime(invoice.created_at)}</bdi></td>
                <td className="col-location">{invoice.warehouse_name}</td>
                <td className="col-kind">{accountKindLabel(invoice.account_kind)}</td>
                <td className="col-account">{invoice.account_name}</td>
                <td><MoneyDisplay value={invoice.total} strong /></td>
                {kind !== 'waste' && <td className="col-money"><MoneyDisplay value={invoice.paid} /></td>}
                {kind !== 'waste' && (
                  <td>
                    <MoneyDisplay
                      value={invoice.remaining}
                      strong={Number(invoice.remaining) > 0}
                      className={Number(invoice.remaining) > 0 ? 'remaining' : ''}
                    />
                  </td>
                )}
                {kind !== 'waste' && <td className="col-status"><StatusBadge variant={status}>{saleStatusLabel(status, isReturn)}</StatusBadge></td>}
                <td className="col-notes">{invoice.notes || '—'}</td>
                <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                  {showDeleted ? (
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
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

import { formatDate, money } from '../../lib/format';
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
  partyHeader,
  sortOrder,
  onSort,
  canViewProfit,
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
    <table className="table erp-table">
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
          <SortableHeader
            label={partyHeader}
            field="account"
            defaultDirection="asc"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <th>المخزن</th>
          <SortableHeader
            label="الإجمالي"
            field="total"
            align="end"
            className="num"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          {(kind === 'sale' || kind === 'sale_return') && canViewProfit && (
            <th className="num">الربح</th>
          )}
          {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && (
            <th className="num">{kind === 'waste' ? 'الخسارة' : 'التكلفة'}</th>
          )}
          {kind !== 'waste' && <th>{isReturn ? 'الاسترداد' : 'السداد'}</th>}
          {kind !== 'waste' && (
            <SortableHeader
              label={isReturn ? 'غير المسترد' : 'المتبقي'}
              field="remaining"
              align="end"
              className="num"
              currentSort={sortOrder}
              onSort={(s) => onSort(s as SaleSort)}
            />
          )}
          <th aria-label="الإجراءات" />
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={10} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageInvoices.length === 0 && (
          <tr>
            <td colSpan={10} className="empty">
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
                <td className="num strong">{invoice.number}</td>
                <td className="num">{formatDate(invoice.invoice_date)}</td>
                <td>{invoice.account_name}</td>
                <td>{invoice.warehouse_name}</td>
                <td className="num strong">{money(invoice.total)}</td>
                {(kind === 'sale' || kind === 'sale_return') && canViewProfit && (
                  <td className="num">{money(invoice.profit_total)}</td>
                )}
                {(kind === 'purchase' || kind === 'purchase_return' || kind === 'waste') && (
                  <td className="num">{money(invoice.cost_total)}</td>
                )}
                {kind !== 'waste' && (
                  <td>
                    <StatusBadge variant={status}>{saleStatusLabel(status, isReturn)}</StatusBadge>
                  </td>
                )}
                {kind !== 'waste' && (
                  <td className={Number(invoice.remaining) > 0 ? 'num strong remaining' : 'num'}>
                    {money(invoice.remaining)}
                  </td>
                )}
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

import { formatDate } from '../../lib/format';
import MoneyDisplay from '../../components/MoneyDisplay';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import type { CashBoxTransferRow } from '../../lib/types';
import type { ReceiptSort } from './ReceiptTable';

interface CashBoxTransferTableProps {
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
  return (
    <table className="table erp-table">
      <thead>
        <tr>
          <SortableHeader
            label="الرقم"
            field="number"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as ReceiptSort)}
          />
          <SortableHeader
            label="التاريخ"
            field="date"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as ReceiptSort)}
          />
          <th>من خزنة</th>
          <th>إلى خزنة</th>
          <SortableHeader
            label="المبلغ"
            field="amount"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as ReceiptSort)}
            align="end"
            className="num"
          />
          <th>ملاحظات</th>
          <th aria-label="الإجراءات" />
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={7} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageTransfers.length === 0 && (
          <tr>
            <td colSpan={7} className="empty">
              لا توجد تحويلات تطابق البحث أو الفلاتر.
            </td>
          </tr>
        )}
        {!loading &&
          pageTransfers.map((transfer) => (
            <tr
              key={transfer.id}
              tabIndex={0}
              onClick={() => onView(transfer)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onView(transfer);
                }
              }}
            >
              <td className="num strong">{transfer.number}</td>
              <td className="num">{formatDate(transfer.transfer_date)}</td>
              <td>{transfer.source_cash_box_name}</td>
              <td>{transfer.destination_cash_box_name}</td>
              <td><MoneyDisplay value={transfer.amount} strong /></td>
              <td className="muted">{transfer.notes || '—'}</td>
              <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                {showDeleted ? (
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
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

import type { ReactNode } from 'react';
import { creationTime, formatDate } from '../../lib/format';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
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
  return (
    <table className="table erp-table document-table">
      <thead>
        <tr>
          <SortableHeader
            label="الرقم"
            className="col-number"
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
          <th className="col-time">الوقت</th>
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
          <th className="col-notes">ملاحظات</th>
          <th className="col-creator">بواسطة</th>
          <th aria-label="الإجراءات" />
        </tr>
        {columnFilter}
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={9} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageTransfers.length === 0 && (
          <tr>
            <td colSpan={9} className="empty">
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
              <td className="col-number strong"><bdi dir="ltr" className="tabular-nums">{transfer.number}</bdi></td>
              <td className="col-date"><bdi dir="ltr" className="tabular-nums">{formatDate(transfer.transfer_date)}</bdi></td>
              <td className="col-time"><bdi dir="ltr" className="tabular-nums">{creationTime(transfer.created_at)}</bdi></td>
              <td>{transfer.source_cash_box_name}</td>
              <td>{transfer.destination_cash_box_name}</td>
              <td><MoneyDisplay value={transfer.amount} strong /></td>
              <td className="col-notes">{transfer.notes || '—'}</td>
              <DocumentCreatorCell name={transfer.created_by_name} />
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

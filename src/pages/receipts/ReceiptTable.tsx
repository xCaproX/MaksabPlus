import { accountKindLabel, creationTime, formatDate } from '../../lib/format';
import MoneyDisplay from '../../components/MoneyDisplay';
import SortableHeader from '../../components/SortableHeader';
import StatusBadge from '../../components/StatusBadge';
import RowActions from '../../components/RowActions';
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

export function linkKind(kind: ReceiptRow['invoice_kind']) {
  return kind === 'sale_return' || kind === 'purchase_return' ? 'مرتجع' : 'فاتورة';
}

interface ReceiptTableProps {
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
          <th className="col-location">الخزنة</th>
          <th className="col-kind">نوع الحساب</th>
          <SortableHeader label="الحساب" field="account" currentSort={sortOrder}
            className="col-account" onSort={(s) => onSort(s as ReceiptSort)} />
          <SortableHeader
            label="المبلغ"
            field="amount"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as ReceiptSort)}
            align="end"
            className="num"
          />
          <th>نوع الإيصال</th>
          <th className="col-notes">البيان</th>
          <th className="col-notes">ملاحظات</th>
          <th aria-label="الإجراءات" />
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={11} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageReceipts.length === 0 && (
          <tr>
            <td colSpan={11} className="empty">
              لا توجد إيصالات تطابق البحث أو الفلاتر.
            </td>
          </tr>
        )}
        {!loading &&
          pageReceipts.map((receipt) => (
            <tr
              key={receipt.id}
              tabIndex={0}
              onClick={() => onView(receipt)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onView(receipt);
                }
              }}
            >
              <td className="col-number strong"><bdi dir="ltr" className="tabular-nums">{receipt.number}</bdi></td>
              <td className="col-date"><bdi dir="ltr" className="tabular-nums">{formatDate(receipt.receipt_date)}</bdi></td>
              <td className="col-time"><bdi dir="ltr" className="tabular-nums">{creationTime(receipt.created_at)}</bdi></td>
              <td className="col-location">{receipt.cash_box_name}</td>
              <td className="col-kind">{accountKindLabel(receipt.account_kind)}</td>
              <td className="col-account">{receipt.account_name}</td>
              <td><MoneyDisplay value={receipt.amount} strong /></td>
              <td>
                {receipt.is_free ? (
                  <StatusBadge variant="free">إيصال حر</StatusBadge>
                ) : (
                  <StatusBadge variant="linked">مرتبط بـ{linkKind(receipt.invoice_kind)}</StatusBadge>
                )}
              </td>
              <td className="col-notes">{receipt.statement || '—'}</td>
              <td className="col-notes">{receipt.notes || '—'}</td>
              <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                {showDeleted ? (
                  canDelete ? (
                    receipt.is_free ? (
                      <RowActions
                        onRestore={() => onRestore(receipt)}
                        restoreLabel="استعادة الإيصال"
                      />
                    ) : (
                      <span className="muted" title="يُستعاد مع الفاتورة">
                        مرتبط
                      </span>
                    )
                  ) : null
                ) : receipt.is_free ? (
                  <RowActions
                    onEdit={canEdit ? () => onEdit(receipt) : undefined}
                    onDelete={canDelete ? () => onDelete(receipt) : undefined}
                  />
                ) : (
                  <span className="muted" title={`يُعدَّل من داخل ${linkKind(receipt.invoice_kind)}`}>
                    مرتبط
                  </span>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

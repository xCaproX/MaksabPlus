import type { ReactNode } from 'react';
import { creationTime, formatDate, qty as formatQty } from '../../lib/format';
import DocumentCreatorCell from '../../components/DocumentCreatorCell';
import MoneyDisplay from '../../components/MoneyDisplay';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
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
  return (
    <table className="table erp-table document-table">
      <thead>
        <tr>
          <SortableHeader
            label="الرقم"
            className="col-number"
            field="number"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <SortableHeader
            label="التاريخ"
            className="col-date"
            field="date"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <th className="col-time">الوقت</th>
          <th>من مخزن</th>
          <th>إلى مخزن</th>
          <th className="num">عدد الأصناف</th>
          <th className="num">إجمالي الكميات</th>
          {canViewProfit && <SortableHeader
            label="قيمة التكلفة"
            field="total"
            align="end"
            className="num"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />}
          <th className="col-notes">ملاحظات</th>
          <th className="col-creator">بواسطة</th>
          <th aria-label="الإجراءات" />
        </tr>
        {columnFilter}
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={canViewProfit ? 11 : 10} className="empty">
              جارٍ التحميل…
            </td>
          </tr>
        )}
        {!loading && pageTransfers.length === 0 && (
          <tr>
            <td colSpan={canViewProfit ? 11 : 10} className="empty">
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
              <td>{transfer.source_warehouse_name}</td>
              <td>{transfer.destination_warehouse_name}</td>
              <td className="num"><bdi dir="ltr" className="tabular-nums">{transfer.line_count}</bdi></td>
              <td className="num"><bdi dir="ltr" className="tabular-nums">{formatQty(transfer.total_qty)}</bdi></td>
              {canViewProfit && <td><MoneyDisplay value={transfer.total_value} strong /></td>}
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

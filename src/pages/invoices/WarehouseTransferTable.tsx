import { formatDate, money, qty as formatQty } from '../../lib/format';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import type { WarehouseTransferRow } from '../../lib/types';
import type { SaleSort } from './InvoiceTable';

interface WarehouseTransferTableProps {
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
}

export default function WarehouseTransferTable({
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
}: WarehouseTransferTableProps) {
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
          <th>من مخزن</th>
          <th>إلى مخزن</th>
          <th className="num">عدد الأصناف</th>
          <th className="num">إجمالي الكميات</th>
          <SortableHeader
            label="قيمة التكلفة"
            field="total"
            align="end"
            className="num"
            currentSort={sortOrder}
            onSort={(s) => onSort(s as SaleSort)}
          />
          <th>ملاحظات</th>
          <th aria-label="الإجراءات" />
        </tr>
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
              <td className="num strong">{transfer.number}</td>
              <td className="num">{formatDate(transfer.transfer_date)}</td>
              <td>{transfer.source_warehouse_name}</td>
              <td>{transfer.destination_warehouse_name}</td>
              <td className="num">{transfer.line_count}</td>
              <td className="num">{formatQty(transfer.total_qty)}</td>
              <td className="num strong">{money(transfer.total_value)}</td>
              <td>{transfer.notes || '—'}</td>
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

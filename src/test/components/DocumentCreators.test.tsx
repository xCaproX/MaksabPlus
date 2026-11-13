import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InvoiceTable from '../../pages/invoices/InvoiceTable';
import WarehouseTransferTable from '../../pages/invoices/WarehouseTransferTable';
import ReceiptTable from '../../pages/receipts/ReceiptTable';
import CashBoxTransferTable from '../../pages/receipts/CashBoxTransferTable';
import type { InvoiceRow, WarehouseTransferRow, ReceiptRow, CashBoxTransferRow } from '../../lib/types';

const actions = { onSort: vi.fn(), onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onRestore: vi.fn(),
  canEdit: false, canDelete: false, loading: false, showDeleted: false };
const base = { id: 'document', number: 'DOC-000001', created_at: '2026-11-06T10:00:00Z', notes: 'ملاحظات المستند' };

function example(kind: string, name: string | null) {
  const row = { ...base, created_by_name: name };
  switch (kind) {
    case 'invoice': return <InvoiceTable {...actions} sortOrder="date-desc" kind="sale"
      newLabel="فاتورة" isReturn={false} pageInvoices={[{ ...row, total: 100, paid: 40, remaining: 60 } as InvoiceRow]} />;
    case 'warehouse': return <WarehouseTransferTable {...actions} sortOrder="date-desc" canViewProfit={false}
      pageTransfers={[{ ...row, total_qty: 2, line_count: 1 } as WarehouseTransferRow]} />;
    case 'receipt': return <ReceiptTable {...actions} sortOrder="date-desc"
      pageReceipts={[{ ...row, amount: 40, is_free: true } as ReceiptRow]} />;
    default: return <CashBoxTransferTable {...actions} sortOrder="date-desc"
      pageTransfers={[{ ...row, amount: 40 } as CashBoxTransferRow]} />;
  }
}

describe('document creator column', () => {
  it.each(['invoice','warehouse','receipt','cash'])('%s displays the saved name immediately before actions', (kind) => {
    render(example(kind, 'منشئ المستند'));
    const headers = screen.getAllByRole('columnheader');
    expect(headers.slice(-3).map((cell) => cell.textContent)).toEqual(['ملاحظات','بواسطة','']);
    const cells = screen.getAllByRole('cell');
    expect(cells[cells.length - 2]).toHaveTextContent('منشئ المستند');
    expect(cells[cells.length - 2]).toHaveClass('col-creator');
  });
  it.each(['invoice','warehouse','receipt','cash'])('%s labels unattributed historical documents honestly', (kind) => {
    render(example(kind, null));
    const cells = screen.getAllByRole('cell');
    expect(cells[cells.length - 2]).toHaveTextContent('غير مسجل');
  });
});

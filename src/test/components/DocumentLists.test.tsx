import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceiptTable from '../../pages/receipts/ReceiptTable';
import InvoiceTable from '../../pages/invoices/InvoiceTable';
import { calculateInvoiceKpis } from '../../pages/invoices/invoiceKpis';
import { calculateReceiptKpis } from '../../pages/receipts/receiptKpis';
import type { InvoiceRow, ReceiptRow } from '../../lib/types';

const invoice = { id: 'i', number: 'SAL-000001', invoice_date: '2026-11-06',
  created_at: '2026-11-06T10:30:00Z', account_name: 'عميل تجريبي', account_kind: 'customer',
  warehouse_name: 'مخزن رئيسي', total: 100, paid: 40, remaining: 60, profit_total: 123456,
  notes: 'تسليم الدور الثاني', created_by_name: 'منشئ تجريبي' } as InvoiceRow;
const summary = { totalAmount: 100, paidAmount: 40, remainingAmount: 60, profitTotal: 20, count: 1 };

describe('document list presentation', () => {
  it('shows the requested invoice columns, separate paid/credit values, Cairo time and notes', () => {
    const { container } = render(<InvoiceTable loading={false} pageInvoices={[invoice]} kind="sale"
      sortOrder="date-desc" onSort={vi.fn()} showDeleted={false}
      newLabel="فاتورة" isReturn={false} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
      onRestore={vi.fn()} canEdit={false} canDelete={false} />);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'الرقم', 'التاريخ', 'الوقت', 'المخزن', 'نوع الحساب', 'الحساب', 'الإجمالي', 'المسدد', 'الآجل', 'الحالة', 'ملاحظات', 'بواسطة', '',
    ]);
    const dateEl = container.querySelector('.date-display');
    expect(dateEl).toBeInTheDocument();
    expect(dateEl?.textContent).toBe('06/11/2026');
    expect(dateEl).toHaveAttribute('dir', 'rtl');
    for (const text of ['12:30 PM', 'عميل', '40.00', '60.00', 'جزئية', 'تسليم الدور الثاني']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText('123,456.00')).not.toBeInTheDocument();
    expect(screen.getByText('60.00').closest('span')).not.toHaveClass('remaining');
    expect(screen.getByText('60.00').closest('span')).not.toHaveClass('strong');
    expect(screen.getAllByRole('columnheader')[0]).toHaveClass('col-number');
    expect(screen.getByRole('cell', { name: 'منشئ تجريبي' })).toHaveClass('col-creator');
  });
  it('uses short receipt types and preserves their shared semantic variants', () => {
    const { container } = render(<ReceiptTable loading={false} sortOrder="date-desc" onSort={vi.fn()}
      showDeleted={false} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()}
      canEdit={false} canDelete={false} pageReceipts={[
        { ...invoice, id: 'free', amount: 100, is_free: true } as unknown as ReceiptRow,
        { ...invoice, id: 'linked', amount: 100, is_free: false, invoice_kind: 'sale_return' } as unknown as ReceiptRow,
      ]} />);
    const badges = container.querySelectorAll('tbody .col-receipt-type .status-badge');
    expect([...badges].map((badge) => badge.textContent)).toEqual(['حر', 'مرتبط']);
    expect(badges[0]).toHaveClass('status-badge-free');
    expect(badges[1]).toHaveClass('status-badge-linked');
  });
  it('orders sales summaries and only includes profit for the owner', () => {
    const items = calculateInvoiceKpis({ kind: 'sale', isWarehouseTransfer: false, invoiceSummary: summary, canViewProfit: true });
    expect(items.map((item) => item.label)).toEqual(['إجمالي المبيعات','عدد الفواتير','إجمالي التحصيل','إجمالي الآجل','إجمالي الأرباح']);
    expect(items.map((item) => item.value)).toEqual(['100.00',1,'40.00','60.00','20.00']);
    expect(items.find((item) => item.id === 'sale-paid')?.subtext).toBeUndefined();
    expect(calculateInvoiceKpis({ kind: 'sale', isWarehouseTransfer: false, invoiceSummary: summary, canViewProfit: false })).toHaveLength(4);
  });
  it('keeps sibling purchasing and return summaries appropriate to their function', () => {
    for (const kind of ['purchase','sale_return','purchase_return'] as const) {
      const items = calculateInvoiceKpis({ kind, isWarehouseTransfer: false, invoiceSummary: summary, canViewProfit: false });
      expect(items[1].value).toBe(1);
      expect(items.some((item) => item.id === 'sale-profit')).toBe(false);
    }
    const items = calculateReceiptKpis({ isCashBoxTransfer: false, isIn: true,
      receiptSummary: { totalAmount: 50, invoiceLinked: 40, count: 2 }, transferSummary: { totalAmount: 0, count: 0 } });
    expect(items[1].label).toBe('عدد إيصالات الاستلام');
    expect(items.find((item) => item.id === 'receipt-in-free')?.value).toBe('10.00');
    expect(items.every((item) => item.subtext === undefined)).toBe(true);
  });
});

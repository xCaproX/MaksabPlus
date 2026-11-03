import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvoiceForm from '../../components/InvoiceForm';

vi.mock('../../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

describe('InvoiceForm - وضع العرض وقراءة الفاتورة (readOnly)', () => {
  const mockAccounts = [
    { id: 'acc-1', name: 'عميل نقدي عام', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
    { id: 'acc-2', name: 'شركة النور للتجارة', kind: 'customer', balance: 2500, is_active: true, notes: 'عميل موثوق', phone: '01000000000', serial_number: 2, opening_balance: 0, invoiced: 5000, paid: 2500, has_documents: true, system_key: null },
  ] as any;

  const mockWarehouses = [
    { id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 },
  ] as any;

  const mockCashBoxes = [
    { id: 'cb-1', name: 'الخزينة الرئيسية', balance: 10000, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null },
  ] as any;

  const mockItems = [
    { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'سكر أبيض 1 كجم', unit: 'كجم', sale_price: 35, purchase_price: 30, qty: 10, is_active: true },
    { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'زيت عباد الشمس 1 لتر', unit: 'زجاجة', sale_price: 70, purchase_price: 60, qty: 5, is_active: true },
  ] as any;

  const mockStockRows = [
    { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 50 },
    { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 20 },
  ] as any;

  const mockEditingInvoice = {
    invoice: {
      id: 'inv-101',
      company_id: 'cmp-1',
      serial_number: 101,
      kind: 'sale' as const,
      number: 'SAL-000101',
      invoice_date: '2026-11-01',
      account_id: 'acc-2',
      account_kind: 'customer' as const,
      warehouse_id: 'wh-1',
      cash_box_id: 'cb-1',
      subtotal: 1050,
      discount: 0,
      total: 1050,
      paid: 500,
      remaining: 550,
      notes: 'ملاحظة تجريبية للفاتورة',
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
      receipt_number: 'RCP-000101',
      receipt_amount: 500,
      account_name: 'شركة النور للتجارة',
      warehouse_name: 'المخزن الرئيسي',
      cash_box_name: 'الخزينة الرئيسية',
      profit_total: 200,
    } as any,
    lines: [
      { key: 'l-1', item_id: 'itm-1', qty: '10', unit_price: '35' },
      { key: 'l-2', item_id: 'itm-2', qty: '10', unit_price: '70' },
    ],
  };

  it('في وضع العرض readOnly: يظهر أزرار الإجراءات (تعديل، طباعة، حذف، إغلاق) ولا يظهر شريط إدخال صنف جديد', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={onCancel}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    // التحقق من وجود زر تعديل الفاتورة
    expect(screen.getByText('تعديل الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الطباعة
    expect(screen.getByText('طباعة الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الحذف
    expect(screen.getByText('حذف الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الإغلاق
    expect(screen.getByText('إغلاق')).toBeInTheDocument();

    // التحقق من عدم وجود شريط إدراج سطر جديد
    expect(screen.queryByText('إدراج')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('اختر صنفاً للإدراج…')).not.toBeInTheDocument();

    // التحقق من ظهور السند المالي المرتبط
    expect(screen.getByText('السند المالي المرتبط')).toBeInTheDocument();
    expect(screen.getByText(/إيصال/)).toBeInTheDocument();

    // التحقق من ظهور ملاحظات الفاتورة
    expect(screen.getByText('ملاحظة تجريبية للفاتورة')).toBeInTheDocument();
  });

  it('في وضع العرض readOnly لمستند محذوف: يظهر زر "استعادة الفاتورة" عند تمرير onRestore', () => {
    const onRestore = vi.fn();
    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRestore={onRestore}
      />
    );

    expect(screen.getByText('استعادة الفاتورة')).toBeInTheDocument();
  });
});

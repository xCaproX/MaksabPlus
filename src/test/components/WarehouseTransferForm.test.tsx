import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WarehouseTransferForm from '../../components/WarehouseTransferForm';

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

describe('WarehouseTransferForm - نموذج التحويل بين المخازن', () => {
  const mockWarehouses = [
    { id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 },
    { id: 'wh-2', name: 'مخزن المعرض', is_primary: false, is_active: true, serial_number: 2 },
  ];

  const mockItems = [
    { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'سكر أبيض 1 كجم', unit: 'كجم', sale_price: 35, purchase_price: 30, qty: 10, is_active: true },
    { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'زيت عباد الشمس 1 لتر', unit: 'لتر', sale_price: 70, purchase_price: 60, qty: 5, is_active: true },
  ];

  const mockStockRows = [
    { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 0 },
    { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 5 },
    { item_id: 'itm-1', warehouse_id: 'wh-2', current_qty: 10 },
  ] as any;

  it('يعرض شرائط إجمالي الكميات وعدد الأصناف في الشريط الجانبي الأيسر الموحد', () => {
    const { container } = render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const leftSidebar = container.querySelector('.invoice-part-left');
    expect(leftSidebar).toBeInTheDocument();
    expect(leftSidebar).toHaveTextContent('عدد الأصناف');
    expect(leftSidebar).toHaveTextContent('إجمالي الكميات');
    expect(leftSidebar?.querySelector('textarea.left-notes-textarea')).toBeInTheDocument();
  });

  it('في وضع التعديل: يحسب الرصيد المتاح بإضافة الكمية المحولة سابقاً إلى رصيد مخزن المصدر', () => {
    // التحويل السابق يحتوي على 10 كجم من الصنف itm-1 رغم أن current_qty في stockRows هو 0
    const mockEditing = {
      id: 'wtr-1',
      serial_number: 1,
      number: 'WTR-0001',
      transfer_date: '2026-11-01',
      source_warehouse_id: 'wh-1',
      source_warehouse_name: 'المخزن الرئيسي',
      destination_warehouse_id: 'wh-2',
      destination_warehouse_name: 'مخزن المعرض',
      notes: 'تحويل للمراجعة',
      deleted_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
      line_count: 1,
      total_qty: 10,
      total_value: 300,
      items_summary: 'سكر أبيض 1 كجم x 10',
      lines: [
        {
          transfer_id: 'wtr-1',
          item_id: 'itm-1',
          qty: 10,
          unit_cost: 30,
        },
      ],
    };

    render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditing}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // الرصيد المتاح المعروض في السطر يجب أن يكون 10 وليس 0، مع عزل الرقم بـ bdi dir="ltr" وإبقاء الوحدة خارجه
    const availableCells = screen.getAllByText('10');
    expect(availableCells.length).toBeGreaterThan(0);
    const availableCell = availableCells[0].closest('td');
    expect(availableCell?.querySelector('bdi[dir="ltr"]')).toHaveTextContent('10');
    expect(availableCell?.querySelector('bdi[dir="ltr"]')?.textContent).not.toContain('كجم');
    expect(availableCell).toHaveTextContent('كجم');
  });

  it('في وضع العرض readOnly لمستند محذوف: يظهر زر "استعادة أمر التحويل" عند تمرير onRestore', () => {
    const onRestore = vi.fn();
    const mockEditing = {
      id: 'wtr-1',
      serial_number: 1,
      number: 'WTR-0001',
      transfer_date: '2026-11-01',
      source_warehouse_id: 'wh-1',
      source_warehouse_name: 'المخزن الرئيسي',
      destination_warehouse_id: 'wh-2',
      destination_warehouse_name: 'مخزن المعرض',
      notes: null,
      deleted_at: '2026-11-02T00:00:00Z',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
      line_count: 0,
      total_qty: 0,
      total_value: 0,
      items_summary: '',
      lines: [],
    };

    render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditing}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRestore={onRestore}
      />
    );

    expect(screen.getByText('استعادة أمر التحويل')).toBeInTheDocument();
  });

  it('يعرض حقل إدخال التاريخ القابل للتعديل DateInput في وضع الإنشاء والتعديل، ويعرضه للقراءة فقط في readOnly', () => {
    const { unmount } = render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText('تاريخ التحويل')).toBeInTheDocument();

    unmount();

    render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('تاريخ التحويل')).not.toBeInTheDocument();
  });

  it('يربط النموذج بتخطيط invoice-two-parts-layout ويخصص المساحة الزائدة لجدول الأصناف في الإنشاء والقراءة فقط', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container, rerender } = render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const form = container.querySelector('form');
    expect(form).toHaveClass('invoice-form', 'invoice-two-parts-layout', 'warehouse-transfer-form');
    expect(container.querySelector('.invoice-part-right .account-header-card')).toBeInTheDocument();
    const cardEdit = container.querySelector('.invoice-part-right .transfer-lines-card');
    expect(cardEdit).toHaveClass('right-card', 'items-table-card');
    expect(cardEdit?.querySelector('.lines-wrap .lines-table')).toBeInTheDocument();
    expect(container.querySelector('.invoice-part-left .left-actions-group')).toBeInTheDocument();
    expect(screen.getByText('حفظ التحويل المخزني')).toBeInTheDocument();

    rerender(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    const cardReadOnly = container.querySelector('.invoice-part-right .transfer-lines-card');
    expect(cardReadOnly).toHaveClass('right-card', 'items-table-card');
    expect(cardReadOnly?.querySelector('.lines-wrap .lines-table')).toBeInTheDocument();
    expect(container.querySelector('.invoice-part-left .readonly-actions-group')).toBeInTheDocument();
    expect(screen.getByText('تعديل التحويل')).toBeInTheDocument();
    expect(screen.getByText('طباعة')).toBeInTheDocument();
    expect(screen.getByText('حذف')).toBeInTheDocument();
    expect(screen.getByText('إغلاق')).toBeInTheDocument();
  });

  it('T-04 & T-05: يعرض تنبيه الضبط ويميز السطر عند تجاوز الإدراج المعلق، ويخفي عمود المتاح بالمصدر في الطباعة عند القراءة فقط', async () => {
    const editingWithPartialStock = {
      id: 'wtr-2',
      serial_number: 2,
      number: 'WTR-0002',
      transfer_date: '2026-11-01',
      source_warehouse_id: 'wh-1',
      source_warehouse_name: 'المخزن الرئيسي',
      destination_warehouse_id: 'wh-2',
      destination_warehouse_name: 'مخزن المعرض',
      notes: '',
      deleted_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
      line_count: 1,
      total_qty: 3,
      total_value: 180,
      items_summary: 'زيت عباد الشمس x 3',
      lines: [{ transfer_id: 'wtr-2', item_id: 'itm-2', qty: 3, unit_cost: 60 }],
    };

    const { container, rerender } = render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={editingWithPartialStock}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للتحويل أو امسح الباركود…');
    fireEvent.focus(itemInput);
    fireEvent.click(await screen.findByRole('option', { name: /زيت عباد الشمس/ }));

    const entryQtyInput = screen.getByLabelText('الكمية المنقولة');
    // المتاح الفعلي في التعديل = 5 (بالمخزن) + 3 (المحوّل سابقاً) = 8؛ إدخال 7 يتجاوز الحد فيُضبط إلى 5
    fireEvent.change(entryQtyInput, { target: { value: '7' } });

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('status')).toHaveTextContent('تم إدراج الصنف وتعديل الكمية تلقائيًا');
    const highlightedRow = container.querySelector('tr[data-adjusted-row="itm-2"]');
    expect(highlightedRow).toHaveClass('is-adjusted-highlight');

    rerender(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={editingWithPartialStock}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('المتاح بالمصدر').closest('th')).toHaveClass('print-hidden');
  });
});


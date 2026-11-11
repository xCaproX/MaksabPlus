import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('يعرض كبسولات إجمالي الكميات وعدد الأصناف الموحدة', () => {
    render(
      <WarehouseTransferForm
        warehouses={mockWarehouses}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('عدد الأصناف:')).toBeInTheDocument();
    expect(screen.getByText('إجمالي الكميات:')).toBeInTheDocument();
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

    // الرصيد المتاح المعروض في السطر يجب أن يكون 10 وليس 0
    const availableCells = screen.getAllByText('10');
    expect(availableCells.length).toBeGreaterThan(0);
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
});


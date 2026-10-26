import { useState } from 'react';
import Modal from '../components/Modal';
import InvoiceForm from '../components/InvoiceForm';
import InvoiceFormPrototype from '../components/InvoiceFormPrototype';
import type { AccountRow, CashBoxRow, ItemRow, StockOpeningRow, WarehouseOption } from '../lib/types';

export default function PreviewInvoice() {
  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'prototype' | 'current'>('prototype');

  const mockAccounts: AccountRow[] = [
    {
      id: 'acc-1',
      serial_number: 1,
      name: 'شركة النور للتجارة (عميل)',
      kind: 'customer',
      phone: '01012345678',
      balance: 1500,
      opening_balance: 0,
      invoiced: 1500,
      paid: 0,
      has_documents: true,
      is_active: true,
      notes: null,
      system_key: null,
    },
    {
      id: 'acc-2',
      serial_number: 2,
      name: 'عميل نقدي عام',
      kind: 'customer',
      phone: null,
      balance: 0,
      opening_balance: 0,
      invoiced: 0,
      paid: 0,
      has_documents: false,
      is_active: true,
      notes: null,
      system_key: 'cash_customer',
    },
  ];

  const mockWarehouses: WarehouseOption[] = [
    { id: 'wh-1', serial_number: 1, name: 'المخزن الرئيسي', is_active: true, is_primary: true },
    { id: 'wh-2', serial_number: 2, name: 'مخزن المعرض', is_active: true, is_primary: false },
  ];

  const mockCashBoxes: CashBoxRow[] = [
    { id: 'cb-1', serial_number: 1, name: 'خزنة الكاشير الرئيسية', balance: 12500, opening_balance: 5000, notes: null, is_active: true, is_primary: true },
  ];

  const mockItems: ItemRow[] = [
    { id: 'item-1', serial_number: 101, code: 'ITM-101', name: 'أرز بسمتي هندي ممتاز (كجم)', unit: 'كجم', qty: 20, sale_price: 65, purchase_price: 50, is_active: true },
    { id: 'item-2', serial_number: 102, code: 'ITM-102', name: 'زيت عباد الشمس 1 لتر', unit: 'زجاجة', qty: 5, sale_price: 75, purchase_price: 60, is_active: true },
    { id: 'item-3', serial_number: 103, code: 'ITM-103', name: 'سكر أبيض ناعم 1 كجم', unit: 'كيس', qty: 50, sale_price: 35, purchase_price: 28, is_active: true },
  ];

  const mockStock: StockOpeningRow[] = [
    { warehouse_id: 'wh-1', warehouse_name: 'المخزن الرئيسي', warehouse_number: 1, warehouse_notes: null, item_id: 'item-1', item_name: 'أرز بسمتي هندي ممتاز (كجم)', item_code: 'ITM-101', item_number: 101, item_notes: null, unit: 'كجم', unit_cost: 50, opening_qty: 20, current_qty: 20, cost_locked: false },
    { warehouse_id: 'wh-1', warehouse_name: 'المخزن الرئيسي', warehouse_number: 1, warehouse_notes: null, item_id: 'item-2', item_name: 'زيت عباد الشمس 1 لتر', item_code: 'ITM-102', item_number: 102, item_notes: null, unit: 'زجاجة', unit_cost: 60, opening_qty: 5, current_qty: 5, cost_locked: false },
    { warehouse_id: 'wh-1', warehouse_name: 'المخزن الرئيسي', warehouse_number: 1, warehouse_notes: null, item_id: 'item-3', item_name: 'سكر أبيض ناعم 1 كجم', item_code: 'ITM-103', item_number: 103, item_notes: null, unit: 'كيس', unit_cost: 28, opening_qty: 50, current_qty: 50, cost_locked: false },
  ];

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', background: '#fff', padding: '12px 18px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
        <strong>عرض المقارنة:</strong>
        <button
          type="button"
          className={`btn ${viewMode === 'prototype' ? 'primary' : 'outline'}`}
          onClick={() => { setViewMode('prototype'); setOpen(true); }}
        >
          ✨ النموذج المقترح الجديد (المبني على تنظيم شاشة إكسس)
        </button>
        <button
          type="button"
          className={`btn ${viewMode === 'current' ? 'primary' : 'outline'}`}
          onClick={() => { setViewMode('current'); setOpen(true); }}
        >
          النموذج الحالي القديم
        </button>
        {!open && (
          <button type="button" className="btn outline" onClick={() => setOpen(true)} style={{ marginInlineStart: 'auto' }}>
            فتح النافذة
          </button>
        )}
      </div>

      {open && (
        <Modal
          className="transaction-entry-modal"
          backdropClassName="transaction-entry-backdrop"
          title={viewMode === 'prototype' ? 'فاتورة مبيعات جديدة — النموذج المقترح' : 'فاتورة مبيعات جديدة — النموذج الحالي'}
          onClose={() => setOpen(false)}
        >
          {viewMode === 'prototype' ? (
            <InvoiceFormPrototype onCancel={() => setOpen(false)} />
          ) : (
            <InvoiceForm
              kind="sale"
              accounts={mockAccounts}
              warehouses={mockWarehouses}
              cashBoxes={mockCashBoxes}
              items={mockItems}
              stockRows={mockStock}
              editing={null}
              onSaved={(msg) => alert(msg)}
              onCancel={() => setOpen(false)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

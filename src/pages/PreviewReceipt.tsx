import { useState } from 'react';
import Modal from '../components/Modal';
import ReceiptForm from '../components/ReceiptForm';
import type { AccountRow, CashBoxRow } from '../lib/types';

export default function PreviewReceipt() {
  const [open, setOpen] = useState(true);

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
      notes: 'عميل مميز — تعامل تجاري منتظم',
      system_key: null,
    },
    {
      id: 'acc-2',
      serial_number: 2,
      name: 'مؤسسة الأمل للتوريدات (مورد)',
      kind: 'supplier',
      phone: '01298765432',
      balance: 2400,
      opening_balance: 0,
      invoiced: 2400,
      paid: 0,
      has_documents: true,
      is_active: true,
      notes: null,
      system_key: null,
    },
  ];

  const isNew = new URLSearchParams(window.location.search).get('mode') !== 'edit';

  const mockCashBoxes: CashBoxRow[] = [
    { id: 'cb-2', serial_number: 2, name: 'خزنة الفرع 2', balance: 45000, opening_balance: 10000, notes: null, is_active: true, is_primary: false },
    { id: 'cb-1', serial_number: 1, name: 'الخزنة الرئيسية', balance: 12500, opening_balance: 5000, notes: null, is_active: true, is_primary: true },
  ];

  const mockEditing: any = {
    id: 'mock-1',
    serial_number: 1,
    number: 'REC-00001',
    receipt_date: '2026-11-01',
    direction: 'in',
    account_id: 'acc-1',
    account_name: 'شركة النور للتجارة (عميل)',
    account_kind: 'customer',
    cash_box_id: 'cb-1',
    cash_box_name: 'خزنة الكاشير الرئيسية',
    amount: 1500,
    statement: 'سداد دفعة نقدية',
    notes: 'ملاحظات اختيارية',
    is_free: true,
  };

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: 'var(--bg)' }}>
      {!open && (
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          فتح نافذة الإيصال
        </button>
      )}

      {open && (
        <Modal
          className="receipt-entry-modal"
          backdropClassName="receipt-entry-backdrop"
          title="إيصال استلام جديد (سند قبض)"
          onClose={() => setOpen(false)}
        >
          <ReceiptForm
            direction="in"
            accounts={mockAccounts}
            cashBoxes={mockCashBoxes}
            editing={isNew ? null : mockEditing}
            onSaved={(msg) => alert(msg)}
            onCancel={() => setOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}

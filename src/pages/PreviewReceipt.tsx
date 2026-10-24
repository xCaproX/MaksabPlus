import { useState } from 'react';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import AccountBalanceCard from '../components/AccountBalanceCard';
import DateInput from '../components/DateInput';
import { money, today } from '../lib/format';
import type { AccountKind, AccountRow, CashBoxRow } from '../lib/types';

export default function PreviewReceipt() {
  const [open, setOpen] = useState(true);
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [accountId, setAccountId] = useState('acc-1');
  const [cashBoxId, setCashBoxId] = useState('cb-1');
  const [amount, setAmount] = useState('500');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('دفعة نقدية تحت حساب فواتير الشهر');
  const [notes, setNotes] = useState('');

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
      name: 'مؤسسة الأمل للتوريدات (مورد)',
      kind: 'supplier',
      phone: '01298765432',
      balance: -2400,
      opening_balance: 0,
      invoiced: 2400,
      paid: 0,
      has_documents: true,
      is_active: true,
      notes: null,
      system_key: null,
    },
  ];

  const mockCashBoxes: CashBoxRow[] = [
    { id: 'cb-1', serial_number: 1, name: 'خزنة الكاشير الرئيسية', balance: 12500, opening_balance: 5000, notes: null, is_active: true, is_primary: true },
    { id: 'cb-2', serial_number: 2, name: 'خزنة الإدارة العامة', balance: 45000, opening_balance: 10000, notes: null, is_active: true, is_primary: false },
  ];

  const selectedReceiptAccount = mockAccounts.find((a) => a.id === accountId);
  const numAmount = Number(amount || 0);
  const receiptBalanceBefore = selectedReceiptAccount ? Number(selectedReceiptAccount.balance) : 0;
  // In receipt in (استلام), customer balance decreases (-amt)
  const currentDelta = -numAmount;
  const receiptBalanceAfter = receiptBalanceBefore + currentDelta;

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: 'var(--bg)' }}>
      {!open && (
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          فتح نافذة الإيصال
        </button>
      )}

      {open && (
        <Modal
          className="transaction-entry-modal"
          backdropClassName="transaction-entry-backdrop"
          title="إيصال استلام نقدية جديد (REC-00042)"
          onClose={() => setOpen(false)}
        >
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); alert('تم الحفظ بنجاح'); }}>
            {/* المجموعة الأولى: الحساب والنوع وموقف الرصيد */}
            <div className="form-header-bar" style={{ marginBottom: '16px' }}>
              <div className="form-header-fields">
                <label className="field-account-kind">
                  نوع الحساب
                  <select
                    value={accountKind}
                    onChange={(e) => {
                      setAccountKind(e.target.value as AccountKind);
                      setAccountId('');
                    }}
                    required
                  >
                    <option value="customer">عميل</option>
                    <option value="supplier">مورد</option>
                  </select>
                </label>

                <label className="field-account-select">
                  استلام من (العميل)
                  <SearchableSelect
                    value={accountId}
                    options={mockAccounts.filter((a) => a.kind === accountKind).map((account) => ({ value: account.id, label: account.name }))}
                    onChange={setAccountId}
                    placeholder="اختر الحساب…"
                    required
                  />
                </label>
              </div>

              {selectedReceiptAccount && (
                <AccountBalanceCard
                  accountKind={selectedReceiptAccount.kind}
                  balanceBefore={receiptBalanceBefore}
                  delta={currentDelta}
                  balanceAfter={receiptBalanceAfter}
                  titleBefore="الرصيد قبل الإيصال"
                  deltaLabel="صافي حركة الإيصال"
                  titleAfter="الرصيد بعد الإيصال"
                />
              )}
            </div>

            {/* المجموعة الثانية: الخزنة، المبلغ، والتاريخ */}
            <div className="form-grid">
              <label className="form-grid-col-4">
                الخزنة المستلمة
                <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} required>
                  {mockCashBoxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name} ({money(box.balance)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-grid-col-4">
                المبلغ
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0.0001"
                  dir="ltr"
                  value={amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="no-spinner num"
                  required
                />
              </label>

              <label className="form-grid-col-4">
                تاريخ الإيصال
                <DateInput
                  value={date}
                  onChange={setDate}
                  required
                />
              </label>

              {/* المجموعة الثالثة: البيان والملاحظات بعرض كامل */}
              <label className="form-grid-col-12">
                البيان
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="سبب أو وصف المعاملة…"
                />
              </label>

              <label className="form-grid-col-12">
                ملاحظات
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية على الإيصال (اختياري)…"
                />
              </label>
            </div>

            {Number(amount) > 0 && (
              <div className="invoice-totals-bar" style={{ marginTop: '14px' }}>
                <div className="total-stat-box grand-total">
                  <span className="stat-box-title">قيمة الإيصال المحصلة</span>
                  <strong dir="ltr" className="stat-box-num num">{money(Number(amount))}</strong>
                </div>
              </div>
            )}

            <div className="form-modal-actions">
              <button type="submit" className="btn primary">
                حفظ إيصال الاستلام
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

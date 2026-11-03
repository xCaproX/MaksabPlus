import { useState } from 'react';
import Modal from '../components/Modal';
import ReceiptForm from '../components/ReceiptForm';
import StatusBadge from '../components/StatusBadge';
import RowActions from '../components/RowActions';
import SortableHeader from '../components/SortableHeader';
import { formatDate, money } from '../lib/format';
import type { AccountRow, CashBoxRow, ReceiptRow } from '../lib/types';

export default function PreviewReceipt() {
  const [modalOpen, setModalOpen] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('open');
    return p !== 'false';
  });

  const [showDeleted, setShowDeleted] = useState(() => {
    return new URLSearchParams(window.location.search).get('deleted') === 'true';
  });

  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>(() => {
    const m = new URLSearchParams(window.location.search).get('mode');
    return m === 'edit' ? 'edit' : m === 'create' ? 'create' : 'view';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('date-desc');

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

  const mockCashBoxes: CashBoxRow[] = [
    { id: 'cb-2', serial_number: 2, name: 'خزنة الفرع 2', balance: 45000, opening_balance: 10000, notes: null, is_active: true, is_primary: false },
    { id: 'cb-1', serial_number: 1, name: 'الخزنة الرئيسية', balance: 12500, opening_balance: 5000, notes: null, is_active: true, is_primary: true },
  ];

  const [receipts, setReceipts] = useState<ReceiptRow[]>([
    {
      id: 'rec-1',
      number: 'REC-00001',
      receipt_date: '2026-11-01',
      direction: 'in',
      account_id: 'acc-1',
      account_name: 'شركة النور للتجارة',
      account_kind: 'customer',
      cash_box_id: 'cb-1',
      cash_box_name: 'الخزنة الرئيسية',
      amount: 1500,
      statement: 'سداد دفعة نقدية عن فواتير سابقة',
      notes: 'عميل مميز — تعامل تجاري منتظم',
      is_free: true,
      created_at: new Date().toISOString(),
      deleted_at: null,
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
    },
    {
      id: 'rec-2',
      number: 'REC-00002',
      receipt_date: '2026-11-02',
      direction: 'in',
      account_id: 'acc-2',
      account_name: 'مؤسسة الأمل للتوريدات',
      account_kind: 'supplier',
      cash_box_id: 'cb-1',
      cash_box_name: 'الخزنة الرئيسية',
      amount: 3200,
      statement: 'إشعار تسوية رصيد',
      notes: null,
      is_free: false,
      created_at: new Date().toISOString(),
      deleted_at: null,
      description: null,
      invoice_id: 'inv-1',
      invoice_number: 'INV-00042',
      invoice_kind: 'purchase_return',
    },
    {
      id: 'rec-3',
      number: 'REC-00003',
      receipt_date: '2026-11-03',
      direction: 'in',
      account_id: 'acc-1',
      account_name: 'شركة النور للتجارة',
      account_kind: 'customer',
      cash_box_id: 'cb-2',
      cash_box_name: 'خزنة الفرع 2',
      amount: 850,
      statement: 'دفعة حساب نقدي',
      notes: null,
      is_free: true,
      created_at: new Date().toISOString(),
      deleted_at: '2026-11-03T18:00:00Z',
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
    },
  ]);

  const visibleReceipts = receipts.filter((r) => showDeleted ? Boolean(r.deleted_at) : !r.deleted_at);

  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(
    showDeleted ? (receipts.find((r) => r.deleted_at) ?? receipts[0]) : receipts[0],
  );

  function handleOpenView(rec: ReceiptRow) {
    setSelectedReceipt(rec);
    setModalMode('view');
    setModalOpen(true);
  }

  function handleOpenEdit(rec: ReceiptRow) {
    setSelectedReceipt(rec);
    setModalMode('edit');
    setModalOpen(true);
  }

  return (
    <div className="stack" style={{ minHeight: '100vh', background: 'var(--erp-bg, #f8fafc)', padding: '24px' }}>
      <div className="page-head">
        <div>
          <h1>{showDeleted ? 'المحذوفات — إيصالات الاستلام' : 'إيصالات الاستلام'}</h1>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn outline"
            onClick={() => {
              const next = !showDeleted;
              setShowDeleted(next);
              setModalOpen(false);
            }}
          >
            {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
          </button>
          {!showDeleted && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setSelectedReceipt(null);
                setModalMode('create');
                setModalOpen(true);
              }}
            >
              + إيصال استلام جديد
            </button>
          )}
        </div>
      </div>

      {/* شريط التبويبات القياسي */}
      <div className="tabs">
        <button type="button" className="tab active">إيصالات استلام</button>
        <button type="button" className="tab">إيصالات صرف</button>
        <button type="button" className="tab">تحويل بين الخزن</button>
      </div>

      {/* جدول الإيصالات ممتد 100% بكامل العرض بدون أي لوحة جانبية تضيقه */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label="قائمة إيصالات الاستلام">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="بحث بالرقم أو الحساب أو البيان…"
                />
              </label>
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="table erp-table">
              <thead>
                <tr>
                  <SortableHeader label="الرقم" field="number" currentSort={sortOrder} onSort={setSortOrder} />
                  <SortableHeader label="التاريخ" field="date" currentSort={sortOrder} onSort={setSortOrder} />
                  <SortableHeader label="الحساب" field="account" currentSort={sortOrder} onSort={setSortOrder} />
                  <th>الخزنة</th>
                  <SortableHeader label="المبلغ" field="amount" currentSort={sortOrder} onSort={setSortOrder} align="end" className="num" />
                  <th>نوع الإيصال</th>
                  <th>البيان</th>
                  <th aria-label="الإجراءات" />
                </tr>
              </thead>
              <tbody>
                {visibleReceipts.map((rec) => (
                  <tr
                    key={rec.id}
                    tabIndex={0}
                    onClick={() => handleOpenView(rec)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="num strong">{rec.number}</td>
                    <td className="num">{formatDate(rec.receipt_date)}</td>
                    <td>
                      {rec.account_name}{' '}
                      <span className="muted">
                        ({rec.account_kind === 'customer' ? 'عميل' : 'مورد'})
                      </span>
                    </td>
                    <td>{rec.cash_box_name}</td>
                    <td className="num strong">{money(rec.amount)}</td>
                    <td>
                      {rec.is_free ? (
                        <StatusBadge variant="free">إيصال حر</StatusBadge>
                      ) : (
                        <StatusBadge variant="linked">مرتبط بمرتجع</StatusBadge>
                      )}
                    </td>
                    <td className="muted">{rec.statement || '—'}</td>
                    <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                      {showDeleted ? (
                        <RowActions
                          onRestore={() => {
                            setReceipts((prev) => prev.map((r) => r.id === rec.id ? { ...r, deleted_at: null } : r));
                          }}
                          restoreLabel="استعادة الإيصال"
                        />
                      ) : (
                        <RowActions
                          onEdit={rec.is_free ? () => handleOpenEdit(rec) : undefined}
                          onDelete={rec.is_free ? () => {
                            setReceipts((prev) => prev.map((r) => r.id === rec.id ? { ...r, deleted_at: new Date().toISOString() } : r));
                          } : undefined}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* المودال الموحد للعرض والتعديل والإنشاء */}
      {modalOpen && (
        <Modal
          className="receipt-entry-modal"
          backdropClassName="receipt-entry-backdrop"
          title={
            modalMode === 'view'
              ? `${showDeleted ? 'محذوف — ' : ''}إيصال استلام ${selectedReceipt?.number ?? ''}`
              : modalMode === 'edit'
              ? `تعديل الإيصال ${selectedReceipt?.number ?? ''}`
              : 'إيصال استلام جديد (سند قبض)'
          }
          onClose={() => setModalOpen(false)}
        >
          <ReceiptForm
            key={`${selectedReceipt?.id ?? 'receipt'}-${modalMode}`}
            direction="in"
            accounts={mockAccounts}
            cashBoxes={mockCashBoxes}
            editing={modalMode === 'create' ? null : selectedReceipt}
            readOnly={modalMode === 'view'}
            onEdit={!showDeleted ? () => setModalMode('edit') : undefined}
            onDelete={
              !showDeleted
                ? () => {
                    if (confirm(`حذف الإيصال ${selectedReceipt?.number}؟`)) {
                      setReceipts((prev) => prev.map((r) => r.id === selectedReceipt?.id ? { ...r, deleted_at: new Date().toISOString() } : r));
                      setModalOpen(false);
                    }
                  }
                : undefined
            }
            onRestore={
              showDeleted
                ? () => {
                    alert(`تم استعادة الإيصال ${selectedReceipt?.number}`);
                    setReceipts((prev) => prev.map((r) => r.id === selectedReceipt?.id ? { ...r, deleted_at: null } : r));
                    setModalOpen(false);
                  }
                : undefined
            }
            onPrint={() => window.print()}
            onSaved={(msg) => {
              alert(msg);
              setModalMode('view');
            }}
            onCancel={() => (modalMode === 'edit' ? setModalMode('view') : setModalOpen(false))}
          />
        </Modal>
      )}
    </div>
  );
}

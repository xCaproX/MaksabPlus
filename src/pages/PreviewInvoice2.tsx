import { useState } from 'react';
import Modal from '../components/Modal';
import InvoiceFormPrototype2, {
  type Inv2Account,
  type Inv2CashBox,
  type Inv2Item,
} from '../components/InvoiceFormPrototype2';

// بيانات تجريبية مأخوذة من شاشة الأكسس الأصلية. الرصيد الموجب = عليه، والسالب = له.
const ACCOUNTS: Inv2Account[] = [
  { id: 'acc-1', kind: 'customer', code: '000006', name: 'جودت', note: 'موظفين', phone: '01223420739', balance: 4041 },
  { id: 'acc-2', kind: 'customer', code: '000001', name: 'شركة النور للمقاولات والتوريدات', phone: '01012345678', balance: -1250 },
  { id: 'acc-3', kind: 'customer', code: '000002', name: 'عميل نقدي عام', balance: 0 },
  { id: 'sup-1', kind: 'supplier', code: '000101', name: 'مورد التمور الأول', balance: -8300 },
];

const ITEMS: Inv2Item[] = [
  { id: 'item-1', code: '000121', name: 'بلح الوادي برانيك 1ك فرز اول', unit: 'كجم', available: 2295, cost: 44.78, showroomPrice: 54.5 },
  { id: 'item-2', code: '000175', name: 'عسل زهرة البرسيم تجاري زجاج 1ك', unit: 'برطمان', available: 204, cost: 57.51, showroomPrice: 73 },
  { id: 'item-3', code: '000228', name: 'عسل زهرة حبة البركة تجاري بلاستيك 250جم', unit: 'برطمان', available: 1, cost: 20.75, showroomPrice: 30 },
  { id: 'item-4', code: '000305', name: 'شاي العروسة كرتونة 100 باكت', unit: 'علبة', available: 85, cost: 38, showroomPrice: 45 },
  { id: 'item-5', code: '000312', name: 'سكر أبيض ناعم 1 كجم', unit: 'كيس', available: 420, cost: 26.4, showroomPrice: 33 },
];

const CASH_BOXES: Inv2CashBox[] = [
  { id: 'cb-1', name: 'الخزنة الرئيسية', balance: 419928.9 },
  { id: 'cb-2', name: 'خزنة الكاشير الفرعية', balance: 12450 },
];

const WAREHOUSES = ['المخزن الرئيسي', 'مخزن المعرض', 'مخزن البضاعة الحاضرة'];

export default function PreviewInvoice2() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '20px',
          background: '#fff',
          padding: '12px 18px',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
        }}
      >
        <strong>معاينة التصميم المقترح 2</strong>
        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>ملخص جانبي ثابت · خصم بالقيمة والنسبة · رصيد العميل قبل وبعد</span>
        <a href="/preview-invoice" className="btn outline" style={{ marginInlineStart: 'auto' }}>
          المقارنة مع النموذج الأول
        </a>
        {!open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            فتح النافذة
          </button>
        )}
      </div>

      {open && (
        <Modal
          className="transaction-entry-modal"
          backdropClassName="transaction-entry-backdrop"
          title="فاتورة مبيعات جديدة"
          onClose={() => setOpen(false)}
        >
          <InvoiceFormPrototype2
            accounts={ACCOUNTS}
            items={ITEMS}
            cashBoxes={CASH_BOXES}
            warehouses={WAREHOUSES}
            onCancel={() => setOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}

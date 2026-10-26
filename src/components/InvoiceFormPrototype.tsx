import { useState } from 'react';
import { 
  Printer, 
  FileSpreadsheet, 
  Receipt, 
  Eye, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Clock, 
  Save, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { money, round2 } from '../lib/format';

interface PrototypeLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  availableStock: number;
  qty: number;
  price: number;
  discountPercent: number;
}

export default function InvoiceFormPrototype({ onCancel }: { onCancel?: () => void }) {
  // State for Account
  const [accountType, setAccountType] = useState<'customer' | 'supplier'>('customer');
  const [selectedAccountId, setSelectedAccountId] = useState('acc-1');
  const customerBalance = 4041.00;

  // State for Warehouse & Price Category
  const [warehouse, setWarehouse] = useState('المخزن الرئيسي');
  const [priceTier, setPriceTier] = useState<'showroom' | 'general' | 'agent' | 'wholesale'>('showroom');
  const [invoiceDate, setInvoiceDate] = useState('26/10/2026');

  // State for Invoice Lines
  const [lines, setLines] = useState<PrototypeLine[]>([
    {
      id: '1',
      itemId: 'item-1',
      code: '000121',
      name: 'بلح الوادي برانيك 1ك فرز اول',
      unit: 'كجم',
      availableStock: 2295,
      qty: 15,
      price: 54.50,
      discountPercent: 0,
    },
    {
      id: '2',
      itemId: 'item-2',
      code: '000175',
      name: 'عسل زهرة البرسيم تجاري زجاج 1ك',
      unit: 'برطمان',
      availableStock: 204,
      qty: 5,
      price: 73.00,
      discountPercent: 0,
    },
    {
      id: '3',
      itemId: 'item-3',
      code: '000228',
      name: 'عسل زهرة حبة البركة تجاري بلاستيك 250جم',
      unit: 'برطمان',
      availableStock: 1,
      qty: 1,
      price: 30.00,
      discountPercent: 0,
    },
  ]);

  // State for Discount & Tax
  const [discountPercent, setDiscountPercent] = useState<number>(1.03);
  const [taxPercent] = useState<number>(0.00);

  // State for Payment & Cashbox
  const [paid, setPaid] = useState<number>(1000.00);
  const [cashBox, setCashBox] = useState('الخزنة الرئيسية');
  const cashBoxBalance = 419928.90;
  const [notes, setNotes] = useState('');

  // Calculations
  const subtotal = lines.reduce((acc, line) => {
    const lineNetPrice = line.price * (1 - line.discountPercent / 100);
    return acc + lineNetPrice * line.qty;
  }, 0);

  const discountAmount = round2((subtotal * discountPercent) / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = round2((afterDiscount * taxPercent) / 100);
  const netTotal = round2(afterDiscount + taxAmount);
  const remaining = round2(netTotal - paid);

  function updateLineQty(id: string, qty: number) {
    setLines(lines.map((l) => (l.id === id ? { ...l, qty: Math.max(0, qty) } : l)));
  }

  function updateLinePrice(id: string, price: number) {
    setLines(lines.map((l) => (l.id === id ? { ...l, price: Math.max(0, price) } : l)));
  }

  function removeLine(id: string) {
    setLines(lines.filter((l) => l.id !== id));
  }

  function addNewLine() {
    const nextId = String(Date.now());
    setLines([
      ...lines,
      {
        id: nextId,
        itemId: 'item-new',
        code: '000305',
        name: 'شاي العروسة كرتونة 100 باكت',
        unit: 'علبة',
        availableStock: 85,
        qty: 1,
        price: 45.00,
        discountPercent: 0,
      },
    ]);
  }

  return (
    <div className="invoice-prototype">
      {/* 1. Header Toolbar */}
      <div className="proto-top-toolbar">
        <div className="proto-title-area">
          <Sparkles size={20} color="#38bdf8" />
          <h2>إضافة فاتورة مبيعات جديدة (النموذج المقترح)</h2>
        </div>
        <div className="proto-print-actions">
          <button type="button" className="proto-print-btn" title="معاينة الطباعة">
            <Eye size={14} /> معاينة
          </button>
          <button type="button" className="proto-print-btn" title="تصدير ملف Excel">
            <FileSpreadsheet size={14} /> تصدير
          </button>
          <button type="button" className="proto-print-btn" title="طباعة بون ريسيت">
            <Receipt size={14} /> ريسيت حراري
          </button>
          <button type="button" className="proto-print-btn" title="طباعة فاتورة مقاس A5">
            <Printer size={14} /> طباعة A5
          </button>
          <button type="button" className="proto-print-btn" title="طباعة فاتورة مقاس A4">
            <Printer size={14} /> طباعة A4
          </button>
        </div>
      </div>

      {/* 2. Top Info Grid */}
      <div className="proto-meta-grid">
        <div className="proto-field">
          <span className="proto-field-label">نوع الحساب</span>
          <select 
            value={accountType} 
            onChange={(e) => setAccountType(e.target.value as 'customer' | 'supplier')}
          >
            <option value="customer">عميل</option>
            <option value="supplier">مورد</option>
          </select>
        </div>

        <div className="proto-field">
          <span className="proto-field-label">الحساب / العميل</span>
          <select 
            value={selectedAccountId} 
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            <option value="acc-1">[000006] شركة جودت للتجارة — موظفين — 01223420739</option>
            <option value="acc-2">[000001] شركة النور للمقاولات والتوريدات — 01012345678</option>
            <option value="acc-3">[000002] عميل نقدي عام (نقدي فوري)</option>
          </select>
        </div>

        <div className="proto-balance-badge" title="الرصيد الفعلي الحالي لهذا العميل">
          <span className="title">الرصيد الحالي للعميل</span>
          <span className="amount" dir="ltr">{money(customerBalance)} له</span>
        </div>

        <button type="button" className="proto-quick-add-btn" title="إضافة عميل جديد فوري">
          <Plus size={18} />
        </button>
      </div>

      {/* 2.2 Warehouse & Price Tiers */}
      <div className="proto-meta-grid-2">
        <div className="proto-field">
          <span className="proto-field-label">المخزن المنصرف منه</span>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="المخزن الرئيسي">المخزن الرئيسي</option>
            <option value="مخزن المعرض">مخزن المعرض</option>
            <option value="مخزن البضاعة الحاضرة">مخزن البضاعة الحاضرة</option>
          </select>
        </div>

        <div className="proto-field">
          <span className="proto-field-label">فئة التسعير السريعة</span>
          <div className="proto-price-tiers">
            <button
              type="button"
              className={`proto-tier-pill ${priceTier === 'showroom' ? 'active' : ''}`}
              onClick={() => setPriceTier('showroom')}
            >
              المعرض (قطاعي)
            </button>
            <button
              type="button"
              className={`proto-tier-pill ${priceTier === 'general' ? 'active' : ''}`}
              onClick={() => setPriceTier('general')}
            >
              عام
            </button>
            <button
              type="button"
              className={`proto-tier-pill ${priceTier === 'agent' ? 'active' : ''}`}
              onClick={() => setPriceTier('agent')}
            >
              مندوب
            </button>
            <button
              type="button"
              className={`proto-tier-pill ${priceTier === 'wholesale' ? 'active' : ''}`}
              onClick={() => setPriceTier('wholesale')}
            >
              جملة
            </button>
          </div>
        </div>

        <div className="proto-field">
          <span className="proto-field-label">تاريخ الفاتورة</span>
          <input 
            type="text" 
            value={invoiceDate} 
            onChange={(e) => setInvoiceDate(e.target.value)} 
            dir="ltr" 
            style={{ textAlign: 'center', fontWeight: '600' }} 
          />
        </div>
      </div>

      {/* 3. Items Table */}
      <div className="proto-table-wrap">
        <table className="proto-items-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th>الصنف</th>
              <th style={{ width: '100px' }}>المتاح بالمخزن</th>
              <th style={{ width: '130px' }}>الكمية</th>
              <th style={{ width: '110px' }}>السعر</th>
              <th style={{ width: '90px' }}>خصم %</th>
              <th style={{ width: '110px' }}>الصافي</th>
              <th style={{ width: '130px' }}>الإجمالي</th>
              <th style={{ width: '50px' }}>حذف</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const lineNet = line.price * (1 - line.discountPercent / 100);
              const lineTotal = round2(lineNet * line.qty);

              return (
                <tr key={line.id}>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#64748b' }}>
                    {idx + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: '700', color: 'var(--ink)' }}>
                        <span style={{ color: '#0284c7', marginInlineEnd: '6px' }}>[{line.code}]</span>
                        {line.name}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="proto-avail-cell" title={`الرصيد المتاح حالياً في ${warehouse}`}>
                      {line.availableStock} {line.unit}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="1"
                        dir="ltr"
                        value={line.qty}
                        onChange={(e) => updateLineQty(line.id, Number(e.target.value))}
                        style={{ width: '70px', fontWeight: '700' }}
                      />
                      <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '600' }}>
                        {line.unit}
                      </span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      dir="ltr"
                      value={line.price}
                      onChange={(e) => updateLinePrice(line.id, Number(e.target.value))}
                      style={{ width: '90px', fontWeight: '600' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      dir="ltr"
                      value={line.discountPercent}
                      readOnly
                      style={{ width: '70px', color: '#64748b' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '650' }} dir="ltr">
                    {money(lineNet)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '750', color: '#0f172a' }} dir="ltr">
                    <strong>{money(lineTotal)}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="proto-del-btn"
                      onClick={() => removeLine(line.id)}
                      title="حذف هذا الصنف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ padding: '8px 12px', background: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
          <button type="button" className="proto-add-line-btn" onClick={addNewLine}>
            <Plus size={15} /> + إضافة صنف جديد للفاتورة (F2)
          </button>
        </div>
      </div>

      {/* 4. Totals & Accounting Matrix */}
      <div className="proto-totals-matrix">
        {/* Row 1: Subtotal, Discounts, Taxes */}
        <div className="proto-matrix-row proto-matrix-row-1">
          <div className="proto-stat-cell">
            <span className="label">الإجمالي قبل الخصم:</span>
            <span className="val" dir="ltr">{money(subtotal)}</span>
          </div>
          <div className="proto-stat-cell">
            <span className="label">الخصم (%):</span>
            <input
              type="number"
              step="0.01"
              dir="ltr"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              style={{ width: '65px', textAlign: 'center', height: '30px', minHeight: '30px', fontWeight: '700' }}
            />
          </div>
          <div className="proto-stat-cell">
            <span className="label">قيمة الخصم:</span>
            <span className="val" dir="ltr">{money(discountAmount)}</span>
          </div>
          <div className="proto-stat-cell">
            <span className="label">الضريبة (%):</span>
            <span className="val" dir="ltr">0.00%</span>
          </div>
          <div className="proto-stat-cell">
            <span className="label">قيمة الضريبة:</span>
            <span className="val" dir="ltr">0.00 ج.م</span>
          </div>
        </div>

        {/* Row 2: Net, Paid, Remaining */}
        <div className="proto-matrix-row proto-matrix-row-2">
          <div className="proto-stat-cell highlight-net">
            <span className="label" style={{ fontSize: '14px', color: '#166534', fontWeight: '750' }}>
              الصافي المطلوب سداده:
            </span>
            <span className="val" dir="ltr">{money(netTotal)}</span>
          </div>

          <div className="proto-stat-cell">
            <span className="label">المدفوع نقداً:</span>
            <div className="proto-paid-input-wrap">
              <input
                type="number"
                step="0.01"
                dir="ltr"
                value={paid}
                onChange={(e) => setPaid(Number(e.target.value))}
                style={{ height: '32px', minHeight: '32px' }}
              />
              <button
                type="button"
                className="proto-quick-action-btn pay-full"
                title="سداد الفاتورة بالكامل نقداً"
                onClick={() => setPaid(netTotal)}
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                className="proto-quick-action-btn clear-pay"
                title="تصفير المدفوع (آجل بالكامل)"
                onClick={() => setPaid(0)}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className={`proto-stat-cell ${remaining > 0 ? 'highlight-remaining' : ''}`}>
            <span className="label">{remaining > 0 ? 'المتبقي آجل:' : 'المتبقي:'}</span>
            <span className="val" dir="ltr">{money(remaining)}</span>
          </div>
        </div>

        {/* Row 3: CashBox & Notes */}
        <div className="proto-matrix-row proto-matrix-row-3">
          <div className="proto-stat-cell" title="الخزنة التي استلمت المبلغ المدفوع مع رصيدها">
            <span className="label">الخزنة:</span>
            <select
              value={cashBox}
              onChange={(e) => setCashBox(e.target.value)}
              style={{ minHeight: '32px', height: '32px', fontSize: '12px', padding: '2px 8px' }}
            >
              <option value="الخزنة الرئيسية">الخزنة الرئيسية ({money(cashBoxBalance)})</option>
              <option value="خزنة الكاشير الفرعية">خزنة الكاشير الفرعية (12,450.00 ج.م)</option>
            </select>
          </div>

          <div className="proto-stat-cell" style={{ padding: '4px 10px' }}>
            <span className="label" style={{ whiteSpace: 'nowrap', marginInlineEnd: '10px' }}>
              ملاحظات:
            </span>
            <input
              type="text"
              placeholder="ملاحظات اختيارية على الفاتورة أو شروط السداد والخصم…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', height: '32px', minHeight: '32px', textAlign: 'start' }}
            />
          </div>
        </div>
      </div>

      {/* 5. Central Action Bar */}
      <div className="proto-central-actions">
        <button type="button" className="proto-btn-action hold" title="تعليق الفاتورة مؤقتاً لخدمة زبون آخر (F4)">
          <Clock size={16} /> تعليق الفاتورة (F4)
        </button>

        <button type="button" className="proto-btn-action save" title="حفظ وطباعة الفاتورة (F9)">
          <Save size={16} /> حفظ الفاتورة (F9)
        </button>

        <button 
          type="button" 
          className="proto-btn-action clear" 
          title="مسح وتفريغ الحقول لبدء فاتورة جديدة (Esc)"
          onClick={() => {
            setLines([]);
            setPaid(0);
          }}
        >
          <RotateCcw size={16} /> مسح / جديد (Esc)
        </button>

        {onCancel && (
          <button type="button" className="btn outline" onClick={onCancel} style={{ minHeight: '44px' }}>
            إغلاق
          </button>
        )}
      </div>
    </div>
  );
}

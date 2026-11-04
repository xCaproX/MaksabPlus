import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import {
  Package,
  Wallet,
  Database,
  Scale,
  ShieldCheck,
  LogOut,
  ChevronDown,
  ChevronUp,
  KeyRound,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FileText,
  TrendingUp,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../components/KpiBar';
import ChangePasswordModal from '../components/ChangePasswordModal';
import Modal from '../components/Modal';
import InvoiceForm from '../components/InvoiceForm';
import WarehouseTransferForm from '../components/WarehouseTransferForm';
import CashBoxTransferForm from '../components/CashBoxTransferForm';
import DateInput from '../components/DateInput';
import StatusBadge from '../components/StatusBadge';
import RowActions from '../components/RowActions';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { money } from '../lib/format';

export default function PreviewPhase3And4() {
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'invoice') {
      return true;
    }
    return false;
  });
  const [changePasswordOpen, setChangePasswordOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'password') {
      return true;
    }
    return false;
  });
  const [warehouseTransferOpen, setWarehouseTransferOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'warehouse-transfer') {
      return true;
    }
    return false;
  });
  const [cashBoxTransferOpen, setCashBoxTransferOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'cashbox-transfer') {
      return true;
    }
    return false;
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openSections, setOpenSections] = useState({
    goods: true,
    money: false,
    data: false,
    balances: false,
    management: false,
  });

  const [dateFrom, setDateFrom] = useState('2026-10-01');
  const [dateTo, setDateTo] = useState('2026-10-24');
  const [selectedInvoice, setSelectedInvoice] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === '1') {
      return 1;
    }
    return null;
  });
  const [modalMode, setModalMode] = useState<'view' | 'edit'>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('edit') === '1') {
      return 'edit';
    }
    return 'view';
  });

  const mockInvoices = [
    {
      id: 1,
      number: 'INV-2026-0089',
      date: '2026-10-24',
      customer: 'شركة النور للتجارة والتوريدات',
      warehouse: 'المخزن الرئيسي',
      total: 8450.0,
      paid: 5000.0,
      remaining: 3450.0,
      status: 'partial' as const,
      statusLabel: 'جزئية',
      receiptNumber: 'REC-0042',
      receiptAmount: 5000.0,
      notes: 'دفعة مقدمة نقداً، والمتبقي أجل أسبوع',
    },
    {
      id: 2,
      number: 'INV-2026-0088',
      date: '2026-10-23',
      customer: 'عميل نقدي عام',
      warehouse: 'المخزن الرئيسي',
      total: 1200.0,
      paid: 1200.0,
      remaining: 0.0,
      status: 'paid' as const,
      statusLabel: 'مسددة',
      receiptNumber: 'REC-0041',
      receiptAmount: 1200.0,
      notes: 'تم السداد فورياً في خزينة المعرض',
    },
    {
      id: 3,
      number: 'INV-2026-0087',
      date: '2026-10-22',
      customer: 'مؤسسة الفجر للمقاولات',
      warehouse: 'مخزن المعرض',
      total: 14200.0,
      paid: 0.0,
      remaining: 14200.0,
      status: 'unpaid' as const,
      statusLabel: 'غير مسددة',
      receiptNumber: null,
      receiptAmount: 0,
      notes: 'فاتورة مؤجلة سداد شهري',
    },
  ];

  const current = mockInvoices.find((i) => i.id === selectedInvoice) || null;

  const sortedMockInvoices = [...mockInvoices].sort((a, b) => {
    if (sortOrder === 'total-desc') return b.total - a.total;
    if (sortOrder === 'total-asc') return a.total - b.total;
    if (sortOrder === 'number-desc') return b.number.localeCompare(a.number, undefined, { numeric: true });
    if (sortOrder === 'number-asc') return a.number.localeCompare(b.number, undefined, { numeric: true });
    if (sortOrder === 'customer-desc') return b.customer.localeCompare(a.customer, 'ar');
    if (sortOrder === 'customer-asc') return a.customer.localeCompare(b.customer, 'ar');
    if (sortOrder === 'remaining-desc') return b.remaining - a.remaining;
    if (sortOrder === 'remaining-asc') return a.remaining - b.remaining;
    const cmp = a.date.localeCompare(b.date);
    return sortOrder === 'date-asc' ? cmp : -cmp;
  });

  const totalSales = sortedMockInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const paidSales = sortedMockInvoices.reduce((sum, inv) => sum + inv.paid, 0);
  const remainingSales = sortedMockInvoices.reduce((sum, inv) => sum + inv.remaining, 0);
  const profitSales = totalSales * 0.22;

  const kpiItems: KpiItem[] = [
    {
      id: 'mock-total',
      label: 'إجمالي المبيعات',
      value: money(totalSales),
      unit: 'ج.م',
      variant: 'primary',
      icon: DollarSign,
    },
    {
      id: 'mock-paid',
      label: 'المحصّل نقدًا',
      value: money(paidSales),
      unit: 'ج.م',
      variant: 'success',
      icon: CheckCircle2,
      subtext: (
        <span>
          نسبة التحصيل: <bdi dir="ltr">{Math.round((paidSales / totalSales) * 100)}%</bdi>
        </span>
      ),
    },
    {
      id: 'mock-remaining',
      label: 'المتبقي آجل (ديون)',
      value: money(remainingSales),
      unit: 'ج.م',
      variant: remainingSales > 0 ? 'warning' : 'neutral',
      icon: AlertCircle,
    },
    {
      id: 'mock-count',
      label: 'عدد الفواتير',
      value: sortedMockInvoices.length,
      unit: 'فاتورة',
      variant: 'neutral',
      icon: FileText,
    },
    {
      id: 'mock-profit',
      label: 'أرباح المبيعات التقديرية',
      value: money(profitSales),
      unit: 'ج.م',
      variant: 'info',
      icon: TrendingUp,
    },
  ];

  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((prev) => {
      const willBeOpen = !prev[key];
      return {
        goods: false,
        money: false,
        data: false,
        balances: false,
        management: false,
        [key]: willBeOpen,
      };
    });
  }

  return (
    <BrowserRouter>
      <div className="app" dir="rtl">
        {/* Sidebar */}
        <header className="topbar">
          <div className="brand">
            <img src="/maksab-sidebar-logo.png" alt="مكسب بلس" />
          </div>

          <nav className="nav" aria-label="التنقل الرئيسي">
            {/* البضاعة */}
            <div className="nav-group">
              <div className="nav-link active">
                <span className="nav-link-main">
                  <Package size={17} className="nav-icon" />
                  <span>البضاعة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSection('goods');
                  }}
                >
                  {openSections.goods ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>
              {openSections.goods && (
                <div className="subnav">
                  <span className="subnav-link active">
                    <span className="subnav-dot" />
                    <span>فواتير المبيعات</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>فواتير المشتريات</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>مرتجعات المبيعات</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>الهالك</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>تحويل بين مخازن</span>
                  </span>
                </div>
              )}
            </div>

            {/* الفلوس - مفتوح في نفس الوقت لإثبات إمكانية فتح أكثر من قسم معاً */}
            <div className="nav-group">
              <div className="nav-link">
                <span className="nav-link-main">
                  <Wallet size={17} className="nav-icon" />
                  <span>الفلوس</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSection('money');
                  }}
                >
                  {openSections.money ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>
              {openSections.money && (
                <div className="subnav">
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>إيصالات استلام</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>إيصالات صرف</span>
                  </span>
                  <span className="subnav-link">
                    <span className="subnav-dot" />
                    <span>تحويل بين الخزن</span>
                  </span>
                </div>
              )}
            </div>

            {/* البيانات */}
            <div className="nav-group">
              <div className="nav-link">
                <span className="nav-link-main">
                  <Database size={17} className="nav-icon" />
                  <span>البيانات</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSection('data');
                  }}
                >
                  {openSections.data ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>
            </div>

            {/* الأرصدة */}
            <div className="nav-group">
              <div className="nav-link">
                <span className="nav-link-main">
                  <Scale size={17} className="nav-icon" />
                  <span>الأرصدة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSection('balances');
                  }}
                >
                  {openSections.balances ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>
            </div>

            {/* إدارة */}
            <div className="nav-group">
              <div className="nav-link">
                <span className="nav-link-main">
                  <ShieldCheck size={17} className="nav-icon" />
                  <span>إدارة</span>
                </span>
                <span
                  className="nav-chevron"
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSection('management');
                  }}
                >
                  {openSections.management ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>
            </div>
          </nav>

          {/* Sidebar Footer with user name and company name */}
          <div className="sidebar-footer">
            <div className="sidebar-user-block">
              <div className="sidebar-user-name">عبد الرحمن عيد (Capro)</div>
              <div className="sidebar-company-name">شركة الأمل للتجارة والتوزيع</div>
            </div>
            <button
              type="button"
              className="sidebar-user-btn"
              onClick={() => setChangePasswordOpen(true)}
              title="تغيير كلمة المرور"
            >
              <KeyRound size={15} />
              <span>تغيير كلمة المرور</span>
            </button>
            <button type="button" className="sign-out">
              <LogOut size={16} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </header>

        <ChangePasswordModal
          isOpen={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />

        {/* Main Content Workspace */}
        <main className="content">
          <div className="stack">
            <div className="page-head">
              <div>
                <h1>فواتير المبيعات</h1>
              </div>
              <div className="actions">
                <button type="button" className="btn outline">
                  عرض المحذوفات
                </button>
                <button type="button" className="btn primary" onClick={() => setInvoiceFormOpen(true)}>
                  + فاتورة مبيعات جديدة
                </button>
              </div>
            </div>

            {/* شريط المؤشرات والإجماليات المتفاعل مع الفلاتر */}
            <KpiBar items={kpiItems} ariaLabel="مؤشرات فواتير المبيعات" />

            {/* ERP Sales Workspace with detail open */}
            <div className={current ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
              <section className="erp-list-panel" aria-label="قائمة فواتير المبيعات">
                <div className="erp-toolbar">
                  <div className="erp-filters">
                    <label className="erp-search">
                      <span className="sr-only">البحث</span>
                      <input type="search" placeholder="بحث بالرقم أو العميل أو المخزن…" />
                    </label>

                    <SearchableSelect
                      ariaLabel="تصفية حسب حالة السداد"
                      value={statusFilter}
                      options={[
                        { value: 'all', label: 'كل الحالات' },
                        { value: 'paid', label: 'مسددة' },
                        { value: 'partial', label: 'جزئية' },
                        { value: 'unpaid', label: 'غير مسددة' },
                      ]}
                      onChange={setStatusFilter}
                    />

                    {/* Shared DateInput components */}
                    <div className="erp-date-range">
                      <div className="erp-date">
                        <span>من</span>
                        <DateInput value={dateFrom} onChange={setDateFrom} ariaLabel="من تاريخ" />
                      </div>
                      <div className="erp-date">
                        <span>إلى</span>
                        <DateInput value={dateTo} onChange={setDateTo} ariaLabel="إلى تاريخ" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="erp-table-wrap">
                  <table className="table erp-table">
                    <thead>
                      <tr>
                        <SortableHeader label="الرقم" field="number" currentSort={sortOrder} onSort={setSortOrder} />
                        <SortableHeader label="التاريخ" field="date" currentSort={sortOrder} onSort={setSortOrder} />
                        <SortableHeader label="العميل" field="customer" defaultDirection="asc" currentSort={sortOrder} onSort={setSortOrder} />
                        <th className="col-hide-on-detail">المخزن</th>
                        <SortableHeader label="الإجمالي" field="total" align="end" className="num" currentSort={sortOrder} onSort={setSortOrder} />
                        <th className="num col-hide-on-detail">الربح</th>
                        <th className="col-hide-on-detail">السداد</th>
                        <SortableHeader label="المتبقي" field="remaining" align="end" className="num" currentSort={sortOrder} onSort={setSortOrder} />
                        <th aria-label="الإجراءات" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMockInvoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className={inv.id === selectedInvoice ? 'selected' : ''}
                          onClick={() => setSelectedInvoice(inv.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="num strong">{inv.number}</td>
                          <td className="num">{inv.date}</td>
                          <td>{inv.customer}</td>
                          <td className="col-hide-on-detail">{inv.warehouse}</td>
                          <td className="num strong">{money(inv.total)}</td>
                          <td className="num col-hide-on-detail">{money(inv.total * 0.22)}</td>
                          <td className="col-hide-on-detail">
                            <StatusBadge variant={inv.status}>{inv.statusLabel}</StatusBadge>
                          </td>
                          <td className={inv.remaining > 0 ? 'num strong remaining' : 'num'}>
                            {money(inv.remaining)}
                          </td>
                          <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              onEdit={() => {}}
                              onDelete={() => {}}
                              editLabel="تعديل"
                              deleteLabel="حذف"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="erp-pagination">
                  <span>عرض 1–3 من 3</span>
                  <div>
                    <button type="button" className="btn compact" disabled>
                      السابق
                    </button>
                    <span>1 / 1</span>
                    <button type="button" className="btn compact" disabled>
                      التالي
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>

        {/* Unified Invoice View Modal */}
        {selectedInvoice && current && (
          <Modal
            className="transaction-entry-modal invoice-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title={modalMode === 'view' ? `عرض فاتورة مبيعات — ${current.number}` : `تعديل الفاتورة ${current.number}`}
            onClose={() => { setSelectedInvoice(null); setModalMode('view'); }}
          >
            <InvoiceForm
              key={`preview-inv-${modalMode}`}
              readOnly={modalMode === 'view'}
              kind="sale"
              accounts={[
                { id: 'acc-1', name: 'عميل نقدي عام', kind: 'customer', balance: 0, is_active: true, notes: 'عميل نقدي فوري', phone: '01000000000', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
                { id: 'acc-2', name: 'شركة النور للتجارة والتوريدات', kind: 'customer', balance: 3450, is_active: true, notes: 'عميل آجل معتمد بحد ائتماني 50,000', phone: '01234567890', serial_number: 2, opening_balance: 0, invoiced: 8450, paid: 5000, has_documents: true, system_key: null },
              ] as any}
              warehouses={[
                { id: 'wh-1', name: 'المخزن الرئيسي', is_active: true, is_primary: true, serial_number: 1 },
              ] as any}
              cashBoxes={[
                { id: 'cb-1', name: 'خزينة المعرض الرئيسية', balance: 24500, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null },
              ] as any}
              items={[
                { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'شاي العروسة 250 جم', unit: 'كرتونة', sale_price: 180, purchase_price: 150, qty: 45, is_active: true },
                { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'سكر أبيض نقي 1 كجم', unit: 'كجم', sale_price: 32.5, purchase_price: 28, qty: 120, is_active: true },
                { id: 'itm-3', serial_number: 3, code: 'ITM-003', name: 'زيت عباد الشمس 800 مل', unit: 'زجاجة', sale_price: 65, purchase_price: 54, qty: 60, is_active: true },
                { id: 'itm-4', serial_number: 4, code: 'ITM-004', name: 'أرز فاخر عريض الحبة 5 كجم', unit: 'شيكارة', sale_price: 175, purchase_price: 145, qty: 30, is_active: true },
              ] as any}
              stockRows={[
                { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 45 },
                { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 120 },
                { item_id: 'itm-3', warehouse_id: 'wh-1', current_qty: 60 },
                { item_id: 'itm-4', warehouse_id: 'wh-1', current_qty: 30 },
              ] as any}
              editing={{
                invoice: {
                  id: 'mock-inv-1',
                  company_id: 'cmp-1',
                  serial_number: 89,
                  kind: 'sale',
                  number: current.number,
                  invoice_date: current.date,
                  account_id: 'acc-2',
                  account_kind: 'customer',
                  warehouse_id: 'wh-1',
                  cash_box_id: 'cb-1',
                  subtotal: current.total,
                  discount: 0,
                  total: current.total,
                  paid: current.paid,
                  remaining: current.remaining,
                  notes: current.notes,
                  created_at: '2026-10-24T14:30:00Z',
                  updated_at: '2026-10-24T14:30:00Z',
                  receipt_number: current.receiptNumber,
                  receipt_amount: current.receiptAmount,
                  account_name: current.customer,
                  warehouse_name: current.warehouse,
                  cash_box_name: 'خزينة المعرض الرئيسية',
                  profit_total: current.total * 0.22,
                } as any,
                lines: [
                  { key: 'line-1', item_id: 'itm-4', qty: '20', unit_price: '175' },
                  { key: 'line-2', item_id: 'itm-2', qty: '60', unit_price: '32.5' },
                  { key: 'line-3', item_id: 'itm-3', qty: '46.1538', unit_price: '65' },
                ],
              }}
              onSaved={() => {
                if (modalMode === 'edit') setModalMode('view');
                else setSelectedInvoice(null);
              }}
              onCancel={() => {
                if (modalMode === 'edit') setModalMode('view');
                else setSelectedInvoice(null);
              }}
              onEdit={() => setModalMode('edit')}
              onDelete={() => setShowDeleteConfirm(true)}
              onPrint={() => window.print()}
            />
          </Modal>
        )}

        {showDeleteConfirm && current && (
          <ConfirmDialog
            title="تأكيد حذف الفاتورة"
            message={`هل أنت متأكد من رغبتك في حذف الفاتورة رقم ${current.number}؟\nسيتم إلغاء تأثيرها المالي وحركاتها المخزنية بشكل فوري.`}
            confirmLabel="نعم، حذف الفاتورة"
            danger
            onConfirm={() => setShowDeleteConfirm(false)}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}

        {invoiceFormOpen && (
          <Modal
            className="transaction-entry-modal invoice-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title="فاتورة مبيعات جديدة"
            onClose={() => setInvoiceFormOpen(false)}
          >
            <InvoiceForm
              kind="sale"
              accounts={[
                { id: 'acc-1', name: 'عميل نقدي عام', kind: 'customer', balance: 0, is_active: true, notes: 'عميل نقدي فوري', phone: '01000000000', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
                { id: 'acc-2', name: 'شركة النور للتجارة والتوريدات', kind: 'customer', balance: 3450, is_active: true, notes: 'عميل آجل معتمد بحد ائتماني 50,000', phone: '01234567890', serial_number: 2, opening_balance: 0, invoiced: 8450, paid: 5000, has_documents: true, system_key: null },
                { id: 'acc-3', name: 'مؤسسة الفجر للمقاولات', kind: 'customer', balance: 14200, is_active: true, notes: 'دفع نصف شهري', phone: '01112223334', serial_number: 3, opening_balance: 0, invoiced: 14200, paid: 0, has_documents: true, system_key: null },
              ] as any}
              warehouses={[
                { id: 'wh-1', name: 'المخزن الرئيسي', is_active: true, is_primary: true, serial_number: 1 },
                { id: 'wh-2', name: 'مخزن المعرض', is_active: true, is_primary: false, serial_number: 2 },
              ] as any}
              cashBoxes={[
                { id: 'cb-1', name: 'خزينة المعرض الرئيسية', balance: 24500, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null },
                { id: 'cb-2', name: 'خزينة الإدارة', balance: 85000, is_active: true, is_primary: false, serial_number: 2, opening_balance: 0, notes: null },
              ] as any}
              items={[
                { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'شاي العروسة 250 جم', unit: 'كرتونة', sale_price: 180, purchase_price: 150, qty: 45, is_active: true },
                { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'سكر أبيض نقي 1 كجم', unit: 'كجم', sale_price: 32.5, purchase_price: 28, qty: 120, is_active: true },
                { id: 'itm-3', serial_number: 3, code: 'ITM-003', name: 'زيت عباد الشمس 800 مل', unit: 'زجاجة', sale_price: 65, purchase_price: 54, qty: 60, is_active: true },
                { id: 'itm-4', serial_number: 4, code: 'ITM-004', name: 'أرز فاخر عريض الحبة 5 كجم', unit: 'شيكارة', sale_price: 175, purchase_price: 145, qty: 30, is_active: true },
              ] as any}
              stockRows={[
                { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 45 },
                { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 120 },
                { item_id: 'itm-3', warehouse_id: 'wh-1', current_qty: 60 },
                { item_id: 'itm-4', warehouse_id: 'wh-1', current_qty: 30 },
              ] as any}
              editing={null}
              onSaved={() => setInvoiceFormOpen(false)}
              onCancel={() => setInvoiceFormOpen(false)}
            />
          </Modal>
        )}

        {warehouseTransferOpen && (
          <Modal
            className="transaction-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title="تحويل مخزني جديد"
            onClose={() => setWarehouseTransferOpen(false)}
          >
            <WarehouseTransferForm
              warehouses={[
                { id: 'wh-1', name: 'المخزن الرئيسي', is_active: true, is_primary: true, serial_number: 1 },
                { id: 'wh-2', name: 'مخزن المعرض', is_active: true, is_primary: false, serial_number: 2 },
              ] as any}
              items={[
                { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'شاي العروسة 250 جم', unit: 'كرتونة', sale_price: 180, purchase_price: 150, qty: 45, is_active: true },
                { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'سكر أبيض نقي 1 كجم', unit: 'كجم', sale_price: 32.5, purchase_price: 28, qty: 120, is_active: true },
              ] as any}
              stockRows={[
                { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 45 },
                { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 120 },
              ] as any}
              editing={null}
              onSaved={() => setWarehouseTransferOpen(false)}
              onCancel={() => setWarehouseTransferOpen(false)}
            />
          </Modal>
        )}

        {cashBoxTransferOpen && (
          <Modal
            className="transaction-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title="تحويل جديد بين الخزن"
            onClose={() => setCashBoxTransferOpen(false)}
          >
            <CashBoxTransferForm
              cashBoxes={[
                { id: 'cb-1', name: 'خزينة المعرض الرئيسية', balance: 24500, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null },
                { id: 'cb-2', name: 'خزينة الإدارة', balance: 85000, is_active: true, is_primary: false, serial_number: 2, opening_balance: 0, notes: null },
              ] as any}
              editing={null}
              onSaved={() => setCashBoxTransferOpen(false)}
              onCancel={() => setCashBoxTransferOpen(false)}
            />
          </Modal>
        )}
      </div>
    </BrowserRouter>
  );
}

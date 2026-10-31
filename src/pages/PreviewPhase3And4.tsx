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
  Receipt as ReceiptIcon,
  ExternalLink,
  X,
  KeyRound,
} from 'lucide-react';
import ChangePasswordModal from '../components/ChangePasswordModal';
import DateInput from '../components/DateInput';
import StatusBadge from '../components/StatusBadge';
import RowActions from '../components/RowActions';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import SortableHeader from '../components/SortableHeader';
import { money } from '../lib/format';

export default function PreviewPhase3And4() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'password') {
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
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('detail') === '0') {
      return null;
    }
    return 1;
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
                <button type="button" className="btn primary">
                  + فاتورة مبيعات جديدة
                </button>
              </div>
            </div>

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

              {/* Detail Panel */}
              {current && (
                <aside className="erp-detail-panel open" aria-label="تفاصيل المستند">
                  <div className="erp-detail-head">
                    <div>
                      <span>فاتورة مبيعات</span>
                      <h2 className="num">{current.number}</h2>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="إغلاق التفاصيل"
                      onClick={() => setSelectedInvoice(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>

                <dl className="erp-detail-summary">
                  <div>
                    <dt>العميل</dt>
                    <dd>{current.customer}</dd>
                  </div>
                  <div>
                    <dt>التاريخ</dt>
                    <dd className="num">{current.date}</dd>
                  </div>
                  <div>
                    <dt>المخزن</dt>
                    <dd>{current.warehouse}</dd>
                  </div>
                  <div>
                    <dt>حالة السداد</dt>
                    <dd>
                      <StatusBadge variant={current.status}>{current.statusLabel}</StatusBadge>
                    </dd>
                  </div>
                </dl>

                <div className="erp-detail-lines">
                  <table className="table subtable">
                    <thead>
                      <tr>
                        <th>الصنف</th>
                        <th className="num">الكمية</th>
                        <th className="num">السعر</th>
                        <th className="num">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>أرز بسمتي هندي ممتاز</td>
                        <td className="num">50 كجم</td>
                        <td className="num">{money(65)}</td>
                        <td className="num strong">{money(3250)}</td>
                      </tr>
                      <tr>
                        <td>زيت عباد الشمس 1 لتر</td>
                        <td className="num">40 زجاجة</td>
                        <td className="num">{money(75)}</td>
                        <td className="num strong">{money(3000)}</td>
                      </tr>
                      <tr>
                        <td>سكر أبيض ناعم 1 كجم</td>
                        <td className="num">60 كيس</td>
                        <td className="num">{money(35)}</td>
                        <td className="num strong">{money(2100)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="erp-detail-totals">
                  <span>الإجمالي</span>
                  <strong className="num">{money(current.total)}</strong>
                  <span>المدفوع</span>
                  <strong className="num">{money(current.paid)}</strong>
                  <span>المتبقي</span>
                  <strong className="num remaining">{money(current.remaining)}</strong>
                </div>

                {/* Clickable Linked Receipt Link */}
                {current.receiptNumber && (
                  <div className="erp-detail-notes">
                    <span>الإيصال المرتبط</span>
                    <span className="receipt-linked-link" style={{ cursor: 'pointer' }}>
                      <ReceiptIcon size={15} />
                      <span>
                        إيصال {current.receiptNumber} ({money(current.receiptAmount)})
                      </span>
                      <ExternalLink size={13} className="link-ext-icon" />
                    </span>
                  </div>
                )}

                {/* Example of Linked Status Badge (Blue color family) vs Payment Status (Amber) */}
                <div className="erp-detail-notes" style={{ marginTop: '8px' }}>
                  <span>حالة الارتباط المحاسبي</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusBadge variant="linked">مرتبط بفاتورة {current.number}</StatusBadge>
                    <span className="muted" style={{ fontSize: '11px' }}>
                      (عائلة الأزرق المستقلة عن حالة السداد البرتقالية)
                    </span>
                  </div>
                </div>

                {current.notes && (
                  <p className="erp-detail-notes">
                    <span>ملاحظات</span>
                    {current.notes}
                  </p>
                )}

                <div className="erp-detail-actions">
                  <button type="button" className="btn">
                    تعديل الفاتورة
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    حذف
                  </button>
                </div>
              </aside>
              )}
            </div>
          </div>
        </main>

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
      </div>
    </BrowserRouter>
  );
}

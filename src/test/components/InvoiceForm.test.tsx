import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InvoiceForm from '../../components/InvoiceForm';
import { toast } from '../../components/Toast';
import * as masterDataQueries from '../../lib/masterDataQueries';
import { supabase } from '../../lib/supabase';
import type { AccountKind, AccountRow } from '../../lib/types';

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

describe('InvoiceForm - وضع العرض وقراءة الفاتورة (readOnly)', () => {
  const mockAccounts = [
    { id: 'acc-1', name: 'عميل نقدي عام', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
    { id: 'acc-2', name: 'شركة النور للتجارة', kind: 'customer', balance: 2500, is_active: true, notes: 'عميل موثوق', phone: '01000000000', serial_number: 2, opening_balance: 0, invoiced: 5000, paid: 2500, has_documents: true, system_key: null },
  ] as any;

  const mockWarehouses = [
    { id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 },
  ] as any;

  const mockCashBoxes = [
    { id: 'cb-1', name: 'الخزينة الرئيسية', balance: 10000, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null },
  ] as any;

  const mockItems = [
    { id: 'itm-1', serial_number: 1, code: 'ITM-001', name: 'سكر أبيض 1 كجم', unit: 'كجم', sale_price: 35, purchase_price: 30, qty: 10, is_active: true },
    { id: 'itm-2', serial_number: 2, code: 'ITM-002', name: 'زيت عباد الشمس 1 لتر', unit: 'زجاجة', sale_price: 70, purchase_price: 60, qty: 5, is_active: true },
  ] as any;

  const mockStockRows = [
    { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 50 },
    { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 20 },
  ] as any;

  const mockEditingInvoice = {
    invoice: {
      id: 'inv-101',
      company_id: 'cmp-1',
      serial_number: 101,
      kind: 'sale' as const,
      number: 'SAL-000101',
      invoice_date: '2026-11-01',
      account_id: 'acc-2',
      account_kind: 'customer' as const,
      warehouse_id: 'wh-1',
      cash_box_id: 'cb-1',
      subtotal: 1050,
      discount: 0,
      total: 1050,
      paid: 500,
      remaining: 550,
      notes: 'ملاحظة تجريبية للفاتورة',
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
      receipt_number: 'RCP-000101',
      receipt_amount: 500,
      account_name: 'شركة النور للتجارة',
      warehouse_name: 'المخزن الرئيسي',
      cash_box_name: 'الخزينة الرئيسية',
      profit_total: 200,
    } as any,
    lines: [
      { key: 'l-1', item_id: 'itm-1', qty: '10', unit_price: '35' },
      { key: 'l-2', item_id: 'itm-2', qty: '10', unit_price: '70' },
    ],
  };

  it('في وضع العرض readOnly: يظهر أزرار الإجراءات (تعديل، طباعة، حذف، إغلاق) ولا يظهر شريط إدخال صنف جديد', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={onCancel}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    // التحقق من وجود زر تعديل الفاتورة
    expect(screen.getByText('تعديل الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الطباعة
    expect(screen.getByText('طباعة الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الحذف
    expect(screen.getByText('حذف الفاتورة')).toBeInTheDocument();
    // التحقق من وجود زر الإغلاق
    expect(screen.getByText('إغلاق')).toBeInTheDocument();

    // التحقق من عدم وجود شريط إدراج سطر جديد
    expect(screen.queryByText('إدراج')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('اختر صنفاً للإدراج…')).not.toBeInTheDocument();

    // التحقق من ظهور السند المالي المرتبط
    expect(screen.getByText('السند المالي المرتبط')).toBeInTheDocument();
    expect(screen.getByText(/إيصال/)).toBeInTheDocument();

    // التحقق من ظهور ملاحظات الفاتورة
    expect(screen.getByText('ملاحظة تجريبية للفاتورة')).toBeInTheDocument();
  });

  it('في وضع العرض readOnly لمستند محذوف: يظهر زر "استعادة الفاتورة" عند تمرير onRestore', () => {
    const onRestore = vi.fn();
    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRestore={onRestore}
      />
    );

    expect(screen.getByText('استعادة الفاتورة')).toBeInTheDocument();
  });

  it('يقبل عرض وتعديل الفاتورة بكميات كسرية للأوزان والأمتار (مثل 0.5 كجم)', () => {
    const decimalEditingInvoice = {
      ...mockEditingInvoice,
      lines: [
        { key: 'l-1', item_id: 'itm-1', qty: '0.5', unit_price: '35' },
      ],
    };

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={decimalEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const qtyInput = screen.getByLabelText(/الكمية — سكر أبيض 1 كجم/) as HTMLInputElement;
    expect(qtyInput).toBeInTheDocument();
    expect(qtyInput.value).toBe('0.5');
    expect(qtyInput.min).toBe('0.0001');
  });

  it('يعرض حقل إدخال التاريخ القابل للتعديل DateInput في وضع التحرير والإدخال، ويعرضه للعرض فقط في readOnly', () => {
    const { unmount } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const editableDate = screen.getByLabelText('تاريخ الفاتورة');
    expect(editableDate).toBeInTheDocument();

    unmount();

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('تاريخ الفاتورة')).not.toBeInTheDocument();
  });

  it('يعرض اسم الحساب واسم الصنف ووحدته من بيانات الفاتورة التاريخية عند عدم وجودهما في القوائم النشطة', () => {
    const historicalInvoice = {
      ...mockEditingInvoice,
      invoice: {
        ...mockEditingInvoice.invoice,
        account_id: 'acc-deactivated',
        account_name: 'عميل موقوف تاريخي',
      },
      lines: [
        {
          key: 'l-hist',
          item_id: 'itm-deactivated',
          item_name: 'صنف تاريخي موقوف',
          unit: 'كرتونة',
          qty: '3',
          unit_price: '100',
        },
      ],
    };

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={historicalInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('عميل موقوف تاريخي')).toBeInTheDocument();
    expect(screen.getByText('صنف تاريخي موقوف')).toBeInTheDocument();
    expect(screen.getByText('كرتونة')).toBeInTheDocument();
  });

  it('عند تغيير الحساب في وضع التعديل لا يخصم صافي الفاتورة السابقة من رصيد الحساب الجديد', async () => {
    const accountsWithThird = [
      ...mockAccounts,
      {
        id: 'acc-3',
        name: 'عميل جديد للمعاينة',
        kind: 'customer',
        balance: 1000,
        is_active: true,
        notes: '',
        phone: '01011111111',
        serial_number: 3,
        opening_balance: 0,
        invoiced: 1000,
        paid: 0,
        has_documents: true,
        system_key: null,
      },
    ] as any;

    render(
      <InvoiceForm
        kind="sale"
        accounts={accountsWithThird}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const accountCombo = screen.getByDisplayValue(/شركة النور للتجارة/);
    fireEvent.focus(accountCombo);
    fireEvent.click(await screen.findByText(/عميل جديد للمعاينة/));

    const beforePill = screen.getByText('المديونية قبل:').closest('.stat-pill')!;
    expect(beforePill).toHaveTextContent('1,000.00');
  });

  it('T-04: عند ضبط كمية بند معلق أثناء الحفظ يعرض تنبيهًا تحذيريًا ويميز السطر المعدل قبل الحفظ النهائي', async () => {
    // في فاتورة جديدة: المتاح بالمخزن 50؛ ندرج 45 أولاً ثم نحاول إرسال 10 معلقة في الشريط (45 + 10 > 50 فتُضبط إلى 5)
    const { container } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemInput);
    fireEvent.click(await screen.findByRole('option', { name: /سكر أبيض 1 كجم/ }));
    fireEvent.change(screen.getByLabelText(/كمية الصنف/), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'إدراج' }));

    fireEvent.focus(itemInput);
    fireEvent.click(await screen.findByRole('option', { name: /سكر أبيض 1 كجم/ }));
    fireEvent.change(screen.getByLabelText(/كمية الصنف/), { target: { value: '10' } });

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('status')).toHaveTextContent('تم إدراج الصنف وتعديل الكمية تلقائيًا');
    const highlightedRow = container.querySelector('tr[data-adjusted-row="itm-1"]');
    expect(highlightedRow).toHaveClass('is-adjusted-highlight');
  });

  it('T-06 & T-18: keeps zero-stock edit line item selectable via held qty and normalizes Arabic digits in paid input to ASCII', () => {
    const zeroStockRows = [
      { item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 0 },
      { item_id: 'itm-2', warehouse_id: 'wh-1', current_qty: 20 },
    ] as any;
    const heldEditInvoice = {
      ...mockEditingInvoice,
      lines: [{ key: 'l-1', item_id: 'itm-1', qty: '5', unit_price: '35' }],
    };

    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={zeroStockRows}
        editing={heldEditInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemInput);
    const heldOption = screen.getByRole('option', { name: /سكر أبيض 1 كجم/ });
    expect(heldOption).not.toBeDisabled();

    const paidInput = screen.getByLabelText('المدفوع') as HTMLInputElement;
    fireEvent.change(paidInput, { target: { value: '١٢٥٫٥٠' } });
    expect(paidInput.value).toBe('125.50');
  });

  it.each(['sale_return', 'purchase_return'] as const)(
    'يعرض شريط المتبقي في %s بعنوان "المتبقي" وشارة "خالص" أو "آجل" مثل فواتير المبيعات',
    (returnKind) => {
      const accountKind = returnKind === 'sale_return' ? ('customer' as const) : ('supplier' as const);
      const returnAccounts = [
        {
          id: 'acc-ret',
          name: 'حساب مرتجع تجريبي',
          kind: accountKind,
          balance: 0,
          is_active: true,
          notes: '',
          phone: '',
          serial_number: 10,
          opening_balance: 0,
          invoiced: 0,
          paid: 0,
          has_documents: false,
          system_key: null,
        },
      ] as any;
      const returnEditing = {
        invoice: {
          ...mockEditingInvoice.invoice,
          kind: returnKind,
          account_id: 'acc-ret',
          account_kind: accountKind,
          account_name: 'حساب مرتجع تجريبي',
          total: 350,
          paid: 350,
          remaining: 0,
        },
        lines: [{ key: 'l-r1', item_id: 'itm-1', qty: '10', unit_price: '35' }],
      };

      const { container } = render(
        <InvoiceForm
          kind={returnKind}
          accounts={returnAccounts}
          warehouses={mockWarehouses}
          cashBoxes={mockCashBoxes}
          items={mockItems}
          stockRows={mockStockRows}
          editing={returnEditing}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const remainingStrip = container.querySelector('.left-remaining-strip')!;
      expect(remainingStrip).toBeInTheDocument();
      expect(remainingStrip.querySelector('.strip-label')).toHaveTextContent('المتبقي');
      expect(remainingStrip.querySelector('.status-badge')).toHaveTextContent('خالص');
      expect(remainingStrip).not.toHaveTextContent('حالة الاسترداد');
      expect(remainingStrip).not.toHaveTextContent('مسترد بالكامل');

      const paidInput = screen.getByLabelText('المبلغ المسترد') as HTMLInputElement;
      fireEvent.change(paidInput, { target: { value: '100' } });

      expect(remainingStrip.querySelector('.status-badge')).toHaveTextContent('آجل');
      expect(remainingStrip).not.toHaveTextContent('غير مسترد');
    },
  );

  it('يزيل لاحقة العملة والوحدات من حقول الأرقام ويعرض الصنف بالترتيب (كود، اسم، وحدة)', () => {
    const { container } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.line-unit-suffix')).toHaveLength(0);
    expect(container.querySelectorAll('.readonly-unit-text')).toHaveLength(0);

    const firstInsertedInfo = container.querySelector('.inserted-line-row .inserted-item-info')!;
    expect(Array.from(firstInsertedInfo.children).map((el) => el.textContent?.trim())).toEqual([
      'ITM-001',
      'سكر أبيض 1 كجم',
      'كجم',
    ]);

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemInput);
    const option = screen.getByRole('option', { name: /ITM-001 — سكر أبيض 1 كجم — كجم/ });
    expect(option.querySelector('.searchable-select-sublabel')).toHaveTextContent('متاح: 60');
  });

  const makeAccount = (
    id: string,
    name: string,
    kind: AccountKind,
    systemKey: AccountRow['system_key'] = null,
    serialNumber: number | null = null,
  ): AccountRow => ({
    id,
    serial_number: serialNumber,
    name,
    kind,
    phone: null,
    notes: null,
    is_active: true,
    opening_balance: 0,
    invoiced: 0,
    paid: 0,
    balance: 0,
    has_documents: false,
    system_key: systemKey,
  });

  it.each([
    { kind: 'sale' as const, cashName: 'عميل نقدي', cashId: 'cash-c', otherName: 'أحمد سمير', accountKind: 'customer' as const, cashKey: 'cash_customer' as const },
    { kind: 'sale_return' as const, cashName: 'عميل نقدي', cashId: 'cash-c', otherName: 'أحمد سمير', accountKind: 'customer' as const, cashKey: 'cash_customer' as const },
    { kind: 'purchase' as const, cashName: 'مورد نقدي', cashId: 'cash-s', otherName: 'الشركة المتحدة', accountKind: 'supplier' as const, cashKey: 'cash_supplier' as const },
    { kind: 'purchase_return' as const, cashName: 'مورد نقدي', cashId: 'cash-s', otherName: 'الشركة المتحدة', accountKind: 'supplier' as const, cashKey: 'cash_supplier' as const },
  ])(
    'يثبت "$cashName" كأول خيار في القائمة بعد اختيار حساب آخر في $kind (أقل من 50 حساب)',
    ({ kind, cashName, cashId, otherName, accountKind, cashKey }) => {
      const accounts: AccountRow[] = [
        makeAccount('other-1', otherName, accountKind),
        makeAccount('other-2', 'بدر محمود', accountKind),
        makeAccount(cashId, cashName, accountKind, cashKey),
      ];

      const { container } = render(
        <InvoiceForm
          kind={kind}
          accounts={accounts}
          warehouses={mockWarehouses}
          cashBoxes={mockCashBoxes}
          items={mockItems}
          stockRows={mockStockRows}
          editing={null}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const accountField = container.querySelector('.field-account-select') as HTMLElement;
      const combobox = within(accountField).getByRole('combobox');
      const getAccountOptions = () => {
        const listbox = document.getElementById(combobox.getAttribute('aria-controls') ?? '') as HTMLElement;
        return within(listbox).getAllByRole('option');
      };

      fireEvent.focus(combobox);
      let options = getAccountOptions();
      expect(options[0]).toHaveTextContent(cashName);

      // اختيار حساب غير نقدي
      const otherOption = options.find((opt) => opt.textContent?.includes(otherName));
      expect(otherOption).toBeDefined();
      fireEvent.click(otherOption!);
      expect(combobox).toHaveAttribute('placeholder', otherName);

      // إعادة فتح القائمة: يجب أن يظل العميل/المورد النقدي ظاهراً وكأول خيار
      fireEvent.focus(combobox);
      options = getAccountOptions();
      expect(options[0]).toHaveTextContent(cashName);
      expect(options.some((opt) => opt.textContent?.includes(otherName))).toBe(true);
    },
  );

  it.each([
    { kind: 'sale' as const, cashName: 'عميل نقدي', cashId: 'cash-c', otherName: 'يوسف الزعيم', accountKind: 'customer' as const, cashKey: 'cash_customer' as const },
    { kind: 'sale_return' as const, cashName: 'عميل نقدي', cashId: 'cash-c', otherName: 'يوسف الزعيم', accountKind: 'customer' as const, cashKey: 'cash_customer' as const },
    { kind: 'purchase' as const, cashName: 'مورد نقدي', cashId: 'cash-s', otherName: 'ياسين للتوريدات', accountKind: 'supplier' as const, cashKey: 'cash_supplier' as const },
    { kind: 'purchase_return' as const, cashName: 'مورد نقدي', cashId: 'cash-s', otherName: 'ياسين للتوريدات', accountKind: 'supplier' as const, cashKey: 'cash_supplier' as const },
  ])(
    'يثبت "$cashName" كأول خيار في البحث غير المتزامن (>50 حساب) بعد اختيار حساب آخر في $kind',
    async ({ kind, cashName, cashId, otherName, accountKind, cashKey }) => {
      const top25 = Array.from({ length: 25 }, (_, i) =>
        makeAccount(`acc-top-${i}`, `أحمد ${String(i + 1).padStart(2, '0')}`, accountKind),
      );
      const midAccounts = Array.from({ length: 30 }, (_, i) =>
        makeAccount(`acc-mid-${i}`, `باسم ${i + 1}`, accountKind),
      );
      const selectedTarget = makeAccount('acc-target', otherName, accountKind);
      const cashAccount = makeAccount(cashId, cashName, accountKind, cashKey, 1);
      const manyAccounts: AccountRow[] = [...top25, ...midAccounts, cashAccount, selectedTarget];

      const searchSpy = vi
        .spyOn(masterDataQueries, 'searchAccountsAsync')
        .mockImplementation(async (_k, query = '') => {
          const q = query.trim();
          if (!q) {
            // محاكاة عودة أول 25 حساباً أبجدياً فقط دون الحساب النقدي أو المختار المتأخر أبجدياً
            return top25.map((a) => ({ value: a.id, label: a.name }));
          }
          if (q.includes(otherName.slice(0, 4))) {
            return [{ value: selectedTarget.id, label: selectedTarget.name }];
          }
          if (q.includes('نقدي')) {
            // محاكاة عودة 25 حساباً آخر تبدأ بـ"نقدي" دون الحساب النقدي الرسمي
            return [{ value: 'acc-top-0', label: 'أحمد نقدي تجاري' }];
          }
          return [];
        });

      try {
        const { container } = render(
          <InvoiceForm
            kind={kind}
            accounts={manyAccounts}
            warehouses={mockWarehouses}
            cashBoxes={mockCashBoxes}
            items={mockItems}
            stockRows={mockStockRows}
            editing={null}
            readOnly={false}
            onSaved={vi.fn()}
            onCancel={vi.fn()}
          />,
        );

        const accountField = container.querySelector('.field-account-select') as HTMLElement;
        const combobox = within(accountField).getByRole('combobox');
        const getAccountOptions = () => {
          const listbox = document.getElementById(combobox.getAttribute('aria-controls') ?? '') as HTMLElement;
          return within(listbox).getAllByRole('option');
        };

        // البحث واختيار حساب غير نقدي
        fireEvent.focus(combobox);
        fireEvent.change(combobox, { target: { value: otherName.slice(0, 4) } });

        await waitFor(() => {
          expect(getAccountOptions()[0]).toHaveTextContent(otherName);
        });
        fireEvent.click(getAccountOptions()[0]);
        expect(combobox).toHaveAttribute('placeholder', otherName);

        // إعادة فتح القائمة بدون نص بحث: يظل الحساب النقدي أول خيار قبل وأثناء وبعد الجلب
        fireEvent.focus(combobox);
        expect(getAccountOptions()[0]).toHaveTextContent(cashName);

        await waitFor(() => {
          expect(searchSpy).toHaveBeenCalledWith(accountKind, '', 25, { includeCashAccount: true });
        });

        const optionsAfterLoad = getAccountOptions();
        expect(optionsAfterLoad[0]).toHaveTextContent(cashName);
        expect(optionsAfterLoad[1]).toHaveTextContent(otherName);

        // عند البحث بكلمة "نقدي" يظهر الحساب النقدي كأول خيار حتى لو لم يُرجع في أعلى 25 نتيجة
        fireEvent.change(combobox, { target: { value: 'نقدي' } });
        await waitFor(() => {
          const cashSearchOptions = getAccountOptions();
          expect(cashSearchOptions[0]).toHaveTextContent(cashName);
        });
      } finally {
        searchSpy.mockRestore();
      }
    },
  );

  it('تعرض قائمة الخزنة في الشريط الجانبي للفاتورة الاسم فقط عند الاختيار والرصيد كسطر فرعي عند الفتح', () => {
    render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cashBoxInput = screen.getByDisplayValue('الخزينة الرئيسية') as HTMLInputElement;
    expect(cashBoxInput.value).toBe('الخزينة الرئيسية');

    fireEvent.focus(cashBoxInput);
    const cashOption = screen.getByRole('option', { name: /الخزينة الرئيسية/ });
    expect(within(cashOption).getByText(/10,000\.00/).closest('[dir="ltr"]')).toHaveClass('tabular-nums');
    expect(cashOption.querySelector('.searchable-select-sublabel')).toHaveTextContent('الرصيد: 10,000.00');
  });

  it('يعرض عمود المتاح لصنف الإدخال والسطور المدرجة ورصيد الخزنة في الشريط الجانبي عند الإنشاء والتعديل ويخفيهما في العرض فقط', async () => {
    const { container, rerender } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // 1. عمود المتاح ظاهر في الإنشاء/التعديل: يظهر "—" في سطر الإدخال قبل الاختيار ثم يتحدث فور اختيار الصنف
    expect(screen.getByRole('columnheader', { name: 'المتاح' })).toBeInTheDocument();
    const entryStockCell = container.querySelector('.entry-line-row .stock-available-cell')!;
    expect(entryStockCell).toHaveTextContent('—');

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemInput);
    fireEvent.click(await screen.findByRole('option', { name: /ITM-001 — سكر أبيض 1 كجم — كجم/ }));
    expect(entryStockCell).toHaveTextContent('60');
    expect(entryStockCell.textContent?.trim()).toBe('60');

    // السطور المدرجة تعرض المتاح رقماً صافياً بدون وحدة
    const insertedStockCells = Array.from(
      container.querySelectorAll('.inserted-line-row .stock-available-cell'),
    );
    expect(insertedStockCells.map((el) => el.textContent?.trim())).toEqual(['60', '30']);

    // 2. رصيد الخزنة ظاهر بجانب حقل الخزنة في الشريط الجانبي حتى والقائمة مقفولة بدون كلمة "الرصيد"
    const cashBalanceField = container.querySelector('.field-cashbox-balance')!;
    expect(cashBalanceField).not.toHaveTextContent('الرصيد');
    expect(cashBalanceField.querySelector('.cashbox-balance-box')).toHaveAttribute('aria-label', 'الرصيد');
    expect(cashBalanceField).toHaveTextContent('10,000.00');
    expect(cashBalanceField.querySelector('.cashbox-balance-box')).not.toHaveClass('is-danger');

    // 3. عند التبديل لوضع القراءة فقط readOnly: يختفي عمود المتاح وخانة رصيد الخزنة
    rerender(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'المتاح' })).not.toBeInTheDocument();
    expect(container.querySelector('.field-cashbox-balance')).toBeNull();
    expect(container.querySelectorAll('.readonly-unit-text')).toHaveLength(0);
  });

  it('في فواتير الصرف (مشتريات / مرتجع مبيعات): يحسب الرصيد المتاح للخزنة ويميز التجاوز باللون الأحمر', () => {
    const supplierAccounts = [
      {
        id: 'sup-cash',
        name: 'مورد نقدي عام',
        kind: 'supplier',
        balance: 0,
        is_active: true,
        notes: '',
        phone: '',
        serial_number: 1,
        opening_balance: 0,
        invoiced: 0,
        paid: 0,
        has_documents: false,
        system_key: 'cash_supplier',
      },
    ] as any;
    const lowBalanceBoxes = [
      {
        id: 'cb-1',
        name: 'الخزينة الرئيسية',
        balance: 100,
        is_active: true,
        is_primary: true,
        serial_number: 1,
        opening_balance: 0,
        notes: null,
      },
    ] as any;
    const purchaseEditing = {
      invoice: {
        ...mockEditingInvoice.invoice,
        kind: 'purchase' as const,
        account_id: 'sup-cash',
        account_kind: 'supplier' as const,
        total: 1000,
        paid: 200,
        remaining: 800,
      },
      lines: [{ key: 'l-1', item_id: 'itm-1', qty: '10', unit_price: '100' }],
    };

    const { container } = render(
      <InvoiceForm
        kind="purchase"
        accounts={supplierAccounts}
        warehouses={mockWarehouses}
        cashBoxes={lowBalanceBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={purchaseEditing}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // المورد نقدي فيسدد كامل 1000.00، بينما الرصيد المتاح بالخزنة = 100 + 200 (المدفوع سابقاً) = 300.00 بدون كلمة "الرصيد المتاح" ظاهرة
    const cashBalanceField = container.querySelector('.field-cashbox-balance')!;
    expect(cashBalanceField).not.toHaveTextContent('الرصيد');
    expect(cashBalanceField.querySelector('.cashbox-balance-box')).toHaveAttribute('aria-label', 'الرصيد المتاح');
    expect(cashBalanceField).toHaveTextContent('300.00');
    expect(cashBalanceField.querySelector('.cashbox-balance-box')).toHaveClass('is-danger');
  });

  it('عند عدم وجود مدفوع (0.00): يفرغ الخزنة ويعطلها ويعرض شرطة في الرصيد، ويفعّل الافتراضية تلقائياً عند وجود مدفوع', async () => {
    vi.mocked(supabase.rpc).mockClear();
    const creditOnlyAccounts = [mockAccounts[1]];
    const unpaidEditingInvoice = {
      invoice: {
        ...mockEditingInvoice.invoice,
        paid: 0,
        remaining: 1050,
        cash_box_id: null,
        cash_box_name: null,
      },
      lines: mockEditingInvoice.lines,
    };

    // 1. فاتورة جديدة بدون مدفوع: لا خزنة مختارة ولا نص "اختر الخزنة" وهي مقفولة، والرصيد "—"
    const { container: newContainer, unmount: unmountNew } = render(
      <InvoiceForm
        kind="sale"
        accounts={creditOnlyAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(within(newContainer).getByText('لا يوجد مدفوع')).toBeInTheDocument();
    const newCashBoxInput = within(newContainer).getByRole('combobox', { name: 'الخزنة' }) as HTMLInputElement;
    expect(newCashBoxInput).toBeDisabled();
    expect(newCashBoxInput.value).toBe('');
    expect(newCashBoxInput.placeholder).toBe('');
    expect(newContainer.querySelector('.field-cashbox-balance')).toHaveTextContent('—');
    unmountNew();

    // 2. تعديل فاتورة آجلة (المدفوع 0): يبدأ بلا خزنة، وعند السداد يختار الافتراضية، وعند التصفير يعود بلا خزنة ويرسل null
    const { container, rerender } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={unpaidEditingInvoice}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cashBoxInput = within(container).getByRole('combobox', { name: 'الخزنة' }) as HTMLInputElement;
    expect(cashBoxInput).toBeDisabled();
    expect(cashBoxInput.value).toBe('');
    expect(container.querySelector('.field-cashbox-balance')).toHaveTextContent('—');

    fireEvent.click(within(container).getByRole('button', { name: 'دفع بالكامل' }));
    expect(cashBoxInput).not.toBeDisabled();
    expect(cashBoxInput.value).toBe('الخزينة الرئيسية');
    expect(container.querySelector('.field-cashbox-balance')).toHaveTextContent('10,000.00');
    expect(within(container).queryByText('لا يوجد مدفوع')).toBeNull();

    fireEvent.click(within(container).getByRole('button', { name: 'عدم دفع شيء (تصفير)' }));
    expect(cashBoxInput).toBeDisabled();
    expect(cashBoxInput.value).toBe('');
    expect(cashBoxInput.placeholder).toBe('');
    expect(container.querySelector('.field-cashbox-balance')).toHaveTextContent('—');
    expect(within(container).getByText('لا يوجد مدفوع')).toBeInTheDocument();

    fireEvent.click(within(container).getByRole('button', { name: 'حفظ التعديلات' }));
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'update_invoice_with_cash_box',
        expect.objectContaining({ p_paid: 0, p_cash_box_id: null }),
      );
    });

    // 3. عرض فقط (readOnly) لفاتورة آجلة غير مسددة: يعرض "—" بدلاً من الخزنة الافتراضية
    rerender(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={unpaidEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const readonlyCashBoxBox = container.querySelectorAll('.readonly-val-box');
    expect(Array.from(readonlyCashBoxBox).some((el) => el.textContent?.trim() === 'الخزينة الرئيسية')).toBe(false);
    expect(Array.from(readonlyCashBoxBox).some((el) => el.textContent?.trim() === '—')).toBe(true);
  });

  it('يقفل حقل المدفوع وأزرار السداد السريع للحساب النقدي ويفعلها للحساب الآجل دون رجوع مفاجئ للقيمة', () => {
    const creditAndCashAccounts = [
      makeAccount('acc-cash', 'عميل نقدي عام', 'customer', 'cash_customer', 1),
      makeAccount('acc-credit', 'شركة الأمل', 'customer', null, 2),
    ];

    const { container, rerender } = render(
      <InvoiceForm
        kind="sale"
        accounts={creditAndCashAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const itemInput = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemInput);
    fireEvent.click(screen.getByRole('option', { name: /ITM-001 — سكر أبيض 1 كجم — كجم/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إدراج' }));

    const paidInput = screen.getByLabelText('المدفوع') as HTMLInputElement;
    const payAllBtn = container.querySelector('.btn-paid-all') as HTMLButtonElement;
    const payZeroBtn = container.querySelector('.btn-paid-zero') as HTMLButtonElement;

    expect(paidInput).toBeDisabled();
    expect(payAllBtn).toBeDisabled();
    expect(payZeroBtn).toBeDisabled();
    expect(paidInput.value).toBe('35.00');

    // محاولة تغيير قيمة المدفوع على الحساب النقدي لا تنفذ التغيير
    fireEvent.change(paidInput, { target: { value: '50' } });
    expect(paidInput.value).toBe('35.00');

    // التحويل إلى حساب آجل يفعل الحقل والأزرار ويقبل تعديل المدفوع بحرية دون ارتداد
    fireEvent.focus(screen.getByDisplayValue('عميل نقدي عام'));
    fireEvent.click(screen.getByRole('option', { name: /شركة الأمل/ }));

    expect(paidInput).not.toBeDisabled();
    expect(payAllBtn).not.toBeDisabled();
    expect(payZeroBtn).not.toBeDisabled();
    expect(paidInput.value).toBe('0.00');

    fireEvent.change(paidInput, { target: { value: '20' } });
    expect(paidInput.value).toBe('20');

    // في وضع العرض فقط إذا كانت الخزنة غير موجودة بالقائمة يعرض cash_box_name المحفوظ بدلاً من "—"
    const archivedCashBoxInvoice = {
      ...mockEditingInvoice,
      invoice: {
        ...mockEditingInvoice.invoice,
        cash_box_id: 'cb-archived',
        cash_box_name: 'خزنة أرشيفية قديمة',
      },
    };
    rerender(
      <InvoiceForm
        kind="sale"
        accounts={creditAndCashAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={archivedCashBoxInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('خزنة أرشيفية قديمة')).toBeInTheDocument();
  });

  it('يعرض EmptyState الموحد بأيقونة داخل جدول الأصناف عندما يكون فارغاً في وضعي الإدخال والعرض', () => {
    const { container, rerender } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={null}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.querySelector('.lines-table tr.empty-state-row')).toBeInTheDocument();
    expect(container.querySelector('.lines-table .empty-state.is-compact .empty-state-icon')).toBeInTheDocument();
    expect(screen.getByText('لم يتم إدراج أصناف بعد')).toBeInTheDocument();
    expect(screen.getByText('اختر صنفاً من الشريط أعلاه واضغط إدراج أو Enter.')).toBeInTheDocument();

    const emptyEditingInvoice = {
      ...mockEditingInvoice,
      lines: [],
    };
    rerender(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={emptyEditingInvoice}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.querySelector('.lines-table .empty-state.is-compact .empty-state-icon')).toBeInTheDocument();
    expect(screen.getByText('لا توجد بنود في هذه الفاتورة.')).toBeInTheDocument();
  });

  it('في فواتير الصرف: يعرض شارة تجاوز الخزنة ويعطل زر الحفظ ويمنع الإرسال عند التجاوز', async () => {
    vi.mocked(supabase.rpc).mockClear();
    vi.mocked(toast.error).mockClear();
    const supplierAccounts = [
      {
        id: 'sup-cash',
        name: 'مورد نقدي عام',
        kind: 'supplier',
        balance: 0,
        is_active: true,
        notes: '',
        phone: '',
        serial_number: 1,
        opening_balance: 0,
        invoiced: 0,
        paid: 0,
        has_documents: false,
        system_key: 'cash_supplier',
      },
    ] as any;
    const lowBalanceBoxes = [
      {
        id: 'cb-1',
        name: 'الخزينة الرئيسية',
        balance: 100,
        is_active: true,
        is_primary: true,
        serial_number: 1,
        opening_balance: 0,
        notes: null,
      },
    ] as any;
    const purchaseEditing = {
      invoice: {
        ...mockEditingInvoice.invoice,
        kind: 'purchase' as const,
        account_id: 'sup-cash',
        account_kind: 'supplier' as const,
        total: 1000,
        paid: 200,
        remaining: 800,
      },
      lines: [{ key: 'l-1', item_id: 'itm-1', qty: '10', unit_price: '100' }],
    };

    const { container } = render(
      <InvoiceForm
        kind="purchase"
        accounts={supplierAccounts}
        warehouses={mockWarehouses}
        cashBoxes={lowBalanceBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={purchaseEditing}
        readOnly={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('overdraft-warning-badge');
    expect(alert).toHaveTextContent('تنبيه: المبلغ يتجاوز الرصيد المتوفر بالخزنة المحددة');

    const saveBtn = screen.getByRole('button', { name: /حفظ التعديلات/ });
    expect(saveBtn).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);
    expect(toast.error).toHaveBeenCalledWith('تنبيه: المبلغ يتجاوز الرصيد المتوفر بالخزنة المحددة');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('يبلغ عن حالة الانشغال via onBusyChange أثناء الحفظ ويعيدها إلى false عند الانتهاء', async () => {
    let resolveRpc!: (value: { data: unknown; error: null }) => void;
    vi.mocked(supabase.rpc).mockImplementationOnce(
      () => new Promise((resolve) => { resolveRpc = resolve; }) as never,
    );
    const onBusyChange = vi.fn();

    const { container, unmount } = render(
      <InvoiceForm
        kind="sale"
        accounts={mockAccounts}
        warehouses={mockWarehouses}
        cashBoxes={mockCashBoxes}
        items={mockItems}
        stockRows={mockStockRows}
        editing={mockEditingInvoice}
        readOnly={false}
        onBusyChange={onBusyChange}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));

    await act(async () => {
      resolveRpc({ data: { id: 'inv-101' }, error: null });
    });
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));

    unmount();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});

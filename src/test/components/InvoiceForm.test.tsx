import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InvoiceForm from '../../components/InvoiceForm';
import * as masterDataQueries from '../../lib/masterDataQueries';
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

  it('يزيل لاحقة العملة "ج.م" من حقول السعر والمدفوع مع الإبقاء على وحدة الكمية للصنف', () => {
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

    const suffixes = Array.from(container.querySelectorAll('.line-unit-suffix')).map((el) =>
      el.textContent?.trim(),
    );
    expect(suffixes).not.toContain('ج.م');
    expect(suffixes).toContain('قطعة');
    expect(suffixes).toContain('كجم');
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

      fireEvent.focus(combobox);
      let options = within(accountField).getAllByRole('option');
      expect(options[0]).toHaveTextContent(cashName);

      // اختيار حساب غير نقدي
      const otherOption = options.find((opt) => opt.textContent?.includes(otherName));
      expect(otherOption).toBeDefined();
      fireEvent.click(otherOption!);
      expect(combobox).toHaveAttribute('placeholder', otherName);

      // إعادة فتح القائمة: يجب أن يظل العميل/المورد النقدي ظاهراً وكأول خيار
      fireEvent.focus(combobox);
      options = within(accountField).getAllByRole('option');
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

        // البحث واختيار حساب غير نقدي
        fireEvent.focus(combobox);
        fireEvent.change(combobox, { target: { value: otherName.slice(0, 4) } });

        await waitFor(() => {
          expect(within(accountField).getAllByRole('option')[0]).toHaveTextContent(otherName);
        });
        fireEvent.click(within(accountField).getAllByRole('option')[0]);
        expect(combobox).toHaveAttribute('placeholder', otherName);

        // إعادة فتح القائمة بدون نص بحث: يظل الحساب النقدي أول خيار قبل وأثناء وبعد الجلب
        fireEvent.focus(combobox);
        expect(within(accountField).getAllByRole('option')[0]).toHaveTextContent(cashName);

        await waitFor(() => {
          expect(searchSpy).toHaveBeenCalledWith(accountKind, '', 25, { includeCashAccount: true });
        });

        const optionsAfterLoad = within(accountField).getAllByRole('option');
        expect(optionsAfterLoad[0]).toHaveTextContent(cashName);
        expect(optionsAfterLoad[1]).toHaveTextContent(otherName);

        // عند البحث بكلمة "نقدي" يظهر الحساب النقدي كأول خيار حتى لو لم يُرجع في أعلى 25 نتيجة
        fireEvent.change(combobox, { target: { value: 'نقدي' } });
        await waitFor(() => {
          const cashSearchOptions = within(accountField).getAllByRole('option');
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
});

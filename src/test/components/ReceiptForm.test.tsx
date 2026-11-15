import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReceiptForm from '../../components/ReceiptForm';
import { toast } from '../../components/Toast';
import * as masterDataQueries from '../../lib/masterDataQueries';
import { supabase } from '../../lib/supabase';

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

describe('ReceiptForm - نموذج إيصال الاستلام', () => {
  const mockAccounts = [
    {
      id: 'acc-1',
      name: 'عميل تجريبي',
      kind: 'customer',
      balance: 500,
      opening_balance: 0,
      is_active: true,
      notes: null,
      serial_number: 1,
      phone: '01012345678',
      address: 'القاهرة',
    },
  ] as any;

  const mockCashBoxes = [
    {
      id: 'cb-branch',
      name: 'خزنة الفرع 2',
      is_primary: false,
      is_active: true,
      balance: 1000,
      opening_balance: 0,
      serial_number: 2,
      notes: null,
    },
    {
      id: 'cb-main',
      name: 'الخزنة الرئيسية',
      is_primary: true,
      is_active: true,
      balance: 5000,
      opening_balance: 0,
      serial_number: 1,
      notes: null,
    },
  ] as any;

  it('لا يحتوي على كلمة "تفقيط المبلغ:" ويعرض تفقيط المبلغ بالعربية عند إدخال قيمة', () => {
    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    // التحقق من حذف كلمة تفقيط المبلغ:
    expect(screen.queryByText('تفقيط المبلغ:')).toBeNull();
    expect(screen.queryByText('تفقيط المبلغ')).toBeNull();

    // إدخال مبلغ 1500
    const amountInput = screen.getByLabelText('مبلغ الإيصال');
    fireEvent.change(amountInput, { target: { value: '1500' } });

    // التحقق من ظهور نص التفقيط بالعربية مباشرة
    expect(screen.getByText(/ألف وخمسمائة/)).toBeInTheDocument();
  });

  it('يحدد "الخزنة الرئيسية" كخيار افتراضي حتى وإن لم تكن الأولى في مصفوفة الخزائن', () => {
    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    // الخزنة الرئيسية يجب أن تكون هي المحددة افتراضياً
    expect(screen.getByDisplayValue(/الخزنة الرئيسية/)).toBeInTheDocument();
  });

  it('يعرض أزرار العرض (تعديل، طباعة، حذف، إغلاق) في وضع القراءة فقط', () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handlePrint = vi.fn();
    const handleCancel = vi.fn();

    const mockEditing = {
      id: 'rec-1',
      number: 'REC-001',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: 'دفعة نقدية',
      statement: null,
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={mockEditing}
          readOnly={true}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPrint={handlePrint}
          onSaved={vi.fn()}
          onCancel={handleCancel}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('تعديل الإيصال')).toBeInTheDocument();
    expect(screen.getByText('طباعة الإيصال')).toBeInTheDocument();
    expect(screen.getByText('حذف الإيصال')).toBeInTheDocument();
    expect(screen.getByText('إغلاق')).toBeInTheDocument();

    fireEvent.click(screen.getByText('تعديل الإيصال'));
    expect(handleEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('إغلاق'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('يعرض زر "إلغاء" بدلاً من "مسح / جديد" في وضع التعديل', () => {
    const handleCancel = vi.fn();
    const mockEditing = {
      id: 'rec-1',
      number: 'REC-001',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: 'دفعة',
      statement: null,
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={mockEditing}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={handleCancel}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('إلغاء')).toBeInTheDocument();
    expect(screen.queryByText('مسح / جديد')).toBeNull();

    fireEvent.click(screen.getByText('إلغاء'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('في وضع العرض readOnly لإيصال محذوف: يظهر زر "استعادة الإيصال" عند تمرير onRestore', () => {
    const onRestore = vi.fn();
    const mockEditing = {
      id: 'rec-1',
      number: 'REC-001',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: 'دفعة',
      statement: null,
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: '2026-11-02T00:00:00Z',
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={mockEditing}
          readOnly={true}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
          onRestore={onRestore}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('استعادة الإيصال')).toBeInTheDocument();
  });

  it('في وضع التعديل (editing): يتم تثبيت نوع الحساب ولا يسمح بتغييره منعاً لتضارب اتجاه السند', () => {
    const mockEditing = {
      id: 'rec-1',
      number: 'REC-001',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: 'دفعة',
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={mockEditing}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    // نوع الحساب معروض كقيمة ثابتة للقراءة فقط وليس كقائمة منسدلة قابلة للاختيار
    expect(screen.getByText('عميل')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('اختر النوع…')).toBeNull();
  });

  it('عند تغيير الحساب في وضع التعديل لا يخصم أثر الإيصال السابق من رصيد الحساب الجديد وتكون الدقة منزلتين عشريتين', async () => {
    const accountsWithSecond = [
      ...mockAccounts,
      {
        id: 'acc-2',
        name: 'عميل آخر',
        kind: 'customer',
        balance: 1000,
        opening_balance: 0,
        is_active: true,
        notes: null,
        serial_number: 2,
        phone: '01099999999',
        address: 'الجيزة',
      },
    ] as any;

    const mockEditing = {
      id: 'rec-1',
      number: 'REC-001',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: 'دفعة',
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={accountsWithSecond}
          cashBoxes={mockCashBoxes}
          editing={mockEditing}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const amountInput = screen.getByLabelText('مبلغ الإيصال');
    expect(amountInput).toHaveAttribute('step', '0.01');
    expect(amountInput).toHaveAttribute('min', '0.01');
    expect(amountInput.parentElement?.querySelector('.line-unit-suffix')).toBeNull();

    // تغيير الحساب إلى العميل الآخر ذي الرصيد 1000
    const accountCombo = screen.getByDisplayValue(/عميل تجريبي/);
    fireEvent.focus(accountCombo);
    fireEvent.click(await screen.findByText(/عميل آخر/));

    // يجب أن يبقى "المديونية قبل:" للعميل الجديد مساوياً 1,000.00 ج.م دون عكس مبلغ 1,500 منه
    const beforePill = screen.getByText('المديونية قبل:').closest('.stat-pill')!;
    expect(beforePill).toHaveTextContent('1,000.00');
  });

  it('يحذر ويعطل الحفظ عند نقل إيصال استلام من خزنة رصيدها أقل من المبلغ السابق', async () => {
    const boxes = [
      { id: 'cb-main', company_id: 'comp-1', name: 'الخزنة الرئيسية', balance: 500, is_primary: true, is_active: true } as any,
      { id: 'cb-alt', company_id: 'comp-1', name: 'خزنة فرعية', balance: 2000, is_primary: false, is_active: true } as any,
    ];
    const mockEditing = {
      id: 'rec-2',
      number: 'RCP-000002',
      receipt_date: '2026-11-01',
      amount: 1500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      notes: '',
      statement: null,
      description: null,
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={boxes}
          editing={mockEditing}
          readOnly={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const boxInput = screen.getByDisplayValue(/الخزنة الرئيسية/);
    fireEvent.focus(boxInput);
    fireEvent.click(await screen.findByText(/خزنة فرعية/));

    expect(screen.getByRole('alert')).toHaveTextContent('لا يمكن نقل الإيصال من (الخزنة الرئيسية)');
    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeDisabled();

    // محاولة الإرسال مباشرة (مثل الضغط على Enter) يجب ألا تستدعي RPC
    const form = screen.getByRole('button', { name: 'حفظ التعديلات' }).closest('form')!;
    fireEvent.submit(form);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('يحافظ على استبعاد العميل النقدي والمورد النقدي في السندات الحرة (>50 حساب)', async () => {
    const manyCustomers = Array.from({ length: 55 }, (_, i) => ({
      id: `cust-${i}`,
      name: `عميل ${i + 1}`,
      kind: 'customer',
      balance: 0,
      opening_balance: 0,
      is_active: true,
      notes: null,
      serial_number: i + 2,
      phone: null,
      system_key: null,
    })) as any;
    manyCustomers.push({
      id: 'cash-c',
      name: 'عميل نقدي',
      kind: 'customer',
      balance: 0,
      opening_balance: 0,
      is_active: true,
      notes: null,
      serial_number: 1,
      phone: null,
      system_key: 'cash_customer',
    });

    const searchSpy = vi
      .spyOn(masterDataQueries, 'searchAccountsAsync')
      .mockResolvedValue([{ value: 'cust-0', label: 'عميل 1' }]);

    try {
      render(
        <MemoryRouter>
          <ReceiptForm
            direction="in"
            accounts={manyCustomers}
            cashBoxes={mockCashBoxes}
            editing={null}
            onSaved={vi.fn()}
            onCancel={vi.fn()}
          />
        </MemoryRouter>,
      );

      const combobox = screen.getByPlaceholderText('ابحث باسم أو هاتف الحساب…');
      fireEvent.focus(combobox);

      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalledWith('customer', '');
      });
      expect(searchSpy.mock.calls[0]?.[3]).toBeUndefined();
      expect(screen.queryByRole('option', { name: /عميل نقدي/ })).toBeNull();
    } finally {
      searchSpy.mockRestore();
    }
  });

  it('يرتب بطاقات وحقول الإيصال وأزرار الإجراءات بالترتيب المعتمد (مع مسح/جديد قبل حفظ الإيصال)', () => {
    const { container } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const form = container.querySelector('form.receipt-form') as HTMLElement;
    const directCards = Array.from(form.children);
    expect(directCards.map((el) => el.className)).toEqual([
      'account-header-card',
      'receipt-amount-card',
      'receipt-meta-card',
      'row-actions-group',
    ]);

    const row1 = form.querySelector('.account-header-row1')!;
    expect(Array.from(row1.children).map((el) => el.className)).toEqual([
      'field-receipt-date',
      'field-account-kind',
      'field-account-main',
    ]);

    const row2 = form.querySelector('.account-header-row2')!;
    expect(Array.from(row2.children).map((el) => el.className)).toEqual([
      'field-account-notes',
      'account-balance-pills',
    ]);

    const amountCard = form.querySelector('.receipt-amount-card')!;
    const amountTafqeetRow = amountCard.querySelector('.row-amount-tafqeet')!;
    expect(Array.from(amountTafqeetRow.children).map((el) => el.className)).toEqual([
      'field-amount-slot',
      'field-tafqeet-card',
    ]);
    expect(amountTafqeetRow.querySelector('.field-amount-slot .btn-settle-all-action')).toBeInTheDocument();
    expect(amountCard.lastElementChild).toHaveClass('field-receipt-statement');
    expect(amountCard.querySelector('.field-receipt-statement .required-asterisk')).toBeNull();
    expect(amountCard.querySelector('.field-receipt-statement')).not.toHaveTextContent('*');
    const statementInput = amountCard.querySelector('.field-receipt-statement input') as HTMLInputElement;
    expect(statementInput).toBeRequired();
    expect(statementInput.placeholder).toBe('اكتب بيان الإيصال…');

    const metaCard = form.querySelector('.receipt-meta-card')!;
    const metaRow = metaCard.querySelector('.row-cashbox-balance-notes')!;
    expect(Array.from(metaRow.children).map((el) => el.className)).toEqual([
      'field-cashbox-select',
      'field-cashbox-balance',
      'field-receipt-notes',
    ]);
    const cashboxInput = metaRow.querySelector('.field-cashbox-select input') as HTMLInputElement;
    expect(cashboxInput.value).toBe('الخزنة الرئيسية');
    const balanceField = metaRow.querySelector('.field-cashbox-balance')!;
    expect(balanceField).not.toHaveTextContent('الرصيد');
    expect(balanceField.querySelector('.cashbox-balance-box')).toHaveAttribute('aria-label', 'الرصيد');
    expect(balanceField).toHaveTextContent('5,000.00');
    expect(balanceField.querySelector('.strong')).toBeNull();

    // فتح قائمة الخزن يعرض الرصيد كسطر فرعي داخل القائمة فقط دون تكراره في الحقل المقفول
    fireEvent.focus(cashboxInput);
    const optionSublabels = Array.from(document.body.querySelectorAll('.searchable-select-sublabel')).map(
      (el) => el.textContent?.trim(),
    );
    expect(optionSublabels).toEqual(['الرصيد: 5,000.00', 'الرصيد: 1,000.00']);

    const actionButtons = Array.from(form.querySelectorAll('.row-actions-group button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(actionButtons).toEqual(['حفظ إيصال الاستلام', 'مسح / جديد']);
  });

  it('يشترط إدخال البيان ويرسل البيان والملاحظات كحقلين مستقلين وتقوم إعادة الضبط بتفريغهما', async () => {
    vi.mocked(supabase.rpc).mockClear();
    vi.mocked(toast.error).mockClear();
    const onSaved = vi.fn();

    const { container, unmount } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={null}
          onSaved={onSaved}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const accountCombo = screen.getByPlaceholderText('ابحث باسم أو هاتف الحساب…');
    fireEvent.focus(accountCombo);
    fireEvent.click(await screen.findByText(/عميل تجريبي/));

    const amountInput = screen.getByLabelText('مبلغ الإيصال');
    fireEvent.change(amountInput, { target: { value: '250' } });

    const statementInput = screen.getByPlaceholderText('اكتب بيان الإيصال…') as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText('ملاحظات اختيارية…') as HTMLTextAreaElement;
    expect(notesInput.tagName).toBe('TEXTAREA');
    fireEvent.change(statementInput, { target: { value: '   ' } });
    fireEvent.change(notesInput, { target: { value: 'ملاحظة اختيارية فقط' } });

    const form = container.querySelector('form.receipt-form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(toast.error).toHaveBeenCalledWith('أدخل البيان أولاً');
    expect(supabase.rpc).not.toHaveBeenCalled();

    fireEvent.change(statementInput, { target: { value: 'سداد دفعة نقدية' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_free_receipt', {
        p_direction: 'in',
        p_account_id: 'acc-1',
        p_cash_box_id: 'cb-main',
        p_receipt_date: expect.any(String),
        p_amount: 250,
        p_description: 'سداد دفعة نقدية',
        p_notes: 'ملاحظة اختيارية فقط',
      });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'مسح / جديد' }));
    expect(statementInput.value).toBe('');
    expect(notesInput.value).toBe('');

    unmount();

    // التحقق في وضع التعديل من تحميل البيان والملاحظات منفصلين وتمريرهما منفصلين عند التحديث
    vi.mocked(supabase.rpc).mockClear();
    const editingReceipt = {
      id: 'rec-edit-1',
      number: 'RCP-000050',
      receipt_date: '2026-11-14',
      amount: 300,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      description: 'دفعة أولى',
      statement: 'دفعة أولى',
      notes: 'تحويل بنكي',
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    const { container: editContainer } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={editingReceipt}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const editStatement = screen.getByDisplayValue('دفعة أولى') as HTMLInputElement;
    const editNotes = screen.getByDisplayValue('تحويل بنكي') as HTMLInputElement;
    fireEvent.change(editStatement, { target: { value: 'دفعة معدلة' } });
    fireEvent.change(editNotes, { target: { value: '' } });

    fireEvent.submit(editContainer.querySelector('form.receipt-form') as HTMLFormElement);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('update_free_receipt', {
        p_receipt_id: 'rec-edit-1',
        p_account_id: 'acc-1',
        p_cash_box_id: 'cb-main',
        p_receipt_date: '2026-11-14',
        p_amount: 300,
        p_description: 'دفعة معدلة',
        p_notes: null,
      });
    });
  });

  it('يعرض البيان والخزنة ورصيدها والملاحظات في وضع القراءة فقط وفي إيصال الصرف بنفس السطر', () => {
    const outEditing = {
      id: 'rec-ro-1',
      number: 'RCP-000070',
      receipt_date: '2026-11-14',
      amount: 400,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: true,
      description: 'بيان محفوظ للإيصال',
      statement: 'بيان محفوظ للإيصال',
      notes: 'ملاحظة محفوظة',
      invoice_id: null,
      invoice_number: null,
      invoice_kind: null,
      direction: 'out',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    const { container, unmount } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="out"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={outEditing}
          readOnly
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('.field-receipt-statement')).toHaveTextContent('بيان محفوظ للإيصال');
    const metaRow = container.querySelector('.row-cashbox-balance-notes')!;
    expect(metaRow.querySelector('.field-cashbox-select')).toHaveTextContent('الخزنة الرئيسية');
    expect(metaRow.querySelector('.field-cashbox-balance')).toBeNull();
    expect(metaRow.querySelector('.field-receipt-notes')).toHaveTextContent('ملاحظة محفوظة');
    expect(container.querySelector('.cashbox-balance-hint')).toBeNull();

    unmount();

    // في وضع التحرير لإيصال صرف يتجاوز الرصيد، يبرز صندوق رصيد الخزنة بالخطر داخل السطر الخامس نفسه
    const { container: outEditContainer } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="out"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const amountInput = screen.getByLabelText('مبلغ الإيصال');
    fireEvent.change(amountInput, { target: { value: '9000' } });

    const outMetaRow = outEditContainer.querySelector('.row-cashbox-balance-notes')!;
    const outBalanceField = outMetaRow.querySelector('.field-cashbox-balance')!;
    expect(outBalanceField).not.toHaveTextContent('الرصيد');
    expect(outBalanceField.querySelector('.cashbox-balance-box')).toHaveAttribute('aria-label', 'الرصيد المتاح');
    expect(outBalanceField.querySelector('.cashbox-balance-box')).toHaveClass('is-danger');
    expect(outEditContainer.querySelector('.overdraft-warning-badge')).toBeInTheDocument();
  });

  it('ينسق شريط ربط الإيصال التلقائي بالفاتورة كسطر موحد يضم الرابط والملاحظة', () => {
    const linkedEditing = {
      id: 'rec-linked-1',
      number: 'RCP-000010',
      receipt_date: '2026-11-14',
      amount: 500,
      account_id: 'acc-1',
      account_name: 'عميل تجريبي',
      account_kind: 'customer',
      cash_box_id: 'cb-main',
      cash_box_name: 'الخزنة الرئيسية',
      is_free: false,
      notes: '',
      statement: null,
      description: null,
      invoice_id: 'inv-8003',
      invoice_number: 'SAL-008003',
      invoice_kind: 'sale',
      direction: 'in',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    const { container } = render(
      <MemoryRouter>
        <ReceiptForm
          direction="in"
          accounts={mockAccounts}
          cashBoxes={mockCashBoxes}
          editing={linkedEditing}
          readOnly
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const banner = container.querySelector('.linked-receipt-box')!;
    expect(banner).toBeInTheDocument();
    expect(Array.from(banner.children).map((el) => el.className)).toEqual([
      'linked-receipt-main',
      'linked-receipt-note',
    ]);
    expect(banner.querySelector('.linked-receipt-main .receipt-linked-link')).toHaveTextContent(
      'فاتورة مبيعات SAL-008003',
    );
    expect(banner.querySelector('.linked-receipt-note')).toHaveTextContent(
      'يتم تعديله أو حذفه من داخل الفاتورة نفسها',
    );
  });
});

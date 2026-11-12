import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReceiptForm from '../../components/ReceiptForm';
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
});

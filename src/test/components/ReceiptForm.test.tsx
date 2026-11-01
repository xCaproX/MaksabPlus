import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReceiptForm from '../../components/ReceiptForm';

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
      <ReceiptForm
        direction="in"
        accounts={mockAccounts}
        cashBoxes={mockCashBoxes}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
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
      <ReceiptForm
        direction="in"
        accounts={mockAccounts}
        cashBoxes={mockCashBoxes}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // الخزنة الرئيسية يجب أن تكون هي المحددة افتراضياً
    expect(screen.getByDisplayValue(/الخزنة الرئيسية/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CashBoxTransferForm from '../../components/CashBoxTransferForm';

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

describe('CashBoxTransferForm - نموذج التحويل بين الخزائن', () => {
  const mockCashBoxes = [
    {
      id: 'cb-1',
      name: 'الخزنة الرئيسية',
      is_primary: true,
      is_active: true,
      balance: 5000,
      opening_balance: 0,
      serial_number: 1,
      notes: null,
    },
    {
      id: 'cb-2',
      name: 'خزنة الفرع',
      is_primary: false,
      is_active: true,
      balance: 1000,
      opening_balance: 0,
      serial_number: 2,
      notes: null,
    },
  ] as any;

  it('يعرض حقول النموذج الثلاثية في السطر الأول ومؤشرات الرصيد والتاريخ', () => {
    render(
      <CashBoxTransferForm
        cashBoxes={mockCashBoxes}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('من خزنة (المصدر) *')).toBeInTheDocument();
    expect(screen.getByText('إلى خزنة (الوجهة) *')).toBeInTheDocument();
    expect(screen.getByText('تاريخ التحويل *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('DD/MM/YYYY')).toBeInTheDocument();
  });

  it('يعرض تفقيط المبلغ بالعربية عند إدخال قيمة في حقل المبلغ', () => {
    render(
      <CashBoxTransferForm
        cashBoxes={mockCashBoxes}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const amountInput = screen.getByLabelText('المبلغ المراد تحويله');
    fireEvent.change(amountInput, { target: { value: '2500' } });

    expect(screen.getByText(/ألفان وخمسمائة/)).toBeInTheDocument();
  });

  it('يعرض أزرار العرض (تعديل، طباعة، حذف، إغلاق) في وضع القراءة فقط', () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handlePrint = vi.fn();
    const handleCancel = vi.fn();

    const mockEditing = {
      id: 'cbt-1',
      number: 'CBT-001',
      transfer_date: '2026-11-01',
      amount: 1500,
      source_cash_box_id: 'cb-1',
      source_cash_box_name: 'الخزنة الرئيسية',
      destination_cash_box_id: 'cb-2',
      destination_cash_box_name: 'خزنة الفرع',
      notes: 'تحويل دوري',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <CashBoxTransferForm
        cashBoxes={mockCashBoxes}
        editing={mockEditing}
        readOnly={true}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPrint={handlePrint}
        onSaved={vi.fn()}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('تعديل التحويل')).toBeInTheDocument();
    expect(screen.getByText('طباعة')).toBeInTheDocument();
    expect(screen.getByText('حذف')).toBeInTheDocument();
    expect(screen.getByText('إغلاق')).toBeInTheDocument();

    fireEvent.click(screen.getByText('تعديل التحويل'));
    expect(handleEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('إغلاق'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('في وضع العرض readOnly لمستند محذوف: يظهر زر "استعادة التحويل"', () => {
    const onRestore = vi.fn();
    const mockEditing = {
      id: 'cbt-1',
      number: 'CBT-001',
      transfer_date: '2026-11-01',
      amount: 1500,
      source_cash_box_id: 'cb-1',
      source_cash_box_name: 'الخزنة الرئيسية',
      destination_cash_box_id: 'cb-2',
      destination_cash_box_name: 'خزنة الفرع',
      notes: null,
      created_at: new Date().toISOString(),
      deleted_at: '2026-11-02T00:00:00Z',
    } as any;

    render(
      <CashBoxTransferForm
        cashBoxes={mockCashBoxes}
        editing={mockEditing}
        readOnly={true}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onRestore={onRestore}
      />
    );

    expect(screen.getByText('استعادة التحويل')).toBeInTheDocument();
  });
});

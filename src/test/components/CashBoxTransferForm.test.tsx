import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CashBoxTransferForm from '../../components/CashBoxTransferForm';
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

describe('CashBoxTransferForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يظهر العجز الحقيقي لخزنة الوجهة عند تقليل تحويل صُرف جزء منه ويمنع الحفظ', () => {
    const cashBoxes = [
      { id: 'cb-src', name: 'الخزنة الرئيسية', is_primary: true, is_active: true, balance: 2000, opening_balance: 0, serial_number: 1, notes: null },
      { id: 'cb-dest', name: 'خزنة الفرع', is_primary: false, is_active: true, balance: 300, opening_balance: 0, serial_number: 2, notes: null },
    ] as any;

    const editingTransfer = {
      id: 'tr-1',
      number: 'CBT-0001',
      transfer_date: '2026-11-10',
      source_cash_box_id: 'cb-src',
      source_cash_box_name: 'الخزنة الرئيسية',
      destination_cash_box_id: 'cb-dest',
      destination_cash_box_name: 'خزنة الفرع',
      amount: 1000,
      notes: '',
      created_at: new Date().toISOString(),
      deleted_at: null,
    } as any;

    render(
      <CashBoxTransferForm
        cashBoxes={cashBoxes}
        editing={editingTransfer}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('المبلغ المراد تحويله');
    expect((screen.getByDisplayValue('الخزنة الرئيسية') as HTMLInputElement).value).toBe('الخزنة الرئيسية');
    expect((screen.getByDisplayValue('خزنة الفرع') as HTMLInputElement).value).toBe('خزنة الفرع');
    expect(amountInput).toHaveAttribute('step', '0.01');
    expect(amountInput).toHaveAttribute('min', '0.01');
    expect(amountInput.parentElement?.querySelector('.line-unit-suffix')).toBeNull();

    // تقليل التحويل من 1000 إلى 200 رغم أن رصيد الوجهة 300 فقط -> عجز -500 في الوجهة
    fireEvent.change(amountInput, { target: { value: '200' } });

    expect(screen.getByText('عجز')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('سيصبح رصيد خزنة الوجهة');

    fireEvent.submit(amountInput.closest('form')!);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('يوحد شكل التفقيط ويستخدم أصناف CSS دون style مضمّن ويفتح قوائم الخزن في portal', () => {
    const cashBoxes = [
      { id: 'cb-1', name: 'الخزنة الرئيسية', balance: 2000, opening_balance: 2000, is_active: true, is_primary: true, serial_number: 1, notes: null },
      { id: 'cb-2', name: 'خزنة الفرع', balance: 300, opening_balance: 300, is_active: true, is_primary: false, serial_number: 2, notes: null },
    ] as any;

    const { container } = render(
      <CashBoxTransferForm
        cashBoxes={cashBoxes}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('.tafqeet-label')).toBeNull();
    expect(container.querySelector('.field-tafqeet-card .tafqeet-text')).toHaveTextContent('—');
    expect(container.querySelector('.cashbox-date-card')).not.toBeNull();
    expect(container.querySelector('.cashbox-date-card')?.hasAttribute('style')).toBe(false);
    expect(container.querySelector('.cashbox-notes-card')).not.toBeNull();
    expect(container.querySelector('.cashbox-notes-card')?.hasAttribute('style')).toBe(false);

    const sourceCombo = screen.getByDisplayValue('الخزنة الرئيسية');
    fireEvent.focus(sourceCombo);
    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(container.contains(listbox)).toBe(false);
  });
});

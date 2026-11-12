import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CashBoxOpeningTab from '../../pages/management/CashBoxOpeningTab';
import CashBoxesTab from '../../pages/master-data/CashBoxesTab';
import { supabase } from '../../lib/supabase';
import { toast } from '../../components/Toast';

vi.mock('../../lib/access', () => ({
  useAccess: () => ({ can: () => true, canViewProfit: true, canViewPurchasePrice: true }),
}));
vi.mock('../../context/MasterDataContext', () => ({
  useMasterData: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../../components/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/supabase', () => {
  function queryBuilder() {
    const q = {
      select: () => q,
      order: () => q,
      range: () => Promise.resolve({ data: [], count: 0, error: null }),
    };
    return q;
  }
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: queryBuilder,
    },
  };
});

describe('cash box opening balance non-negative validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CashBoxOpeningTab sets min="0" and blocks negative opening balance before RPC', async () => {
    const { rerender } = render(
      <CashBoxOpeningTab
        cashBoxes={[
          { id: 'cb-1', name: 'الخزنة الرئيسية', is_primary: true, is_active: true, balance: 1000, opening_balance: 1000, serial_number: 1, notes: null },
        ]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        saveTrigger={0}
      />,
    );

    const input = screen.getByDisplayValue('1000');
    expect(input).toHaveAttribute('min', '0');

    fireEvent.change(input, { target: { value: '-50' } });
    rerender(
      <CashBoxOpeningTab
        cashBoxes={[
          { id: 'cb-1', name: 'الخزنة الرئيسية', is_primary: true, is_active: true, balance: 1000, opening_balance: 1000, serial_number: 1, notes: null },
        ]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        saveTrigger={1}
      />,
    );

    expect(toast.error).toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('CashBoxesTab sets min="0" and blocks negative opening balance on create', async () => {
    render(
      <MemoryRouter initialEntries={['/data?tab=cashBoxes&action=new']}>
        <CashBoxesTab />
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole('dialog');
    const nameInput = dialog.querySelector('input[type="text"]')!;
    const openingInput = dialog.querySelector('input[type="number"]')!;
    expect(openingInput).toHaveAttribute('min', '0');

    fireEvent.change(nameInput, { target: { value: 'خزنة اختبار' } });
    fireEvent.change(openingInput, { target: { value: '-100' } });
    fireEvent.submit(dialog.querySelector('form')!);

    expect(toast.error).toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

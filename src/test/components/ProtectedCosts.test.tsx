import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StockOpeningTab from '../../pages/management/StockOpeningTab';
import WarehouseTransferTable from '../../pages/invoices/WarehouseTransferTable';
import { calculateInvoiceKpis } from '../../pages/invoices/invoiceKpis';
import { supabase } from '../../lib/supabase';
import { toast } from '../../components/Toast';
import type { StockOpeningRow } from '../../lib/types';

const access = vi.hoisted(() => ({ canViewProfit: false }));
vi.mock('../../lib/access', () => ({ useAccess: () => access }));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}));
vi.mock('../../components/Toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const row: StockOpeningRow = {
  item_id: 'item-1', item_number: 1, item_code: 'ITM-1', item_name: 'صنف تجريبي', unit: 'قطعة',
  warehouse_id: 'warehouse-1', warehouse_number: 1, warehouse_name: 'مخزن تجريبي',
  warehouse_notes: null, item_notes: null, opening_qty: 10, current_qty: 10,
  unit_cost: null, cost_locked: true,
};

const unchangedRow: StockOpeningRow = {
  item_id: 'item-2', item_number: 2, item_code: 'ITM-2', item_name: 'صنف غير معدل', unit: 'قطعة',
  warehouse_id: 'warehouse-1', warehouse_number: 1, warehouse_name: 'مخزن تجريبي',
  warehouse_notes: null, item_notes: null, opening_qty: 5, current_qty: 5,
  unit_cost: 50, cost_locked: false,
};

describe('protected accounting costs', () => {
  beforeEach(() => { vi.clearAllMocks(); access.canViewProfit = false; });

  it('quantity editor hides costs and submits only changed rows with null unit_cost', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <StockOpeningTab
        warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
        stockRows={[row, unchangedRow]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={onRefresh}
        saveTrigger={0}
      />,
    );
    expect(screen.queryByText('تكلفة الوحدة')).not.toBeInTheDocument();
    expect(screen.queryByText('قيمة بضاعة أول المدة')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
    rerender(
      <StockOpeningTab
        warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
        stockRows={[row, unchangedRow]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={onRefresh}
        saveTrigger={1}
      />,
    );

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('save_opening_balances', {
      p_cash_boxes: [], p_stock: [{ warehouse_id: 'warehouse-1', item_id: 'item-1', opening_qty: 12, unit_cost: null }],
    }));
  });

  it('skips RPC call when no stock opening values changed', async () => {
    render(
      <StockOpeningTab
        warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
        stockRows={[row]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        saveTrigger={1}
      />,
    );
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('owner retains opening cost display and submits edited cost row', async () => {
    access.canViewProfit = true;
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <StockOpeningTab
        warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
        stockRows={[{ ...row, unit_cost: 120 }, unchangedRow]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={onRefresh}
        saveTrigger={0}
      />,
    );
    expect(screen.getByText('تكلفة الوحدة')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '15' } });
    rerender(
      <StockOpeningTab
        warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
        stockRows={[{ ...row, unit_cost: 120 }, unchangedRow]}
        canEditOpening
        saving={false}
        setSaving={vi.fn()}
        onRefresh={onRefresh}
        saveTrigger={1}
      />,
    );
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('save_opening_balances', {
      p_cash_boxes: [], p_stock: [{ warehouse_id: 'warehouse-1', item_id: 'item-1', opening_qty: 15, unit_cost: 120 }],
    }));
  });

  it.each([false, true])('transfer cost column and KPI follow permission %s', (canViewProfit) => {
    render(<WarehouseTransferTable loading={false} pageTransfers={[]} sortOrder="date-desc"
      onSort={vi.fn()} showDeleted={false} onView={vi.fn()} onEdit={vi.fn()}
      onDelete={vi.fn()} onRestore={vi.fn()} canEdit={false} canDelete={false}
      canViewProfit={canViewProfit} />);
    expect(Boolean(screen.queryByText('قيمة التكلفة'))).toBe(canViewProfit);
    const kpis = calculateInvoiceKpis({ kind: 'warehouse_transfer', isWarehouseTransfer: true, canViewProfit });
    expect(kpis.some((item) => item.id === 'transfers-value')).toBe(canViewProfit);
  });
});

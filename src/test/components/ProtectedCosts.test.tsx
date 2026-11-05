import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StockOpeningTab from '../../pages/management/StockOpeningTab';
import WarehouseTransferTable from '../../pages/invoices/WarehouseTransferTable';
import { calculateInvoiceKpis } from '../../pages/invoices/invoiceKpis';
import { supabase } from '../../lib/supabase';
import type { StockOpeningRow } from '../../lib/types';

const access = vi.hoisted(() => ({ canViewProfit: false }));
vi.mock('../../lib/access', () => ({ useAccess: () => access }));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}));
vi.mock('../../components/Toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row: StockOpeningRow = {
  item_id: 'item-1', item_number: 1, item_code: 'ITM-1', item_name: 'صنف تجريبي', unit: 'قطعة',
  warehouse_id: 'warehouse-1', warehouse_number: 1, warehouse_name: 'مخزن تجريبي',
  warehouse_notes: null, item_notes: null, opening_qty: 10, current_qty: 10,
  unit_cost: null, cost_locked: true,
};

describe('protected accounting costs', () => {
  beforeEach(() => { vi.clearAllMocks(); access.canViewProfit = false; });

  it('quantity editor hides costs and submits null so the database preserves them', async () => {
    render(<StockOpeningTab warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
      stockRows={[row]} canEditOpening saving={false} setSaving={vi.fn()}
      onRefresh={vi.fn().mockResolvedValue(undefined)} saveTrigger={1} />);
    expect(screen.queryByText('تكلفة الوحدة')).not.toBeInTheDocument();
    expect(screen.queryByText('قيمة بضاعة أول المدة')).not.toBeInTheDocument();
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('save_opening_balances', {
      p_cash_boxes: [], p_stock: [{ warehouse_id: 'warehouse-1', item_id: 'item-1', opening_qty: 10, unit_cost: null }],
    }));
  });

  it('owner retains opening cost display and submission', async () => {
    access.canViewProfit = true;
    render(<StockOpeningTab warehouses={[{ id: 'warehouse-1', name: 'مخزن تجريبي' }]}
      stockRows={[{ ...row, unit_cost: 120 }]} canEditOpening saving={false} setSaving={vi.fn()}
      onRefresh={vi.fn().mockResolvedValue(undefined)} saveTrigger={1} />);
    expect(screen.getByText('تكلفة الوحدة')).toBeInTheDocument();
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('save_opening_balances', {
      p_cash_boxes: [], p_stock: [{ warehouse_id: 'warehouse-1', item_id: 'item-1', opening_qty: 10, unit_cost: 120 }],
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

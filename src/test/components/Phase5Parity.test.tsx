import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ItemBalancesTab, { type WarehouseItemRow } from '../../pages/balances/ItemBalancesTab';
import ReconciliationLogTab from '../../pages/management/ReconciliationLogTab';
import CashBoxOpeningTab from '../../pages/management/CashBoxOpeningTab';
import StockOpeningTab from '../../pages/management/StockOpeningTab';
import type { ReconciliationLogRow } from '../../lib/types';

const state = vi.hoisted(() => ({
  itemRows: [] as WarehouseItemRow[],
  itemError: null as { message: string } | null,
  logRows: [] as ReconciliationLogRow[],
  logError: null as { message: string } | null,
  orderCalls: [] as Array<{ col: string; ascending: boolean }>,
  rpcCalls: [] as string[],
}));

vi.mock('../../lib/access', () => ({
  useAccess: () => ({ can: () => true, canViewProfit: true, canViewPurchasePrice: true }),
}));

vi.mock('../../context/MasterDataContext', () => ({
  useMasterData: () => ({
    warehouses: [
      { id: 'wh-1', name: 'المخزن الرئيسي', serial_number: 1, is_active: true, is_primary: true },
    ],
    resourceStatus: {
      warehouses: { loading: false, error: null, hasLoaded: true },
    },
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../components/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../lib/supabase', () => {
  function itemQuery() {
    const q = {
      select: () => q,
      eq: () => q,
      order: (col: string, opts?: { ascending?: boolean }) => {
        state.orderCalls.push({ col, ascending: Boolean(opts?.ascending) });
        return q;
      },
      range: () =>
        Promise.resolve(
          state.itemError
            ? { data: null, count: null, error: state.itemError }
            : { data: state.itemRows, count: state.itemRows.length, error: null },
        ),
    };
    return q;
  }

  function logQuery() {
    const q = {
      select: () => q,
      gte: () => q,
      lt: () => q,
      order: (col: string, opts?: { ascending?: boolean }) => {
        state.orderCalls.push({ col, ascending: Boolean(opts?.ascending) });
        return q;
      },
      range: () =>
        Promise.resolve(
          state.logError
            ? { data: null, count: null, error: state.logError }
            : { data: state.logRows, count: state.logRows.length, error: null },
        ),
    };
    return q;
  }

  return {
    supabase: {
      rpc: (name: string) => {
        state.rpcCalls.push(name);
        if (name === 'filter_warehouse_item_rows') return itemQuery();
        if (name === 'get_warehouse_stock_kpis_columns') {
          return Promise.resolve({
            data: { total_qty: 12.5, total_val: 500, out_of_stock_count: 0, count: 1 },
            error: null,
          });
        }
        if (name === 'filter_reconciliation_rows') return logQuery();
        if (name === 'get_reconciliation_log_kpis_columns') {
          return Promise.resolve({
            data: { total_discrepancies: 2, latest_created_at: '2026-11-15T10:00:00Z', latest_status: 'clean' },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

describe('Phase 5 shared UI, direction, badge, and drawer parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.orderCalls = [];
    state.rpcCalls = [];
    state.itemError = null;
    state.logError = null;
    state.itemRows = [
      {
        item_id: 'itm-1',
        item_name: 'سكر أبيض',
        item_code: 'SKU-10',
        unit: 'كجم',
        sale_price: 50,
        purchase_price: 40,
        item_number: 1,
        item_notes: 'حفظ في مكان جاف',
        item_is_active: true,
        warehouse_id: 'wh-1',
        warehouse_name: 'المخزن الرئيسي',
        warehouse_number: 1,
        warehouse_notes: null,
        current_qty: 12.5,
        unit_cost: 40,
      },
    ];
    state.logRows = [
      {
        id: 'rec-clean',
        company_id: 'co-1',
        performed_by: 'u-1',
        performed_by_name: 'أحمد',
        created_at: '2026-11-15T10:00:00Z',
        updated_at: '2026-11-15T10:00:00Z',
        mode: 'reconcile',
        notes: 'مراجعة نهاية اليوم الكاملة',
        accounts_count: 5,
        cash_boxes_count: 2,
        items_count: 10,
        discrepancies_count: 0,
        status: 'clean',
        discrepancies: [],
      },
      {
        id: 'rec-sim',
        company_id: 'co-1',
        performed_by: 'u-1',
        performed_by_name: 'أحمد',
        created_at: '2026-11-14T10:00:00Z',
        updated_at: '2026-11-14T10:00:00Z',
        mode: 'simulation',
        notes: null,
        accounts_count: 5,
        cash_boxes_count: 2,
        items_count: 10,
        discrepancies_count: 2,
        status: 'discrepancies_found',
        discrepancies: [],
      },
    ];
  });

  it('ItemBalancesTab renders unit next to item name, isolates qty in <bdi>, closes drawer via backdrop/Escape, and retries on error', async () => {
    const { container } = render(
      <MemoryRouter>
        <ItemBalancesTab />
      </MemoryRouter>,
    );

    const itemRow = (await screen.findByText('سكر أبيض')).closest('tr')!;
    expect(container.querySelector('thead tr:first-child .col-hide-on-detail')).not.toBeInTheDocument();
    expect(itemRow.querySelector('.col-hide-on-detail')).not.toBeInTheDocument();

    const itemInfo = itemRow.querySelector('.inserted-item-info')!;
    expect(itemInfo).toHaveTextContent('سكر أبيض');
    expect(itemInfo.querySelector('.item-unit-tag')).toHaveTextContent('كجم');

    const cells = itemRow.querySelectorAll('td');
    const qtyCell = cells[3];
    const qtyBdi = qtyCell.querySelector('bdi')!;
    expect(qtyBdi).toHaveAttribute('dir', 'ltr');
    expect(qtyBdi).toHaveClass('tabular-nums');
    expect(qtyBdi).toHaveTextContent('12.5');
    expect(qtyCell).not.toHaveTextContent('كجم');

    fireEvent.click(itemRow);
    const drawer = screen.getByLabelText('تفاصيل الرصيد');
    expect(drawer).toHaveClass('open');
    expect(drawer.querySelector('.erp-detail-totals')).not.toHaveTextContent('كجم');

    const backdrop = container.querySelector('.erp-drawer-backdrop')!;
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop);
    expect(drawer).not.toHaveClass('open');

    fireEvent.click(itemRow);
    expect(drawer).toHaveClass('open');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer).not.toHaveClass('open');

    state.itemError = { message: 'network down' };
    fireEvent.click(screen.getByRole('button', { name: /الكمية الحالية/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('تعذّر تحميل أرصدة الأصناف.');

    state.itemError = null;
    const callsBeforeRetry = state.rpcCalls.filter((c) => c === 'filter_warehouse_item_rows').length;
    fireEvent.click(within(alert).getByRole('button', { name: /إعادة المحاولة/ }));
    await waitFor(() => {
      expect(state.rpcCalls.filter((c) => c === 'filter_warehouse_item_rows').length).toBeGreaterThan(
        callsBeforeRetry,
      );
    });
  });

  it('ReconciliationLogTab supports sorting, StatusBadge variants, .alert.success, external notes, and Escape/backdrop drawer close', async () => {
    const { container } = render(
      <MemoryRouter>
        <ReconciliationLogTab />
      </MemoryRouter>,
    );

    const cleanRow = (await screen.findByText('تصحيح فعلي')).closest('tr')!;
    expect(container.querySelector('.status-badge-mini')).not.toBeInTheDocument();
    expect(container.querySelector('thead tr:first-child .col-hide-on-detail')).not.toBeInTheDocument();
    expect(cleanRow.querySelector('.col-hide-on-detail')).not.toBeInTheDocument();
    expect(cleanRow.querySelector('.status-badge-completed')).toBeInTheDocument();
    expect(cleanRow.querySelector('.status-badge-active')).toBeInTheDocument();

    const simRow = screen.getByText('استكشافي').closest('tr')!;
    expect(simRow.querySelector('.status-badge-pending')).toBeInTheDocument();
    expect(simRow.querySelector('.status-badge-warning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /نتيجة الفحص/ }));
    await waitFor(() => {
      expect(state.orderCalls.some((c) => c.col === 'discrepancies_count' && c.ascending === false)).toBe(true);
    });

    const sortedCleanRow = (await screen.findByText('تصحيح فعلي')).closest('tr')!;
    fireEvent.click(sortedCleanRow);
    const drawer = screen.getByLabelText('تفاصيل عملية التدقيق');
    expect(drawer).toHaveClass('open');

    const summaryDl = drawer.querySelector('dl.erp-detail-summary')!;
    expect(summaryDl).not.toHaveTextContent('مراجعة نهاية اليوم الكاملة');
    expect(drawer.querySelector('.erp-detail-notes')).toHaveTextContent('مراجعة نهاية اليوم الكاملة');
    expect(within(drawer).getByRole('status')).toHaveClass('alert', 'success');

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    document.body.appendChild(modalBackdrop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer).toHaveClass('open');
    document.body.removeChild(modalBackdrop);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer).not.toHaveClass('open');
  });

  it('CashBoxOpeningTab and StockOpeningTab expose accessible numeric input aria-labels and close drawers via backdrop/Escape', () => {
    const { container } = render(
      <>
        <CashBoxOpeningTab
          cashBoxes={[
            {
              id: 'cb-1',
              name: 'الخزنة الرئيسية',
              serial_number: 1,
              is_primary: true,
              is_active: true,
              balance: 1000,
              opening_balance: 1000,
              notes: null,
            },
          ]}
          canEditOpening
          saving={false}
          setSaving={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
        <StockOpeningTab
          warehouses={[
            { id: 'wh-1', name: 'المخزن الرئيسي', serial_number: 1, is_active: true, is_primary: true },
          ]}
          stockRows={[
            {
              item_id: 'itm-1',
              item_number: 1,
              item_code: 'SKU-10',
              item_name: 'سكر أبيض',
              unit: 'كجم',
              warehouse_id: 'wh-1',
              warehouse_number: 1,
              warehouse_name: 'المخزن الرئيسي',
              warehouse_notes: null,
              opening_qty: 5,
              unit_cost: 20,
              current_qty: 5,
              cost_locked: false,
              item_notes: null,
            },
          ]}
          canEditOpening
          saving={false}
          setSaving={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </>,
    );

    expect(screen.getByLabelText('الرصيد الافتتاحي لخزينة الخزنة الرئيسية')).toBeInTheDocument();
    expect(screen.getByLabelText('كمية البداية لصنف سكر أبيض')).toBeInTheDocument();
    expect(screen.getByLabelText('تكلفة الوحدة لصنف سكر أبيض')).toBeInTheDocument();

    const stockRow = screen.getByText('سكر أبيض').closest('tr')!;
    fireEvent.click(stockRow);
    const stockDrawer = screen.getByLabelText('تفاصيل الصنف');
    expect(stockDrawer).toHaveClass('open');

    const backdrop = container.querySelector('.erp-drawer-backdrop')!;
    fireEvent.click(backdrop);
    expect(stockDrawer).not.toHaveClass('open');
  });
});

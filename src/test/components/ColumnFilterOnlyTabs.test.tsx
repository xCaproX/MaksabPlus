import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountBalancesTab from '../../pages/balances/AccountBalancesTab';
import CashBoxBalancesTab from '../../pages/balances/CashBoxBalancesTab';
import ItemBalancesTab from '../../pages/balances/ItemBalancesTab';
import AccountsTab from '../../pages/master-data/AccountsTab';
import ItemsTab from '../../pages/master-data/ItemsTab';
import CashBoxesTab from '../../pages/master-data/CashBoxesTab';
import WarehousesTab from '../../pages/master-data/WarehousesTab';
import AccountOpeningTab from '../../pages/management/AccountOpeningTab';
import CashBoxOpeningTab from '../../pages/management/CashBoxOpeningTab';
import StockOpeningTab from '../../pages/management/StockOpeningTab';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cashBoxes: [
    {
      id: 'cb-1',
      name: 'الخزنة الرئيسية',
      is_primary: true,
      is_active: true,
      balance: 1500,
      opening_balance: 1500,
      serial_number: 1,
      notes: 'رئيسية',
    },
    {
      id: 'cb-2',
      name: 'خزنة الفرع',
      is_primary: false,
      is_active: true,
      balance: 250,
      opening_balance: 250,
      serial_number: 2,
      notes: 'فرعية',
    },
  ],
  warehouses: [
    {
      id: 'wh-1',
      name: 'المخزن الرئيسي',
      serial_number: 1,
      is_active: true,
      is_primary: true,
    },
  ],
}));

vi.mock('../../lib/access', () => ({
  useAccess: () => ({ can: () => true, canViewProfit: true, canViewPurchasePrice: true }),
}));

vi.mock('../../context/MasterDataContext', () => ({
  useMasterData: () => ({
    accounts: [],
    items: [],
    warehouses: mocks.warehouses,
    cashBoxes: mocks.cashBoxes,
    stockRows: [],
    resourceStatus: {
      accounts: { loading: false, error: null, hasLoaded: true },
      items: { loading: false, error: null, hasLoaded: true },
      warehouses: { loading: false, error: null, hasLoaded: true },
      cashBoxes: { loading: false, error: null, hasLoaded: true },
      stock: { loading: false, error: null, hasLoaded: true },
    },
    refresh: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('../../components/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/masterDataQueries', () => ({
  loadAllWarehouses: vi.fn().mockResolvedValue([
    { id: 'wh-1', name: 'المخزن الرئيسي', serial_number: 1, is_active: true, is_primary: true },
  ]),
}));

vi.mock('../../lib/supabase', () => {
  function queryBuilder() {
    const query = {
      select: () => query,
      eq: () => query,
      neq: () => query,
      is: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      range: () => Promise.resolve({ data: [], count: 0, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
    };
    return query;
  }

  return {
    supabase: {
      rpc: (name: string, params?: unknown) => {
        mocks.rpc(name, params);
        if (name.startsWith('filter_')) return queryBuilder();
        return Promise.resolve({
          data: {
            total_count: 0,
            net_balance: 0,
            total_debit: 0,
            total_credit: 0,
            zero_count: 0,
            total_qty: 0,
            total_val: 0,
            out_of_stock_count: 0,
            active_count: 0,
            inactive_count: 0,
            receivable_count: 0,
            payable_count: 0,
            avg_price: 0,
          },
          error: null,
        });
      },
      from: queryBuilder,
    },
  };
});

describe('redundant global search removal on ColumnFilterRow tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes both .erp-search and empty .erp-toolbar on toolbar-free tabs', async () => {
    const cases = [
      {
        name: 'AccountBalancesTab',
        element: (
          <MemoryRouter>
            <AccountBalancesTab kind="customer" />
          </MemoryRouter>
        ),
      },
      {
        name: 'CashBoxBalancesTab',
        element: (
          <MemoryRouter>
            <CashBoxBalancesTab />
          </MemoryRouter>
        ),
      },
      {
        name: 'AccountOpeningTab',
        element: (
          <AccountOpeningTab
            kind="customer"
            accounts={[]}
            canEditOpening
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            saving={false}
            setSaving={vi.fn()}
          />
        ),
      },
      {
        name: 'CashBoxOpeningTab',
        element: (
          <CashBoxOpeningTab
            cashBoxes={mocks.cashBoxes}
            canEditOpening
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            saving={false}
            setSaving={vi.fn()}
          />
        ),
      },
    ];

    for (const testCase of cases) {
      const { container, unmount } = render(testCase.element);
      await waitFor(() => {
        expect(screen.getByRole('row', { name: 'بحث بالأعمدة' })).toBeInTheDocument();
      });
      expect(container.querySelector('.erp-search'), `${testCase.name} should not render .erp-search`).toBeNull();
      expect(container.querySelector('.erp-toolbar'), `${testCase.name} should not render empty .erp-toolbar`).toBeNull();
      unmount();
    }
  });

  it('removes .erp-search while keeping remaining filter controls inside .erp-toolbar', async () => {
    const cases = [
      {
        name: 'ItemBalancesTab',
        expectedLabel: 'المخزن',
        element: (
          <MemoryRouter>
            <ItemBalancesTab />
          </MemoryRouter>
        ),
      },
      {
        name: 'AccountsTab',
        expectedLabel: 'الحالة',
        element: (
          <MemoryRouter>
            <AccountsTab kind="customer" />
          </MemoryRouter>
        ),
      },
      {
        name: 'ItemsTab',
        expectedLabel: 'الحالة',
        element: (
          <MemoryRouter>
            <ItemsTab />
          </MemoryRouter>
        ),
      },
      {
        name: 'CashBoxesTab',
        expectedLabel: 'الحالة',
        element: (
          <MemoryRouter>
            <CashBoxesTab />
          </MemoryRouter>
        ),
      },
      {
        name: 'WarehousesTab',
        expectedLabel: 'الحالة',
        element: (
          <MemoryRouter>
            <WarehousesTab />
          </MemoryRouter>
        ),
      },
      {
        name: 'StockOpeningTab',
        expectedLabel: 'المخزن',
        element: (
          <StockOpeningTab
            warehouses={mocks.warehouses}
            stockRows={[]}
            canEditOpening
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            saving={false}
            setSaving={vi.fn()}
          />
        ),
      },
    ];

    for (const testCase of cases) {
      const { container, unmount } = render(testCase.element);
      await waitFor(() => {
        expect(screen.getByRole('row', { name: 'بحث بالأعمدة' })).toBeInTheDocument();
      });
      expect(container.querySelector('.erp-search'), `${testCase.name} should not render .erp-search`).toBeNull();
      const toolbar = container.querySelector('.erp-toolbar');
      expect(toolbar, `${testCase.name} should keep .erp-toolbar`).not.toBeNull();
      expect(toolbar?.textContent).toContain(testCase.expectedLabel);
      unmount();
    }
  });

  it('passes p_search: null in RPC-filtered tabs and filters rows via ColumnFilterRow', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AccountBalancesTab kind="customer" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        'filter_account_balance_rows',
        expect.objectContaining({ p_search: null, p_kind: 'customer' }),
      );
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_account_balances_kpis_columns',
        expect.objectContaining({ p_search: null, p_kind: 'customer' }),
      );
    });
    unmount();

    mocks.rpc.mockClear();
    const itemBal = render(
      <MemoryRouter>
        <ItemBalancesTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        'filter_warehouse_item_rows',
        expect.objectContaining({ p_search: null }),
      );
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_warehouse_stock_kpis_columns',
        expect.objectContaining({ p_search: null }),
      );
    });
    itemBal.unmount();

    mocks.rpc.mockClear();
    const accountsRender = render(
      <MemoryRouter>
        <AccountsTab kind="customer" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        'filter_master_account_rows',
        expect.objectContaining({ p_search: null, p_kind: 'customer' }),
      );
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_master_accounts_kpis_columns',
        expect.objectContaining({ p_search: null, p_kind: 'customer' }),
      );
    });
    accountsRender.unmount();

    mocks.rpc.mockClear();
    const itemsRender = render(
      <MemoryRouter>
        <ItemsTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        'filter_master_item_rows',
        expect.objectContaining({ p_search: null }),
      );
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_master_items_kpis_columns',
        expect.objectContaining({ p_search: null }),
      );
    });
    itemsRender.unmount();

    render(
      <MemoryRouter>
        <CashBoxBalancesTab />
      </MemoryRouter>,
    );
    expect(screen.getByText('الخزنة الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('خزنة الفرع')).toBeInTheDocument();

    const nameFilter = screen.getByLabelText('بحث في الخزنة');
    fireEvent.change(nameFilter, { target: { value: 'الفرع' } });

    await waitFor(() => {
      expect(screen.queryByText('الخزنة الرئيسية')).not.toBeInTheDocument();
    });
    expect(screen.getByText('خزنة الفرع')).toBeInTheDocument();
  });
});

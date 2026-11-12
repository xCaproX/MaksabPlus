import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ItemsTab from '../../pages/master-data/ItemsTab';

const access = vi.hoisted(() => ({
  can: () => true,
  canViewPurchasePrice: true,
  canViewProfit: false,
}));

vi.mock('../../lib/access', () => ({ useAccess: () => access }));
vi.mock('../../context/MasterDataContext', () => ({ useMasterData: () => ({ refresh: vi.fn() }) }));
vi.mock('../../components/Toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
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
      order: () => query,
      range: () => Promise.resolve({ data: [], count: 0, error: null }),
    };
    return query;
  }
  return {
    supabase: {
      rpc: (name: string) => {
        if (name === 'filter_master_item_rows') return queryBuilder();
        return Promise.resolve({ data: { total_count: 0, active_count: 0, inactive_count: 0, avg_price: 0 }, error: null });
      },
      from: queryBuilder,
    },
  };
});

describe('ItemsTab opening cost visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.canViewProfit = false;
    access.canViewPurchasePrice = true;
  });

  it('يخفي حقل تكلفة الوحدة الافتتاحية لمن لا يملك صلاحية رؤية الربح ويظهره للمصرح له', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/data?tab=items&action=new']}>
        <ItemsTab />
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole('dialog');
    const whCombo = within(dialog).getByDisplayValue('لا يوجد رصيد أول مدة');
    fireEvent.focus(whCombo);
    fireEvent.click(await screen.findByText('المخزن الرئيسي'));

    expect(within(dialog).getByText('الكمية الافتتاحية')).toBeInTheDocument();
    expect(within(dialog).queryByText('تكلفة الوحدة الافتتاحية')).not.toBeInTheDocument();

    unmount();

    access.canViewProfit = true;
    render(
      <MemoryRouter initialEntries={['/data?tab=items&action=new']}>
        <ItemsTab />
      </MemoryRouter>,
    );

    const dialogOwner = await screen.findByRole('dialog');
    const whComboOwner = within(dialogOwner).getByDisplayValue('لا يوجد رصيد أول مدة');
    fireEvent.focus(whComboOwner);
    fireEvent.click(await screen.findByText('المخزن الرئيسي'));

    expect(within(dialogOwner).getByText('تكلفة الوحدة الافتتاحية')).toBeInTheDocument();
  });
});

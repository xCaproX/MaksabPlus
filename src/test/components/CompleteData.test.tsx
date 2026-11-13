import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataProvider, useMasterData } from '../../context/MasterDataContext';
import { useCompleteStatement } from '../../lib/useCompleteStatement';
import type { CountedPage } from '../../lib/exportRows';

const api = vi.hoisted(() => ({ range: vi.fn(), toast: vi.fn() }));
vi.mock('../../components/Toast', () => ({ toast: { error: api.toast } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const query = {
        select: (_columns: string, options: { count: string }) => {
          expect(options.count).toBe('exact');
          return query;
        },
        order: () => query,
        range: (from: number, to: number) => api.range(table, from, to),
      };
      return query;
    },
  },
}));

const OPENING_RESOURCES = ['accounts', 'stock'] as const;
const WAREHOUSE_RESOURCES = ['warehouses'] as const;
const ACCOUNT_RESOURCES = ['accounts'] as const;

const rows = Array.from({ length: 1202 }, (_, index) => ({
  id: String(index + 1), running_balance: index + 1,
}));

function cappedPage(from: number, to: number) {
  return { data: rows.slice(from, Math.min(to + 1, from + 400)), count: rows.length, error: null };
}

describe('complete data loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads nothing by default, then reads only subscribed resources', async () => {
    api.range.mockResolvedValue({ data: [], count: 0, error: null });
    const initialProps: { keys?: Parameters<typeof useMasterData>[0] } = {};
    const { result, rerender } = renderHook(
      ({ keys }) => useMasterData(keys),
      { wrapper: MasterDataProvider, initialProps },
    );
    expect(api.range).not.toHaveBeenCalled();

    rerender({ keys: WAREHOUSE_RESOURCES });
    await waitFor(() => expect(result.current.resourceStatus.warehouses.hasLoaded).toBe(true));
    expect(api.range.mock.calls.map(([table]) => table)).toEqual(['warehouses']);

    await act(async () => { await result.current.refresh(['warehouses', 'accounts']); });
    expect(api.range.mock.calls.map(([table]) => table)).toEqual(['warehouses', 'warehouses']);

    rerender({ keys: ACCOUNT_RESOURCES });
    await waitFor(() => expect(result.current.resourceStatus.accounts.hasLoaded).toBe(true));
    expect(api.range.mock.calls.map(([table]) => table)).toEqual(['warehouses', 'warehouses', 'v_account_balances']);

    rerender({ keys: WAREHOUSE_RESOURCES });
    expect(api.range).toHaveBeenCalledTimes(3);
  });

  it('publishes the refreshed balance instead of an older in-flight read', async () => {
    const firstRows = [{ id: 'account', balance: 50 }];
    const refreshedRows = [{ id: 'account', balance: 75 }];
    let finish!: (page: CountedPage<(typeof firstRows)[number]>) => void;
    const first = new Promise<CountedPage<(typeof firstRows)[number]>>((resolve) => { finish = resolve; });
    api.range.mockReturnValueOnce(first)
      .mockResolvedValueOnce({ data: refreshedRows, count: 1, error: null });
    const { result } = renderHook(() => useMasterData(ACCOUNT_RESOURCES), { wrapper: MasterDataProvider });
    await act(async () => { await result.current.refresh(ACCOUNT_RESOURCES); });
    await act(async () => { finish({ data: firstRows, count: 1, error: null }); });
    expect(result.current.accounts).toEqual(refreshedRows);
  });

  it('loads shared stock and opening accounts past the row limit', async () => {
    const large = ['v_account_balances', 'v_stock_opening_balances'];
    api.range.mockImplementation(async (table, from, to) =>
      large.includes(table) ? cappedPage(from, to) : { data: [], count: 0, error: null },
    );
    const { result } = renderHook(() => useMasterData(OPENING_RESOURCES), { wrapper: MasterDataProvider });
    await waitFor(() => expect(result.current.resourceStatus.stock.loading).toBe(false));
    expect(result.current.accounts).toHaveLength(1202);
    expect(result.current.stockRows).toHaveLength(1202);
    expect(result.current.accounts[1201]?.id).toBe('1202');
    expect(api.range.mock.calls.filter(([table]) => table === 'v_stock_opening_balances')
      .map(([, offset]) => offset)).toEqual([0, 400, 800, 1200]);
  });

  it('keeps the last complete shared result and reports a later page failure', async () => {
    api.range.mockImplementation(async (table) => table === 'v_account_balances'
      ? { data: [rows[0]], count: 1, error: null } : { data: [], count: 0, error: null });
    const { result } = renderHook(() => useMasterData(OPENING_RESOURCES), { wrapper: MasterDataProvider });
    await waitFor(() => expect(result.current.resourceStatus.accounts.loading).toBe(false));

    api.range.mockImplementation(async (_table, from, to) => from === 0
      ? cappedPage(from, to) : { data: null, count: null, error: { message: 'page failed' } });
    await act(async () => { await result.current.refresh(['accounts']); });
    expect(result.current.accounts).toEqual([rows[0]]);
    expect(result.current.resourceStatus.accounts).toEqual({ loading: false, error: 'page failed', hasLoaded: true });
  });

  it('publishes the true final statement balance only after every page arrives', async () => {
    const { result } = renderHook(useCompleteStatement<(typeof rows)[number]>);
    let finish!: (page: CountedPage<(typeof rows)[number]>) => void;
    const lastPage = new Promise<CountedPage<(typeof rows)[number]>>((resolve) => { finish = resolve; });
    let loading!: Promise<void>;
    await act(async () => {
      loading = result.current.load(async (from, to) => from < 1200 ? cappedPage(from, to) : lastPage);
    });
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => { finish(cappedPage(1200, 1699)); await loading; });
    expect(result.current.rows).toHaveLength(1202);
    expect(result.current.rows[1201]?.running_balance).toBe(1202);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.load(async (from, to) => from === 0
        ? cappedPage(from, to) : { data: null, count: null, error: { message: 'page failed' } });
    });
    expect(result.current.rows).toEqual([]);
    expect(api.toast).toHaveBeenCalledWith('page failed');
  });

  it('ignores a statement response after closing or resetting the modal', async () => {
    const { result } = renderHook(useCompleteStatement<(typeof rows)[number]>);
    let finish!: (page: CountedPage<(typeof rows)[number]>) => void;
    const page = new Promise<CountedPage<(typeof rows)[number]>>((resolve) => { finish = resolve; });
    const request = vi.fn<(
      from: number, to: number, signal: AbortSignal,
    ) => typeof page>(() => page);
    let loading!: Promise<void>;
    act(() => { loading = result.current.load(request); });
    const signal = request.mock.calls[0][2];
    act(() => result.current.reset());
    expect(signal.aborted).toBe(true);
    await act(async () => { finish({ data: [rows[0]], count: 1, error: null }); await loading; });
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('T-10: preserves existing rows while reloading with preserveRows option', async () => {
    const { result } = renderHook(useCompleteStatement<(typeof rows)[number]>);
    await act(async () => {
      await result.current.load(async () => ({ data: [rows[0]], count: 1, error: null }));
    });
    expect(result.current.rows).toEqual([rows[0]]);

    let finishSecond!: (page: CountedPage<(typeof rows)[number]>) => void;
    const secondPage = new Promise<CountedPage<(typeof rows)[number]>>((resolve) => {
      finishSecond = resolve;
    });
    let secondLoad!: Promise<void>;
    await act(async () => {
      secondLoad = result.current.load(async () => secondPage, { preserveRows: true });
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([rows[0]]);

    const updatedRow = { ...rows[0], name: 'Updated Client' };
    await act(async () => {
      finishSecond({ data: [updatedRow], count: 1, error: null });
      await secondLoad;
    });
    expect(result.current.rows).toEqual([updatedRow]);
    expect(result.current.loading).toBe(false);
  });
});

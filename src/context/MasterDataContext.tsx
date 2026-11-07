import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { collectAllRows } from '../lib/exportRows';
import { loadAllWarehouses } from '../lib/masterDataQueries';
import type {
  AccountRow,
  CashBoxRow,
  ItemRow,
  StockOpeningRow,
  WarehouseOption,
} from '../lib/types';

export type MasterDataResource = 'accounts' | 'items' | 'warehouses' | 'cashBoxes' | 'stock';

type ResourceStatus = { loading: boolean; error: string | null; hasLoaded: boolean };

const pending: ResourceStatus = { loading: true, error: null, hasLoaded: false };
const noResources: readonly MasterDataResource[] = [];

interface ResourceRequest {
  subscribers: number;
  stale: boolean;
  request?: symbol;
}

export interface MasterDataContextType {
  accounts: AccountRow[];
  items: ItemRow[];
  warehouses: WarehouseOption[];
  cashBoxes: CashBoxRow[];
  stockRows: StockOpeningRow[];
  resourceStatus: Record<MasterDataResource, ResourceStatus>;
  refresh: (keys: readonly MasterDataResource[]) => Promise<void>;
  subscribe: (keys: readonly MasterDataResource[]) => () => void;
}

const MasterDataContext = createContext<MasterDataContextType | null>(null);

export function MasterDataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [resourceStatus, setResourceStatus] = useState({
    accounts: pending, items: pending, warehouses: pending, cashBoxes: pending, stock: pending,
  });
  const resources = useRef<Record<MasterDataResource, ResourceRequest>>({
    accounts: { subscribers: 0, stale: true },
    items: { subscribers: 0, stale: true },
    warehouses: { subscribers: 0, stale: true },
    cashBoxes: { subscribers: 0, stale: true },
    stock: { subscribers: 0, stale: true },
  });

  const fetchResources = useCallback(async (keys: readonly MasterDataResource[]) => {
    async function load<Row>(
      key: MasterDataResource,
      fetchRows: () => Promise<Row[]>,
      publish: (rows: Row[]) => void,
    ) {
      const resource = resources.current[key];
      const request = Symbol(key);
      resource.request = request;
      setResourceStatus((status) => ({
        ...status, [key]: { ...status[key], loading: true, error: null },
      }));
      let error: string | null = null;
      try {
        const rows = await fetchRows();
        if (resource.request === request) publish(rows);
      } catch (cause) {
        error = errorMessage(cause);
      } finally {
        if (resource.request === request) {
          resource.request = undefined;
          resource.stale = Boolean(error);
          setResourceStatus((status) => ({
            ...status, [key]: { loading: false, error, hasLoaded: !error || status[key].hasLoaded },
          }));
        }
      }
    }

    const loaders: Record<MasterDataResource, () => Promise<void>> = {
      accounts: () => load<AccountRow>('accounts', () => collectAllRows((from, to) =>
        supabase.from('v_account_balances').select('*', { count: 'exact' })
          .order('name').order('id').range(from, to),
      ), setAccounts),
      items: () => load<ItemRow>('items', () => collectAllRows((from, to) =>
        supabase.from('v_item_stock').select('*', { count: 'exact' })
          .order('name').order('id').range(from, to),
      ), setItems),
      warehouses: () => load('warehouses', loadAllWarehouses, setWarehouses),
      cashBoxes: () => load<CashBoxRow>('cashBoxes', () => collectAllRows((from, to) =>
        supabase.from('v_cash_box_balances').select('*', { count: 'exact' })
          .order('name').order('id').range(from, to),
      ), setCashBoxes),
      stock: () => load<StockOpeningRow>('stock', () => collectAllRows((from, to) =>
        supabase.from('v_stock_opening_balances').select('*', { count: 'exact' })
          .order('warehouse_name').order('item_name')
          .order('warehouse_id').order('item_id').range(from, to),
      ), setStockRows),
    };
    await Promise.all(keys.map((key) => loaders[key]()));
  }, []);

  const subscribe = useCallback((keys: readonly MasterDataResource[]) => {
    const requested = keys.filter((key) => {
      const resource = resources.current[key];
      resource.subscribers += 1;
      return resource.stale && !resource.request;
    });
    void fetchResources(requested);
    return () => {
      for (const key of keys) resources.current[key].subscribers -= 1;
    };
  }, [fetchResources]);

  const refresh = useCallback(async (keys: readonly MasterDataResource[]) => {
    const active = keys.filter((key) => {
      const resource = resources.current[key];
      resource.stale = true;
      if (resource.subscribers > 0) return true;
      resource.request = undefined;
      setResourceStatus((status) => ({ ...status, [key]: pending }));
      return false;
    });
    await fetchResources(active);
  }, [fetchResources]);

  return (
    <MasterDataContext.Provider
      value={{
        accounts,
        items,
        warehouses,
        cashBoxes,
        stockRows,
        resourceStatus,
        refresh,
        subscribe,
      }}
    >
      {children}
    </MasterDataContext.Provider>
  );
}

export function useMasterData(keys: readonly MasterDataResource[] = noResources): MasterDataContextType {
  const context = useContext(MasterDataContext);
  const subscribe = context?.subscribe;
  useEffect(() => subscribe?.(keys), [keys, subscribe]);
  if (!context) {
    throw new Error('useMasterData must be used within a MasterDataProvider');
  }
  return context;
}

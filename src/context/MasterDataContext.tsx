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

export interface MasterDataContextType {
  accounts: AccountRow[];
  items: ItemRow[];
  warehouses: WarehouseOption[];
  cashBoxes: CashBoxRow[];
  stockRows: StockOpeningRow[];
  loading: boolean;
  resourceStatus: Record<MasterDataResource, ResourceStatus>;
  refresh: (keys?: MasterDataResource[]) => Promise<void>;
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
  const requests = useRef<Partial<Record<MasterDataResource, symbol>>>({});

  const fetchResources = useCallback(async (keys?: MasterDataResource[]) => {
    const selected = keys ?? ['accounts', 'items', 'warehouses', 'cashBoxes', 'stock'];

    async function load<Row>(
      key: MasterDataResource,
      fetchRows: () => Promise<Row[]>,
      publish: (rows: Row[]) => void,
    ) {
      const request = Symbol(key);
      requests.current[key] = request;
      setResourceStatus((status) => ({
        ...status, [key]: { ...status[key], loading: true, error: null },
      }));
      let error: string | null = null;
      try {
        const rows = await fetchRows();
        if (requests.current[key] === request) publish(rows);
      } catch (cause) {
        error = errorMessage(cause);
      } finally {
        if (requests.current[key] === request) {
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
    await Promise.all(selected.map((key) => loaders[key]()));
  }, []);

  const refresh = useCallback(
    async (keys?: MasterDataResource[]) => {
      await fetchResources(keys);
    },
    [fetchResources],
  );

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      // تحميل البيانات الإعدادية الخفيفة أولاً لفتح الواجهة فورياً
      await fetchResources(['warehouses', 'cashBoxes']);
      if (!alive) return;

      // استكمال تحميل الحسابات والأصناف في الخلفية دون حظر واجهة المستخدم
      await fetchResources(['accounts', 'items', 'stock']);
    }

    void bootstrap();

    return () => {
      alive = false;
    };
  }, [fetchResources]);

  return (
    <MasterDataContext.Provider
      value={{
        accounts,
        items,
        warehouses,
        cashBoxes,
        stockRows,
        loading: resourceStatus.cashBoxes.loading || resourceStatus.warehouses.loading,
        resourceStatus,
        refresh,
      }}
    >
      {children}
    </MasterDataContext.Provider>
  );
}

export function useMasterData(): MasterDataContextType {
  const context = useContext(MasterDataContext);
  if (!context) {
    throw new Error('useMasterData must be used within a MasterDataProvider');
  }
  return context;
}

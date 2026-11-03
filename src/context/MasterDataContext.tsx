import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { translateDbError } from '../lib/errors';
import type {
  AccountRow,
  CashBoxRow,
  ItemRow,
  StockOpeningRow,
  WarehouseOption,
} from '../lib/types';

export type MasterDataResource = 'accounts' | 'items' | 'warehouses' | 'cashBoxes' | 'stock';

export interface MasterDataContextType {
  accounts: AccountRow[];
  items: ItemRow[];
  warehouses: WarehouseOption[];
  cashBoxes: CashBoxRow[];
  stockRows: StockOpeningRow[];
  loading: boolean;
  error: string | null;
  refresh: (keys?: MasterDataResource[]) => Promise<void>;
}

const MasterDataContext = createContext<MasterDataContextType | null>(null);

export function MasterDataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [stockRows, setStockRows] = useState<StockOpeningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async (keys?: MasterDataResource[]) => {
    const shouldFetch = (key: MasterDataResource) => !keys || keys.includes(key);

    const promises: Promise<void>[] = [];
    let fetchError: string | null = null;

    if (shouldFetch('accounts')) {
      promises.push(
        (async () => {
          const { data, error: err } = await supabase
            .from('v_account_balances')
            .select('*')
            .order('name');
          if (err) fetchError = translateDbError(err.message);
          else if (data) setAccounts(data as AccountRow[]);
        })(),
      );
    }

    if (shouldFetch('items')) {
      promises.push(
        (async () => {
          const { data, error: err } = await supabase
            .from('v_item_stock')
            .select('*')
            .order('name');
          if (err) fetchError = translateDbError(err.message);
          else if (data) setItems(data as ItemRow[]);
        })(),
      );
    }

    if (shouldFetch('warehouses')) {
      promises.push(
        (async () => {
          const { data, error: err } = await supabase
            .from('warehouses')
            .select('*')
            .order('name');
          if (err) fetchError = translateDbError(err.message);
          else if (data) setWarehouses(data as WarehouseOption[]);
        })(),
      );
    }

    if (shouldFetch('cashBoxes')) {
      promises.push(
        (async () => {
          const { data, error: err } = await supabase
            .from('v_cash_box_balances')
            .select('*')
            .order('name');
          if (err) fetchError = translateDbError(err.message);
          else if (data) setCashBoxes(data as CashBoxRow[]);
        })(),
      );
    }

    if (shouldFetch('stock')) {
      promises.push(
        (async () => {
          const { data, error: err } = await supabase
            .from('v_stock_opening_balances')
            .select('*')
            .order('warehouse_name')
            .order('item_name');
          if (err) fetchError = translateDbError(err.message);
          else if (data) setStockRows(data as StockOpeningRow[]);
        })(),
      );
    }

    await Promise.all(promises);
    setError(fetchError);
  }, []);

  const refresh = useCallback(
    async (keys?: MasterDataResource[]) => {
      await fetchResources(keys);
    },
    [fetchResources],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetchResources().finally(() => {
      if (alive) setLoading(false);
    });

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
        loading,
        error,
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

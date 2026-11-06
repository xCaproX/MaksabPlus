import { supabase } from './supabase';
import type { ColumnValues } from './columnFilters';
import type { ExportPage } from './exportRows';

export type DocumentScope = 'invoice' | 'warehouse_transfer' | 'receipt' | 'cash_transfer';
export interface DocumentListOptions {
  scope: DocumentScope;
  kind: string;
  filters: ColumnValues;
  dateFrom: string;
  dateTo: string;
  showDeleted: boolean;
  sortOrder: string;
}
const sources = {
  warehouse_transfer: { rpc: 'filter_warehouse_transfer_rows', date: 'transfer_date', amount: 'total_value' },
  receipt: { rpc: 'filter_receipt_rows', date: 'receipt_date', amount: 'amount' },
  cash_transfer: { rpc: 'filter_cash_transfer_rows', date: 'transfer_date', amount: 'amount' },
} as const;

/** The visible page and export share the same filters and deterministic ordering. */
export function documentListQuery<Row = unknown>(options: DocumentListOptions) {
  const { scope, kind, filters, dateFrom, dateTo, showDeleted, sortOrder } = options;
  if (scope === 'invoice') {
    return {
      async range(from: number, to: number): Promise<ExportPage<Row>> {
        const { data, error } = await supabase.rpc('get_invoice_page', {
          p_columns: filters, p_kind: kind, p_search: null,
          p_date_from: dateFrom || null, p_date_to: dateTo || null,
          p_show_deleted: showDeleted, p_sort_order: sortOrder,
          p_offset: from, p_limit: to - from + 1,
        });
        const page = data as { rows: Row[]; total_count: number } | null;
        return { data: error ? null : page?.rows ?? [], count: error ? null : page?.total_count ?? null, error };
      },
    };
  }
  const source = sources[scope];
  const hasParty = scope === 'receipt';
  let query = supabase.rpc(source.rpc, {
    p_columns: filters, p_search: null, ...(hasParty ? { p_kind: kind } : {}),
  }, { count: 'exact' }).select('*');
  if (hasParty) query = query.eq('direction', kind);
  query = showDeleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (dateFrom) query = query.gte(source.date, dateFrom);
  if (dateTo) query = query.lte(source.date, dateTo);
  const [field, direction] = sortOrder.split('-');
  const amountField = scope === 'warehouse_transfer' ? 'total' : 'amount';
  const supported = field === 'date' || field === 'number' || field === amountField
    || (field === 'account' && hasParty);
  const ascending = supported && direction === 'asc';
  const orderColumn = field === 'number' ? 'number'
    : field === 'account' && hasParty ? 'account_name'
    : field === amountField ? source.amount : source.date;
  query = query.order(orderColumn, { ascending });
  if (orderColumn !== 'number') query = query.order('number', { ascending });
  return query;
}

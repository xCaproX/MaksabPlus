import { supabase } from './supabase';
import type { ColumnValues } from './columnFilters';

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
  invoice: { rpc: 'filter_invoice_rows', date: 'invoice_date', amount: 'total' },
  warehouse_transfer: { rpc: 'filter_warehouse_transfer_rows', date: 'transfer_date', amount: 'total_value' },
  receipt: { rpc: 'filter_receipt_rows', date: 'receipt_date', amount: 'amount' },
  cash_transfer: { rpc: 'filter_cash_transfer_rows', date: 'transfer_date', amount: 'amount' },
} as const;

/** The visible page and export share the same filters and deterministic ordering. */
export function documentListQuery(options: DocumentListOptions) {
  const { scope, kind, filters, dateFrom, dateTo, showDeleted, sortOrder } = options;
  const source = sources[scope];
  const hasParty = scope === 'invoice' || scope === 'receipt';
  let query = supabase.rpc(source.rpc, {
    p_columns: filters, p_search: null, ...(hasParty ? { p_kind: kind } : {}),
  }, { count: 'exact' }).select('*');
  if (hasParty) query = query.eq(scope === 'invoice' ? 'kind' : 'direction', kind);
  query = showDeleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (dateFrom) query = query.gte(source.date, dateFrom);
  if (dateTo) query = query.lte(source.date, dateTo);
  const [field, direction] = sortOrder.split('-');
  const amountField = scope === 'invoice' || scope === 'warehouse_transfer' ? 'total' : 'amount';
  const supported = field === 'date' || field === 'number' || field === amountField
    || (field === 'account' && hasParty) || (field === 'remaining' && scope === 'invoice');
  const ascending = supported && direction === 'asc';
  const orderColumn = field === 'number' ? 'number'
    : field === 'account' && hasParty ? 'account_name'
    : field === 'remaining' && scope === 'invoice' ? 'remaining'
    : field === amountField ? source.amount : source.date;
  query = query.order(orderColumn, { ascending });
  if (orderColumn !== 'number') query = query.order('number', { ascending });
  return query;
}

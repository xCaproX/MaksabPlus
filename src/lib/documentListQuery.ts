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
/** The visible page and export share the same filters and deterministic ordering. */
export function documentListQuery<Row = unknown>(options: DocumentListOptions) {
  const { scope, kind, filters, dateFrom, dateTo, showDeleted, sortOrder } = options;
  return {
    async range(from: number, to: number): Promise<ExportPage<Row>> {
      const { data, error } = await supabase.rpc('get_document_page', {
        p_scope: scope, p_columns: filters, p_kind: kind, p_search: null,
        p_date_from: dateFrom || null, p_date_to: dateTo || null,
        p_show_deleted: showDeleted, p_sort_order: sortOrder,
        p_offset: from, p_limit: to - from + 1,
      });
      const page = data as { rows: Row[]; total_count: number } | null;
      return { data: error ? null : page?.rows ?? [], count: error ? null : page?.total_count ?? null, error };
    },
  };
}

import rawSchema from './listColumnSchema.json';
import { entityNumber } from './format';
import { supabase } from './supabase';

export type ListScope = keyof typeof rawSchema;
export type ColumnValues = Record<string, string>;
export interface ColumnSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'time' | 'datetime' | 'select' | 'none';
  source?: string;
  fallbackSource?: string;
  format?: string;
  fields?: string[];
  secondaryKey?: string;
  prefix?: string;
  prefixByKind?: Record<string, string>;
  options?: string | { value: string; label: string }[];
  ownerOnly?: boolean;
  excludeKinds?: string[];
  className?: string;
}
export const LIST_COLUMN_SCHEMA = rawSchema as unknown as Record<ListScope, { globalFields: string[]; columns: ColumnSpec[] }>;

export function listColumns(scope: ListScope, owner = false, kind = '') {
  return LIST_COLUMN_SCHEMA[scope].columns.filter((column) =>
    (!column.ownerOnly || owner) && !column.excludeKinds?.includes(kind),
  );
}

const cairoParts = (value: unknown) => {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return {} as Record<string, string>;
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
};

export function columnValue(row: object, column: ColumnSpec, secondary = false): unknown {
  const record = row as Record<string, unknown>;
  if (column.key === 'created_by_name') return record.created_by_name || 'غير مسجل';
  const source = record[column.source ?? column.key] ?? (column.fallbackSource ? record[column.fallbackSource] : undefined);
  if (column.format === 'serial') {
    return entityNumber(column.prefixByKind?.[String(record.kind)] ?? column.prefix ?? '', source as number);
  }
  if (column.format === 'abs') return source == null ? null : Math.abs(Number(source));
  if (column.format === 'payment_status') return Number(record.remaining) <= 0 ? 'paid' : Number(record.paid) > 0 ? 'partial' : 'unpaid';
  if (column.format === 'receipt_type') return record.is_free ? 'free' : 'linked';
  if (column.format === 'result_status') return record.status === 'clean' || Number(record.discrepancies_count) === 0 ? 'clean' : 'issues';
  if (column.format === 'scope_summary') return `${record.accounts_count} حساب • ${record.cash_boxes_count} خزنة • ${record.items_count} صنف`;
  if (column.format === 'time' || column.type === 'datetime') {
    const parts = cairoParts(source);
    return secondary || column.format === 'time' ? `${parts.hour}:${parts.minute}` : `${parts.year}-${parts.month}-${parts.day}`;
  }
  return source;
}

export function matchesColumnFilters(row: object, scope: ListScope, values: ColumnValues): boolean {
  const record = row as Record<string, unknown>;
  return Object.entries(values).every(([key, raw]) => {
    const wanted = raw.trim();
    if (!wanted) return true;
    const column = LIST_COLUMN_SCHEMA[scope].columns.find((item) => item.key === key || item.secondaryKey === key);
    if (!column) return false;
    const secondary = column.secondaryKey === key;
    const actual = columnValue(row, column, secondary);
    const type = column.type === 'datetime' ? (secondary ? 'time' : 'date') : column.type;
    if (type === 'text') return (column.fields?.map((field) => record[field]) ?? [actual])
      .some((value) => value != null && String(value).toLocaleLowerCase('ar').includes(wanted.toLocaleLowerCase('ar')));
    if (actual == null) return false;
    if (type === 'number') return Number.isFinite(Number(wanted)) && Number(actual) === Number(wanted);
    return String(actual) === wanted;
  });
}

export async function loadCreatorFilterOptions(scope: ListScope, kind: string, query: string) {
  const { data, error } = await supabase.rpc('list_creator_filter_options', {
    p_scope: scope, p_kind: kind || null, p_query: query,
  });
  if (error) throw error;
  return (data ?? []) as { value: string; label: string }[];
}

import { normalizeDigits } from './format';

export const DOCUMENT_SEARCH_FIELDS = {
  invoice: ['number', 'account_name', 'account_phone', 'warehouse_name', 'notes', 'created_by_name'],
  receipt: ['number', 'account_name', 'account_phone', 'cash_box_name', 'statement', 'notes', 'created_by_name'],
  warehouseTransfer: ['number', 'source_warehouse_name', 'destination_warehouse_name', 'notes', 'created_by_name'],
  cashTransfer: ['number', 'source_cash_box_name', 'destination_cash_box_name', 'notes', 'created_by_name'],
};
export const DOCUMENT_SEARCH_PLACEHOLDER = 'بحث في بيانات المستند أو بواسطة…';

/** مطابقة نصوص البحث العربية في الحقول المعروضة مع توحيد الأرقام القياسية. */
export function matchesSearchQuery(
  fields: (string | number | null | undefined)[],
  query: string,
): boolean {
  const normalizedQuery = normalizeDigits(query).trim().toLocaleLowerCase('ar');
  if (!normalizedQuery) return true;

  return fields.some((field) => {
    if (field === null || field === undefined) return false;
    return normalizeDigits(String(field)).toLocaleLowerCase('ar').includes(normalizedQuery);
  });
}

export function escapeLikePattern(term: string): string {
  return term
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * يهرّب النص للاستخدام الآمن في فلاتر PostgREST
 * يضع القيمة بين علامتي تنصيص "..." مع تهريب \ و " و % و _
 */
export function escapePostgrestFilterValue(term: string): string {
  const escaped = escapeLikePattern(term).replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/**
 * يبني نص شرط .or(...) لعدة أعمدة مع تهريب آمن للقيمة
 */
export function buildPostgrestOrFilter(columns: string[], term: string): string {
  const escapedValue = escapePostgrestFilterValue(term);
  return columns.map((col) => `${col}.ilike.${escapedValue}`).join(',');
}


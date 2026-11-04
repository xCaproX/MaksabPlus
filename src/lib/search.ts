/**
 * وظيفة مطابقة نصوص البحث باللغة العربية
 * تتحقق مما إذا كان أي من الحقول النصية يحتوي على كلمة البحث، مع مراعاة الحروف والحالات.
 */
export function matchesSearchQuery(
  fields: (string | number | null | undefined)[],
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('ar');
  if (!normalizedQuery) return true;

  return fields.some((field) => {
    if (field === null || field === undefined) return false;
    return String(field).toLocaleLowerCase('ar').includes(normalizedQuery);
  });
}

/**
 * يهرّب النص للاستخدام الآمن في فلاتر PostgREST
 * يضع القيمة بين علامتي تنصيص "..." مع تهريب \ و " و % و _
 */
export function escapePostgrestFilterValue(term: string): string {
  const escaped = term
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `"%${escaped}%"`;
}

/**
 * يبني نص شرط .or(...) لعدة أعمدة مع تهريب آمن للقيمة
 */
export function buildPostgrestOrFilter(columns: string[], term: string): string {
  const escapedValue = escapePostgrestFilterValue(term);
  return columns.map((col) => `${col}.ilike.${escapedValue}`).join(',');
}


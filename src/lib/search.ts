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

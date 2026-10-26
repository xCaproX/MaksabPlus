export type AccessState = {
  role: 'owner' | 'employee';
  permissions: string[];
};

/**
 * دالة فحص وتحديد صلاحية المستخدم بشكل نقي (Pure Function)
 * متطابقة مع دالة قاعدة البيانات public.has_permission:
 * 1. هل المستخدم مالك (owner) أو لديه الصلاحية العامة الشاملة ('*')؟
 * 2. هل لديه مطابقة دقيقة لأي من الصلاحيات المطلوبة (مثل 'goods.sale.view')؟
 * 3. الاتجاه من العام للخاص: إذا كان المفتاح المطلوب تفصيلياً (3 أجزاء مثل 'goods.sale.view')،
 *    يمنح الصلاحية إذا كان لدى المستخدم صلاحية القسم الأب (مثل 'goods.view').
 * 4. الاتجاه من الخاص للعام: إذا كان المفتاح المطلوب عاماً (جزأين مثل 'data.view' أو 'balances.view')،
 *    يمنح الصلاحية إذا كان لدى المستخدم أي تفريعة فرعية لنفس القسم والإجراء (مثل 'data.customers.view').
 */
export function hasPermission(
  access: AccessState | null | undefined,
  ...requiredKeys: string[]
): boolean {
  if (!access) return false;
  if (access.role === 'owner' || access.permissions.includes('*')) return true;

  return requiredKeys.some((key) => {
    if (access.permissions.includes(key)) return true;

    const parts = key.split('.');
    if (parts.length === 3) {
      // مطابقة القسم الأب مع الإجراء: goods.sale.view => goods.view
      const parentKey = `${parts[0]}.${parts[2]}`;
      if (access.permissions.includes(parentKey)) return true;
    }

    if (parts.length === 2) {
      // مطابقة عكسية من التفريعات الفرعية للقسم الأب:
      // عند فحص 'data.view'، تمنح الصلاحية إذا امتلك المستخدم أي صلاحية مثل 'data.customers.view'
      const [section, action] = parts;
      const hasMatchingSubPermission = access.permissions.some((p) => {
        const pParts = p.split('.');
        return pParts.length === 3 && pParts[0] === section && pParts[2] === action;
      });
      if (hasMatchingSubPermission) return true;
    }

    return false;
  });
}

export type AccessState = {
  role: 'owner' | 'employee';
  permissions: string[];
};

/**
 * دالة فحص وتحديد صلاحية المستخدم بشكل نقي (Pure Function)
 * تتحقق من:
 * 1. هل المستخدم مالك (owner) أو لديه الصلاحية العامة الشاملة ('*')؟
 * 2. هل لديه مطابقة دقيقة لأي من الصلاحيات المطلوبة (مثل 'goods.sale.view')؟
 * 3. هل لديه صلاحية القسم الأب (مثل 'goods.view' التي تشمل 'goods.sale.view' و 'goods.purchase.view')؟
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

    return false;
  });
}

import type { AccountRow, CashBoxRow, WarehouseOption, AccountKind } from './types';

/**
 * دالة استخراج الحساب الافتراضي:
 * الأولوية 1: الحساب النشط المطابق لـ system_key (مثل 'cash_customer' أو 'cash_supplier' أو 'waste')
 * الأولوية 2: الحساب الذي يحتوي اسمه على الاسم العربي كخط دفاع أخير (fallback)
 * الأولوية 3: أول حساب نشط من نفس النوع
 */
export function resolveDefaultAccount(
  accounts: readonly AccountRow[],
  kind: AccountKind,
  systemKey: 'cash_customer' | 'cash_supplier' | 'waste' | null = null,
): AccountRow | undefined {
  const active = accounts.filter((a) => a.is_active !== false);
  if (systemKey) {
    const byKey = active.find((a) => a.system_key === systemKey);
    if (byKey) return byKey;
  }
  const fallbackText = kind === 'customer' ? 'عميل نقدي' : kind === 'supplier' ? 'مورد نقدي' : 'هالك';
  const byName = active.find((a) => a.name.includes(fallbackText));
  if (byName) return byName;
  return active.find((a) => a.kind === kind);
}

/**
 * دالة استخراج المخزن الافتراضي:
 * الأولوية 1: المخزن النشط الذي يحمل شارة رئيسي (is_primary === true)
 * الأولوية 2: المخزن الذي يحتوي اسمه على 'المخزن الرئيسي' كخط دفاع أخير
 * الأولوية 3: أول مخزن نشط
 */
export function resolveDefaultWarehouse<T extends WarehouseOption>(
  warehouses: readonly T[],
): T | undefined {
  const active = warehouses.filter((w) => w.is_active !== false);
  return (
    active.find((w) => w.is_primary) ??
    active.find((w) => w.name.includes('المخزن الرئيسي')) ??
    active[0]
  );
}

/**
 * دالة استخراج الخزنة الافتراضية:
 * الأولوية 1: الخزنة النشطة التي تحمل شارة رئيسية (is_primary === true)
 * الأولوية 2: الخزنة التي يحتوي اسمها على 'الرئيسية' كخط دفاع أخير
 * الأولوية 3: أول خزنة نشطة
 */
export function resolveDefaultCashBox<T extends CashBoxRow>(
  cashBoxes: readonly T[],
): T | undefined {
  const active = cashBoxes.filter((b) => b.is_active !== false);
  return (
    active.find((b) => b.is_primary) ??
    active.find((b) => b.name?.trim().includes('الرئيسية')) ??
    active[0]
  );
}

/**
 * ترتيب الخزائن بحيث تتصدر الخزنة الرئيسية القائمة
 */
export function sortCashBoxesWithPrimaryFirst<T extends CashBoxRow>(
  cashBoxes: readonly T[],
): T[] {
  return [...cashBoxes].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    const aMain = a.name?.includes('الرئيسية');
    const bMain = b.name?.includes('الرئيسية');
    if (aMain && !bMain) return -1;
    if (!aMain && bMain) return 1;
    return (a.name || '').localeCompare(b.name || '', 'ar');
  });
}

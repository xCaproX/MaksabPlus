import { round2 } from './format';
import type { LineDraft } from './types';

/**
 * حساب إجمالي بنود الفاتورة مع التقريب المحاسبي لمنزلتين عشريتين
 */
export function calculateInvoiceSubtotal(lines: LineDraft[]): number {
  const activeLines = lines.filter((line) => Boolean(line.item_id));
  const subtotal = activeLines.reduce((sum, line) => {
    const qty = Number(line.qty || 0);
    const price = Number(line.unit_price || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
    return sum + qty * price;
  }, 0);
  return round2(subtotal);
}

/**
 * حساب المبلغ المتبقي بعد سداد جزء أو كامل الفاتورة
 */
export function calculateRemaining(total: number, paid: number | string): number {
  const paidNumber = Number(paid || 0);
  const safePaid = Number.isFinite(paidNumber) ? paidNumber : 0;
  return round2(total - safePaid);
}

export interface BalancePreviewParams {
  currentAccountBalance: number;
  isReturn: boolean;
  total: number;
  paid: number | string;
  isEditing?: boolean;
  editingTotal?: number;
  editingPaid?: number;
}

export interface BalancePreviewResult {
  netInvoiceDebt: number;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * حساب الأثر المالي للفاتورة على رصيد الحساب قبل وبعد الحفظ (عرض ومعاينة فقط)
 * - الفاتورة العادية: صافي المديونية = الإجمالي - المدفوع
 * - المرتجع: ينعكس الأثر ليقلل من مديونية الحساب
 * - عند التعديل: يتم استبعاد أثر الفاتورة السابقة أولاً لحساب الرصيد الفعلي قبل الفاتورة
 */
export function calculateBalancePreview({
  currentAccountBalance,
  isReturn,
  total,
  paid,
  isEditing = false,
  editingTotal = 0,
  editingPaid = 0,
}: BalancePreviewParams): BalancePreviewResult {
  const paidNumber = Number(paid || 0);
  const safePaid = Number.isFinite(paidNumber) ? paidNumber : 0;
  const netInvoiceDebt = isReturn ? -(total - safePaid) : (total - safePaid);

  let prevDebt = 0;
  if (isEditing) {
    const prevRemaining = Number(editingTotal || 0) - Number(editingPaid || 0);
    prevDebt = isReturn ? -prevRemaining : prevRemaining;
  }

  const balanceBefore = round2(currentAccountBalance - prevDebt);
  const balanceAfter = round2(balanceBefore + netInvoiceDebt);

  return {
    netInvoiceDebt: round2(netInvoiceDebt),
    balanceBefore,
    balanceAfter,
  };
}

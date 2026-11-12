import { round2, round4 } from './format';
import type { AccountKind, InvoiceKind, LineDraft } from './types';

/**
 * حساب إجمالي بنود الفاتورة مع تقريب الكمية والسعر لـ 4 منازل وتقريب السطر لمنزلتين عشريتين
 */
export function calculateInvoiceSubtotal(lines: LineDraft[]): number {
  const activeLines = lines.filter((line) => Boolean(line.item_id));
  const subtotal = activeLines.reduce((sum, line) => {
    const rawQty = Number(line.qty || 0);
    const rawPrice = Number(line.unit_price || 0);
    if (!Number.isFinite(rawQty) || !Number.isFinite(rawPrice)) return sum;
    const qty = round4(rawQty);
    const price = round4(rawPrice);
    return sum + round2(qty * price);
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
  isReturn?: boolean;
  total: number;
  paid: number | string;
  isEditing?: boolean;
  editingTotal?: number;
  editingPaid?: number;
  accountKind?: AccountKind;
  invoiceKind?: InvoiceKind;
}

export interface BalancePreviewResult {
  netInvoiceDebt: number;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * حساب معامل الأثر المالي للفاتورة على رصيد الحساب بناءً على نوع الحساب ونوع الفاتورة:
 * - حساب عميل:
 *   - بيع / مرتجع مشتريات: يزيد مديونية العميل (+1)
 *   - شراء / مرتجع مبيعات: يقلل مديونية العميل (-1)
 * - حساب مورد:
 *   - شراء / مرتجع مبيعات: يزيد مستحقات المورد (+1)
 *   - بيع / مرتجع مشتريات: يقلل مستحقات المورد (-1)
 * - حساب هالك: لا يوجد أثر مالي (0)
 */
export function getInvoiceBalanceMultiplier(
  accountKind?: AccountKind,
  invoiceKind?: InvoiceKind,
  isReturn = false,
): number {
  if (accountKind && invoiceKind) {
    if (accountKind === 'customer') {
      if (invoiceKind === 'sale' || invoiceKind === 'purchase_return') return 1;
      if (invoiceKind === 'purchase' || invoiceKind === 'sale_return') return -1;
      return 0;
    }
    if (accountKind === 'supplier') {
      if (invoiceKind === 'purchase' || invoiceKind === 'sale_return') return 1;
      if (invoiceKind === 'sale' || invoiceKind === 'purchase_return') return -1;
      return 0;
    }
    return 0;
  }
  return isReturn ? -1 : 1;
}

/**
 * حساب الأثر المالي للفاتورة على رصيد الحساب قبل وبعد الحفظ (عرض ومعاينة فقط)
 * - الفاتورة العادية: صافي المديونية = الإجمالي - المدفوع
 * - المرتجع: ينعكس الأثر ليقلل من مديونية الحساب
 * - يدعم عمليات البيع والشراء والمردودات المتبادلة بين العملاء والموردين (المقاصة)
 * - عند التعديل: يتم استبعاد أثر الفاتورة السابقة أولاً لحساب الرصيد الفعلي قبل الفاتورة
 */
export function calculateBalancePreview({
  currentAccountBalance,
  isReturn = false,
  total,
  paid,
  isEditing = false,
  editingTotal = 0,
  editingPaid = 0,
  accountKind,
  invoiceKind,
}: BalancePreviewParams): BalancePreviewResult {
  const paidNumber = Number(paid || 0);
  const safePaid = Number.isFinite(paidNumber) ? paidNumber : 0;
  const multiplier = getInvoiceBalanceMultiplier(accountKind, invoiceKind, isReturn);
  const netInvoiceDebt = multiplier * (total - safePaid);

  let prevDebt = 0;
  if (isEditing) {
    const prevRemaining = Number(editingTotal || 0) - Number(editingPaid || 0);
    prevDebt = multiplier * prevRemaining;
  }

  const balanceBefore = round2(currentAccountBalance - prevDebt);
  const balanceAfter = round2(balanceBefore + netInvoiceDebt);

  return {
    netInvoiceDebt: round2(netInvoiceDebt),
    balanceBefore,
    balanceAfter,
  };
}

/**
-- ============================================================================
-- قواعد التحقق والتصحيح التلقائي لفواتير المبيعات وبنودها والمدفوعات
-- ============================================================================
 */

export interface ClampQuantityOptions {
  availableStock?: number;
  isStockLimited?: boolean;
}

/**
 * تصحيح حقل الكمية بحيث:
 * 1. لا يقل عن أو يساوي صفر (إذا كان غير صالح أو <= 0 يعود إلى 1 افتراضياً)
 * 2. يسمح بالكسور العشرية للأوزان والأمتار (مثلاً 0.5 كجم أو 0.250 م)
 * 3. لا يتجاوز الكمية المتاحة في المخزن لحركات الصرف (البيع/الهالك/مرتجع الشراء)
 */
export function clampQuantity(
  rawQty: number | string,
  options: ClampQuantityOptions = {},
): string {
  const num = typeof rawQty === 'number' ? rawQty : parseFloat(rawQty);
  if (isNaN(num) || num <= 0) {
    return '1';
  }

  const { availableStock, isStockLimited = true } = options;
  if (isStockLimited && typeof availableStock === 'number' && availableStock > 0) {
    if (num > availableStock) {
      return String(availableStock);
    }
  }

  return String(num);
}

export interface ClampPaidOptions {
  total: number;
  isCashAccount?: boolean;
  minDecimals?: number;
}

/**
 * تصحيح حقل المدفوع بحيث:
 * 1. لا يقل عن الصفر
 * 2. لا يتجاوز إجمالي الفاتورة
 * 3. بالنسبة للعميل/المورد النقدي: لا يقل عن إجمالي الفاتورة (المدفوع = الإجمالي دائمًا)
 */
export function clampPaid(
  rawPaid: number | string,
  options: ClampPaidOptions,
): string {
  const { total, isCashAccount = false, minDecimals = 2 } = options;
  let num = typeof rawPaid === 'number' ? rawPaid : parseFloat(rawPaid);

  if (isNaN(num) || num < 0) {
    num = 0;
  }

  if (num > total) {
    num = total;
  }

  if (isCashAccount && num < total) {
    num = total;
  }

  return num.toFixed(minDecimals);
}

/**
 * التحقق مما إذا كان الصنف متوفرًا في المخزن المحدد (رصيده > 0)
 */
export function isItemInStock(
  itemId: string,
  warehouseId: string,
  stockRows: Array<{ item_id: string; warehouse_id: string; current_qty: number | string }>,
): boolean {
  if (!itemId || !warehouseId) return false;
  const row = stockRows.find((r) => r.item_id === itemId && r.warehouse_id === warehouseId);
  const qty = row ? Number(row.current_qty) : 0;
  return qty > 0;
}

export interface CalculateAvailableStockOptions {
  itemId: string;
  warehouseId: string;
  stockRows: Array<{ item_id: string; warehouse_id: string; current_qty: number | string }>;
  editingWarehouseId?: string;
  editingLines?: Array<{ item_id: string; qty: number | string }>;
}

/**
 * حساب الرصيد المتاح للصنف في المخزن مع مراعاة وضع التعديل:
 * عند تعديل مستند مسجل مسبقاً (فاتورة بيع، أمر تحويل...) في نفس المخزن،
 * الكمية المحجوزة مسبقاً في هذا المستند تُضاف للرصيد المتاح لأنها كانت مخصومة بسببه.
 */
export function calculateAvailableStock(options: CalculateAvailableStockOptions): number {
  const {
    itemId,
    warehouseId,
    stockRows,
    editingWarehouseId,
    editingLines,
  } = options;

  if (!itemId || !warehouseId) return 0;
  const row = stockRows.find((r) => r.item_id === itemId && r.warehouse_id === warehouseId);
  let available = row ? Number(row.current_qty) : 0;

  if (editingWarehouseId && editingWarehouseId === warehouseId && editingLines) {
    const prevQty = editingLines
      .filter((l) => l.item_id === itemId)
      .reduce((sum, l) => sum + Number(l.qty || 0), 0);
    available += prevQty;
  }

  return available;
}

import { toast } from '../components/Toast';
import { qty as formatQty, round2 } from './format';

export interface DocLineBase {
  key: string;
  item_id: string;
  qty: string;
}

/**
 * ضبط قيمة حقل الكمية أثناء الكتابة:
 * - يسمح بالفراغ أو الكسور المؤقتة ('0', '0.', '.')
 * - يمنع القيم غير الرقمية والسالبة
 * - يقيد الكمية بالرصيد المتاح إذا كان المستند مقيداً بالمخزون
 */
export function clampDocQty(
  val: string,
  availableStock: number,
  isStockLimited: boolean,
  customWarning?: string,
): string {
  if (val === '' || val === '.') return val;
  const num = parseFloat(val);
  if (isNaN(num)) return '1';

  if (isStockLimited && availableStock > 0 && num > availableStock) {
    toast.warning(customWarning ?? `الكمية المتاحة (${formatQty(availableStock)}) هي الحد الأقصى`);
    return String(availableStock);
  }

  if (num <= 0 && val !== '0' && val !== '0.' && val !== '.') {
    return '1';
  }

  return val;
}

/**
 * ضبط قيمة حقل الكمية عند خروج المؤشر (Blur):
 * - يضمن أن القيمة رقم موجب صحيح أو عشري (> 0)
 * - يقيد بالرصيد المتاح إذا كان المستند مقيداً بالمخزون
 */
export function clampDocQtyOnBlur(
  val: string,
  availableStock: number,
  isStockLimited: boolean,
): string {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    return '1';
  }
  if (isStockLimited && availableStock > 0 && num > availableStock) {
    return String(availableStock);
  }
  return val;
}

export interface MergeOrInsertOptions<T extends DocLineBase = DocLineBase> {
  lines: readonly T[];
  itemId: string;
  itemName?: string;
  qty: number;
  availableStock: number;
  isStockLimited: boolean;
  extra?: Record<string, unknown>;
  docLabel?: string;
}

/**
 * إدراج سطر جديد أو دمجه في سطر موجود مسبقاً في القائمة:
 * - يتحقق من توفر الصنف والرصيد المتبقي
 * - يعدل الكمية تلقائياً إذا كانت الإضافة تتجاوز المتبقي
 * - يحدث السطر السابق أو يضيف سطراً جديداً بـ UUID فريد
 */
export function mergeOrInsertDocLine<T extends DocLineBase = DocLineBase>({
  lines,
  itemId,
  itemName,
  qty,
  availableStock,
  isStockLimited,
  extra,
  docLabel = 'المستند',
}: MergeOrInsertOptions<T>): T[] | null {
  if (!itemId) {
    toast.warning('اختر صنفاً أولاً');
    return null;
  }

  let qtyNum = qty;
  if (!(qtyNum > 0)) {
    toast.warning('الكمية يجب أن تكون أكبر من صفر');
    return null;
  }

  if (isStockLimited) {
    if (availableStock <= 0) {
      toast.warning('الصنف غير متوفر بالمخزن');
      return null;
    }

    const existingInList = lines.find((l) => l.item_id === itemId);
    const currentInList = existingInList ? Number(existingInList.qty || 0) : 0;

    if (currentInList >= availableStock) {
      toast.warning(`الكمية المتاحة بالكامل (${formatQty(availableStock)}) موجودة بالفعل في ${docLabel}`);
      return null;
    }

    if (currentInList + qtyNum > availableStock) {
      qtyNum = availableStock - currentInList;
      toast.warning(
        `تم تعديل الكمية المضافة إلى ${formatQty(qtyNum)} لتتوافق مع المتبقي من الرصيد المتاح`,
      );
    }
  }

  const existingIndex = lines.findIndex((l) => l.item_id === itemId);
  if (existingIndex >= 0) {
    const updated = [...lines];
    const existing = updated[existingIndex];
    const mergedQty = round2(Number(existing.qty || 0) + qtyNum);
    updated[existingIndex] = {
      ...existing,
      ...extra,
      qty: String(mergedQty),
    };
    if (itemName) {
      toast.info(`تم تحديث كمية "${itemName}" إلى (${formatQty(mergedQty)})`);
    }
    return updated;
  }

  const newLine = {
    key: crypto.randomUUID(),
    item_id: itemId,
    qty: String(qtyNum),
    ...extra,
  } as unknown as T;

  return [...lines, newLine];
}

/**
 * إدراج الصنف المعلق في شريط الإدخال الثابت تلقائياً قبل الحفظ:
 */
export function flushPendingDocLine<T extends DocLineBase = DocLineBase>(
  lines: readonly T[],
  entryItemId: string,
  entryQty: string,
  availableStock: number,
  isStockLimited: boolean,
  extra?: Record<string, unknown>,
): T[] {
  if (!entryItemId) return [...lines];

  let qtyNum = Number(entryQty || 0);
  if (!(qtyNum > 0)) return [...lines];

  if (isStockLimited && availableStock > 0 && qtyNum > availableStock) {
    qtyNum = availableStock;
  }

  const existingIndex = lines.findIndex((l) => l.item_id === entryItemId);
  if (existingIndex >= 0) {
    const updated = [...lines];
    const existing = updated[existingIndex];
    const mergedQty = round2(Number(existing.qty || 0) + qtyNum);
    updated[existingIndex] = {
      ...existing,
      ...extra,
      qty: String(mergedQty),
    };
    return updated;
  }

  const newLine = {
    key: crypto.randomUUID(),
    item_id: entryItemId,
    qty: String(qtyNum),
    ...extra,
  } as unknown as T;

  return [...lines, newLine];
}

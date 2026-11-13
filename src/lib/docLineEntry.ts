import { toast } from '../components/Toast';
import { qty as formatQty } from './format';

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
export function mergeOrInsertDocLine<T extends DocLineBase>(options: MergeOrInsertOptions<T>): T[] | null {
  return prepareDocLine(options)?.lines ?? null;
}

function prepareDocLine<T extends DocLineBase>({
  lines,
  itemId,
  itemName,
  qty,
  availableStock,
  isStockLimited,
  extra,
  docLabel = 'المستند',
}: MergeOrInsertOptions<T>): { lines: T[]; adjusted: boolean } | null {
  if (!itemId) {
    toast.warning('اختر صنفاً أولاً');
    return null;
  }

  let qtyNum = Math.round(qty * 10_000);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    toast.warning('الكمية يجب أن تكون أكبر من صفر');
    return null;
  }

  const existingIndex = lines.findIndex((line) => line.item_id === itemId);
  const existing = lines[existingIndex];
  const currentQty = Math.round(Number(existing?.qty || 0) * 10_000);
  let adjusted = qtyNum / 10_000 !== qty;
  if (isStockLimited) {
    const stock = Math.round(availableStock * 10_000);
    if (stock <= 0) {
      toast.warning('الصنف غير متوفر بالمخزن');
      return null;
    }

    if (currentQty >= stock) {
      toast.warning(`الكمية المتاحة بالكامل (${formatQty(availableStock)}) موجودة بالفعل في ${docLabel}`);
      return null;
    }

    if (currentQty + qtyNum > stock) {
      qtyNum = stock - currentQty;
      adjusted = true;
      toast.warning(
        `تم تعديل الكمية المضافة إلى ${formatQty(qtyNum / 10_000)} لتتوافق مع المتبقي من الرصيد المتاح`,
      );
    }
  }

  if (adjusted && qtyNum === Math.round(qty * 10_000)) {
    toast.warning(`تم تقريب الكمية المضافة إلى ${formatQty(qtyNum / 10_000)}`);
  }

  if (existing) {
    const updated = [...lines];
    const mergedQty = (currentQty + qtyNum) / 10_000;
    updated[existingIndex] = {
      ...existing,
      ...extra,
      qty: String(mergedQty),
    };
    if (itemName) {
      toast.info(`تم تحديث كمية "${itemName}" إلى (${formatQty(mergedQty)})`);
    }
    return { lines: updated, adjusted };
  }

  const newLine = {
    key: crypto.randomUUID(),
    item_id: itemId,
    ...extra,
    qty: String(qtyNum / 10_000),
  } as unknown as T;

  return { lines: [...lines, newLine], adjusted };
}

export const DOC_LINE_CLAMP_WARNING =
  'تم إدراج الصنف وتعديل الكمية تلقائيًا لتوافق الرصيد المتاح. راجع السطر المميز ثم اضغط حفظ لتأكيد العملية.';

/**
 * إدراج الصنف المعلق في شريط الإدخال الثابت تلقائياً قبل الحفظ:
 */
export function flushPendingDocLine<T extends DocLineBase = DocLineBase>(
  lines: T[],
  entryItemId: string,
  entryQty: string,
  availableStock: number,
  isStockLimited: boolean,
  extra?: Record<string, unknown>,
): { lines: T[]; adjusted: boolean } | null {
  if (!entryItemId) return { lines, adjusted: false };

  return prepareDocLine({
    lines,
    itemId: entryItemId,
    qty: Number(entryQty),
    availableStock,
    isStockLimited,
    extra,
  });
}

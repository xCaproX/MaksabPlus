import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clampDocQty,
  clampDocQtyOnBlur,
  mergeOrInsertDocLine,
  flushPendingDocLine,
  type DocLineBase,
} from '../lib/docLineEntry';

interface TestDocLine extends DocLineBase {
  unit_price?: string;
}

const toastMock = vi.hoisted(() => ({
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../components/Toast', () => ({
  toast: toastMock,
}));

describe('docLineEntry - محرك التحقق ودمج سطور الأصناف', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clampDocQty', () => {
    it('يسمح بالقيمة الفارغة أو الكسور المؤقتة أثناء الكتابة', () => {
      expect(clampDocQty('', 10, true)).toBe('');
      expect(clampDocQty('0', 10, true)).toBe('0');
      expect(clampDocQty('0.', 10, true)).toBe('0.');
      expect(clampDocQty('.', 10, true)).toBe('.');
    });

    it('يمنع الحروف غير الرقمية ويعيد القيمة الافتراضية 1', () => {
      expect(clampDocQty('abc', 10, true)).toBe('1');
    });

    it('يقيد الكمية بالرصيد المتاح ويظهر تنبيهاً إذا كان مقيداً بالمخزون', () => {
      const res = clampDocQty('15', 10, true);
      expect(res).toBe('10');
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('10'));
    });

    it('لا يقيد الكمية إذا لم يكن المستند مقيداً بالمخزون (مثل فواتير الشراء)', () => {
      const res = clampDocQty('50', 10, false);
      expect(res).toBe('50');
      expect(toastMock.warning).not.toHaveBeenCalled();
    });

    it('يمنع الأرقام السالبة ويعيد 1', () => {
      expect(clampDocQty('-5', 10, true)).toBe('1');
    });

    it('يقبل نص التحذير المخصص', () => {
      const customMsg = 'الكمية بمخزن المصدر محدودة';
      clampDocQty('20', 5, true, customMsg);
      expect(toastMock.warning).toHaveBeenCalledWith(customMsg);
    });
  });

  describe('clampDocQtyOnBlur', () => {
    it('يعيد 1 إذا كانت القيمة غير صالحة أو صفر أو سالبة عند فقدان التركيز', () => {
      expect(clampDocQtyOnBlur('', 10, true)).toBe('1');
      expect(clampDocQtyOnBlur('0', 10, true)).toBe('1');
      expect(clampDocQtyOnBlur('-2', 10, true)).toBe('1');
      expect(clampDocQtyOnBlur('abc', 10, true)).toBe('1');
    });

    it('يقيد القيمة بالرصيد المتاح عند فقدان التركيز', () => {
      expect(clampDocQtyOnBlur('15', 8, true)).toBe('8');
    });

    it('يحافظ على القيمة الصحيحة كما هي', () => {
      expect(clampDocQtyOnBlur('3.5', 10, true)).toBe('3.5');
    });
  });

  describe('mergeOrInsertDocLine', () => {
    it('يرفض الإدراج إذا لم يكن هناك صنف مختار', () => {
      const res = mergeOrInsertDocLine({
        lines: [],
        itemId: '',
        qty: 1,
        availableStock: 10,
        isStockLimited: true,
      });
      expect(res).toBeNull();
      expect(toastMock.warning).toHaveBeenCalledWith('اختر صنفاً أولاً');
    });

    it('يرفض الإدراج إذا كانت الكمية <= 0', () => {
      const res = mergeOrInsertDocLine({
        lines: [],
        itemId: 'item-1',
        qty: 0,
        availableStock: 10,
        isStockLimited: true,
      });
      expect(res).toBeNull();
      expect(toastMock.warning).toHaveBeenCalledWith('الكمية يجب أن تكون أكبر من صفر');
    });

    it('يرفض الإدراج إذا كان الرصيد المتاح 0 للمستندات المقيدة بالمخزون', () => {
      const res = mergeOrInsertDocLine({
        lines: [],
        itemId: 'item-1',
        qty: 1,
        availableStock: 0,
        isStockLimited: true,
      });
      expect(res).toBeNull();
      expect(toastMock.warning).toHaveBeenCalledWith('الصنف غير متوفر بالمخزن');
    });

    it('يمنع الإدراج إذا كان كامل الرصيد المتاح موجوداً بالفعل في القائمة', () => {
      const existing: DocLineBase[] = [
        { key: 'line-1', item_id: 'item-1', qty: '10' },
      ];
      const res = mergeOrInsertDocLine({
        lines: existing,
        itemId: 'item-1',
        qty: 2,
        availableStock: 10,
        isStockLimited: true,
        docLabel: 'الفاتورة',
      });
      expect(res).toBeNull();
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('موجودة بالفعل في الفاتورة'));
    });

    it('يعدل الكمية تلقائياً للمتبقي من الرصيد المتاح ويدمج في السطر السابق', () => {
      const existing: TestDocLine[] = [
        { key: 'line-1', item_id: 'item-1', qty: '6', unit_price: '50' },
      ];
      const res = mergeOrInsertDocLine<TestDocLine>({
        lines: existing,
        itemId: 'item-1',
        itemName: 'سكر',
        qty: 8, // مجموع 6 + 8 = 14 > 10
        availableStock: 10,
        isStockLimited: true,
        extra: { unit_price: '55' },
      });

      expect(res).not.toBeNull();
      expect(res).toHaveLength(1);
      expect(res![0].qty).toBe('10');
      expect(res![0].unit_price).toBe('55');
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('تم تعديل الكمية المضافة إلى 4'));
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('تم تحديث كمية "سكر" إلى (10)'));
    });

    it('يضيف سطراً جديداً بـ key فريد إذا لم يكن الصنف موجوداً في القائمة', () => {
      const res = mergeOrInsertDocLine<TestDocLine>({
        lines: [],
        itemId: 'item-1',
        qty: 3,
        availableStock: 10,
        isStockLimited: true,
        extra: { unit_price: '20' },
      });

      expect(res).toHaveLength(1);
      expect(res![0].item_id).toBe('item-1');
      expect(res![0].qty).toBe('3');
      expect(res![0].unit_price).toBe('20');
      expect(res![0].key).toBeDefined();
    });
  });

  describe('flushPendingDocLine', () => {
    it('يدرج السطر المعلق تلقائياً قبل الحفظ ويدمجه إذا كان مكرراً', () => {
      const existing: TestDocLine[] = [
        { key: 'line-1', item_id: 'item-1', qty: '3' },
      ];
      const flushed = flushPendingDocLine<TestDocLine>(
        existing,
        'item-1',
        '2',
        10,
        true,
        { unit_price: '100' },
      );
      expect(flushed).toMatchObject({
        lines: [{ qty: '5', unit_price: '100' }],
        adjusted: false,
      });
    });

    it('يقيد الكمية بالرصيد المتاح إذا كانت الكمية المعلقة تتجاوزه', () => {
      const flushed = flushPendingDocLine<TestDocLine>(
        [],
        'item-1',
        '15',
        8,
        true,
        { unit_price: '100' },
      );
      expect(flushed).toMatchObject({ lines: [{ qty: '8' }], adjusted: true });
    });

    it('يتجاهل سطر الإدخال الفارغ ويوقف الحفظ إذا اختير صنف بكمية غير صالحة', () => {
      const existing: DocLineBase[] = [{ key: 'line-1', item_id: 'item-1', qty: '3' }];
      expect(flushPendingDocLine(existing, '', '5', 10, true)?.lines).toBe(existing);
      expect(flushPendingDocLine(existing, 'item-2', '0', 10, true)).toBeNull();
    });

    it('يحسب المتبقي بعد خصم الكمية الموجودة ويطلب مراجعة التعديل قبل الحفظ', () => {
      const existing = [{ key: 'line-1', item_id: 'item-1', qty: '8' }];
      expect(flushPendingDocLine(existing, 'item-1', '5', 10, true))
        .toEqual({ lines: [{ ...existing[0], qty: '10' }], adjusted: true });
      expect(existing[0].qty).toBe('8');
    });

    it('يوقف الحفظ إذا كان الرصيد صفر أو استُخدم بالكامل في المستند', () => {
      const existing = [{ key: 'line-1', item_id: 'item-1', qty: '8' }];
      expect(flushPendingDocLine(existing, 'item-2', '1', 0, true)).toBeNull();
      expect(flushPendingDocLine(existing, 'item-1', '1', 8, true)).toBeNull();
    });

    it('يحافظ على أربع خانات عشرية عند الدمج في مساري الإضافة والحفظ', () => {
      const lines = [{ key: 'line-1', item_id: 'item-1', qty: '0.1001' }];
      const added = mergeOrInsertDocLine({
        lines, itemId: 'item-1', qty: 0.0049, availableStock: 0.105, isStockLimited: true,
      });
      const flushed = flushPendingDocLine(lines, 'item-1', '0.0049', 0.105, true);
      expect(added?.[0].qty).toBe('0.105');
      expect(flushed).toEqual({ lines: added, adjusted: false });
    });
  });
});

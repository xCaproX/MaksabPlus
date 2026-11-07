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
      expect(flushed).toHaveLength(1);
      expect(flushed[0].qty).toBe('5');
      expect(flushed[0].unit_price).toBe('100');
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
      expect(flushed).toHaveLength(1);
      expect(flushed[0].qty).toBe('8');
    });

    it('يتجاهل السطر المعلق إذا لم يكن هناك صنف أو كانت الكمية <= 0', () => {
      const existing: DocLineBase[] = [{ key: 'line-1', item_id: 'item-1', qty: '3' }];
      expect(flushPendingDocLine(existing, '', '5', 10, true)).toEqual(existing);
      expect(flushPendingDocLine(existing, 'item-2', '0', 10, true)).toEqual(existing);
    });
  });
});

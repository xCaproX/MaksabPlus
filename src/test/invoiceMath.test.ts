import { describe, it, expect } from 'vitest';
import {
  calculateInvoiceSubtotal,
  calculateRemaining,
  calculateBalancePreview,
} from '../lib/invoiceMath';
import type { LineDraft } from '../lib/types';

describe('invoiceMath - حسابات الفواتير والأرصدة', () => {
  describe('calculateInvoiceSubtotal', () => {
    it('يحسب إجمالي البنود النشطة بدقة', () => {
      const lines: LineDraft[] = [
        { key: '1', item_id: 'item-1', qty: '2', unit_price: '50' },
        { key: '2', item_id: 'item-2', qty: '1.5', unit_price: '20' },
        { key: '3', item_id: '', qty: '10', unit_price: '100' }, // بند فارغ يتم تجاهله
      ];
      expect(calculateInvoiceSubtotal(lines)).toBe(130);
    });

    it('يتعامل بأمان مع القيم غير العددية والكسور ويقرب لمنزلتين عشريتين', () => {
      const lines: LineDraft[] = [
        { key: '1', item_id: 'item-1', qty: '3', unit_price: '10.3333' },
        { key: '2', item_id: 'item-2', qty: 'invalid', unit_price: '50' },
      ];
      // 3 * 10.3333 = 30.9999 => 31
      expect(calculateInvoiceSubtotal(lines)).toBe(31);
    });

    it('يُرجع 0 عند عدم وجود أي بنود نشطة', () => {
      expect(calculateInvoiceSubtotal([])).toBe(0);
      expect(calculateInvoiceSubtotal([{ key: '1', item_id: '', qty: '5', unit_price: '10' }])).toBe(0);
    });
  });

  describe('calculateRemaining', () => {
    it('يحسب المتبقي الصحيح عند السداد الجزئي', () => {
      expect(calculateRemaining(1000, 400)).toBe(600);
      expect(calculateRemaining(500.5, '200.25')).toBe(300.25);
    });

    it('يُرجع 0 عند السداد الكامل', () => {
      expect(calculateRemaining(500, 500)).toBe(0);
    });

    it('يتعامل مع السداد بالزيادة ويعيد قيمة سالبة', () => {
      expect(calculateRemaining(500, 600)).toBe(-100);
    });

    it('يتعامل بأمان مع القيم الفارغة أو غير المعرفة', () => {
      expect(calculateRemaining(1000, '')).toBe(1000);
    });
  });

  describe('calculateBalancePreview', () => {
    it('فاتورة مبيعات جديدة عادية: تزيد من مديونية العميل بالمبلغ الآجل', () => {
      const result = calculateBalancePreview({
        currentAccountBalance: 500, // العميل عليه 500
        isReturn: false,
        total: 1000,
        paid: 300, // الآجل 700
      });

      expect(result.netInvoiceDebt).toBe(700);
      expect(result.balanceBefore).toBe(500);
      expect(result.balanceAfter).toBe(1200); // 500 + 700 = 1200
    });

    it('مرتجع مبيعات جديد: يخفض مديونية العميل بصافي قيمة المرتجع غير المسدد', () => {
      const result = calculateBalancePreview({
        currentAccountBalance: 1200,
        isReturn: true,
        total: 400,
        paid: 100, // المتبقي للمرتجع 300
      });

      expect(result.netInvoiceDebt).toBe(-300);
      expect(result.balanceBefore).toBe(1200);
      expect(result.balanceAfter).toBe(900); // 1200 - 300 = 900
    });

    it('تعديل فاتورة قائمة: يستبعد الأثر المالي القديم ويعيد حساب الرصيد بشكل صحيح', () => {
      // الفاتورة الأصلية كانت: إجمالي 1000، مسدد 200 (الأثر السابق 800)
      // رصيد الحساب الحالي يشمل تلك الفاتورة: 1500
      // التعديل الجديد: إجمالي 1200، مسدد 500 (الأثر الجديد 700)
      const result = calculateBalancePreview({
        currentAccountBalance: 1500,
        isReturn: false,
        total: 1200,
        paid: 500,
        isEditing: true,
        editingTotal: 1000,
        editingPaid: 200,
      });

      // الرصيد قبل الفاتورة = 1500 - 800 = 700
      expect(result.balanceBefore).toBe(700);
      expect(result.netInvoiceDebt).toBe(700);
      // الرصيد بعد التعديل = 700 + 700 = 1400
      expect(result.balanceAfter).toBe(1400);
    });
  });
});

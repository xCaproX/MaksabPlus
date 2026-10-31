import { describe, it, expect } from 'vitest';
import {
  clampQuantity,
  clampPaid,
  isItemInStock,
} from '../lib/invoiceValidation';

describe('invoiceValidation - قواعد التحقق والتصحيح التلقائي للفاتورة', () => {
  describe('clampQuantity - تصحيح الكمية', () => {
    it('يصحح أي كمية أقل من 1 إلى 1', () => {
      expect(clampQuantity(0)).toBe('1');
      expect(clampQuantity(-5)).toBe('1');
      expect(clampQuantity(0.5)).toBe('1');
      expect(clampQuantity('')).toBe('1');
      expect(clampQuantity('abc')).toBe('1');
    });

    it('يصحح الكمية لتساوي المتاح إذا تجاوزت الرصيد المتاح بالمخزن', () => {
      expect(clampQuantity(10, { availableStock: 5, isStockLimited: true })).toBe('5');
      expect(clampQuantity('12', { availableStock: 8, isStockLimited: true })).toBe('8');
    });

    it('يقبل الكمية إذا كانت بين 1 والمتاح', () => {
      expect(clampQuantity(3, { availableStock: 5, isStockLimited: true })).toBe('3');
      expect(clampQuantity(5, { availableStock: 5, isStockLimited: true })).toBe('5');
      expect(clampQuantity(1, { availableStock: 5, isStockLimited: true })).toBe('1');
    });

    it('لا يقيد الكمية إذا لم تكن حركة صرف (مثال: فاتورة شراء)', () => {
      expect(clampQuantity(100, { availableStock: 5, isStockLimited: false })).toBe('100');
    });
  });

  describe('clampPaid - تصحيح المدفوع', () => {
    it('يصحح أي قيمة سالبة إلى 0.00', () => {
      expect(clampPaid(-50, { total: 500 })).toBe('0.00');
      expect(clampPaid('-10.5', { total: 500 })).toBe('0.00');
    });

    it('يصحح أي قيمة تتجاوز الإجمالي لتساوي الإجمالي', () => {
      expect(clampPaid(600, { total: 500 })).toBe('500.00');
      expect(clampPaid('750.50', { total: 500.5 })).toBe('500.50');
    });

    it('يقبل المدفوع إذا كان بين الصفر والإجمالي للعميل العادي', () => {
      expect(clampPaid(200, { total: 500 })).toBe('200.00');
      expect(clampPaid(0, { total: 500 })).toBe('0.00');
      expect(clampPaid(500, { total: 500 })).toBe('500.00');
    });

    it('بالنسبة للعميل النقدي: لا يقبل أي مدفوع أقل من الإجمالي ويساويه دائما بالإجمالي', () => {
      expect(clampPaid(0, { total: 500, isCashAccount: true })).toBe('500.00');
      expect(clampPaid(250, { total: 500, isCashAccount: true })).toBe('500.00');
      expect(clampPaid(600, { total: 500, isCashAccount: true })).toBe('500.00');
      expect(clampPaid(-10, { total: 500, isCashAccount: true })).toBe('500.00');
    });
  });

  describe('isItemInStock - التحقق من توفر الصنف', () => {
    const stockRows = [
      { item_id: 'item-1', warehouse_id: 'wh-1', current_qty: 10 },
      { item_id: 'item-2', warehouse_id: 'wh-1', current_qty: 0 },
      { item_id: 'item-1', warehouse_id: 'wh-2', current_qty: 0 },
    ];

    it('يُرجع true إذا كان رصيد الصنف بالمخزن أكبر من صفر', () => {
      expect(isItemInStock('item-1', 'wh-1', stockRows)).toBe(true);
    });

    it('يُرجع false إذا كان رصيد الصنف 0 أو غير موجود بالمخزن', () => {
      expect(isItemInStock('item-2', 'wh-1', stockRows)).toBe(false);
      expect(isItemInStock('item-1', 'wh-2', stockRows)).toBe(false);
      expect(isItemInStock('item-unknown', 'wh-1', stockRows)).toBe(false);
    });
  });
});

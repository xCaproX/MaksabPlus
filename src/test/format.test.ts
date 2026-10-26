import { describe, it, expect } from 'vitest';
import { money, qty, round2, formatDate, entityNumber } from '../lib/format';

describe('format - دوال التنسيق المحاسبي والتواريخ', () => {
  describe('money', () => {
    it('ينسق المبالغ النقدية بفاصلة الآلاف ومنزلتين عشريتين ولاحقة ج.م', () => {
      expect(money(1234.5)).toBe('1,234.50 ج.م');
      expect(money(0)).toBe('0.00 ج.م');
      expect(money('1000000')).toBe('1,000,000.00 ج.م');
    });

    it('يتعامل بأمان مع القيم الفارغة أو غير المعرفة', () => {
      expect(money(null)).toBe('0.00 ج.م');
      expect(money(undefined)).toBe('0.00 ج.م');
      expect(money('invalid')).toBe('0.00 ج.م');
    });
  });

  describe('qty', () => {
    it('ينسق الكميات بحد أقصى 4 منازل عشرية وبدون أصفار زائدة', () => {
      expect(qty(12.5)).toBe('12.5');
      expect(qty(10)).toBe('10');
      expect(qty(5.1234)).toBe('5.1234');
    });

    it('يُرجع 0 عند تمرير قيم غير صالحة', () => {
      expect(qty(null)).toBe('0');
      expect(qty(undefined)).toBe('0');
    });
  });

  describe('round2', () => {
    it('يقرب لأقرب منزلتين عشريتين بدقة محاسبية', () => {
      expect(round2(10.555)).toBe(10.56);
      expect(round2(10.554)).toBe(10.55);
      expect(round2(0)).toBe(0);
    });
  });

  describe('formatDate', () => {
    it('يحول تاريخ ISO (YYYY-MM-DD) إلى التاريخ المعتمد بالواجهة (DD/MM/YYYY)', () => {
      expect(formatDate('2026-10-25')).toBe('25/10/2026');
      expect(formatDate('2026-01-05T12:00:00Z')).toBe('05/01/2026');
    });

    it('يُرجع شرطة "—" عند عدم وجود تاريخ', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
    });
  });

  describe('entityNumber', () => {
    it('ينسق أرقام المستندات ببادئة و5 خانات مبطنة بالأصفار', () => {
      expect(entityNumber('INV', 7)).toBe('INV-00007');
      expect(entityNumber('REC', 123)).toBe('REC-00123');
      expect(entityNumber('CUST', null)).toBe('CUST-00000');
    });
  });
});

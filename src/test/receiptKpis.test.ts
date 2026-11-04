import { describe, it, expect } from 'vitest';
import { calculateReceiptKpis } from '../pages/receipts/receiptKpis';

describe('calculateReceiptKpis', () => {
  it('يحسب مؤشرات تحويلات الخزن بدقة', () => {
    const kpis = calculateReceiptKpis({
      isCashBoxTransfer: true,
      isIn: false,
      receiptSummary: { totalAmount: 0, invoiceLinked: 0, count: 0 },
      transferSummary: { totalAmount: 5500, count: 3 },
    });

    expect(kpis).toHaveLength(2);
    expect(kpis[0].id).toBe('cash-transfer-total');
    expect(kpis[0].value).toBe('5,500.00');
    expect(kpis[1].id).toBe('cash-transfer-count');
    expect(kpis[1].value).toBe(3);
  });

  it('يحسب مؤشرات إيصالات الاستلام (in) مع نسب السداد', () => {
    const kpis = calculateReceiptKpis({
      isCashBoxTransfer: false,
      isIn: true,
      receiptSummary: { totalAmount: 10000, invoiceLinked: 8000, count: 5 },
      transferSummary: { totalAmount: 0, count: 0 },
    });

    expect(kpis).toHaveLength(4);
    expect(kpis[0].id).toBe('receipt-in-total');
    expect(kpis[0].value).toBe('10,000.00');
    expect(kpis[1].id).toBe('receipt-in-invoice');
    expect(kpis[1].value).toBe('8,000.00');
    expect(kpis[2].id).toBe('receipt-in-free');
    expect(kpis[2].value).toBe('2,000.00');
    expect(kpis[3].id).toBe('receipt-in-count');
    expect(kpis[3].value).toBe(5);
  });

  it('يحسب مؤشرات إيصالات الصرف (out)', () => {
    const kpis = calculateReceiptKpis({
      isCashBoxTransfer: false,
      isIn: false,
      receiptSummary: { totalAmount: 4000, invoiceLinked: 3000, count: 2 },
      transferSummary: { totalAmount: 0, count: 0 },
    });

    expect(kpis).toHaveLength(4);
    expect(kpis[0].id).toBe('receipt-out-total');
    expect(kpis[0].value).toBe('4,000.00');
    expect(kpis[1].id).toBe('receipt-out-invoice');
    expect(kpis[1].value).toBe('3,000.00');
    expect(kpis[2].id).toBe('receipt-out-free');
    expect(kpis[2].value).toBe('1,000.00');
    expect(kpis[3].id).toBe('receipt-out-count');
    expect(kpis[3].value).toBe(2);
  });
});

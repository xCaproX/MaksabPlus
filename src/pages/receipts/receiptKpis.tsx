import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  ShoppingBag,
  DollarSign,
  FileText,
} from 'lucide-react';
import { money } from '../../lib/format';
import type { KpiItem } from '../../components/KpiBar';

export const VALID_RECEIPT_TABS = ['in', 'out', 'cash_box_transfer'] as const;
export type ReceiptTab = typeof VALID_RECEIPT_TABS[number];

export const RECEIPT_TABS = [
  { value: 'in', label: 'إيصالات استلام' },
  { value: 'out', label: 'إيصالات صرف' },
  { value: 'cash_box_transfer', label: 'تحويل بين الخزن' },
] as const;

export interface ReceiptKpiSummary {
  totalAmount: number;
  invoiceLinked: number;
  count: number;
}

export interface CashBoxTransferKpiSummary {
  totalAmount: number;
  count: number;
}

interface CalculateReceiptKpisOptions {
  isCashBoxTransfer: boolean;
  isIn: boolean;
  receiptSummary: ReceiptKpiSummary;
  transferSummary: CashBoxTransferKpiSummary;
}

export function calculateReceiptKpis({
  isCashBoxTransfer,
  isIn,
  receiptSummary,
  transferSummary,
}: CalculateReceiptKpisOptions): KpiItem[] {
  if (isCashBoxTransfer) {
    return [
      {
        id: 'cash-transfer-total',
        label: 'إجمالي المبالغ المحولة',
        value: money(transferSummary.totalAmount),
        unit: 'ج.م',
        variant: 'primary',
        icon: ArrowLeftRight,
      },
      {
        id: 'cash-transfer-count',
        label: 'عدد التحويلات بين الخزن',
        value: transferSummary.count,
        unit: 'تحويل',
        variant: 'neutral',
        icon: FileText,
      },
    ];
  }

  const totalAmount = receiptSummary.totalAmount;
  const invoiceLinked = receiptSummary.invoiceLinked;
  const freeAmount = totalAmount - invoiceLinked;
  const count = receiptSummary.count;

  if (isIn) {
    return [
      {
        id: 'receipt-in-total',
        label: 'إجمالي المستلم',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'success',
        icon: ArrowDownLeft,
      },
      {
        id: 'receipt-in-invoice',
        label: 'تحصيل فواتير مبيعات',
        value: money(invoiceLinked),
        unit: 'ج.م',
        variant: 'primary',
        icon: CheckCircle2,
        subtext:
          totalAmount > 0 ? (
            <span>
              تمثل <bdi dir="ltr">{Math.round((invoiceLinked / totalAmount) * 100)}%</bdi> من الإجمالي
            </span>
          ) : undefined,
      },
      {
        id: 'receipt-in-free',
        label: 'استلامات عامة وحرة',
        value: money(freeAmount),
        unit: 'ج.م',
        variant: 'info',
        icon: DollarSign,
      },
      {
        id: 'receipt-in-count',
        label: 'عدد إيصالات الاستلام',
        value: count,
        unit: 'إيصال',
        variant: 'neutral',
        icon: FileText,
      },
    ];
  }

  // Direction: 'out'
  return [
    {
      id: 'receipt-out-total',
      label: 'إجمالي المدفوعات',
      value: money(totalAmount),
      unit: 'ج.م',
      variant: 'danger',
      icon: ArrowUpRight,
    },
    {
      id: 'receipt-out-invoice',
      label: 'سداد فواتير موردين',
      value: money(invoiceLinked),
      unit: 'ج.م',
      variant: 'primary',
      icon: ShoppingBag,
      subtext:
        totalAmount > 0 ? (
          <span>
            تمثل <bdi dir="ltr">{Math.round((invoiceLinked / totalAmount) * 100)}%</bdi> من الإجمالي
          </span>
        ) : undefined,
    },
    {
      id: 'receipt-out-free',
      label: 'مصروفات ومدفوعات عامة',
      value: money(freeAmount),
      unit: 'ج.م',
      variant: 'warning',
      icon: DollarSign,
    },
    {
      id: 'receipt-out-count',
      label: 'عدد إيصالات الصرف',
      value: count,
      unit: 'إيصال',
      variant: 'neutral',
      icon: FileText,
    },
  ];
}

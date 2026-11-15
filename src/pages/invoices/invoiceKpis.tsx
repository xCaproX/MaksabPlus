import {
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  FileText,
  TrendingUp,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
} from 'lucide-react';
import { money, qty as formatQty } from '../../lib/format';
import type { KpiItem } from '../../components/KpiBar';
import type { InvoiceKind } from '../../lib/types';

export type InvoiceTab = InvoiceKind | 'warehouse_transfer';

export interface InvoiceKpiSummary {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  profitTotal: number;
  count: number;
}

export interface WarehouseTransferKpiSummary {
  totalValue: number;
  totalQty: number;
  count: number;
}

interface CalculateKpisOptions {
  kind: InvoiceTab;
  isWarehouseTransfer: boolean;
  transferSummary?: WarehouseTransferKpiSummary;
  invoiceSummary?: InvoiceKpiSummary;
  canViewProfit: boolean;
}

export function calculateInvoiceKpis({
  kind,
  isWarehouseTransfer,
  transferSummary,
  invoiceSummary,
  canViewProfit,
}: CalculateKpisOptions): KpiItem[] {
  if (isWarehouseTransfer) {
    const totalValue = transferSummary?.totalValue ?? 0;
    const totalQty = transferSummary?.totalQty ?? 0;
    const count = transferSummary?.count ?? 0;

    const items: KpiItem[] = [
      {
        id: 'transfers-value',
        label: 'إجمالي قيمة التحويلات',
        value: money(totalValue),
        unit: 'ج.م',
        variant: 'primary',
        icon: ArrowLeftRight,
      },
      {
        id: 'transfers-qty',
        label: 'إجمالي الكميات المحولة',
        value: formatQty(totalQty),
        unit: 'وحدة',
        variant: 'info',
        icon: Boxes,
      },
      {
        id: 'transfers-count',
        label: 'عدد أوامر التحويل',
        value: count,
        unit: 'تحويل',
        variant: 'neutral',
        icon: FileText,
      },
    ];
    return canViewProfit ? items : items.filter((item) => item.id !== 'transfers-value');
  }

  const totalAmount = invoiceSummary?.totalAmount ?? 0;
  const paidAmount = invoiceSummary?.paidAmount ?? 0;
  const remainingAmount = invoiceSummary?.remainingAmount ?? 0;
  const count = invoiceSummary?.count ?? 0;
  const profitTotal = invoiceSummary?.profitTotal ?? 0;

  if (kind === 'waste') {
    return [
      {
        id: 'waste-total',
        label: 'إجمالي قيمة الهالك',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'danger',
        icon: AlertTriangle,
      },
      {
        id: 'waste-count',
        label: 'عدد فواتير الهالك',
        value: count,
        unit: 'فاتورة',
        variant: 'neutral',
        icon: FileText,
      },
    ];
  }

  if (kind === 'sale_return') {
    return [
      {
        id: 'return-total',
        label: 'إجمالي مرتجع المبيعات',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'primary',
        icon: RotateCcw,
      },
      {
        id: 'return-count',
        label: 'عدد المرتجعات',
        value: count,
        unit: 'مرتجع',
        variant: 'neutral',
        icon: FileText,
      },
      {
        id: 'return-paid',
        label: 'المسترد للعملاء نقدًا',
        value: money(paidAmount),
        unit: 'ج.م',
        variant: 'warning',
        icon: ArrowDownLeft,
      },
      {
        id: 'return-remaining',
        label: 'المخصوم من رصيدهم',
        value: money(remainingAmount),
        unit: 'ج.م',
        variant: remainingAmount > 0 ? 'warning' : 'neutral',
        icon: FileText,
      },
    ];
  }

  if (kind === 'purchase_return') {
    return [
      {
        id: 'p-return-total',
        label: 'إجمالي مرتجع المشتريات',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'primary',
        icon: RotateCcw,
      },
      {
        id: 'p-return-count',
        label: 'عدد المرتجعات',
        value: count,
        unit: 'مرتجع',
        variant: 'neutral',
        icon: FileText,
      },
      {
        id: 'p-return-paid',
        label: 'المسترد نقدًا من الموردين',
        value: money(paidAmount),
        unit: 'ج.م',
        variant: 'success',
        icon: ArrowUpRight,
      },
      {
        id: 'p-return-remaining',
        label: 'المتبقي كخصم من حساباتهم',
        value: money(remainingAmount),
        unit: 'ج.م',
        variant: remainingAmount > 0 ? 'warning' : 'neutral',
        icon: FileText,
      },
    ];
  }

  if (kind === 'purchase') {
    return [
      {
        id: 'purchase-total',
        label: 'إجمالي المشتريات',
        value: money(totalAmount),
        unit: 'ج.م',
        variant: 'primary',
        icon: ShoppingBag,
      },
      {
        id: 'purchase-count',
        label: 'عدد الفواتير',
        value: count,
        unit: 'فاتورة',
        variant: 'neutral',
        icon: FileText,
      },
      {
        id: 'purchase-paid',
        label: 'إجمالي المسدد',
        value: money(paidAmount),
        unit: 'ج.م',
        variant: 'success',
        icon: CheckCircle2,
      },
      {
        id: 'purchase-remaining',
        label: 'إجمالي الآجل',
        value: money(remainingAmount),
        unit: 'ج.م',
        variant: remainingAmount > 0 ? 'warning' : 'neutral',
        icon: AlertCircle,
      },
    ];
  }

  // Default: 'sale'
  const itemsList: KpiItem[] = [
    {
      id: 'sale-total',
      label: 'إجمالي المبيعات',
      value: money(totalAmount),
      unit: 'ج.م',
      variant: 'primary',
      icon: DollarSign,
    },
    {
      id: 'sale-count',
      label: 'عدد الفواتير',
      value: count,
      unit: 'فاتورة',
      variant: 'neutral',
      icon: FileText,
    },
    {
      id: 'sale-paid',
      label: 'إجمالي التحصيل',
      value: money(paidAmount),
      unit: 'ج.م',
      variant: 'success',
      icon: CheckCircle2,
    },
    {
      id: 'sale-remaining',
      label: 'إجمالي الآجل',
      value: money(remainingAmount),
      unit: 'ج.م',
      variant: remainingAmount > 0 ? 'warning' : 'neutral',
      icon: AlertCircle,
    },
  ];

  if (canViewProfit) {
    itemsList.push({
      id: 'sale-profit',
      label: 'إجمالي الأرباح',
      value: money(profitTotal),
      unit: 'ج.م',
      variant: 'info',
      icon: TrendingUp,
    });
  }

  return itemsList;
}

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import QuickActions from '../../pages/home/QuickActions';
import SalesMetricCards from '../../pages/home/SalesMetricCards';
import FinancialPulseCards from '../../pages/home/FinancialPulseCards';
import TopRankedList from '../../pages/home/TopRankedList';
import LowStockCard from '../../pages/home/LowStockCard';
import { Package } from 'lucide-react';

// Mock useAccess
vi.mock('../../lib/access', () => ({
  useAccess: () => ({
    access: { role: 'owner', permissions: ['*'], is_active: true },
    loading: false,
    can: () => true,
  }),
}));

describe('Home Dashboard Components', () => {
  it('QuickActions renders user greeting and primary action buttons', () => {
    render(
      <BrowserRouter>
        <QuickActions userName="عبد الرحمن" companyName="شركة الأهرام" />
      </BrowserRouter>
    );

    expect(screen.getByText(/مرحباً، عبد الرحمن/)).toBeInTheDocument();
    expect(screen.getByText(/شركة الأهرام/)).toBeInTheDocument();
    const saleBtn = screen.getByText('فاتورة بيع جديدة').closest('a');
    expect(saleBtn).toHaveAttribute('href', '/invoices?tab=sale&action=new');

    const inBtn = screen.getByText('استلام فلوس').closest('a');
    expect(inBtn).toHaveAttribute('href', '/receipts?tab=in&action=new');

    const outBtn = screen.getByText('صرف فلوس').closest('a');
    expect(outBtn).toHaveAttribute('href', '/receipts?tab=out&action=new');

    const purchaseBtn = screen.getByText('فاتورة شراء').closest('a');
    expect(purchaseBtn).toHaveAttribute('href', '/invoices?tab=purchase&action=new');
  });

  it('SalesMetricCards renders today, week, and month sales metrics', () => {
    const mockSales = {
      today: 120,
      today_count: 3,
      week: 52349,
      week_count: 1944,
      month: 221804,
      month_count: 0,
    };

    render(<SalesMetricCards sales={mockSales} />);

    expect(screen.queryByText('إجمالي المبيعات')).not.toBeInTheDocument();
    expect(screen.getByText('مبيعات اليوم')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'مبيعات الفترات' })).toHaveTextContent('مبيعات آخر 7 أيام');
    expect(screen.getByRole('region', { name: 'مبيعات الفترات' })).toHaveTextContent('مبيعات آخر 30 يوم');
    expect(screen.getByText('120.00')).toBeInTheDocument();
    expect(screen.getByText('52,349.00')).toBeInTheDocument();
    expect(screen.getByText('221,804.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1,944')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('3').parentElement).toHaveTextContent('3 فواتير');
    expect(screen.getByText('1,944').parentElement).toHaveTextContent('1,944 فاتورة');
    expect(screen.getByText('0').parentElement).toHaveTextContent('0 فاتورة');
  });

  it('FinancialPulseCards renders cash, receivables, and payables cards with direct links', () => {
    render(
      <BrowserRouter>
        <FinancialPulseCards
          cashBalance={15000}
          receivablesBalance={48200}
          payablesBalance={18500}
        />
      </BrowserRouter>
    );

    expect(screen.getByRole('region', { name: 'النبض المالي والأرصدة' })).toBeInTheDocument();
    expect(screen.getByText('الفلوس في الخزن')).toBeInTheDocument();
    expect(screen.getByText('15,000.00')).toBeInTheDocument();
    expect(screen.getByTitle('عرض كشف الخزن')).toHaveAttribute('href', '/balances?tab=cashBoxes');

    expect(screen.getByText('فلوسنا في السوق (العملاء)')).toBeInTheDocument();
    expect(screen.getByText('48,200.00')).toBeInTheDocument();
    expect(screen.getByTitle('عرض أرصدة العملاء')).toHaveAttribute('href', '/balances?tab=customers');

    expect(screen.getByText('ديون الموردين (التزامات)')).toBeInTheDocument();
    expect(screen.getByText('18,500.00')).toBeInTheDocument();
    expect(screen.getByTitle('عرض حسابات الموردين')).toHaveAttribute('href', '/balances?tab=suppliers');
  });

  it('TopRankedList renders ranked bars and formatted values', () => {
    const items = [
      { id: '1', label: 'سبرت', value: 100, formattedValue: '100', unit: 'قطعة' },
      { id: '2', label: 'شيبسي', value: 50, formattedValue: '50', unit: 'قطعة' },
    ];

    render(
      <BrowserRouter>
        <TopRankedList
          title="أكثر الأصناف مبيعاً"
          icon={Package}
          items={items}
          barVariant="items"
          emptyText="لا توجد بيانات"
          linkTo="/invoices?tab=sale"
          linkText="عرض فواتير المبيعات"
        />
      </BrowserRouter>
    );

    expect(screen.getByText('أكثر الأصناف مبيعاً')).toBeInTheDocument();
    expect(screen.getByText('سبرت')).toBeInTheDocument();
    expect(screen.getByText('شيبسي')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض فواتير المبيعات' })).toHaveAttribute('href', '/invoices?tab=sale');
    expect(screen.queryByText('عرض فواتير المبيعات')).not.toBeInTheDocument();
  });

  it('LowStockCard renders items with warning badges and empty state when empty', () => {
    const items = [
      { item_id: '1', item_name: 'جبنة دومتي', unit: 'علبة', code: 'ITM-001', current_qty: 2 },
    ];

    const { rerender } = render(
      <BrowserRouter>
        <LowStockCard items={items} />
      </BrowserRouter>
    );

    expect(screen.getByText('جبنة دومتي')).toBeInTheDocument();
    expect(screen.getByText(/ITM-001/)).toBeInTheDocument();
    expect(screen.getByText(/المتبقي:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض أرصدة الأصناف' })).toHaveAttribute('href', '/balances?tab=items');
    expect(screen.queryByText('عرض أرصدة الأصناف')).not.toBeInTheDocument();

    rerender(
      <BrowserRouter>
        <LowStockCard items={[]} />
      </BrowserRouter>
    );

    expect(screen.getByText(/المخزون مستقر ولا توجد نواقص حرجة حالياً/)).toBeInTheDocument();
  });
});

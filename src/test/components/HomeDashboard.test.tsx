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
    expect(screen.getByText('فاتورة بيع جديدة')).toBeInTheDocument();
    expect(screen.getByText('استلام فلوس')).toBeInTheDocument();
    expect(screen.getByText('صرف فلوس')).toBeInTheDocument();
  });

  it('SalesMetricCards renders today, week, and month sales metrics', () => {
    const mockSales = {
      today: 120,
      today_count: 3,
      week: 52349,
      month: 221804,
    };

    render(<SalesMetricCards sales={mockSales} />);

    expect(screen.getByText('اليوم')).toBeInTheDocument();
    expect(screen.getByText('120.00')).toBeInTheDocument();
    expect(screen.getByText('52,349.00')).toBeInTheDocument();
    expect(screen.getByText('221,804.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('FinancialPulseCards renders cash, receivables, and payables cards', () => {
    render(
      <BrowserRouter>
        <FinancialPulseCards
          cashBalance={15000}
          receivablesBalance={48200}
          payablesBalance={18500}
        />
      </BrowserRouter>
    );

    expect(screen.getByText('الفلوس في الخزن')).toBeInTheDocument();
    expect(screen.getByText('15,000.00')).toBeInTheDocument();
    expect(screen.getByText('فلوسنا في السوق (العملاء)')).toBeInTheDocument();
    expect(screen.getByText('48,200.00')).toBeInTheDocument();
    expect(screen.getByText('ديون الموردين (التزامات)')).toBeInTheDocument();
    expect(screen.getByText('18,500.00')).toBeInTheDocument();
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
        />
      </BrowserRouter>
    );

    expect(screen.getByText('أكثر الأصناف مبيعاً')).toBeInTheDocument();
    expect(screen.getByText('سبرت')).toBeInTheDocument();
    expect(screen.getByText('شيبسي')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
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

    rerender(
      <BrowserRouter>
        <LowStockCard items={[]} />
      </BrowserRouter>
    );

    expect(screen.getByText(/المخزون مستقر ولا توجد نواقص حرجة حالياً/)).toBeInTheDocument();
  });
});

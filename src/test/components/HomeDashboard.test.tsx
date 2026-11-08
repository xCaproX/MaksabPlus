import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import QuickActions from '../../pages/home/QuickActions';
import SalesMetricCards from '../../pages/home/SalesMetricCards';
import FinancialPulseCards from '../../pages/home/FinancialPulseCards';
import TopRankedList from '../../pages/home/TopRankedList';
import Home from '../../pages/Home';
import { supabase } from '../../lib/supabase';
import { Package } from 'lucide-react';

// Mock useAccess
vi.mock('../../lib/access', () => ({
  useAccess: () => ({
    access: { role: 'owner', permissions: ['*'], is_active: true },
    loading: false,
    can: () => true,
  }),
}));

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../../lib/company', () => ({ getCurrentUserIdentity: vi.fn().mockResolvedValue(null) }));

describe('Home Dashboard Components', () => {
  it('QuickActions renders user greeting and primary action buttons', () => {
    const { container } = render(
      <BrowserRouter>
        <QuickActions userName="عبد الرحمن" companyName="شركة الأهرام — 06-11-2026" />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: 'مرحباً، عبد الرحمن' })).toBeInTheDocument();
    expect(screen.getByText(/شركة الأهرام/)).toBeInTheDocument();
    expect(screen.getByText('06-11-2026')).toHaveAttribute('dir', 'ltr');
    const timeEl = container.querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('datetime', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    const dateDisplay = timeEl?.querySelector('.date-display');
    expect(dateDisplay).toBeInTheDocument();
    expect(dateDisplay).toHaveAttribute('dir', 'rtl');
    const saleBtn = screen.getByText('فاتورة بيع جديدة').closest('a');
    expect(saleBtn).toHaveAttribute('href', '/invoices?tab=sale&action=new');

    const inBtn = screen.getByText('استلام فلوس').closest('a');
    expect(inBtn).toHaveAttribute('href', '/receipts?tab=in&action=new');

    const outBtn = screen.getByText('صرف فلوس').closest('a');
    expect(outBtn).toHaveAttribute('href', '/receipts?tab=out&action=new');

    const purchaseBtn = screen.getByText('فاتورة شراء').closest('a');
    expect(purchaseBtn).toHaveAttribute('href', '/invoices?tab=purchase&action=new');
  });

  it('SalesMetricCards renders today and yesterday sales metrics with performance indicator', () => {
    const mockSales = {
      today: 1500,
      today_count: 5,
      yesterday: 1200,
      yesterday_count: 4,
    };

    render(<SalesMetricCards sales={mockSales} />);

    expect(screen.queryByText('إجمالي المبيعات')).not.toBeInTheDocument();
    expect(screen.queryByText('مبيعات آخر 7 أيام')).not.toBeInTheDocument();
    expect(screen.queryByText('مبيعات آخر 30 يوم')).not.toBeInTheDocument();

    expect(screen.getByText('مبيعات اليوم')).toBeInTheDocument();
    expect(screen.getByText('مبيعات أمس')).toBeInTheDocument();

    expect(screen.getByText('1,500.00')).toBeInTheDocument();
    expect(screen.getByText('1,200.00')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    for (const count of ['5', '4']) {
      expect(screen.getByText(count).previousElementSibling).toHaveTextContent('الفواتير');
    }

    // Performance indicator: (1500 - 1200) / 1200 = +25.0%
    expect(screen.getByTitle('مؤشر الأداء مقارنة بأمس')).toHaveTextContent('+25.0% عن أمس');
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

    expect(screen.getByRole('region', { name: 'الأرصدة' })).toBeInTheDocument();
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

  it('shows the three dashboard sections without rendering low-stock data', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        sales: { today: 0, today_count: 0, week: 0, month: 0 },
        cash_balance: 0,
        receivables_balance: null,
        payables_balance: null,
        permissions: { can_view_sales: true, can_view_items: true },
        low_stock_items: [{ item_id: '1', item_name: 'صنف على وشك النفاد', unit: 'قطعة', current_qty: 1 }],
      },
      error: null,
    } as never);

    render(<BrowserRouter><Home /></BrowserRouter>);

    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'المبيعات', 'الأرصدة', 'الإحصائيات',
    ]);
    expect(screen.queryByText(/نواقص المخزن|صنف على وشك النفاد/)).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DashboardChartsSection from '../../components/charts/DashboardChartsSection';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../../components/charts/SalesTrendChart', () => ({
  default: () => <div data-testid="mock-sales-trend-chart">SalesTrendChart</div>,
}));

vi.mock('../../components/charts/SalesVsPurchasesChart', () => ({
  default: () => <div data-testid="mock-sales-purchases-chart">SalesVsPurchasesChart</div>,
}));

vi.mock('../../components/charts/SalesDistributionChart', () => ({
  default: () => <div data-testid="mock-distribution-chart">SalesDistributionChart</div>,
}));

describe('DashboardChartsSection Component', () => {
  const mockChartsData = {
    daily_trend: [
      { date: '2026-11-08', sales: 1500, sales_count: 3, purchases: 800, purchases_count: 2 },
    ],
    sales_distribution: {
      cash_sales: 1000,
      credit_sales: 500,
      returns_total: 0,
    },
    top_items: [
      { item_id: 'item-1', item_name: 'بيبسي كانز', unit: 'علبة', total_qty: 120, total_amount: 1200 },
      { item_id: 'item-2', item_name: 'شيبسي عائلي', unit: 'كيس', total_qty: 85, total_amount: 850 },
    ],
    top_customers: [
      { account_id: 'cust-1', account_name: 'عميل مميز 1', total_amount: 5000, invoice_count: 4 },
      { account_id: 'cust-2', account_name: 'شركة الأمل', total_amount: 3200, invoice_count: 2 },
    ],
    permissions: {
      can_view_sales: true,
      can_view_purchases: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: mockChartsData, error: null } as never);
  });

  it('renders all 6 range options with "آخر شهر" as the default active option', async () => {
    render(
      <BrowserRouter>
        <DashboardChartsSection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('آخر أسبوع')).toBeInTheDocument();
      expect(screen.getByText('آخر شهر')).toBeInTheDocument();
      expect(screen.getByText('آخر 3 أشهر')).toBeInTheDocument();
      expect(screen.getByText('آخر 6 أشهر')).toBeInTheDocument();
      expect(screen.getByText('آخر سنة')).toBeInTheDocument();
      expect(screen.getByText('طول الوقت')).toBeInTheDocument();
    });

    const activeBtn = screen.getByRole('button', { name: 'آخر شهر' });
    expect(activeBtn).toHaveClass('is-active');

    expect(supabase.rpc).toHaveBeenCalledWith('get_home_dashboard_charts', { p_days: 30 });
  });

  it('changes active range and queries RPC with corresponding days when an option is clicked', async () => {
    render(
      <BrowserRouter>
        <DashboardChartsSection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('آخر سنة')).toBeInTheDocument();
    });

    const yearBtn = screen.getByRole('button', { name: 'آخر سنة' });
    fireEvent.click(yearBtn);

    await waitFor(() => {
      expect(yearBtn).toHaveClass('is-active');
      expect(supabase.rpc).toHaveBeenCalledWith('get_home_dashboard_charts', { p_days: 365 });
    });

    const allTimeBtn = screen.getByRole('button', { name: 'طول الوقت' });
    fireEvent.click(allTimeBtn);

    await waitFor(() => {
      expect(allTimeBtn).toHaveClass('is-active');
      expect(supabase.rpc).toHaveBeenCalledWith('get_home_dashboard_charts', { p_days: 0 });
    });
  });

  it('renders top items and top customers lists connected to the selected range', async () => {
    render(
      <BrowserRouter>
        <DashboardChartsSection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('أكثر الأصناف طلباً')).toBeInTheDocument();
      expect(screen.getByText('كبار العملاء')).toBeInTheDocument();
      expect(screen.getByText('نسبة التحصيل النقدي مقارنة بالآجل خلال آخر شهر')).toBeInTheDocument();
      expect(screen.getByText('أعلى 10 أصناف حسب الكمية المباعة خلال آخر شهر')).toBeInTheDocument();
      expect(screen.getByText('أعلى 10 عملاء حسب قيمة المشتريات خلال آخر شهر')).toBeInTheDocument();
      expect(screen.getByText('بيبسي كانز')).toBeInTheDocument();
      expect(screen.getByText('شيبسي عائلي')).toBeInTheDocument();
      expect(screen.getByText('عميل مميز 1')).toBeInTheDocument();
      expect(screen.getByText('شركة الأمل')).toBeInTheDocument();
    });

    // Switch range to last week
    const weekBtn = screen.getByRole('button', { name: 'آخر أسبوع' });
    fireEvent.click(weekBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('get_home_dashboard_charts', { p_days: 7 });
      expect(screen.getByText('نسبة التحصيل النقدي مقارنة بالآجل خلال آخر أسبوع')).toBeInTheDocument();
      expect(screen.getByText('أعلى 10 أصناف حسب الكمية المباعة خلال آخر أسبوع')).toBeInTheDocument();
      expect(screen.getByText('أعلى 10 عملاء حسب قيمة المشتريات خلال آخر أسبوع')).toBeInTheDocument();
    });
  });

  it('shows empty state for sales distribution when only returns exist (cash and credit are zero)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        ...mockChartsData,
        sales_distribution: {
          cash_sales: 0,
          credit_sales: 0,
          returns_total: 250,
        },
      },
      error: null,
    } as never);

    render(
      <BrowserRouter>
        <DashboardChartsSection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('لا توجد بيانات توزيع مبيعات كافية')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-distribution-chart')).not.toBeInTheDocument();
    });
  });
});

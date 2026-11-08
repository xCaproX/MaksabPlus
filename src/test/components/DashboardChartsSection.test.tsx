import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    render(<DashboardChartsSection />);

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
    render(<DashboardChartsSection />);

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
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartConfiguration } from 'chart.js';
import SalesDistributionChart from '../../components/charts/SalesDistributionChart';
import { chartTokens } from '../../components/charts/chartDefaults';

const chartConfigs: Array<ChartConfiguration<'doughnut'>> = [];

vi.mock('chart.js', () => {
  class MockChart {
    static register = vi.fn();
    destroy = vi.fn();
    constructor(_ctx: unknown, config: ChartConfiguration<'doughnut'>) {
      chartConfigs.push(config);
    }
  }
  return {
    Chart: MockChart,
    LineController: {},
    BarController: {},
    DoughnutController: {},
    CategoryScale: {},
    LinearScale: {},
    PointElement: {},
    LineElement: {},
    BarElement: {},
    ArcElement: {},
    Title: {},
    Tooltip: {},
    Legend: {},
    Filler: {},
  };
});

describe('SalesDistributionChart', () => {
  beforeEach(() => {
    chartConfigs.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as unknown as CanvasRenderingContext2D);
  });

  it('renders only cash (green) and credit (red) segments and hides returns', () => {
    render(
      <SalesDistributionChart
        distribution={{
          cash_sales: 389128.09,
          credit_sales: 278330,
          returns_total: 1200,
        }}
      />
    );

    expect(chartConfigs).toHaveLength(1);
    const config = chartConfigs[0];
    expect(config.data.labels).toEqual(['مبيعات نقدية', 'مبيعات آجلة']);
    expect(config.data.datasets[0].data).toEqual([389128.09, 278330]);
    expect(config.data.datasets[0].backgroundColor).toEqual([
      chartTokens.colors.success,
      chartTokens.colors.danger,
    ]);
    expect(screen.queryByText('مرتجعات')).not.toBeInTheDocument();
  });

  it('renders visible percentage indicators without requiring hover using ltr bdi and tabular-nums', () => {
    const { container } = render(
      <SalesDistributionChart
        distribution={{
          cash_sales: 389128.09,
          credit_sales: 278330,
          returns_total: 500,
        }}
      />
    );

    expect(screen.getByText('مبيعات نقدية')).toBeInTheDocument();
    expect(screen.getByText('مبيعات آجلة')).toBeInTheDocument();

    const cashPctEl = screen.getByText('58.3%');
    const creditPctEl = screen.getByText('41.7%');
    expect(cashPctEl.tagName.toLowerCase()).toBe('bdi');
    expect(cashPctEl).toHaveAttribute('dir', 'ltr');
    expect(cashPctEl).toHaveClass('tabular-nums');
    expect(creditPctEl.tagName.toLowerCase()).toBe('bdi');
    expect(creditPctEl).toHaveAttribute('dir', 'ltr');
    expect(creditPctEl).toHaveClass('tabular-nums');

    expect(container.querySelector('.sales-dist-center')).toHaveTextContent('إجمالي المبيعات');
  });
});

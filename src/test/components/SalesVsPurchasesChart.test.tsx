import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartConfiguration } from 'chart.js';
import SalesVsPurchasesChart from '../../components/charts/SalesVsPurchasesChart';
import { chartTokens } from '../../components/charts/chartDefaults';

const chartConfigs: Array<ChartConfiguration<'bar'>> = [];

vi.mock('chart.js', () => {
  class MockChart {
    static register = vi.fn();
    destroy = vi.fn();
    constructor(_ctx: unknown, config: ChartConfiguration<'bar'>) {
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

describe('SalesVsPurchasesChart', () => {
  beforeEach(() => {
    chartConfigs.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as unknown as CanvasRenderingContext2D);
  });

  it('uses blue (accent) for sales bars and warning orange for purchases bars', () => {
    render(
      <SalesVsPurchasesChart
        data={[
          { date: '2026-11-11', sales: 12000, sales_count: 3, purchases: 5000, purchases_count: 1 },
          { date: '2026-11-12', sales: 18000, sales_count: 4, purchases: 7000, purchases_count: 2 },
        ]}
      />
    );

    expect(chartConfigs).toHaveLength(1);
    const datasets = chartConfigs[0].data.datasets;
    expect(datasets[0].label).toBe('المبيعات (ج.م)');
    expect(datasets[0].backgroundColor).toBe(chartTokens.colors.accent);
    expect(datasets[1].label).toBe('المشتريات (ج.م)');
    expect(datasets[1].backgroundColor).toBe(chartTokens.colors.warning);
  });
});

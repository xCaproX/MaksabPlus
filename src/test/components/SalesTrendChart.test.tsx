import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartConfiguration } from 'chart.js';
import SalesTrendChart from '../../components/charts/SalesTrendChart';

const chartConfigs: Array<ChartConfiguration<'line'>> = [];

vi.mock('chart.js', () => {
  class MockChart {
    static register = vi.fn();
    destroy = vi.fn();
    constructor(_ctx: unknown, config: ChartConfiguration<'line'>) {
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

describe('SalesTrendChart', () => {
  beforeEach(() => {
    chartConfigs.length = 0;
    const mockGradient = { addColorStop: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: vi.fn(() => mockGradient),
    } as unknown as CanvasRenderingContext2D);
  });

  it('adds left canvas padding so the leftmost reversed x-axis date label is not clipped', () => {
    render(
      <SalesTrendChart
        data={[
          { date: '2026-11-11', sales: 12000, sales_count: 3, purchases: null, purchases_count: null },
          { date: '2026-11-12', sales: 18000, sales_count: 4, purchases: null, purchases_count: null },
        ]}
      />
    );

    expect(chartConfigs).toHaveLength(1);
    const padding = chartConfigs[0].options?.layout?.padding as { left?: number } | undefined;
    expect(padding?.left).toBeGreaterThanOrEqual(20);
  });
});

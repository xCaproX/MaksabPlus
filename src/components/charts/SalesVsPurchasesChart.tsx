import { useEffect, useRef } from 'react';
import { Chart as ChartJS, type ChartConfiguration } from 'chart.js';
import { ensureChartRegistered, chartTokens, defaultTooltipConfig, defaultLegendConfig } from './chartDefaults';
import { money } from '../../lib/format';
import type { DailyTrendPoint } from './SalesTrendChart';

interface SalesVsPurchasesChartProps {
  data: DailyTrendPoint[];
}

function formatShortDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export default function SalesVsPurchasesChart({ data }: SalesVsPurchasesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    ensureChartRegistered();

    if (!canvasRef.current || data.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const labels = data.map((d) => formatShortDate(d.date));
    const salesValues = data.map((d) => (d.sales !== null ? Number(d.sales) : 0));
    const purchaseValues = data.map((d) => (d.purchases !== null ? Number(d.purchases) : 0));

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'المبيعات (ج.م)',
            data: salesValues,
            backgroundColor: chartTokens.colors.primary,
            borderRadius: 4,
            maxBarThickness: 18,
          },
          {
            label: 'المشتريات (ج.م)',
            data: purchaseValues,
            backgroundColor: chartTokens.colors.warning,
            borderRadius: 4,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 20,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              font: {
                family: chartTokens.fontFamily,
                size: 11,
              },
              color: chartTokens.colors.muted,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
            },
            border: {
              color: chartTokens.colors.line,
            },
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(226, 232, 240, 0.6)',
            },
            ticks: {
              font: {
                family: chartTokens.fontFamily,
                size: 11,
              },
              color: chartTokens.colors.muted,
              callback: (value) => money(Number(value)),
            },
            border: {
              display: false,
            },
          },
        },
        plugins: {
          legend: defaultLegendConfig,
          tooltip: {
            ...defaultTooltipConfig,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx !== undefined && data[idx]) {
                  return `التاريخ: ${data[idx].date}`;
                }
                return items[0]?.label ?? '';
              },
              label: (context) => {
                const label = context.dataset.label ?? '';
                const val = context.parsed.y ?? 0;
                return ` ${label}: ${money(val)} ج.م`;
              },
            },
          },
        },
      },
    };

    chartInstanceRef.current = new ChartJS(ctx, config);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} aria-label="مقارنة المبيعات بالمشتريات" role="img" style={{ display: 'block', maxWidth: '100%' }} />
    </div>
  );
}

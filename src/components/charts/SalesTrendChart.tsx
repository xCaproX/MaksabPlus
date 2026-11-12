import { useEffect, useRef } from 'react';
import { Chart as ChartJS, type ChartConfiguration } from 'chart.js';
import { ensureChartRegistered, chartTokens, defaultTooltipConfig, defaultLegendConfig } from './chartDefaults';
import { money, formatChartDate, formatFullChartDate } from '../../lib/format';

export interface DailyTrendPoint {
  date: string;
  sales: number | null;
  sales_count: number | null;
  purchases: number | null;
  purchases_count: number | null;
}

interface SalesTrendChartProps {
  data: DailyTrendPoint[];
}

export default function SalesTrendChart({ data }: SalesTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    ensureChartRegistered();

    if (!canvasRef.current || data.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const labels = data.map((d) => formatChartDate(d.date));
    const salesValues = data.map((d) => (d.sales !== null ? Number(d.sales) : 0));

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(46, 66, 92, 0.22)');
    gradient.addColorStop(1, 'rgba(46, 66, 92, 0.01)');

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'صافي المبيعات (ج.م)',
            data: salesValues,
            borderColor: chartTokens.colors.primary,
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            borderWidth: 2.2,
            pointRadius: data.length > 60 ? 0 : data.length > 14 ? 1.5 : 3.5,
            pointHoverRadius: 5.5,
            pointBackgroundColor: chartTokens.colors.primary,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 20,
        layout: {
          padding: {
            left: 20,
          },
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          x: {
            reverse: true,
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
            displayColors: false,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx !== undefined && data[idx]) {
                  return formatFullChartDate(data[idx].date);
                }
                return items[0]?.label ?? '';
              },
              label: (context) => {
                const val = context.parsed.y ?? 0;
                const idx = context.dataIndex;
                const count = data[idx]?.sales_count ?? 0;
                return [
                  `${money(val)} ج.م`,
                  `(الفواتير ${count})`,
                ];
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
      <canvas ref={canvasRef} aria-label="رسم بياني لمسار المبيعات عبر الأيام" role="img" style={{ display: 'block', maxWidth: '100%' }} />
    </div>
  );
}

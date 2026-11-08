import { useEffect, useRef } from 'react';
import { Chart as ChartJS, type ChartConfiguration } from 'chart.js';
import { ensureChartRegistered, chartTokens, defaultTooltipConfig, defaultLegendConfig } from './chartDefaults';
import { money } from '../../lib/format';

export interface SalesDistributionData {
  cash_sales: number;
  credit_sales: number;
  returns_total: number;
  cash_count?: number;
  partial_count?: number;
  credit_count?: number;
  returns_count?: number;
}

interface SalesDistributionChartProps {
  distribution: SalesDistributionData;
}

export default function SalesDistributionChart({ distribution }: SalesDistributionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  const cash = Number(distribution.cash_sales || 0);
  const credit = Number(distribution.credit_sales || 0);
  const returns = Number(distribution.returns_total || 0);
  const total = cash + credit;

  useEffect(() => {
    ensureChartRegistered();

    if (!canvasRef.current || (cash === 0 && credit === 0 && returns === 0)) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const labels = ['مبيعات نقدية', 'مبيعات آجلة'];
    const dataValues = [cash, credit];
    const bgColors: string[] = [chartTokens.colors.success, chartTokens.colors.accent];

    if (returns > 0) {
      labels.push('مرتجعات');
      dataValues.push(returns);
      bgColors.push(chartTokens.colors.danger);
    }

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            backgroundColor: bgColors,
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            ...defaultLegendConfig,
            position: 'bottom',
          },
          tooltip: {
            ...defaultTooltipConfig,
            callbacks: {
              label: (context) => {
                const val = Number(context.raw || 0);
                const percent = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return ` ${context.label}: ${money(val)} ج.م (${percent}%)`;
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
  }, [cash, credit, returns, total]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} aria-label="رسم بياني لتوزيع المبيعات النقدية والآجلة" role="img" />
    </div>
  );
}

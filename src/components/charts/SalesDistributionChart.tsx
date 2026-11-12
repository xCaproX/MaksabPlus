import { useEffect, useRef } from 'react';
import { Chart as ChartJS, type ChartConfiguration } from 'chart.js';
import { ensureChartRegistered, chartTokens, defaultTooltipConfig } from './chartDefaults';
import { money } from '../../lib/format';

export interface SalesDistributionData {
  cash_sales: number;
  credit_sales: number;
  returns_total?: number;
  cash_count?: number;
  partial_count?: number;
  credit_count?: number;
  returns_count?: number;
}

interface SalesDistributionChartProps {
  distribution: SalesDistributionData;
}

function boldTooltipLine(text: string, ctx: CanvasRenderingContext2D | null): string {
  if (!ctx) return text;
  return {
    toString() {
      ctx.font = `bold 12px ${chartTokens.fontFamily}`;
      return text;
    },
  } as unknown as string;
}

function normalTooltipLine(text: string, ctx: CanvasRenderingContext2D | null): string {
  if (!ctx) return text;
  return {
    toString() {
      ctx.font = `normal 12px ${chartTokens.fontFamily}`;
      return text;
    },
  } as unknown as string;
}

export default function SalesDistributionChart({ distribution }: SalesDistributionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  const cash = Number(distribution.cash_sales || 0);
  const credit = Number(distribution.credit_sales || 0);
  const total = cash + credit;

  const cashPercentValue = total > 0 ? Math.round((cash / total) * 1000) / 10 : 0;
  const creditPercentValue = total > 0 ? Math.round((100 - cashPercentValue) * 10) / 10 : 0;
  const cashPct = cashPercentValue.toFixed(1);
  const creditPct = creditPercentValue.toFixed(1);

  useEffect(() => {
    ensureChartRegistered();

    if (!canvasRef.current || (cash === 0 && credit === 0)) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const labels = ['مبيعات نقدية', 'مبيعات آجلة'];
    const dataValues = [cash, credit];
    const bgColors: string[] = [chartTokens.colors.success, chartTokens.colors.danger];
    const pctStrings = [cashPct, creditPct];

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
        resizeDelay: 20,
        cutout: '72%',
        layout: {
          padding: 4,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            ...defaultTooltipConfig,
            displayColors: true,
            boxPadding: 6,
            bodySpacing: 6,
            callbacks: {
              title: () => [],
              label: (context) => {
                const val = Number(context.raw || 0);
                const percent = pctStrings[context.dataIndex] ?? '0.0';
                return [
                  boldTooltipLine(context.label ?? '', ctx),
                  normalTooltipLine(`${money(val)} ج.م`, ctx),
                  normalTooltipLine(`(${percent}%)`, ctx),
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
  }, [cash, credit, cashPct, creditPct]);

  return (
    <div className="sales-dist-layout">
      <div className="sales-dist-canvas-wrap">
        <canvas
          ref={canvasRef}
          aria-label="رسم بياني لتوزيع المبيعات النقدية والآجلة"
          role="img"
          style={{ display: 'block', maxWidth: '100%' }}
        />
        <div className="sales-dist-center" aria-hidden="true">
          <span className="sales-dist-center-label">إجمالي المبيعات</span>
          <span className="sales-dist-center-value">
            <bdi dir="ltr" className="tabular-nums">{money(total)}</bdi>
            <span className="sales-dist-center-unit">ج.م</span>
          </span>
        </div>
      </div>

      <div className="sales-dist-indicators">
        <div className="sales-dist-indicator is-cash">
          <div className="sales-dist-indicator-head">
            <span className="sales-dist-dot" aria-hidden="true" />
            <span className="sales-dist-label">مبيعات نقدية</span>
          </div>
          <div className="sales-dist-percent">
            <bdi dir="ltr" className="tabular-nums">{cashPct}%</bdi>
          </div>
          <div className="sales-dist-amount">
            <bdi dir="ltr" className="tabular-nums">{money(cash)}</bdi>
            <span>ج.م</span>
          </div>
        </div>

        <div className="sales-dist-indicator is-credit">
          <div className="sales-dist-indicator-head">
            <span className="sales-dist-dot" aria-hidden="true" />
            <span className="sales-dist-label">مبيعات آجلة</span>
          </div>
          <div className="sales-dist-percent">
            <bdi dir="ltr" className="tabular-nums">{creditPct}%</bdi>
          </div>
          <div className="sales-dist-amount">
            <bdi dir="ltr" className="tabular-nums">{money(credit)}</bdi>
            <span>ج.م</span>
          </div>
        </div>
      </div>
    </div>
  );
}

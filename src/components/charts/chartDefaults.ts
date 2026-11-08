import {
  Chart as ChartJS,
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

let isRegistered = false;

export function ensureChartRegistered(): void {
  if (isRegistered) return;
  ChartJS.register(
    LineController,
    BarController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );
  isRegistered = true;
}

export const chartTokens = {
  fontFamily: "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif",
  colors: {
    primary: '#2e425c',
    primaryHover: '#223348',
    primaryLight: 'rgba(46, 66, 92, 0.12)',
    accent: '#0284c7',
    accentLight: 'rgba(2, 132, 199, 0.12)',
    success: '#16a34a',
    successLight: 'rgba(22, 163, 74, 0.14)',
    warning: '#d97706',
    warningLight: 'rgba(217, 119, 6, 0.14)',
    danger: '#dc2626',
    dangerLight: 'rgba(220, 38, 38, 0.12)',
    muted: '#64748b',
    mutedLight: '#94a3b8',
    line: '#e2e8f0',
    card: '#ffffff',
    ink: '#0f172a',
  },
} as const;

export const defaultTooltipConfig = {
  rtl: true,
  textDirection: 'rtl' as const,
  backgroundColor: '#0f172a',
  titleColor: '#ffffff',
  bodyColor: '#e2e8f0',
  borderColor: '#334155',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  titleFont: {
    family: chartTokens.fontFamily,
    size: 12,
    weight: 'bold' as const,
  },
  bodyFont: {
    family: chartTokens.fontFamily,
    size: 12,
    weight: 'normal' as const,
  },
  displayColors: true,
  boxPadding: 4,
};

export const defaultLegendConfig = {
  position: 'top' as const,
  rtl: true,
  textDirection: 'rtl' as const,
  labels: {
    font: {
      family: chartTokens.fontFamily,
      size: 12,
    },
    color: chartTokens.colors.muted,
    usePointStyle: true,
    pointStyle: 'circle' as const,
    boxWidth: 8,
    boxHeight: 8,
    padding: 14,
  },
};

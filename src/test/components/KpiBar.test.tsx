import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { DollarSign, FileText } from 'lucide-react';

describe('KpiBar Component', () => {
  it('renders nothing when items array is empty', () => {
    const { container } = render(<KpiBar items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders KPI items correctly with label, formatted value, and unit', () => {
    const items: KpiItem[] = [
      {
        id: 'total-sales',
        label: 'إجمالي المبيعات',
        value: '12,500.00',
        unit: 'ج.م',
        variant: 'primary',
        icon: DollarSign,
      },
      {
        id: 'invoice-count',
        label: 'عدد الفواتير',
        value: 15,
        unit: 'فاتورة',
        variant: 'neutral',
        icon: FileText,
      },
    ];

    render(<KpiBar items={items} />);

    expect(screen.getByText('إجمالي المبيعات')).toBeInTheDocument();
    expect(screen.getByText('12,500.00')).toBeInTheDocument();
    expect(screen.getByText('ج.م')).toBeInTheDocument();
    expect(screen.getByText('عدد الفواتير')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('فاتورة')).toBeInTheDocument();

    const valueEl = screen.getByText('12,500.00');
    expect(valueEl.tagName.toLowerCase()).toBe('bdi');
    expect(valueEl).toHaveAttribute('dir', 'ltr');
  });

  it('renders badges and subtext when provided', () => {
    const items: KpiItem[] = [
      {
        id: 'collected',
        label: 'المحصل نقدًا',
        value: '8,000.00',
        unit: 'ج.م',
        variant: 'success',
        subtext: 'نسبة التحصيل: 64%',
        badge: { text: 'سداد جزئي', variant: 'ok' },
      },
    ];

    render(<KpiBar items={items} />);
    expect(screen.getByText('نسبة التحصيل: 64%')).toBeInTheDocument();
    expect(screen.getByText('سداد جزئي')).toBeInTheDocument();
  });
});

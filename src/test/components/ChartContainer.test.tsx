import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChartContainer from '../../components/charts/ChartContainer';
import { TrendingUp } from 'lucide-react';

describe('ChartContainer Component', () => {
  it('renders title, subtitle, and children in normal state', () => {
    render(
      <ChartContainer
        title="حركة المبيعات"
        subtitle="آخر 30 يوماً"
        icon={TrendingUp}
      >
        <div data-testid="chart-content">محتوى الرسم البياني</div>
      </ChartContainer>
    );

    expect(screen.getByText('حركة المبيعات')).toBeInTheDocument();
    expect(screen.getByText('آخر 30 يوماً')).toBeInTheDocument();
    expect(screen.getByTestId('chart-content')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading=true', () => {
    render(
      <ChartContainer title="حركة المبيعات" loading={true}>
        <div data-testid="chart-content">محتوى الرسم البياني</div>
      </ChartContainer>
    );

    expect(screen.getByLabelText('جارٍ تحميل الرسم البياني')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-content')).not.toBeInTheDocument();
  });

  it('renders empty state message when isEmpty=true', () => {
    render(
      <ChartContainer
        title="حركة المبيعات"
        isEmpty={true}
        emptyMessage="لا توجد مبيعات مسجلة"
      >
        <div data-testid="chart-content">محتوى الرسم البياني</div>
      </ChartContainer>
    );

    expect(screen.getByText('لا توجد مبيعات مسجلة')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-content')).not.toBeInTheDocument();
  });

  it('renders error state and triggers onRetry callback', () => {
    const handleRetry = vi.fn();
    render(
      <ChartContainer
        title="حركة المبيعات"
        error="فشل في الاتصال بالخادم"
        onRetry={handleRetry}
      >
        <div>محتوى</div>
      </ChartContainer>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('فشل في الاتصال بالخادم');
    const retryBtn = screen.getByRole('button', { name: /إعادة المحاولة/ });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});

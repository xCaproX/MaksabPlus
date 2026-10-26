import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../components/StatusBadge';

describe('StatusBadge - شارة الحالة الموحدة', () => {
  it('يعرض النص وفئة التنسيق المتوافقة مع نوع الحالة', () => {
    const { container, rerender } = render(
      <StatusBadge variant="paid">مسددة</StatusBadge>
    );

    expect(screen.getByText('مسددة')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('status-badge-paid');

    rerender(<StatusBadge variant="partial">جزئية</StatusBadge>);
    expect(screen.getByText('جزئية')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('status-badge-partial');

    rerender(<StatusBadge variant="unpaid">غير مسددة</StatusBadge>);
    expect(screen.getByText('غير مسددة')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('status-badge-unpaid');
  });
});

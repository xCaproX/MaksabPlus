import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DateDisplay from '../../components/DateDisplay';

describe('DateDisplay component', () => {
  it('renders date in RTL with day, month, and year separated by slashes', () => {
    const { container } = render(<DateDisplay value="2026-11-08" />);
    const span = container.querySelector('.date-display');
    expect(span).toBeInTheDocument();
    expect(span).toHaveAttribute('dir', 'rtl');

    const bdis = span?.querySelectorAll('bdi');
    expect(bdis).toHaveLength(3);
    expect(bdis?.[0].textContent).toBe('08'); // Day on the right (first in RTL)
    expect(bdis?.[1].textContent).toBe('11'); // Month in middle
    expect(bdis?.[2].textContent).toBe('2026'); // Year on the left

    expect(span?.textContent).toBe('08/11/2026');
  });

  it('renders date correctly from ISO timestamp', () => {
    const { container } = render(<DateDisplay value="2026-05-15T14:30:00.000Z" />);
    const span = container.querySelector('.date-display');
    expect(span).toBeInTheDocument();
    expect(span?.textContent).toBe('15/05/2026');
  });

  it('renders dash when value is empty or null', () => {
    render(<DateDisplay value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<DateDisplay value="2026-11-08" className="custom-class" />);
    expect(container.querySelector('.date-display')).toHaveClass('custom-class');
  });
});

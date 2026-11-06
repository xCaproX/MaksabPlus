import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PeriodFilter from '../../components/PeriodFilter';
import { periodDates } from '../../lib/period';

function Example({ required = false }) {
  const [range, setRange] = useState(() => periodDates());
  return <PeriodFilter {...range} required={required} onChange={(from, to) => setRange({ from, to })} />;
}
describe('shared period filter', () => {
  afterEach(() => vi.useRealTimers());
  it('updates both visible dates when a shortcut is selected and supports all periods', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    render(<Example />);
    expect(screen.getByLabelText('الفترة')).toHaveValue('today');
    expect(screen.getByLabelText('من تاريخ')).toHaveValue('06/11/2026');
    fireEvent.change(screen.getByLabelText('الفترة'), { target: { value: 'week' } });
    expect(screen.getByLabelText('من تاريخ')).toHaveValue('31/10/2026');
    expect(screen.getByLabelText('إلى تاريخ')).toHaveValue('06/11/2026');
    fireEvent.change(screen.getByLabelText('الفترة'), { target: { value: 'all' } });
    expect(screen.getByLabelText('من تاريخ')).toHaveValue('');
    expect(screen.getByLabelText('إلى تاريخ')).toHaveValue('');
  });
  it('keeps manually typed dates and does not offer an unbounded required statement', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    render(<Example required />);
    expect(screen.queryByRole('option', { name: 'كل الفترات' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('من تاريخ'), { target: { value: '01/10/2026' } });
    expect(screen.getByLabelText('من تاريخ')).toHaveValue('01/10/2026');
    expect(screen.getByLabelText('الفترة')).toHaveValue('custom');
  });
  it('locks preset and manual dates while a statement is loading', () => {
    render(<PeriodFilter from="2026-11-06" to="2026-11-06" onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText('الفترة')).toBeDisabled();
    expect(screen.getByLabelText('من تاريخ')).toBeDisabled();
    expect(screen.getByLabelText('إلى تاريخ')).toBeDisabled();
  });
});

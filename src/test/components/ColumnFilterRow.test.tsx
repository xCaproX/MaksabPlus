import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColumnFilterRow from '../../components/ColumnFilterRow';
import { useColumnFilters } from '../../lib/useColumnFilters';

function Example({ scopeKey = 'sale', onReset = () => {} }) {
  const columns = useColumnFilters(scopeKey, onReset);
  return <><table><thead><ColumnFilterRow scope="invoice" kind="sale" values={columns.values} onChange={columns.setField} onReset={columns.reset} /></thead></table>
    <output data-testid="settled">{JSON.stringify(columns.filters)}</output></>;
}
describe('column-filter controls and reset', () => {
  afterEach(() => vi.useRealTimers());
  it('debounces the complete set, clears immediately and drops incompatible scopes', () => {
    vi.useFakeTimers();
    const reset = vi.fn(); const view = render(<Example onReset={reset} />);
    fireEvent.change(screen.getByLabelText('بحث في الإجمالي'), { target: { value: '0' } });
    expect(screen.getByTestId('settled')).toHaveTextContent('{}');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('settled')).toHaveTextContent('{"total":"0"}');
    fireEvent.change(screen.getByLabelText('بحث في الحساب'), { target: { value: '010' } });
    fireEvent.click(screen.getByRole('button', { name: 'مسح كل الفلاتر' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('بحث في الحساب')).toHaveValue('');
    expect(screen.getByLabelText('بحث في الإجمالي')).toHaveValue(null);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('settled')).toHaveTextContent('{}');
    fireEvent.change(screen.getByLabelText('بحث في الحساب'), { target: { value: 'قديم' } });
    view.rerender(<Example scopeKey="purchase" onReset={reset} />);
    expect(screen.getByLabelText('بحث في الحساب')).toHaveValue('');
    expect(screen.getByTestId('settled')).toHaveTextContent('{}');
  });
  it('uses searchable options and supports clearing a date without the reset button', () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('combobox', { name: 'بحث في الحالة' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'بحث في الحالة' }), { target: { value: 'جز' } });
    expect(screen.getByRole('option', { name: 'جزئية' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'غير مسددة' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'جزئية' }));
    fireEvent.change(screen.getByLabelText('بحث في التاريخ'), { target: { value: '05/11/2026' } });
    expect(screen.getByLabelText('بحث في التاريخ')).toHaveValue('05/11/2026');
    fireEvent.change(screen.getByLabelText('بحث في التاريخ'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('بحث في التاريخ'));
    expect(screen.getByLabelText('بحث في التاريخ')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('بحث في التاريخ'), { target: { value: '31/02/2026' } });
    fireEvent.blur(screen.getByLabelText('بحث في التاريخ'));
    expect(screen.getByTestId('settled')).not.toHaveTextContent('2026-02-31');
    expect(screen.getByRole('row', { name: 'بحث بالأعمدة' }).children).toHaveLength(13);
  });
});

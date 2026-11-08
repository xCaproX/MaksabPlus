import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DateInput from '../../components/DateInput';
import TimeInput from '../../components/TimeInput';

function Example() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  return <><DateInput value={date} onChange={setDate} /><TimeInput value={time} onChange={setTime} />
    <output data-testid="values">{date + '|' + time}</output></>;
}
describe('shared date and time pickers', () => {
  afterEach(() => vi.restoreAllMocks());
  it('opens the matching native picker from both icons and accepts its chosen value', () => {
    const kinds: string[] = [];
    const previous = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { kinds.push(this.type); };
    try {
      const view = render(<Example />);
      fireEvent.click(screen.getByRole('button', { name: 'اختيار التاريخ من التقويم' }));
      fireEvent.click(screen.getByRole('button', { name: 'اختيار الوقت' }));
      expect(kinds).toEqual(['date', 'time']);
      fireEvent.change(view.container.querySelector('input[type="date"]')!, { target: { value: '2026-11-06' } });
      fireEvent.change(view.container.querySelector('input[type="time"]')!, { target: { value: '14:25' } });
      expect(screen.getByLabelText('التاريخ')).toHaveValue('06/\u200f11/\u200f2026');
      expect(screen.getByLabelText('الوقت')).toHaveValue('14:25');
      expect(screen.getByTestId('values')).toHaveTextContent('2026-11-06|14:25');
    } finally { HTMLInputElement.prototype.showPicker = previous; }
  });
  it('supports typing, rejects invalid times and clears without retaining a hidden filter', () => {
    render(<Example />);
    const time = screen.getByLabelText('الوقت');
    fireEvent.change(time, { target: { value: '14:25' } });
    expect(screen.getByTestId('values')).toHaveTextContent('|14:25');
    fireEvent.change(time, { target: { value: '25:90' } });
    fireEvent.blur(time);
    expect(time).toHaveValue('14:25');
    fireEvent.change(time, { target: { value: '' } });
    fireEvent.blur(time);
    expect(time).toHaveValue('');
    expect(screen.getByTestId('values')).toHaveTextContent('|');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PasswordInput from '../components/PasswordInput';
import PickerInput from '../components/PickerInput';
import SortableHeader from '../components/SortableHeader';
import { normalizeDigits } from '../lib/format';
import { matchesSearchQuery } from '../lib/search';

describe('Phase 2B primitives (T-07, T-18)', () => {
  it('T-18: normalizes Eastern Arabic numerals and separator into ASCII digits and matches search queries', () => {
    expect(normalizeDigits('١٢٥٫٥٠')).toBe('125.50');
    expect(normalizeDigits('۰۹/۱۱/۲۰۲۶')).toBe('09/11/2026');
    expect(matchesSearchQuery(['فاتورة #150', 'عميل النور'], '١٥٠')).toBe(true);
  });

  it('T-07 & T-18: PickerInput trigger button is focusable and normalizes pasted Arabic date digits to ASCII ISO', () => {
    const onChange = vi.fn();
    render(<PickerInput kind="date" value="2026-11-01" onChange={onChange} ariaLabel="تاريخ الاختبار" />);

    const trigger = screen.getByRole('button', { name: 'اختيار التاريخ من التقويم' });
    expect(trigger).not.toHaveAttribute('tabindex', '-1');

    const textInput = screen.getByLabelText('تاريخ الاختبار') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: '١٥/١١/٢٠٢٦' } });
    expect(onChange).toHaveBeenCalledWith('2026-11-15');
    expect(textInput.value).not.toMatch(/[٠-٩]/);
  });

  it('T-07: SortableHeader renders a keyboard-accessible button inside th with aria-sort', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="التاريخ" field="date" currentSort="date-desc" onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );

    const th = screen.getByRole('columnheader');
    expect(th).toHaveAttribute('aria-sort', 'descending');
    const sortBtn = screen.getByRole('button', { name: 'التاريخ' });
    fireEvent.click(sortBtn);
    expect(onSort).toHaveBeenCalledWith('date-asc');
  });

  it('T-18: PasswordInput toggles input type and aria-pressed state', () => {
    render(<PasswordInput aria-label="كلمة المرور" value="secret123" onChange={vi.fn()} />);

    const pwdInput = screen.getByLabelText('كلمة المرور') as HTMLInputElement;
    const toggleBtn = screen.getByRole('button', { name: 'إظهار كلمة المرور' });
    expect(pwdInput.type).toBe('password');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggleBtn);
    expect(pwdInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'إخفاء كلمة المرور' })).toHaveAttribute('aria-pressed', 'true');
  });
});

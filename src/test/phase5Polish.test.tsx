import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentTable, { type DocumentTableColumn } from '../components/DocumentTable';
import SearchableSelect from '../components/SearchableSelect';
import { formatItemAvailabilitySublabel, formatItemOptionLabel } from '../lib/masterDataQueries';

interface Row {
  id: string;
  number: string;
  label: string;
}

describe('Phase 5 Polish (T-20 & T-21b)', () => {
  it('T-20: renders a native <button type="button"> for document record numbers inside DocumentTable', () => {
    const onView = vi.fn();
    const columns: DocumentTableColumn<Row>[] = [
      { key: 'number', header: 'الرقم', render: (r) => r.number },
      { key: 'label', header: 'البيان', render: (r) => r.label },
    ];
    const rows: Row[] = [{ id: 'doc-1', number: 'INV-009', label: 'فاتورة مبيعات' }];

    render(
      <DocumentTable
        columns={columns}
        rows={rows}
        loading={false}
        onView={onView}
        emptyTitle="لا توجد بيانات"
      />,
    );

    const recordBtn = screen.getByRole('button', { name: 'INV-009' });
    expect(recordBtn).toHaveClass('table-record-link');
    expect(recordBtn.closest('tr')).not.toHaveAttribute('tabindex');

    fireEvent.click(recordBtn);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(rows[0]);
  });

  it('T-21b: formats item option label (code, name, unit) and numeric-only availability sublabel cleanly', () => {
    expect(formatItemOptionLabel('سكر', 'ITM-001', 'كجم')).toBe('ITM-001 — سكر — كجم');
    expect(formatItemAvailabilitySublabel(12.5, false)).toBe('متاح: 12.5');
    expect(formatItemAvailabilitySublabel(0, true)).toBe('متاح: 0 (غير متوفر)');

    const options = [
      {
        value: 'itm-1',
        label: formatItemOptionLabel('سكر', 'ITM-001', 'كجم'),
        sublabel: formatItemAvailabilitySublabel(12.5, false),
      },
      {
        value: 'itm-2',
        label: formatItemOptionLabel('زيت', 'ITM-002', 'زجاجة'),
        sublabel: formatItemAvailabilitySublabel(0, true),
        disabled: true,
      },
    ];

    render(
      <SearchableSelect
        ariaLabel="اختر الصنف"
        value="itm-1"
        options={options}
        onChange={vi.fn()}
      />,
    );

    const combo = screen.getByRole('combobox', { name: 'اختر الصنف' });
    expect(combo).toHaveValue('ITM-001 — سكر — كجم');

    fireEvent.focus(combo);
    expect(screen.getByText('متاح: 12.5')).toHaveClass('searchable-select-sublabel');
    expect(screen.getByText('متاح: 0 (غير متوفر)')).toHaveClass('searchable-select-sublabel');
  });
});

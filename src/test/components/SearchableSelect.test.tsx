import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchableSelect, { type SearchOption } from '../../components/SearchableSelect';

describe('SearchableSelect component', () => {
  const syncOptions: SearchOption[] = [
    { value: '1', label: 'صنف أ' },
    { value: '2', label: 'صنف ب' },
    { value: '3', label: 'صنف ج' },
  ];

  it('renders synchronous options and filters based on user input', () => {
    const onChange = vi.fn();
    render(<SearchableSelect value="" options={syncOptions} onChange={onChange} placeholder="اختر الصنف" />);

    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();

    // Focus input to open options
    fireEvent.focus(input);
    expect(screen.getByText('صنف أ')).toBeInTheDocument();
    expect(screen.getByText('صنف ب')).toBeInTheDocument();

    // Type query
    fireEvent.change(input, { target: { value: 'ب' } });
    expect(screen.queryByText('صنف أ')).not.toBeInTheDocument();
    expect(screen.getByText('صنف ب')).toBeInTheDocument();

    // Select option
    fireEvent.click(screen.getByText('صنف ب'));
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('triggers asynchronous loadOptions and displays results', async () => {
    const mockLoad = vi.fn().mockResolvedValue([
      { value: '10', label: 'أرز فاخر 1 كجم' },
      { value: '11', label: 'سكر أبيض 1 كجم' },
    ]);
    const onChange = vi.fn();

    render(
      <SearchableSelect
        value=""
        loadOptions={mockLoad}
        onChange={onChange}
        placeholder="ابحث عن صنف"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalledWith('');
    });

    await waitFor(() => {
      expect(screen.getByText('أرز فاخر 1 كجم')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('أرز فاخر 1 كجم'));
    expect(onChange).toHaveBeenCalledWith('10');
  });

  it('handles fast barcode scanning via onBarcodeScan on Enter', () => {
    const onBarcodeScan = vi.fn();
    const onChange = vi.fn();

    render(
      <SearchableSelect
        value=""
        options={syncOptions}
        onChange={onChange}
        onBarcodeScan={onBarcodeScan}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '622123456789' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onBarcodeScan).toHaveBeenCalledWith('622123456789');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchableSelect, { type SearchOption } from '../../components/SearchableSelect';

describe('SearchableSelect component', () => {
  it('associates a visible field label with the searchable input', () => {
    render(<SearchableSelect label="الحالة" value="all" options={[{ value: 'all', label: 'كل الحالات' }]} onChange={vi.fn()} />);
    expect(screen.getByText('الحالة')).toBeVisible();
    expect(screen.getByLabelText('الحالة')).toHaveAttribute('role', 'combobox');
    expect(screen.getByLabelText('الحالة')).toHaveValue('كل الحالات');
  });
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

  it('selects matching option on Enter when searching by name even if onBarcodeScan is provided', () => {
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
    fireEvent.change(input, { target: { value: 'صنف ب' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('2');
    expect(onBarcodeScan).not.toHaveBeenCalled();
  });

  it('does not prepend the current value at index 0 while typing a search query in async mode', async () => {
    const mockLoad = vi.fn().mockImplementation(async (q: string) => {
      if (q === 'سمير') return [{ value: '20', label: 'سمير للتجارة' }];
      return [{ value: '1', label: 'عميل نقدي' }];
    });
    const onChange = vi.fn();

    render(
      <SearchableSelect
        value="1"
        selectedLabel="عميل نقدي"
        loadOptions={mockLoad}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'سمير' } });

    await waitFor(() => {
      expect(screen.getByText('سمير للتجارة')).toBeInTheDocument();
    });

    expect(screen.queryByText('عميل نقدي')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('20');
  });

  it('T-06: keeps loadOptionsRef stable on re-render, ignores out-of-order responses, and skips disabled options', async () => {
    const firstLoad = vi.fn().mockResolvedValue([{ value: '1', label: 'خيار قديم' }]);
    const secondLoad = vi.fn().mockResolvedValue([{ value: '2', label: 'خيار جديد' }]);
    const onChange = vi.fn();

    const { rerender } = render(
      <SearchableSelect value="" loadOptions={firstLoad} onChange={onChange} />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await waitFor(() => expect(firstLoad).toHaveBeenCalledTimes(1));

    // Re-rendering with a new loadOptions identity must not re-fire fetch while query is unchanged
    rerender(<SearchableSelect value="" loadOptions={secondLoad} onChange={onChange} />);
    await new Promise((r) => setTimeout(r, 300));
    expect(secondLoad).not.toHaveBeenCalled();

    // Out-of-order async resolution: request #1 resolves AFTER request #2
    let resolveReq1!: (v: SearchOption[]) => void;
    let resolveReq2!: (v: SearchOption[]) => void;
    const req1Promise = new Promise<SearchOption[]>((res) => { resolveReq1 = res; });
    const req2Promise = new Promise<SearchOption[]>((res) => { resolveReq2 = res; });

    const raceLoader = vi.fn((q: string) => (q === 'أ' ? req1Promise : req2Promise));
    rerender(<SearchableSelect value="" loadOptions={raceLoader} onChange={onChange} />);

    fireEvent.change(input, { target: { value: 'أ' } });
    await waitFor(() => expect(raceLoader).toHaveBeenCalledWith('أ'));
    fireEvent.change(input, { target: { value: 'ب' } });
    await waitFor(() => expect(raceLoader).toHaveBeenCalledWith('ب'));

    resolveReq2([{ value: 'new', label: 'النتيجة الأحدث' }]);
    await waitFor(() => expect(screen.getByText('النتيجة الأحدث')).toBeInTheDocument());

    resolveReq1([{ value: 'stale', label: 'نتيجة متأخرة' }]);
    await waitFor(() => {
      expect(screen.queryByText('نتيجة متأخرة')).not.toBeInTheDocument();
      expect(screen.getByText('النتيجة الأحدث')).toBeInTheDocument();
    });

    // Disabled options are skipped on ArrowDown / Enter
    const disabledSync: SearchOption[] = [
      { value: 'd1', label: 'غير متوفر', disabled: true },
      { value: 'e1', label: 'متوفر', disabled: false },
    ];
    rerender(<SearchableSelect value="" options={disabledSync} onChange={onChange} />);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('e1');
  });

  it('T-06: fires onBarcodeScan immediately (0ms) on Enter while async query is unresolved without selecting stale option', async () => {
    const mockLoad = vi.fn().mockImplementation(
      () => new Promise<SearchOption[]>(() => {}),
    );
    const onChange = vi.fn();
    const onBarcodeScan = vi.fn();

    render(
      <SearchableSelect
        value="1"
        selectedLabel="صنف سابق"
        loadOptions={mockLoad}
        onChange={onChange}
        onBarcodeScan={onBarcodeScan}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '٦٢٢١٢٣' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onBarcodeScan).toHaveBeenCalledWith('622123');
    expect(onChange).not.toHaveBeenCalled();
  });
});

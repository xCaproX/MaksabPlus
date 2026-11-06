import { X } from 'lucide-react';
import DateInput from './DateInput';
import SearchableSelect, { type SearchOption } from './SearchableSelect';
import { listColumns, loadCreatorFilterOptions, type ColumnSpec, type ColumnValues, type ListScope } from '../lib/columnFilters';

export interface ColumnFilterRowProps {
  scope: ListScope;
  kind?: string;
  owner?: boolean;
  values: ColumnValues;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  options?: Record<string, SearchOption[]>;
  as?: 'row' | 'bar';
}

export default function ColumnFilterRow({ scope, kind = '', owner = false, values, onChange, onReset, options = {}, as = 'row' }: ColumnFilterRowProps) {
  const columns = listColumns(scope, owner, kind);
  const clear = <button type="button" className="column-filter-clear" onClick={onReset}
    aria-label="مسح كل الفلاتر" title="مسح كل الفلاتر"><X size={17} aria-hidden="true" /></button>;
  function control(column: ColumnSpec) {
    const { key, label, type } = column;
    const ariaLabel = `بحث في ${label}`;
    if (type === 'none') return null;
    if (type === 'date' || type === 'datetime') return <div className="column-filter-date">
      <DateInput value={values[key] ?? ''} onChange={(value) => onChange(key, value)} ariaLabel={ariaLabel} />
      {column.secondaryKey && <input type="time" step={60} dir="ltr" className="tabular-nums"
        aria-label="بحث في الوقت" value={values[column.secondaryKey] ?? ''} onChange={(event) => onChange(column.secondaryKey!, event.target.value)} />}
    </div>;
    if (type === 'select') {
      const creators = column.options === 'creators';
      const choices = key === 'account_kind' && kind === 'waste'
        ? [{ value: 'waste', label: 'هالك' }]
        : typeof column.options === 'string' ? options[column.options] ?? [] : column.options ?? [];
      return <SearchableSelect ariaLabel={ariaLabel} value={values[key] ?? ''}
        selectedLabel={creators ? values[key] : undefined}
        options={creators ? undefined : [{ value: '', label: 'الكل' }, ...choices]}
        loadOptions={creators ? (query) => loadCreatorFilterOptions(scope, kind, query).then((items) => [{ value: '', label: 'الكل' }, ...items]) : undefined}
        onChange={(value) => onChange(key, value)} placeholder="الكل" searchPlaceholder="بحث…" />;
    }
    return <input type={type === 'number' ? 'number' : type === 'time' ? 'time' : 'text'}
      step={type === 'time' ? 60 : 'any'} inputMode={type === 'number' ? 'decimal' : undefined}
      dir={type === 'number' || type === 'time' || key === 'number' || key === 'number_label' ? 'ltr' : 'auto'}
      className={type === 'number' || type === 'time' ? 'no-spinner tabular-nums' : ''}
      value={values[key] ?? ''} aria-label={ariaLabel} placeholder={type === 'number' ? 'يساوي' : 'بحث…'}
      onFocus={(event) => { if (type !== 'time') event.target.select(); }} onChange={(event) => onChange(key, event.target.value)} />;
  }
  if (as === 'bar') return <div className="column-filter-bar" aria-label="بحث بالأعمدة">
    {columns.filter((column) => column.type !== 'none').map((column) => <label key={column.key}>
      <span className="filter-label">{column.label}</span>{control(column)}
    </label>)}{clear}
  </div>;
  return <tr className="column-filter-row" aria-label="بحث بالأعمدة">
    {columns.map((column, index) => <td key={column.key || 'actions'} className={column.className}>
      <div className="column-filter-cell">{control(column)}{index === columns.length - 1 && clear}</div>
    </td>)}
  </tr>;
}

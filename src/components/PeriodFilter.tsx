import DateInput from './DateInput';
import SearchableSelect from './SearchableSelect';
import { matchingPeriod, PERIODS, periodDates, type Period } from '../lib/period';

interface PeriodFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export default function PeriodFilter({ from, to, onChange, required = false, disabled = false }: PeriodFilterProps) {
  const period = matchingPeriod(from, to);
  return (
    <div className="period-filter">
      <div className="period-preset print-hidden">
        <SearchableSelect ariaLabel="الفترة" label="الفترة" disabled={disabled} value={period === 'custom' ? '' : period}
          placeholder="اختر الفترة"
          options={[
            ...PERIODS.map(({ value, label }) => ({ value, label })),
            ...(!required ? [{ value: 'all', label: 'كل الفترات' }] : []),
          ]}
          searchPlaceholder="بحث عن فترة…"
          onChange={(value) => {
          if (value === 'all') onChange('', '');
          else {
            const range = periodDates(value as Period);
            onChange(range.from, range.to);
          }
        }} />
      </div>
      <div className="erp-date-range">
        <label className="erp-date"><span className="filter-label">من</span>
          <DateInput value={from} onChange={(value) => onChange(value, to)} ariaLabel="من تاريخ" required={required} disabled={disabled} />
        </label>
        <label className="erp-date"><span className="filter-label">إلى</span>
          <DateInput value={to} onChange={(value) => onChange(from, value)} ariaLabel="إلى تاريخ" required={required} disabled={disabled} />
        </label>
      </div>
    </div>
  );
}

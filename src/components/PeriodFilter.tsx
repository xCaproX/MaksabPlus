import DateInput from './DateInput';
import { matchingPeriod, PERIODS, periodDates, type Period } from '../lib/period';

interface PeriodFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export default function PeriodFilter({ from, to, onChange, required = false, disabled = false }: PeriodFilterProps) {
  return (
    <div className="period-filter">
      <label className="period-preset print-hidden">
        <span>الفترة</span>
        <select aria-label="الفترة" disabled={disabled} value={matchingPeriod(from, to)} onChange={(event) => {
          if (event.target.value === 'all') onChange('', '');
          else {
            const range = periodDates(event.target.value as Period);
            onChange(range.from, range.to);
          }
        }}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          {!required && <option value="all">كل الفترات</option>}
          <option value="custom" disabled>تاريخ مخصص</option>
        </select>
      </label>
      <div className="erp-date-range">
        <label className="erp-date"><span>من</span>
          <DateInput value={from} onChange={(value) => onChange(value, to)} ariaLabel="من تاريخ" required={required} disabled={disabled} />
        </label>
        <label className="erp-date"><span>إلى</span>
          <DateInput value={to} onChange={(value) => onChange(from, value)} ariaLabel="إلى تاريخ" required={required} disabled={disabled} />
        </label>
      </div>
    </div>
  );
}

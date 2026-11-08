export interface DateDisplayProps {
  value: string | null | undefined;
  className?: string;
}

export default function DateDisplay({ value, className = '' }: DateDisplayProps) {
  if (!value) {
    return <span className={className}>—</span>;
  }

  let year = '';
  let month = '';
  let day = '';

  if (value.includes('T') || (value.includes(' ') && value.includes(':'))) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).formatToParts(d);
      day = parts.find((p) => p.type === 'day')?.value ?? '';
      month = parts.find((p) => p.type === 'month')?.value ?? '';
      year = parts.find((p) => p.type === 'year')?.value ?? '';
    }
  } else {
    const raw = value.slice(0, 10);
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      [year, month, day] = parts;
    }
  }

  if (year && month && day) {
    return (
      <span className={`date-display tabular-nums ${className}`.trim()} dir="rtl">
        <bdi>{day}</bdi>/<bdi>{month}</bdi>/<bdi>{year}</bdi>
      </span>
    );
  }

  return (
    <span className={`date-display tabular-nums ${className}`.trim()} dir="rtl">
      {value}
    </span>
  );
}

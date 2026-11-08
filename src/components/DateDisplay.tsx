export interface DateDisplayProps {
  value: string | null | undefined;
  className?: string;
}

export default function DateDisplay({ value, className = '' }: DateDisplayProps) {
  if (!value) {
    return <span className={className}>—</span>;
  }

  const raw = value.slice(0, 10);
  const parts = raw.split('-');

  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
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

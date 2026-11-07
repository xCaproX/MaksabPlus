export const PERIODS = [
  { value: 'today', label: 'النهاردة', days: 1 },
  { value: 'yesterday', label: 'امس', days: 1 },
  { value: '2days', label: 'آخر يومين', days: 2 },
  { value: '7days', label: 'آخر 7 ايام', days: 7 },
  { value: '30days', label: 'آخر 30 يوم', days: 30 },
] as const;
export type Period = typeof PERIODS[number]['value'];

export function shiftCalendarDate(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function periodDates(period: Period = 'today', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;

  if (period === 'yesterday') {
    const yesterday = shiftCalendarDate(today, -1);
    return { from: yesterday, to: yesterday };
  }

  const days = PERIODS.find((p) => p.value === period)?.days ?? 1;
  return { from: shiftCalendarDate(today, 1 - days), to: today };
}

export function matchingPeriod(from: string, to: string, now = new Date()) {
  if (!from && !to) return 'all';
  return PERIODS.find((p) => {
    const range = periodDates(p.value, now);
    return from === range.from && to === range.to;
  })?.value ?? 'custom';
}

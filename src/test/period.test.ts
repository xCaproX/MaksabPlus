import { describe, expect, it } from 'vitest';
import { matchingPeriod, periodDates, shiftCalendarDate } from '../lib/period';

describe('inclusive Cairo calendar periods', () => {
  const now = new Date('2026-11-06T10:00:00Z');

  it('calculates expected date range for each period preset', () => {
    expect(periodDates('today', now)).toEqual({ from: '2026-11-06', to: '2026-11-06' });
    expect(periodDates('yesterday', now)).toEqual({ from: '2026-11-05', to: '2026-11-05' });
    expect(periodDates('2days', now)).toEqual({ from: '2026-11-05', to: '2026-11-06' });
    expect(periodDates('7days', now)).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(periodDates('30days', now)).toEqual({ from: '2026-10-08', to: '2026-11-06' });
  });

  it('uses the Cairo day even when the UTC day is different', () => {
    expect(periodDates('today', new Date('2026-11-05T23:30:00Z'))).toEqual({ from: '2026-11-06', to: '2026-11-06' });
    expect(periodDates('yesterday', new Date('2026-11-05T23:30:00Z'))).toEqual({ from: '2026-11-05', to: '2026-11-05' });
    expect(periodDates('today', new Date('2026-07-01T21:30:00Z'))).toEqual({ from: '2026-07-02', to: '2026-07-02' });
  });

  it('crosses month, year and leap-day boundaries without changing the day count', () => {
    expect(shiftCalendarDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftCalendarDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(periodDates('7days', new Date('2026-04-26T10:00:00Z')).from).toBe('2026-04-20');
  });

  it('recognizes presets, unrestricted dates and manually selected dates', () => {
    expect(matchingPeriod('2026-11-06', '2026-11-06', now)).toBe('today');
    expect(matchingPeriod('2026-11-05', '2026-11-05', now)).toBe('yesterday');
    expect(matchingPeriod('2026-11-05', '2026-11-06', now)).toBe('2days');
    expect(matchingPeriod('2026-10-31', '2026-11-06', now)).toBe('7days');
    expect(matchingPeriod('2026-10-08', '2026-11-06', now)).toBe('30days');
    expect(matchingPeriod('', '', now)).toBe('all');
    expect(matchingPeriod('2026-10-01', '2026-10-31', now)).toBe('custom');
  });
});

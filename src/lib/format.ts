const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

const ARABIC_INDIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٫': '.',
};

/**
 * يحول الأرقام العربية-الهندية والفارسية والفاصل العشري (٫) إلى أرقام لاتينية قياسية (0-9 و .).
 */
export function normalizeDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹٫]/g, (ch) => ARABIC_INDIC_DIGIT_MAP[ch] ?? ch);
}

/** 1234.5 => "1,234.50" */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return moneyFormat.format(n);
}

/** 12.5 => "12.5" */
export function qty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return qtyFormat.format(n);
}

/** A timestamp's calendar date in the same local zone as document times. */
export function creationDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function creationTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function receiptTypeLabel(isFree: boolean): string {
  return isFree ? 'حر' : 'مرتبط';
}

export function accountKindLabel(kind: string): string {
  return ({ customer: 'عميل', supplier: 'مورد', waste: 'هالك' } as Record<string, string>)[kind] ?? '—';
}

export function entityNumber(prefix: string, value: number | string | null | undefined): string {
  const number = Number(value);
  return `${prefix}-${Number.isFinite(number) ? String(number).padStart(5, '0') : '00000'}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const raw = value.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return value;
}

export function formatChartDate(value: string | null | undefined): string {
  if (!value) return '—';
  const raw = value.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [, m, d] = parts;
    // On Canvas and RTL tooltips, month on left and day on right
    // visually displays the day on the right and month on the left: يوم/شهر
    return `${m}/${d}`;
  }
  return value;
}

export function formatFullChartDate(value: string | null | undefined): string {
  if (!value) return '—';
  const raw = value.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${y}/${m}/${d}`;
  }
  return value;
}

export function today(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** تاريخ اليوم السابقة بالعربية للترحيب (اليوم الكامل، مثلاً: السبت، 7 نوفمبر 2026) */
export function formatTodayLongAr(): string {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date());
}

/** تاريخ كامل بالعربية بأرقام لاتينية وبدون فواصل بصيغة: الأحد 8 نوفمبر 2026 */
export function formatFullArabicDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Cairo',
    }).format(date).replace('،', '').trim();
  } catch {
    return date.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });
  }
}

export type BalanceStatusInfo = {
  text: 'خالص' | 'عليه' | 'له';
  type: 'settled' | 'debit' | 'credit';
};

export function getBalanceStatus(
  balance: number | string | null | undefined,
  kind?: string | null,
): BalanceStatusInfo {
  const rounded = round2(Number(balance || 0));
  if (rounded === 0) return { text: 'خالص', type: 'settled' };
  if (kind === 'supplier') {
    return rounded > 0 ? { text: 'له', type: 'credit' } : { text: 'عليه', type: 'debit' };
  }
  return rounded > 0 ? { text: 'عليه', type: 'debit' } : { text: 'له', type: 'credit' };
}

export type SaleStatus = 'all' | 'paid' | 'partial' | 'unpaid';

export function saleStatus(invoice: { remaining: unknown; paid: unknown }): Exclude<SaleStatus, 'all'> {
  if (Number(invoice.remaining) <= 0) return 'paid';
  if (Number(invoice.paid) > 0) return 'partial';
  return 'unpaid';
}

export function saleStatusLabel(status: Exclude<SaleStatus, 'all'>, isReturn = false): string {
  if (isReturn) {
    return status === 'paid' ? 'مستردة بالكامل' : status === 'partial' ? 'مستردة جزئيًا' : 'غير مستردة';
  }
  return status === 'paid' ? 'مسددة' : status === 'partial' ? 'جزئية' : 'غير مسددة';
}

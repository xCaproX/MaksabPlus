const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

/** 1234.5 => "1,234.50 ج.م" */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00 ج.م';
  return `${moneyFormat.format(n)} ج.م`;
}

/** 12.5 => "12.5" */
export function qty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return qtyFormat.format(n);
}

export function entityNumber(prefix: string, value: number | string | null | undefined): string {
  const number = Number(value);
  return `${prefix}-${Number.isFinite(number) ? String(number).padStart(5, '0') : '00000'}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function today(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

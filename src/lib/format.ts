const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

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

export function today(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
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



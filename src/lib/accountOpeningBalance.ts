export type AccountOpeningDirection = 'receivable' | 'payable';
type AccountKind = 'customer' | 'supplier';

export interface AccountOpeningEntry {
  amount: string;
  direction: AccountOpeningDirection;
}

export function defaultAccountOpeningDirection(kind: AccountKind): AccountOpeningDirection {
  return kind === 'customer' ? 'receivable' : 'payable';
}

export function accountOpeningDirectionLabel(direction: AccountOpeningDirection): string {
  return direction === 'receivable' ? 'لنا عنده' : 'له عندنا';
}

export function splitAccountOpeningBalance(
  kind: AccountKind,
  signedOpening: number | string | null | undefined,
): AccountOpeningEntry {
  const numeric = Number(signedOpening || 0);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return { amount: '0', direction: defaultAccountOpeningDirection(kind) };
  }
  const direction: AccountOpeningDirection =
    (kind === 'customer') === (numeric > 0) ? 'receivable' : 'payable';
  return { amount: String(Math.abs(numeric)), direction };
}

/** Convert the user's amount and direction to the existing database convention. */
export function accountOpeningBalance(kind: AccountKind, value: string, direction: AccountOpeningDirection): number {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('أدخل مبلغًا صحيحًا لا يقل عن صفر');
  if (amount === 0) return 0;
  return (kind === 'customer') === (direction === 'receivable') ? amount : -amount;
}

/** Safely compare a draft entry against stored signed opening_balance (normalizing signed zero & zero direction toggles). */
export function isAccountOpeningEntryDirty(
  kind: AccountKind,
  entry: AccountOpeningEntry | undefined,
  storedSignedBalance: number | string | null | undefined,
): boolean {
  if (!entry) return false;
  const amount = Number(entry.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) return true;
  return accountOpeningBalance(kind, entry.amount, entry.direction) !== Number(storedSignedBalance || 0);
}

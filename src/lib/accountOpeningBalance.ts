export type AccountOpeningDirection = 'receivable' | 'payable';
type AccountKind = 'customer' | 'supplier';

export function defaultAccountOpeningDirection(kind: AccountKind): AccountOpeningDirection {
  return kind === 'customer' ? 'receivable' : 'payable';
}

/** Convert the user's amount and direction to the existing database convention. */
export function accountOpeningBalance(kind: AccountKind, value: string, direction: AccountOpeningDirection): number {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('أدخل مبلغًا صحيحًا لا يقل عن صفر');
  if (amount === 0) return 0;
  return (kind === 'customer') === (direction === 'receivable') ? amount : -amount;
}

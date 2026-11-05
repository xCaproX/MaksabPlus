import { describe, expect, it } from 'vitest';
import { accountOpeningBalance, defaultAccountOpeningDirection } from '../lib/accountOpeningBalance';

describe('account opening direction', () => {
  it('defaults to a customer owing us and us owing a supplier', () => {
    expect(defaultAccountOpeningDirection('customer')).toBe('receivable');
    expect(defaultAccountOpeningDirection('supplier')).toBe('payable');
  });
  it.each([
    ['customer','receivable',125.5], ['customer','payable',-125.5],
    ['supplier','payable',125.5], ['supplier','receivable',-125.5],
  ] as const)('maps %s %s to the existing signed balance convention', (kind, direction, expected) => {
    expect(accountOpeningBalance(kind, '125.50', direction)).toBe(expected);
  });
  it('keeps an empty amount as zero without negative zero', () => {
    expect(accountOpeningBalance('supplier', '', 'receivable')).toBe(0);
    expect(accountOpeningBalance('customer', '0', 'payable')).toBe(0);
  });
  it.each(['-1','not-a-number','Infinity'])('rejects invalid amount %s', value => {
    expect(() => accountOpeningBalance('customer', value, 'receivable')).toThrow();
  });
});

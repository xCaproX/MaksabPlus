import { describe, expect, it } from 'vitest';
import {
  accountOpeningBalance,
  accountOpeningDirectionLabel,
  defaultAccountOpeningDirection,
  isAccountOpeningEntryDirty,
  splitAccountOpeningBalance,
} from '../lib/accountOpeningBalance';

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

  it('T-11: splits signed opening balances cleanly and uses plain Arabic direction labels', () => {
    expect(accountOpeningDirectionLabel('receivable')).toBe('لنا عنده');
    expect(accountOpeningDirectionLabel('payable')).toBe('له عندنا');
    expect(splitAccountOpeningBalance('customer', 350)).toEqual({ amount: '350', direction: 'receivable' });
    expect(splitAccountOpeningBalance('customer', -200)).toEqual({ amount: '200', direction: 'payable' });
    expect(splitAccountOpeningBalance('supplier', 400)).toEqual({ amount: '400', direction: 'payable' });
    expect(splitAccountOpeningBalance('supplier', -150)).toEqual({ amount: '150', direction: 'receivable' });
    expect(splitAccountOpeningBalance('customer', 0)).toEqual({ amount: '0', direction: 'receivable' });
  });

  it('T-11: ignores direction toggles on zero amount when computing dirty state', () => {
    expect(isAccountOpeningEntryDirty('customer', { amount: '0', direction: 'payable' }, 0)).toBe(false);
    expect(isAccountOpeningEntryDirty('supplier', { amount: '', direction: 'receivable' }, 0)).toBe(false);
    expect(isAccountOpeningEntryDirty('customer', { amount: '100', direction: 'payable' }, 100)).toBe(true);
    expect(isAccountOpeningEntryDirty('customer', { amount: '100', direction: 'receivable' }, 100)).toBe(false);
  });
});

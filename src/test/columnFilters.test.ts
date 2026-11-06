import migrationSnapshot from '../../supabase/migrations/20261106100000_0063_column_filters.sql?raw';
import { creationDate } from '../lib/format';
import { describe, expect, it } from 'vitest';
import { columnValue, listColumns, LIST_COLUMN_SCHEMA, matchesColumnFilters } from '../lib/columnFilters';

describe('shared column-filter semantics', () => {
  const row = { number: 'SAL-000004', account_name: 'عميل تجريبي', account_phone: '01012345678',
    total: '10.2500', paid: 0, remaining: '10.25', created_at: '2026-11-05T10:21:35Z',
    invoice_date: '2026-11-05', created_by_name: 'أحمد', notes: 'بحث, (حرفي) 50%_', account_kind: 'customer' };
  it('combines criteria and accepts phone or name only in the account cell', () => {
    expect(matchesColumnFilters(row, 'invoice', { account: '010123', total: '10.25', paid: '0', created_time: '12:21', payment_status: 'unpaid', created_by_name: 'أحمد' })).toBe(true);
    expect(matchesColumnFilters(row, 'invoice', { account: 'تجريبي', invoice_date: '2026-11-05' })).toBe(true);
    expect(matchesColumnFilters(row, 'invoice', { account: 'أحمد' })).toBe(false);
    expect(matchesColumnFilters(row, 'invoice', { account: '010123', total: '10.2' })).toBe(false);
    expect(matchesColumnFilters(row, 'invoice', { notes: ', (حرفي) 50%_' })).toBe(true);
    expect(matchesColumnFilters(row, 'invoice', { total: '10.25', created_time: '12:22' })).toBe(false);
  });
  it('treats zero as a real equality, excludes null and ignores empty fields', () => {
    expect(matchesColumnFilters(row, 'invoice', { paid: '0', total: '' })).toBe(true);
    expect(matchesColumnFilters({ ...row, paid: null }, 'invoice', { paid: '0' })).toBe(false);
    expect(matchesColumnFilters(row, 'invoice', { paid: 'NaN' })).toBe(false);
    expect(matchesColumnFilters(row, 'invoice', { total: '10.2501' })).toBe(false);
    expect(matchesColumnFilters(row, 'invoice', { total: '   ' })).toBe(true);
  });
  it('keeps controls identical to conditional table columns', () => {
    expect(listColumns('invoice', true, 'sale')).toHaveLength(13);
    expect(listColumns('invoice', true, 'waste')).toHaveLength(10);
    expect(listColumns('warehouse_transfer', true)).toHaveLength(11);
    expect(listColumns('warehouse_transfer', false)).toHaveLength(10);
    expect(listColumns('opening_items', false).some(c => c.key === 'unit_cost')).toBe(false);
    expect(listColumns('receipt')).toHaveLength(12);
    expect(listColumns('receipt').find(c => c.key === 'receipt_type')?.options).toEqual([{ value: 'free', label: 'حر' }, { value: 'linked', label: 'مرتبط' }]);
    expect(listColumns('cash_transfer')).toHaveLength(9);
  });
  it('matches formatted entity numbers and displayed absolute balances', () => {
    expect(matchesColumnFilters({ serial_number: 7, kind: 'supplier', balance: -125 }, 'account_balances', { number_label: 'SUP-00007', balance: '125' })).toBe(true);
    expect(matchesColumnFilters({ serial_number: 7, kind: 'supplier', balance: -125 }, 'account_balances', { balance: '-125' })).toBe(false);
    expect(creationDate('2026-07-05T21:30:00Z')).toBe('06/07/2026');
    expect(matchesColumnFilters({ created_by_name: null }, 'invoice', { created_by_name: 'غير مسجل' })).toBe(true);
    expect(columnValue({ created_at: '2026-07-05T21:30:00Z' }, { key: 'date', label: '', type: 'datetime', source: 'created_at' })).toBe('2026-07-06');
  });
  it('keeps the migration snapshot identical to the shared manifest', () => {
    const frozen = JSON.parse(migrationSnapshot.split('$json$')[1]);
    expect(frozen).toEqual(LIST_COLUMN_SCHEMA);
  });
});

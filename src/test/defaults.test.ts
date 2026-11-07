import { describe, expect, it } from 'vitest';
import {
  resolveDefaultAccount,
  resolveDefaultWarehouse,
  resolveDefaultCashBox,
  sortCashBoxesWithPrimaryFirst,
} from '../lib/defaults';
import type { AccountRow, CashBoxRow, WarehouseOption } from '../lib/types';

describe('defaults resolver - استخراج الافتراضيات بشكل مستقر ومحمي', () => {
  it('يعتمد على system_key أولاً حتى لو تغير اسم الحساب تماماً', () => {
    const accounts: AccountRow[] = [
      { id: 'acc-1', name: 'عميل عادي', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: null },
      { id: 'acc-2', name: 'زبون المحل المباشر', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 2, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
    ];

    const result = resolveDefaultAccount(accounts, 'customer', 'cash_customer');
    expect(result?.id).toBe('acc-2');
  });

  it('يرجع للاسم العربي (fallback) لو لم يوجد system_key', () => {
    const accounts: AccountRow[] = [
      { id: 'acc-1', name: 'أحمد محمد', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: null },
      { id: 'acc-2', name: 'عميل نقدي عام', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 2, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: null },
    ];

    const result = resolveDefaultAccount(accounts, 'customer', 'cash_customer');
    expect(result?.id).toBe('acc-2');
  });

  it('يعتمد على is_primary للمخازن حتى لو تغير الاسم', () => {
    const warehouses: WarehouseOption[] = [
      { id: 'wh-1', name: 'مخزن فرعي', is_primary: false, is_active: true, serial_number: 1 },
      { id: 'wh-2', name: 'مخزن الهرم الجديد', is_primary: true, is_active: true, serial_number: 2 },
    ];

    const result = resolveDefaultWarehouse(warehouses);
    expect(result?.id).toBe('wh-2');
  });

  it('يعتمد على is_primary للخزن حتى لو تغير الاسم', () => {
    const cashBoxes: CashBoxRow[] = [
      { id: 'cb-1', name: 'خزنة الفرع الثاني', is_primary: false, is_active: true, balance: 100, serial_number: 1, opening_balance: 0, notes: '' },
      { id: 'cb-2', name: 'درج الكاشير', is_primary: true, is_active: true, balance: 500, serial_number: 2, opening_balance: 0, notes: '' },
    ];

    const result = resolveDefaultCashBox(cashBoxes);
    expect(result?.id).toBe('cb-2');
  });

  it('يقدم الخزنة الرئيسية في أول القائمة بالترتيب', () => {
    const cashBoxes: CashBoxRow[] = [
      { id: 'cb-1', name: 'أحمد - خزنة', is_primary: false, is_active: true, balance: 0, serial_number: 1, opening_balance: 0, notes: '' },
      { id: 'cb-2', name: 'خزنة كاشير 1', is_primary: true, is_active: true, balance: 0, serial_number: 2, opening_balance: 0, notes: '' },
      { id: 'cb-3', name: 'بدر - خزنة', is_primary: false, is_active: true, balance: 0, serial_number: 3, opening_balance: 0, notes: '' },
    ];

    const sorted = sortCashBoxesWithPrimaryFirst(cashBoxes);
    expect(sorted[0].id).toBe('cb-2');
  });
});

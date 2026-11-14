import { describe, expect, it } from 'vitest';
import {
  findPinnedCashAccount,
  resolveDefaultAccount,
  resolveDefaultWarehouse,
  resolveDefaultCashBox,
  sortAccountsWithCashFirst,
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

  it('يستبعد النوع الخاطئ حتى لو طابق المفتاح أو الاسم الافتراضي', () => {
    const customer: AccountRow = {
      id: 'customer', name: 'عميل عادي', kind: 'customer', balance: 0,
      is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0,
      invoiced: 0, paid: 0, has_documents: false, system_key: null,
    };
    const supplier: AccountRow = { ...customer, id: 'supplier', name: 'عميل نقدي', kind: 'supplier' };
    const keyedSupplier: AccountRow = { ...supplier, id: 'keyed', system_key: 'cash_customer' };

    expect(resolveDefaultAccount([supplier, customer], 'customer', 'cash_customer')).toBe(customer);
    expect(resolveDefaultAccount([keyedSupplier, customer], 'customer', 'cash_customer')).toBe(customer);
    expect(resolveDefaultAccount([supplier], 'customer', 'cash_customer')).toBeUndefined();
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

  it('يستخرج العميل النقدي والمورد النقدي فقط ولا يعيد حساباً عشوائياً عند غيابهما', () => {
    const accounts = [
      { id: 'c1', name: 'أحمد سمير', kind: 'customer', system_key: null, is_active: true },
      { id: 'c2', name: 'عميل نقدي', kind: 'customer', system_key: 'cash_customer', is_active: true },
      { id: 's1', name: 'توريدات النور', kind: 'supplier', system_key: null, is_active: true },
      { id: 's2', name: 'حساب نقدي للموردين', kind: 'supplier', system_key: 'cash_supplier', is_active: true },
      { id: 'w1', name: 'حساب الهالك', kind: 'waste', system_key: 'waste', is_active: true },
    ] as unknown as AccountRow[];

    expect(findPinnedCashAccount(accounts, 'customer')?.id).toBe('c2');
    expect(findPinnedCashAccount(accounts, 'supplier')?.id).toBe('s2');
    expect(findPinnedCashAccount(accounts, 'waste')).toBeUndefined();
    expect(findPinnedCashAccount([accounts[0], accounts[2]], 'customer')).toBeUndefined();

    const inactiveCash = { ...accounts[1], is_active: false };
    expect(findPinnedCashAccount([accounts[0], inactiveCash], 'customer')).toBeUndefined();
  });

  it('يرتب العملاء والموردين مع تثبيت العميل/المورد النقدي كأول خيار دائماً', () => {
    const customers = [
      { id: 'c1', name: 'أحمد', kind: 'customer', system_key: null, is_active: true },
      { id: 'c2', name: 'سمير', kind: 'customer', system_key: null, is_active: true },
      { id: 'c-cash', name: 'عميل نقدي', kind: 'customer', system_key: 'cash_customer', is_active: true },
    ] as unknown as AccountRow[];

    const suppliers = [
      { id: 's1', name: 'المتحدة', kind: 'supplier', system_key: null, is_active: true },
      { id: 's-cash', name: 'مورد نقدي', kind: 'supplier', system_key: 'cash_supplier', is_active: true },
    ] as unknown as AccountRow[];

    expect(sortAccountsWithCashFirst(customers, 'customer').map((a) => a.id)).toEqual([
      'c-cash',
      'c1',
      'c2',
    ]);
    expect(sortAccountsWithCashFirst(suppliers, 'supplier').map((a) => a.id)).toEqual([
      's-cash',
      's1',
    ]);
  });
});

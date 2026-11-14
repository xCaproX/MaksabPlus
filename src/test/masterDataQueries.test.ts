import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchAccountsAsync } from '../lib/masterDataQueries';
import { supabase } from '../lib/supabase';

const mockState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}));

vi.mock('../lib/supabase', () => {
  const createChain = () => {
    const chain: Record<string, unknown> = {
      select: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'select', args });
        return chain;
      }),
      eq: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'eq', args });
        return chain;
      }),
      is: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'is', args });
        return chain;
      }),
      order: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'order', args });
        return chain;
      }),
      limit: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'limit', args });
        return chain;
      }),
      or: vi.fn((...args: unknown[]) => {
        mockState.calls.push({ method: 'or', args });
        return chain;
      }),
      then: (resolve: (value: { data: typeof mockState.rows; error: null }) => void) =>
        Promise.resolve({ data: mockState.rows, error: null }).then(resolve),
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn(() => createChain()),
    },
  };
});

describe('searchAccountsAsync', () => {
  beforeEach(() => {
    mockState.rows = [];
    mockState.calls = [];
    vi.clearAllMocks();
  });

  it('يستبعد حسابات النظام (مثل العميل النقدي والمورد النقدي) افتراضياً للحفاظ على قيود السندات الحرة', async () => {
    mockState.rows = [
      { id: 'c1', name: 'أحمد علي', phone: '01000000001', serial_number: 2, kind: 'customer', balance: 0, system_key: null },
    ];

    const result = await searchAccountsAsync('customer', '');

    expect(supabase.from).toHaveBeenCalledWith('v_account_balances');
    expect(mockState.calls).toContainEqual({ method: 'is', args: ['system_key', null] });
    expect(result).toEqual([
      { value: 'c1', label: 'أحمد علي — 01000000001', sublabel: '#2' },
    ]);
  });

  it('يتضمن العميل/المورد النقدي عند تمرير includeCashAccount: true ويضعه في أول النتائج', async () => {
    mockState.rows = [
      { id: 'c1', name: 'أحمد علي', phone: null, serial_number: 2, kind: 'customer', balance: 0, system_key: null },
      { id: 'cash-c', name: 'عميل نقدي', phone: null, serial_number: 1, kind: 'customer', balance: 0, system_key: 'cash_customer' },
      { id: 'c2', name: 'محمود حسن', phone: '01111111111', serial_number: 3, kind: 'customer', balance: 100, system_key: null },
    ];

    const result = await searchAccountsAsync('customer', '', 25, { includeCashAccount: true });

    expect(mockState.calls.some((c) => c.method === 'is')).toBe(false);
    expect(result.map((o) => o.value)).toEqual(['cash-c', 'c1', 'c2']);
  });
});

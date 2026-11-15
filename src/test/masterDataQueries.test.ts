import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  formatItemAvailabilitySublabel,
  formatItemOptionLabel,
  searchAccountsAsync,
  toCashBoxOption,
} from '../lib/masterDataQueries';
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

describe('toCashBoxOption', () => {
  it('يفصل اسم الخزنة عن الرصيد ويعزل رقم الرصيد في اتجاه LTR مع تمييز السالب', () => {
    const posOpt = toCashBoxOption({ id: 'cb-1', name: 'الخزنة الرئيسية', balance: 5000 });
    expect(posOpt.value).toBe('cb-1');
    expect(posOpt.label).toBe('الخزنة الرئيسية');

    const { unmount } = render(createElement('div', null, posOpt.sublabel));
    expect(screen.getByText('5,000.00').closest('[dir="ltr"]')).toHaveClass('tabular-nums');
    expect(screen.getByText('5,000.00').closest('[dir="ltr"]')).not.toHaveClass('money-danger');
    unmount();

    const negOpt = toCashBoxOption({ id: 'cb-2', name: 'خزنة السحب', balance: -190732.32 });
    expect(negOpt.label).toBe('خزنة السحب');
    const negRender = render(createElement('div', null, negOpt.sublabel));
    expect(screen.getByText('-190,732.32').closest('[dir="ltr"]')).toHaveClass('money-danger', 'tabular-nums');
    negRender.unmount();

    const suspendedOpt = toCashBoxOption({
      id: 'cb-3',
      name: 'خزنة قديمة',
      balance: 250,
      is_active: false,
    });
    expect(suspendedOpt.label).toBe('خزنة قديمة — موقوفة');
  });
});

describe('formatItemOptionLabel & formatItemAvailabilitySublabel', () => {
  it('يرتب الصنف (كود، اسم، وحدة) ويُبقي المتاح رقماً صافياً بدون وحدة', () => {
    expect(formatItemOptionLabel('صنف تجريبي 0003', 'PERF-0003', 'قطعة')).toBe(
      'PERF-0003 — صنف تجريبي 0003 — قطعة',
    );
    expect(formatItemOptionLabel('صنف بدون كود', null, 'كجم')).toBe('صنف بدون كود — كجم');
    expect(formatItemAvailabilitySublabel(50, false)).toBe('متاح: 50');
    expect(formatItemAvailabilitySublabel(0, true)).toBe('متاح: 0 (غير متوفر)');
  });
});

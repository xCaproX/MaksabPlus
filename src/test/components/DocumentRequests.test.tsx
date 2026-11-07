import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../lib/supabase';
import Invoices from '../../pages/Invoices';
import Receipts from '../../pages/Receipts';

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../../lib/access', () => {
  const can = () => true;
  return { useAccess: () => ({ can, canViewProfit: true }) };
});
vi.mock('../../context/MasterDataContext', () => {
  const data = { accounts: [], items: [], warehouses: [], cashBoxes: [], stockRows: [], refresh: vi.fn() };
  return { useMasterData: () => data };
});
vi.mock('../../components/InvoiceForm', () => ({
  default: ({ onSaved }: { onSaved: (message: string) => void }) =>
    <button onClick={() => onSaved('تم الحفظ')}>اختبار إتمام الحفظ</button>,
}));

type Request = {
  name: string;
  args: Record<string, unknown>;
  signal: AbortSignal;
  resolve: (response: unknown) => void;
};
const requests: Request[] = [];

function expectPair(start: number, summary: string, offset: number) {
  const pair = requests.slice(start);
  expect(pair.map(({ name }) => name)).toEqual(['get_document_page', summary]);
  expect(pair[0].args.p_offset).toBe(offset);
  expect(pair[0].signal).toBe(pair[1].signal);
  return pair;
}

async function resolvePair(pair: Request[], count = 80, total = 100) {
  await act(async () => {
    for (const request of pair) {
      request.resolve({
        error: null,
        data: request.name === 'get_document_page'
          ? { rows: [], total_count: count }
          : { count, total_amount: total, total_qty: total },
      });
    }
  });
}

async function changeNotes(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'بحث في ملاحظات' }), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

describe('document list request lifecycle', () => {
  beforeEach(() => {
    requests.length = 0;
    vi.useFakeTimers();
    vi.mocked(supabase.rpc).mockImplementation((name, args) => ({
      abortSignal: (signal: AbortSignal) => new Promise((resolve) => {
        requests.push({ name, args: args as Record<string, unknown>, signal, resolve });
      }),
    }) as never);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['sales', Invoices, 'sale', 'get_invoice_kpis_columns'],
    ['receipts', Receipts, 'in', 'get_receipt_kpis_columns'],
    ['warehouse transfers', Invoices, 'warehouse_transfer', 'get_warehouse_transfer_kpis_columns'],
    ['cash transfers', Receipts, 'cash_box_transfer', 'get_cash_box_transfer_kpis_columns'],
  ] as const)('refreshes both queries and resets the page in one request pair for %s', async (_, Page, tab, summary) => {
    render(<MemoryRouter initialEntries={[`/?tab=${tab}`]}><Page /></MemoryRouter>);
    await resolvePair(expectPair(0, summary, 0));

    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await resolvePair(expectPair(2, summary, 20));

    await changeNotes('فلتر جديد');
    const filtered = expectPair(4, summary, 0);
    for (const request of filtered) expect(request.args.p_columns).toEqual({ notes: 'فلتر جديد' });
    await resolvePair(filtered);

    fireEvent.click(screen.getByRole('columnheader', { name: 'الرقم' }));
    const sorted = expectPair(6, summary, 0);
    expect(sorted[0].args.p_sort_order).toMatch(/^number-/);
    await resolvePair(sorted);
  });

  it('aborts both superseded requests and ignores their late responses', async () => {
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    const superseded = expectPair(0, 'get_invoice_kpis_columns', 0);
    await changeNotes('الأحدث');
    const current = expectPair(2, 'get_invoice_kpis_columns', 0);
    expect(superseded.every(({ signal }) => signal.aborted)).toBe(true);
    expect(current.every(({ signal }) => !signal.aborted)).toBe(true);

    await resolvePair(current, 41, 900);
    await resolvePair(superseded, 999, 700);
    expect(screen.getByLabelText('شريط ترقيم الصفحات')).toHaveTextContent('41');
    expect(screen.getByLabelText('شريط ترقيم الصفحات')).not.toHaveTextContent('999');
    expect(screen.getByText('900.00')).toBeInTheDocument();
    expect(screen.queryByText('700.00')).not.toBeInTheDocument();
  });

  it('refreshes rows and summaries after a successful save', async () => {
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_invoice_kpis_columns', 0));
    fireEvent.click(screen.getByRole('button', { name: '+ فاتورة مبيعات' }));
    fireEvent.click(screen.getByRole('button', { name: 'اختبار إتمام الحفظ' }));
    await resolvePair(expectPair(2, 'get_invoice_kpis_columns', 0));
  });
});

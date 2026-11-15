import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../lib/supabase';
import Invoices from '../../pages/Invoices';
import Receipts from '../../pages/Receipts';

const masterData = vi.hoisted(() => ({
  refresh: vi.fn(),
  ready: { loading: false, error: null, hasLoaded: true },
  pending: { loading: true, error: null, hasLoaded: false },
  stock: { loading: false, error: null, hasLoaded: true },
}));

const accessMock = vi.hoisted(() => ({
  can: vi.fn((_key: string) => true),
  canViewProfit: true,
}));

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../../lib/access', () => ({
  useAccess: () => accessMock,
}));
vi.mock('../../context/MasterDataContext', () => {
  const { ready, refresh } = masterData;
  return { useMasterData: () => ({
    accounts: [], items: [], warehouses: [], cashBoxes: [], stockRows: [], refresh,
    resourceStatus: { accounts: ready, items: ready, warehouses: ready, cashBoxes: ready, stock: masterData.stock },
  }) };
});
vi.mock('../../components/InvoiceForm', () => ({
  default: ({ onSaved, onRestore }: { onSaved: (message: string, affectsCash: boolean) => void; onRestore?: () => void }) => (
    <>
      <button onClick={() => onSaved('تم الحفظ', false)}>اختبار إتمام الحفظ</button>
      <button onClick={() => onSaved('تم الحفظ', true)}>اختبار إتمام الحفظ بتحصيل</button>
      {onRestore && <button onClick={onRestore}>استعادة الفاتورة</button>}
    </>
  ),
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
    accessMock.can.mockReset();
    accessMock.can.mockReturnValue(true);
    accessMock.canViewProfit = true;
    masterData.refresh.mockClear();
    masterData.stock = masterData.ready;
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

  it('keeps receipt counts and amounts pending until their own requests succeed', async () => {
    render(<MemoryRouter initialEntries={['/?tab=in']}><Receipts /></MemoryRouter>);
    const [rows, summary] = expectPair(0, 'get_receipt_kpis_columns', 0);
    const pagination = screen.getByLabelText('شريط ترقيم الصفحات');
    expect(pagination).not.toHaveTextContent('عرض');
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();

    await act(async () => rows.resolve({ error: null, data: { rows: [], total_count: 0 } }));
    expect(pagination).toHaveTextContent('عرض');
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();

    await act(async () => summary.resolve({ error: { message: 'offline' }, data: null }));
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل الملخص');
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await resolvePair(expectPair(2, 'get_receipt_kpis_columns', 0), 0, 0);
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
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

  it.each([
    ['اختبار إتمام الحفظ', ['accounts', 'items', 'stock']],
    ['اختبار إتمام الحفظ بتحصيل', ['accounts', 'items', 'stock', 'cashBoxes']],
  ])('refreshes rows, summaries and affected resources after %s', async (button, resources) => {
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_invoice_kpis_columns', 0));
    fireEvent.click(screen.getByRole('button', { name: '+ فاتورة مبيعات' }));
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(masterData.refresh.mock.calls).toEqual([[resources]]);
    await resolvePair(expectPair(2, 'get_invoice_kpis_columns', 0));
  });

  it('waits for complete stock before mounting the invoice form', async () => {
    masterData.stock = masterData.pending;
    const view = render(<MemoryRouter><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_invoice_kpis_columns', 0));
    fireEvent.click(screen.getByRole('button', { name: '+ فاتورة مبيعات' }));
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تحميل بيانات النموذج');
    expect(screen.queryByRole('button', { name: 'اختبار إتمام الحفظ' })).not.toBeInTheDocument();

    masterData.stock = masterData.ready;
    view.rerender(<MemoryRouter><Invoices /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'اختبار إتمام الحفظ' })).toBeInTheDocument();
  });

  it('uses invoice-entry-modal sizing classes for warehouse transfer modals as well as invoices', async () => {
    render(<MemoryRouter initialEntries={['/?tab=warehouse_transfer']}><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_warehouse_transfer_kpis_columns', 0));
    fireEvent.click(screen.getByRole('button', { name: '+ تحويل بين مخازن' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('modal', 'transaction-entry-modal', 'invoice-entry-modal');
    expect(dialog.querySelector('.transfer-lines-card')).toHaveClass('right-card', 'items-table-card');
  });

  it.each([
    ['invoices', Invoices, 'sale', 'get_invoice_kpis_columns'],
    ['receipts', Receipts, 'in', 'get_receipt_kpis_columns'],
  ] as const)('omits duplicate clear icon in %s ColumnFilterRow and keeps date range and deleted mode when resetting filters', async (_, Page, tab, summary) => {
    render(<MemoryRouter initialEntries={[`/?tab=${tab}`]}><Page /></MemoryRouter>);
    await resolvePair(expectPair(0, summary, 0));

    expect(screen.queryByRole('button', { name: 'مسح كل الفلاتر' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'الفترة' }));
    fireEvent.click(screen.getByRole('option', { name: 'كل الفترات' }));
    await resolvePair(expectPair(2, summary, 0));

    fireEvent.click(screen.getByRole('button', { name: 'عرض المحذوفات' }));
    await resolvePair(expectPair(4, summary, 0));

    await changeNotes('اختبار');
    const filteredPair = expectPair(6, summary, 0);
    expect(filteredPair[0].args.p_columns).toEqual({ notes: 'اختبار' });
    expect(filteredPair[0].args.p_show_deleted).toBe(true);
    expect(filteredPair[0].args.p_date_from).toBeNull();
    expect(filteredPair[0].args.p_date_to).toBeNull();
    await resolvePair(filteredPair);

    const resetBtn = screen.getByRole('button', { name: /مسح الفلاتر/ });
    fireEvent.click(resetBtn);
    const afterReset = expectPair(8, summary, 0);
    expect(afterReset[0].args.p_columns).toEqual({});
    expect(afterReset[0].args.p_show_deleted).toBe(true);
    expect(afterReset[0].args.p_date_from).toBeNull();
    expect(afterReset[0].args.p_date_to).toBeNull();
    expect(screen.getByRole('combobox', { name: 'الفترة' })).toHaveValue('كل الفترات');
  });

  it('resets showDeleted and sortOrder when switching tabs in Invoices and Receipts', async () => {
    const view = render(<MemoryRouter initialEntries={['/?tab=sale']}><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_invoice_kpis_columns', 0));

    fireEvent.click(screen.getByRole('button', { name: 'عرض المحذوفات' }));
    await resolvePair(expectPair(2, 'get_invoice_kpis_columns', 0));

    fireEvent.click(screen.getByRole('columnheader', { name: 'الرقم' }));
    const sortedInv = expectPair(4, 'get_invoice_kpis_columns', 0);
    expect(sortedInv[0].args.p_show_deleted).toBe(true);
    expect(sortedInv[0].args.p_sort_order).toMatch(/^number-/);
    await resolvePair(sortedInv);

    fireEvent.click(screen.getByRole('button', { name: 'فواتير المشتريات' }));
    const switchedInv = expectPair(6, 'get_invoice_kpis_columns', 0);
    expect(switchedInv[0].args.p_show_deleted).toBe(false);
    expect(switchedInv[0].args.p_sort_order).toBe('date-desc');
    await resolvePair(switchedInv);

    view.unmount();
    requests.length = 0;

    render(<MemoryRouter initialEntries={['/?tab=in']}><Receipts /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_receipt_kpis_columns', 0));

    fireEvent.click(screen.getByRole('button', { name: 'عرض المحذوفات' }));
    await resolvePair(expectPair(2, 'get_receipt_kpis_columns', 0));

    fireEvent.click(screen.getByRole('columnheader', { name: 'الرقم' }));
    await resolvePair(expectPair(4, 'get_receipt_kpis_columns', 0));

    fireEvent.click(screen.getByRole('button', { name: 'إيصالات صرف' }));
    const switchedRec = expectPair(6, 'get_receipt_kpis_columns', 0);
    expect(switchedRec[0].args.p_show_deleted).toBe(false);
    expect(switchedRec[0].args.p_sort_order).toBe('date-desc');
  });

  it('enforces create/delete permissions on Invoices toolbar and redirects unauthorized Receipts to /access-denied', async () => {
    accessMock.can.mockImplementation((key: string) => key === 'goods.sale.view');

    const invView = render(<MemoryRouter initialEntries={['/?tab=sale']}><Invoices /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_invoice_kpis_columns', 0));
    expect(screen.queryByRole('button', { name: '+ فاتورة مبيعات' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض المحذوفات' })).not.toBeInTheDocument();
    invView.unmount();

    accessMock.can.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/receipts?tab=in']}>
        <Routes>
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/access-denied" element={<h1>مرفوض الوصول</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'مرفوض الوصول' })).toBeInTheDocument();
  });

  it('keeps deleted receipt modal open when cancelling restore confirmation', async () => {
    const deletedReceipt = {
      id: 'rec-del-1',
      serial_number: 5,
      direction: 'in',
      number: 'RCP-000005',
      receipt_date: '2026-11-05',
      account_id: 'acc-1',
      account_kind: 'customer',
      account_name: 'عميل محذوف',
      cash_box_id: 'cb-1',
      cash_box_name: 'الخزينة الرئيسية',
      amount: 100,
      is_free: true,
      description: 'تجربة',
      notes: null,
      created_at: '2026-11-05T10:00:00Z',
    };

    render(<MemoryRouter initialEntries={['/?tab=in']}><Receipts /></MemoryRouter>);
    await resolvePair(expectPair(0, 'get_receipt_kpis_columns', 0));

    fireEvent.click(screen.getByRole('button', { name: 'عرض المحذوفات' }));
    const deletedPair = expectPair(2, 'get_receipt_kpis_columns', 0);
    await act(async () => {
      deletedPair[0].resolve({ error: null, data: { rows: [deletedReceipt], total_count: 1 } });
      deletedPair[1].resolve({ error: null, data: { count: 1, total_amount: 100, linked_amount: 0 } });
    });

    fireEvent.click(screen.getByText('RCP-000005'));
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'استعادة الإيصال' }));

    const confirmDialog = screen.getByRole('dialog', { name: 'تأكيد العملية' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'إلغاء' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText(/RCP-000005/)).toBeInTheDocument();
  });
});

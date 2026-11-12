import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountsTab from '../../pages/master-data/AccountsTab';

const api = vi.hoisted(() => ({
  rows: [] as object[], rpc: vi.fn(), update: vi.fn(), refresh: vi.fn(),
  error: vi.fn(), success: vi.fn(), info: vi.fn(),
}));
vi.mock('../../lib/access', () => ({ useAccess: () => ({ can: () => true }) }));
vi.mock('../../context/MasterDataContext', () => ({ useMasterData: () => ({ refresh: api.refresh }) }));
vi.mock('../../components/Toast', () => ({ toast: { error: api.error, success: api.success, info: api.info } }));
vi.mock('../../lib/supabase', () => {
  function queryBuilder() {
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query,
      range: () => Promise.resolve({ data: api.rows, count: api.rows.length, error: null }),
      update: (value: object) => ({ eq: () => api.update(value) }),
    };
    return query;
  }
  return { supabase: {
    rpc: (name: string, ...args: unknown[]) => {
      const result = api.rpc(name, ...args);
      return name === 'filter_master_account_rows' ? queryBuilder() : result;
    },
    from: queryBuilder,
  } };
});

function deferredSave() {
  let resolve!: (value: { error: { message: string } | null }) => void;
  const promise = new Promise<{ error: { message: string } | null }>(done => { resolve = done; });
  return { promise, resolve };
}
function saveCalls() { return api.rpc.mock.calls.filter(([name]) => name === 'save_account_with_notes'); }
async function addForm(kind: 'customer' | 'supplier') {
  render(
    <MemoryRouter initialEntries={[`/data?tab=${kind === 'customer' ? 'customers' : 'suppliers'}&action=new`]}>
      <AccountsTab kind={kind} />
    </MemoryRouter>,
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByPlaceholderText(`اسم ${kind === 'customer' ? 'العميل' : 'المورد'}`), {
    target: { value: 'حساب الاختبار' },
  });
  return dialog;
}

describe('customer and supplier account form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.rows = [];
    api.refresh.mockResolvedValue(undefined);
    api.update.mockResolvedValue({ error: null });
    api.rpc.mockImplementation(() => Promise.resolve({ data: {}, error: null }));
  });

  it.each(['customer','supplier'] as const)('defaults %s to the usual direction and saves a positive balance', async kind => {
    const dialog = await addForm(kind);
    expect(within(dialog).getByRole('combobox')).toHaveValue(kind === 'customer' ? 'receivable' : 'payable');
    fireEvent.change(within(dialog).getByLabelText(/رصيد بداية التعامل/), { target: { value: '1000' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1]).toMatchObject({ p_kind: kind, p_opening_balance: 1000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['customer','supplier'] as const)('saves the opposite %s direction as a negative balance', async kind => {
    const dialog = await addForm(kind);
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: kind === 'customer' ? 'payable' : 'receivable' } });
    fireEvent.change(within(dialog).getByLabelText(/رصيد بداية التعامل/), { target: { value: '250.5' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1]).toMatchObject({ p_opening_balance: -250.5 });
  });

  it('allows only one pending create and blocks dismissal without losing input', async () => {
    const pending = deferredSave();
    api.rpc.mockImplementation(name => name === 'save_account_with_notes' ? pending.promise : Promise.resolve({ data: {}, error: null }));
    const dialog = await addForm('customer');
    fireEvent.submit(dialog.querySelector('form')!);
    fireEvent.submit(dialog.querySelector('form')!);
    expect(saveCalls()).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    expect(within(dialog).getByPlaceholderText('اسم العميل')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'إلغاء' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('presentation'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => pending.resolve({ error: null }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps values on server failure and permits a retry', async () => {
    let attempts = 0;
    api.rpc.mockImplementation(name => {
      if (name !== 'save_account_with_notes') return Promise.resolve({ data: {}, error: null });
      return Promise.resolve({ error: ++attempts === 1 ? { message: 'permission_denied' } : null });
    });
    const dialog = await addForm('supplier');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(within(dialog).getByPlaceholderText('اسم المورد')).toHaveValue('حساب الاختبار');
    expect(within(dialog).getByRole('button', { name: 'إضافة المورد' })).toBeEnabled();
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saveCalls()).toHaveLength(2);
  });

  it('recovers from a rejected request and rejects whitespace-only names', async () => {
    api.rpc.mockImplementation(name => name === 'save_account_with_notes'
      ? Promise.reject(new Error('network unavailable')) : Promise.resolve({ data: {}, error: null }));
    const dialog = await addForm('customer');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(within(dialog).getByRole('button', { name: 'إضافة العميل' })).toBeEnabled();
    fireEvent.change(within(dialog).getByPlaceholderText('اسم العميل'), { target: { value: '   ' } });
    fireEvent.submit(dialog.querySelector('form')!);
    expect(saveCalls()).toHaveLength(1);
    expect(api.error).toHaveBeenLastCalledWith('أدخل اسم العميل');
  });

  it('prevents duplicate edits and never sends an opening balance while editing', async () => {
    api.rows = [{ id: 'account-1', name: 'حساب موجود', kind: 'customer', serial_number: 1,
      phone: '', notes: '', is_active: true, system_key: null }];
    const pending = deferredSave();
    api.update.mockReturnValue(pending.promise);
    render(
      <MemoryRouter initialEntries={['/data?tab=customers']}>
        <AccountsTab kind="customer" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('حساب موجود'));
    fireEvent.click(screen.getByRole('button', { name: 'تعديل البيانات' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('رصيد بداية التعامل')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('اسم العميل'), { target: { value: 'اسم معدل' } });
    fireEvent.submit(dialog.querySelector('form')!);
    fireEvent.submit(dialog.querySelector('form')!);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith({ name: 'اسم معدل', phone: null, notes: null, is_active: true });
    await act(async () => pending.resolve({ error: null }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens create modal via ?action=new URL deep link', async () => {
    render(
      <MemoryRouter initialEntries={['/data?tab=customers&action=new']}>
        <AccountsTab kind="customer" />
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'إضافة العميل' })).toBeInTheDocument();
  });

  it.each([
    { deletedPermanently: false, expectedKind: 'info' as const, expectedText: /تم إيقاف تفعيل العميل «حساب الحذف»/ },
    { deletedPermanently: true, expectedKind: 'success' as const, expectedText: /تم حذف العميل «حساب الحذف» نهائياً/ },
  ])('distinguishes soft deactivation from permanent deletion when delete_account returns $deletedPermanently', async ({ deletedPermanently, expectedKind, expectedText }) => {
    api.rows = [{ id: 'account-del-1', name: 'حساب الحذف', kind: 'customer', serial_number: 2,
      phone: '', notes: '', is_active: true, system_key: null }];
    api.rpc.mockImplementation((name: string) =>
      name === 'delete_account'
        ? Promise.resolve({ data: deletedPermanently, error: null })
        : Promise.resolve({ data: {}, error: null }),
    );
    render(
      <MemoryRouter initialEntries={['/data?tab=customers']}>
        <AccountsTab kind="customer" />
      </MemoryRouter>,
    );

    const actionsBtn = await screen.findByRole('button', { name: 'قائمة الإجراءات' });
    fireEvent.click(actionsBtn);
    const deleteMenuBtn = await screen.findByRole('menuitem', { name: 'حذف' });
    fireEvent.click(deleteMenuBtn);

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(api[expectedKind]).toHaveBeenCalledWith(expect.stringMatching(expectedText)));
    if (expectedKind === 'info') expect(api.success).not.toHaveBeenCalled();
    else expect(api.info).not.toHaveBeenCalled();
  });
});

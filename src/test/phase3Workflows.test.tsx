import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuickActions from '../pages/home/QuickActions';
import InvoiceForm from '../components/InvoiceForm';
import ReceiptForm from '../components/ReceiptForm';
import Management from '../pages/Management';
import ItemsTab from '../pages/master-data/ItemsTab';
import { NavigationGuardProvider, useNavigationDirtyGuard, useNavigationGuard } from '../components/NavigationGuardContext';
import { supabase } from '../lib/supabase';

const mockAccess = vi.hoisted(() => ({
  access: { role: 'employee' as 'owner' | 'employee', permissions: [] as string[], is_active: true },
  can: vi.fn((_key: string) => true),
  canViewProfit: false,
  canViewPurchasePrice: false,
  loading: false,
}));

const mockMasterData = vi.hoisted(() => ({
  accounts: [
    {
      id: 'acc-cus-1',
      name: 'عميل الافتتاحيات',
      kind: 'customer',
      balance: 250,
      opening_balance: 250,
      invoiced: 0,
      paid: 0,
      is_active: true,
      notes: '',
      phone: '01012345678',
      serial_number: 1,
      has_documents: false,
      system_key: null,
    },
  ],
  cashBoxes: [
    { id: 'cb-1', name: 'الخزنة الرئيسية', balance: 500, opening_balance: 500, is_active: true, is_primary: true, serial_number: 1, notes: null },
  ],
  stockRows: [],
  warehouses: [
    { id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 },
  ],
  resourceStatus: {
    accounts: { loading: false, error: null, hasLoaded: true },
    cashBoxes: { loading: false, error: null, hasLoaded: true },
    stock: { loading: false, error: null, hasLoaded: true },
    warehouses: { loading: false, error: null, hasLoaded: true },
    items: { loading: false, error: null, hasLoaded: true },
  },
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/access', () => ({
  useAccess: () => mockAccess,
}));

vi.mock('../context/MasterDataContext', () => ({
  useMasterData: () => mockMasterData,
}));

vi.mock('../lib/masterDataQueries', () => ({
  loadAllWarehouses: vi.fn().mockResolvedValue([
    { id: 'wh-1', name: 'المخزن الرئيسي', serial_number: 1, is_active: true, is_primary: true },
  ]),
}));

vi.mock('../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => {
  const sampleItemRow = {
    id: 'itm-1',
    serial_number: 1,
    code: 'ITM-001',
    name: 'صنف اختبار',
    unit: 'قطعة',
    sale_price: 50,
    purchase_price: 40,
    qty: 10,
    is_active: true,
    notes: null,
    warehouse_qty: 10,
    opening_qty: 10,
  };
  function builder(dataRows: unknown[] = []) {
    const q = {
      select: () => q,
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      eq: () => q,
      order: () => q,
      range: () => Promise.resolve({ data: dataRows, count: dataRows.length, error: null }),
    };
    return q;
  }
  return {
    supabase: {
      rpc: vi.fn((name: string) => {
        if (name === 'filter_master_item_rows') return builder([sampleItemRow]);
        return Promise.resolve({ data: { total_count: 1, active_count: 1, inactive_count: 0, avg_price: 50 }, error: null });
      }),
      from: vi.fn(() => builder([])),
    },
  };
});

describe('Phase 3 workflow fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.access = { role: 'employee', permissions: [], is_active: true };
    mockAccess.can.mockReturnValue(true);
    mockAccess.canViewProfit = false;
    mockAccess.canViewPurchasePrice = false;
  });

  it('T-14: QuickActions enforces strict .create permissions instead of .view permissions', () => {
    const viewOnly = new Set(['goods.sale.view', 'money.in.view', 'money.out.view', 'goods.purchase.view']);
    mockAccess.can.mockImplementation((perm: string) => viewOnly.has(perm));

    const { rerender } = render(
      <MemoryRouter>
        <QuickActions userName="موظف عرض" companyName="شركة المكسب" />
      </MemoryRouter>,
    );

    expect(screen.queryByText('فاتورة بيع جديدة')).not.toBeInTheDocument();
    expect(screen.queryByText('استلام فلوس')).not.toBeInTheDocument();
    expect(screen.queryByText('صرف فلوس')).not.toBeInTheDocument();
    expect(screen.queryByText('فاتورة شراء')).not.toBeInTheDocument();

    mockAccess.can.mockImplementation((perm: string) => perm === 'goods.sale.create' || perm === 'money.in.create');
    rerender(
      <MemoryRouter>
        <QuickActions userName="كاشير" companyName="شركة المكسب" />
      </MemoryRouter>,
    );

    expect(screen.getByText('فاتورة بيع جديدة')).toBeInTheDocument();
    expect(screen.getByText('استلام فلوس')).toBeInTheDocument();
    expect(screen.queryByText('صرف فلوس')).not.toBeInTheDocument();
    expect(screen.queryByText('فاتورة شراء')).not.toBeInTheDocument();
  });

  it('T-13: InvoiceForm auto-resets auto_cash payment to 0.00 when switching to named account, while keeping manual edits across credit accounts', () => {
    const accounts = [
      { id: 'acc-cash', name: 'عميل نقدي', kind: 'customer', balance: 0, is_active: true, notes: '', phone: '', serial_number: 1, opening_balance: 0, invoiced: 0, paid: 0, has_documents: false, system_key: 'cash_customer' },
      { id: 'acc-credit', name: 'شركة الأمل', kind: 'customer', balance: 500, is_active: true, notes: '', phone: '', serial_number: 2, opening_balance: 0, invoiced: 500, paid: 0, has_documents: true, system_key: null },
      { id: 'acc-credit-2', name: 'مؤسسة النصر', kind: 'customer', balance: 100, is_active: true, notes: '', phone: '', serial_number: 3, opening_balance: 0, invoiced: 100, paid: 0, has_documents: true, system_key: null },
    ] as any;
    const warehouses = [{ id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 }] as any;
    const cashBoxes = [{ id: 'cb-1', name: 'الخزنة الرئيسية', balance: 1000, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null }] as any;
    const items = [{ id: 'itm-1', serial_number: 1, code: '111', name: 'بند أول', unit: 'قطعة', sale_price: 100, purchase_price: 80, qty: 20, is_active: true }] as any;
    const stockRows = [{ item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 20 }] as any;

    render(
      <MemoryRouter>
        <InvoiceForm
          kind="sale"
          accounts={accounts}
          warehouses={warehouses}
          cashBoxes={cashBoxes}
          items={items}
          stockRows={stockRows}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const itemCombo = screen.getByPlaceholderText('اختر صنفاً للإدراج أو امسح الباركود…');
    fireEvent.focus(itemCombo);
    fireEvent.click(screen.getByText(/بند أول/));
    fireEvent.click(screen.getByRole('button', { name: 'إدراج' }));

    const paidInput = screen.getByLabelText('المدفوع') as HTMLInputElement;
    expect(paidInput.value).toBe('100.00');

    // Switching from cash account to named credit account resets auto-filled cash payment to 0.00
    fireEvent.focus(screen.getByDisplayValue('عميل نقدي'));
    fireEvent.click(screen.getByText('شركة الأمل'));
    expect(paidInput.value).toBe('0.00');

    // Manual edit on named account must NOT be reset when switching to another named credit account
    fireEvent.change(paidInput, { target: { value: '45' } });
    fireEvent.blur(paidInput);
    expect(paidInput.value).toBe('45.00');

    fireEvent.focus(screen.getByDisplayValue('شركة الأمل'));
    fireEvent.click(screen.getByText('مؤسسة النصر'));
    expect(paidInput.value).toBe('45.00');
  });

  it('T-09a: InvoiceForm linked receipt badge and ReceiptForm linked invoice link point to deep-link routes', () => {
    const accounts = [
      { id: 'acc-2', name: 'شركة النور', kind: 'customer', balance: 550, is_active: true, notes: '', phone: '', serial_number: 2, opening_balance: 0, invoiced: 1050, paid: 500, has_documents: true, system_key: null },
    ] as any;
    const cashBoxes = [{ id: 'cb-1', name: 'الخزنة الرئيسية', balance: 1000, is_active: true, is_primary: true, serial_number: 1, opening_balance: 0, notes: null }] as any;
    const warehouses = [{ id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true, serial_number: 1 }] as any;

    const editingInvoice = {
      invoice: {
        id: 'inv-101',
        company_id: 'cmp-1',
        serial_number: 101,
        kind: 'sale',
        number: 'SAL-000101',
        invoice_date: '2026-11-01',
        account_id: 'acc-2',
        account_kind: 'customer',
        warehouse_id: 'wh-1',
        cash_box_id: 'cb-1',
        subtotal: 100,
        discount: 0,
        total: 100,
        paid: 50,
        remaining: 50,
        notes: null,
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
        receipt_id: 'rcp-99',
        receipt_number: 'RCP-000099',
        receipt_amount: 50,
      },
      lines: [{ key: 'l-1', item_id: 'itm-1', qty: '1', unit_price: '100' }],
    } as any;

    render(
      <MemoryRouter>
        <InvoiceForm
          kind="sale"
          accounts={accounts}
          warehouses={warehouses}
          cashBoxes={cashBoxes}
          items={[{ id: 'itm-1', serial_number: 1, code: '1', name: 'صنف', unit: 'قطعة', sale_price: 100, purchase_price: 80, qty: 5, is_active: true }] as any}
          stockRows={[{ item_id: 'itm-1', warehouse_id: 'wh-1', current_qty: 5 }] as any}
          editing={editingInvoice}
          readOnly
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
        <ReceiptForm
          direction="in"
          accounts={accounts}
          cashBoxes={cashBoxes}
          editing={{
            id: 'rcp-99',
            serial_number: 99,
            direction: 'in',
            number: 'RCP-000099',
            receipt_date: '2026-11-01',
            account_id: 'acc-2',
            account_kind: 'customer',
            cash_box_id: 'cb-1',
            amount: 50,
            notes: null,
            invoice_id: 'inv-101',
            invoice_number: 'SAL-000101',
            invoice_kind: 'sale',
          } as any}
          readOnly
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const receiptLink = screen.getByRole('link', { name: /إيصال.*RCP-000099/ });
    expect(receiptLink).toHaveAttribute('href', '/receipts?tab=in&doc=rcp-99');

    const invoiceLink = screen.getByRole('link', { name: /SAL-000101/ });
    expect(invoiceLink).toHaveAttribute('href', '/invoices?tab=sale&doc=inv-101');
  });

  it('T-11: Management guards dirty tab edits with ConfirmDialog and uses plain Arabic balance direction labels', async () => {
    render(
      <MemoryRouter initialEntries={['/management?tab=customers']}>
        <NavigationGuardProvider>
          <Management />
        </NavigationGuardProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('إجمالي لنا عندهم')).toBeInTheDocument();
    expect(screen.getByText('إجمالي لهم عندنا')).toBeInTheDocument();

    const amountInput = screen.getByLabelText('مبلغ الرصيد الافتتاحي لـ عميل الافتتاحيات');
    fireEvent.change(amountInput, { target: { value: '500' } });

    expect(screen.getByRole('region', { name: 'شريط حفظ التعديلات' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'افتتاحيات الموردين' }));
    expect(await screen.findByText('تغييرات غير محفوظة')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.queryByText('تغييرات غير محفوظة')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'افتتاحيات العملاء' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'افتتاحيات الموردين' }));
    fireEvent.click(await screen.findByRole('button', { name: 'مغادرة دون حفظ' }));
    expect(screen.getByRole('heading', { name: 'افتتاحيات الموردين' })).toBeInTheDocument();
  });

  it('T-11: NavigationGuardProvider prompts ConfirmDialog before allowing external route exit', async () => {
    let lastResult: boolean | null = null;
    function DirtyHarness() {
      useNavigationDirtyGuard(true);
      const guard = useNavigationGuard();
      return (
        <button
          type="button"
          onClick={async () => {
            lastResult = await guard!.confirmNavigationIfDirty();
          }}
        >
          حاول الانتقال
        </button>
      );
    }

    render(
      <NavigationGuardProvider>
        <DirtyHarness />
      </NavigationGuardProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'حاول الانتقال' }));
    expect(await screen.findByText('تجاهل التغييرات؟')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تجاهل ومغادرة' }));
    await waitFor(() => expect(lastResult).toBe(true));
  });

  it('T-12: ItemsTab requires explicit ConfirmDialog confirmation before deactivating an item', async () => {
    render(
      <MemoryRouter initialEntries={['/data?tab=items']}>
        <ItemsTab />
      </MemoryRouter>,
    );

    const itemCell = await screen.findByText('صنف اختبار');
    fireEvent.click(itemCell);

    const deactivateBtn = screen.getByRole('button', { name: 'إيقاف الصنف' });
    fireEvent.click(deactivateBtn);

    expect(await screen.findByText('هل تريد إيقاف الصنف «صنف اختبار»؟')).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'إيقاف' }));
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('items'));
  });
});

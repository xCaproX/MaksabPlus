import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InvoiceForm from '../../components/InvoiceForm';
import WarehouseTransferForm from '../../components/WarehouseTransferForm';
import CashBoxTransferForm from '../../components/CashBoxTransferForm';
import RunReconciliationModal from '../../pages/management/RunReconciliationModal';
import AccountOpeningTab from '../../pages/management/AccountOpeningTab';
import DashboardChartsSection from '../../components/charts/DashboardChartsSection';
import ReceiptTable from '../../pages/receipts/ReceiptTable';
import { calculateInvoiceKpis } from '../../pages/invoices/invoiceKpis';
import { toast } from '../../components/Toast';
import type {
  AccountRow,
  CashBoxRow,
  ItemRow,
  ReceiptRow,
  StockOpeningRow,
  WarehouseOption,
} from '../../lib/types';

const mockState = vi.hoisted(() => ({
  rpcImpl: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>>(),
}));

vi.mock('../../lib/supabase', () => {
  const createChain = () => {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      or: vi.fn(() => chain),
      then: (resolve: (val: { data: never[]; error: null }) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      rpc: (...args: unknown[]) => mockState.rpcImpl(...args),
      from: vi.fn(() => createChain()),
    },
  };
});

vi.mock('../../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const accountsFixture: AccountRow[] = [
  {
    id: 'acc-1',
    serial_number: 2,
    name: 'عميل الملاحظات',
    kind: 'customer',
    phone: '01000000001',
    notes: 'عميل جملة مميز',
    is_active: true,
    opening_balance: 0,
    invoiced: 0,
    paid: 0,
    balance: 250,
    has_documents: true,
    system_key: null,
  },
  {
    id: 'acc-inactive',
    serial_number: 3,
    name: 'عميل موقوف',
    kind: 'customer',
    phone: null,
    notes: null,
    is_active: false,
    opening_balance: 0,
    invoiced: 0,
    paid: 0,
    balance: 150,
    has_documents: false,
    system_key: null,
  },
];

const warehousesFixture: WarehouseOption[] = [
  { id: 'wh-1', name: 'المخزن الرئيسي', is_active: true, is_primary: true },
  { id: 'wh-2', name: 'مخزن فرعي', is_active: true, is_primary: false },
];

const cashBoxesFixture: CashBoxRow[] = [
  { id: 'cb-1', serial_number: 1, name: 'الخزنة الرئيسية', is_active: true, balance: 5000, opening_balance: 5000, is_primary: true, notes: null },
  { id: 'cb-2', serial_number: 2, name: 'خزنة إضافية', is_active: true, balance: 1000, opening_balance: 1000, is_primary: false, notes: null },
];

const itemsFixture: ItemRow[] = [
  {
    id: 'item-1',
    serial_number: 1,
    code: 'IT-001',
    name: 'سكر أبيض',
    unit: 'كيس',
    sale_price: 40,
    purchase_price: 30,
    is_active: true,
    qty: 12,
  },
];

const stockFixture: StockOpeningRow[] = [
  {
    item_id: 'item-1',
    item_number: 1,
    item_code: 'IT-001',
    item_name: 'سكر أبيض',
    unit: 'كيس',
    warehouse_id: 'wh-1',
    warehouse_number: 1,
    warehouse_name: 'المخزن الرئيسي',
    warehouse_notes: null,
    opening_qty: 10,
    unit_cost: 30,
    current_qty: 10,
    cost_locked: false,
    item_notes: null,
  },
  {
    item_id: 'item-1',
    item_number: 1,
    item_code: 'IT-001',
    item_name: 'سكر أبيض',
    unit: 'كيس',
    warehouse_id: 'wh-2',
    warehouse_number: 2,
    warehouse_name: 'مخزن فرعي',
    warehouse_notes: null,
    opening_qty: 2,
    unit_cost: 30,
    current_qty: 2,
    cost_locked: false,
    item_notes: null,
  },
];

describe('Phase 4 parity fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.rpcImpl.mockResolvedValue({ data: [], error: null });
  });

  it('orders RunReconciliationModal action buttons primary first then cancel', () => {
    render(
      <RunReconciliationModal
        loading={false}
        onClose={vi.fn()}
        onConfirm={vi.fn(async () => {})}
      />,
    );

    const actionContainer = document.querySelector('.form-modal-actions')!;
    const buttons = Array.from(actionContainer.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['بدء الفحص الآن', 'إلغاء']);
    expect(buttons[0]).toHaveClass('btn', 'primary');
    expect(buttons[1]).toHaveClass('btn');
  });

  it('renders sale_return InvoiceForm with return wording, 4-decimal price step, and non-input account notes', () => {
    const { container } = render(
      <MemoryRouter>
        <InvoiceForm
          kind="sale_return"
          accounts={accountsFixture}
          warehouses={warehousesFixture}
          cashBoxes={cashBoxesFixture}
          items={itemsFixture}
          stockRows={stockFixture}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const accountNotesEl = screen.getByLabelText('ملاحظات الحساب');
    expect(accountNotesEl.tagName).toBe('DIV');
    expect(accountNotesEl).toHaveClass('account-notes-display');
    expect(container.querySelector('input.account-notes-input')).toBeNull();

    const priceInput = screen.getByLabelText('سعر الوحدة') as HTMLInputElement;
    expect(priceInput.step).toBe('0.0001');
    expect(screen.getByPlaceholderText('ملاحظات اختيارية على المرتجع…')).toBeInTheDocument();

    fireEvent.submit(container.querySelector('form')!);
    expect(toast.error).toHaveBeenCalledWith('اختر صنفًا واحدًا على الأقل في المرتجع');
  });

  it('requires non-empty date and shows live stock warning on WarehouseTransferForm', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <WarehouseTransferForm
          warehouses={warehousesFixture}
          items={itemsFixture}
          stockRows={stockFixture}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Clear date input and submit -> date validation toast
    const dateInput = screen.getByLabelText('تاريخ التحويل') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(toast.error).toHaveBeenCalledWith('أدخل التاريخ');

    // Insert qty 5 from wh-1 (available 10), then simulate live stock refresh reducing wh-1 to 3
    fireEvent.change(dateInput, { target: { value: '15/11/2026' } });
    const itemSelect = screen.getByPlaceholderText('اختر صنفاً للتحويل أو امسح الباركود…');
    fireEvent.focus(itemSelect);
    fireEvent.click(screen.getByText(/سكر أبيض/));

    const entryQty = screen.getByLabelText('الكمية المنقولة') as HTMLInputElement;
    fireEvent.change(entryQty, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /إدراج/ }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const reducedStock = stockFixture.map((row) =>
      row.warehouse_id === 'wh-1' ? { ...row, current_qty: 3 } : row,
    );
    rerender(
      <MemoryRouter>
        <WarehouseTransferForm
          warehouses={warehousesFixture}
          items={itemsFixture}
          stockRows={reducedStock}
          editing={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const warning = screen.getByRole('alert');
    expect(warning).toHaveClass('stock-warning-text');
    expect(warning).toHaveTextContent('تتجاوز المتاح');
  });

  it('shows visible notes label, guards زيادة badge to numAmount > 0, and validates date in CashBoxTransferForm', () => {
    const { container } = render(
      <CashBoxTransferForm
        cashBoxes={cashBoxesFixture}
        editing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('ملاحظات')).toBeInTheDocument();
    expect(container.querySelector('.tag-credit')).toBeNull();

    fireEvent.change(screen.getByLabelText('المبلغ المراد تحويله'), { target: { value: '150' } });
    expect(container.querySelector('.tag-credit')).toHaveTextContent('زيادة');

    fireEvent.change(screen.getByLabelText('تاريخ التحويل'), { target: { value: '' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(toast.error).toHaveBeenCalledWith('أدخل التاريخ');
  });

  it('aligns sale_return and purchase_return KPIs without single-page row fallback', () => {
    const saleReturn = calculateInvoiceKpis({
      kind: 'sale_return',
      isWarehouseTransfer: false,
      invoiceSummary: { totalAmount: 300, paidAmount: 100, remainingAmount: 200, profitTotal: 0, count: 3 },
      canViewProfit: false,
    });
    const purchaseReturn = calculateInvoiceKpis({
      kind: 'purchase_return',
      isWarehouseTransfer: false,
      invoiceSummary: { totalAmount: 400, paidAmount: 400, remainingAmount: 0, profitTotal: 0, count: 2 },
      canViewProfit: false,
    });

    expect(saleReturn.find((k) => k.id === 'return-total')).toMatchObject({
      label: 'إجمالي مرتجع المبيعات',
      variant: 'primary',
    });
    expect(saleReturn.find((k) => k.id === 'return-count')).toMatchObject({
      label: 'عدد المرتجعات',
      unit: 'مرتجع',
    });
    expect(saleReturn.find((k) => k.id === 'return-remaining')?.variant).toBe('warning');

    expect(purchaseReturn.find((k) => k.id === 'p-return-count')).toMatchObject({
      label: 'عدد المرتجعات',
      unit: 'مرتجع',
    });
    expect(purchaseReturn.find((k) => k.id === 'p-return-remaining')?.variant).toBe('neutral');
  });

  it('renders موقوف wording and balance status pill in AccountOpeningTab detail drawer', () => {
    render(
      <AccountOpeningTab
        kind="customer"
        accounts={accountsFixture}
        canEditOpening={false}
        onRefresh={vi.fn(async () => {})}
        saving={false}
        setSaving={vi.fn()}
      />,
    );

    const row = screen.getByText('عميل موقوف').closest('tr')!;
    fireEvent.click(row);

    const drawer = screen.getByLabelText('تفاصيل الحساب');
    expect(drawer).toHaveTextContent('موقوف');
    expect(drawer).not.toHaveTextContent('معطل');
    expect(drawer.querySelector('.status-badge')).toBeInTheDocument();
  });

  it('omits duplicate مرتبط action label for linked receipts and aligns money column in ReceiptTable', () => {
    const linkedReceipt: ReceiptRow = {
      id: 'rec-linked',
      created_at: '2026-11-15T10:00:00Z',
      number: 'RC-001',
      receipt_date: '2026-11-15',
      amount: 100,
      notes: null,
      description: null,
      statement: 'سداد فاتورة',
      account_id: 'acc-1',
      account_name: 'عميل الملاحظات',
      account_kind: 'customer',
      cash_box_id: 'cb-1',
      cash_box_name: 'الخزنة الرئيسية',
      invoice_id: 'inv-1',
      invoice_number: 'SI-001',
      invoice_kind: 'sale',
      is_free: false,
      deleted_at: null,
      direction: 'in',
    };

    const { container } = render(
      <MemoryRouter>
        <ReceiptTable
          loading={false}
          pageReceipts={[linkedReceipt]}
          sortOrder="date-desc"
          onSort={vi.fn()}
          showDeleted={false}
          onView={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onRestore={vi.fn()}
          canEdit
          canDelete
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('th.col-money')).toBeInTheDocument();
    const actionCell = container.querySelector('tbody td.erp-row-actions');
    expect(actionCell).toBeEmptyDOMElement();
  });

  it('shows initial error retry UI on DashboardChartsSection and hides section when can_view_sales is false', async () => {
    mockState.rpcImpl
      .mockResolvedValueOnce({ data: null, error: { message: 'فشل التحميل' } })
      .mockResolvedValueOnce({
        data: {
          daily_trend: [],
          sales_distribution: null,
          top_items: [],
          top_customers: [],
          permissions: { can_view_sales: false, can_view_purchases: true },
        },
        error: null,
      });

    const { container } = render(
      <MemoryRouter>
        <DashboardChartsSection />
      </MemoryRouter>,
    );

    const retryBtn = await screen.findByRole('button', { name: /إعادة المحاولة/ });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(container.querySelector('.dashboard-charts-wrapper')).toBeNull();
    });
  });
});

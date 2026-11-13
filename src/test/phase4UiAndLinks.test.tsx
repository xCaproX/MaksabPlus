import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fetchDocumentDetail, getStatementRowLink } from '../lib/documentLinks';
import DocumentListToolbar from '../components/DocumentListToolbar';
import { SkeletonRows } from '../components/LoadingSkeleton';
import UserPermissions from '../components/UserPermissions';
import type { DocumentExportOptions } from '../lib/documentExcel';
import { supabase } from '../lib/supabase';

const mockUsers = vi.hoisted(() => [
  {
    user_id: 'emp-1',
    email: 'emp1@example.com',
    full_name: 'موظف أول',
    is_active: true,
    access_role: 'employee',
    permission_keys: ['goods.sale.view'],
  },
  {
    user_id: 'emp-2',
    email: 'emp2@example.com',
    full_name: 'موظف ثاني',
    is_active: true,
    access_role: 'employee',
    permission_keys: ['money.in.view'],
  },
]);

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn((fn: string) => {
      if (fn === 'list_company_users') {
        return {
          range: () => Promise.resolve({ data: mockUsers, count: mockUsers.length, error: null }),
        };
      }
      return Promise.resolve({ data: { status: 'not_found' }, error: null });
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
  },
}));

vi.mock('../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Phase 4 UX/UI & Secure Document Deep Links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('T-09b getStatementRowLink & fetchDocumentDetail', () => {
    it('builds typed links for all statement document kinds when permitted and hides unpermitted kinds (SEC-F3)', () => {
      expect(getStatementRowLink('inv-1', 'sale', () => true)).toBe('/invoices?tab=sale&doc=inv-1');
      expect(getStatementRowLink('inv-2', 'purchase_return', () => true)).toBe(
        '/invoices?tab=purchase_return&doc=inv-2',
      );
      expect(getStatementRowLink('wtr-1', 'warehouse_transfer', () => true)).toBe(
        '/invoices?tab=warehouse_transfer&doc=wtr-1',
      );
      expect(getStatementRowLink('rcp-1', 'in', () => true)).toBe('/receipts?tab=in&doc=rcp-1');
      expect(getStatementRowLink('ctr-1', 'cash_box_transfer', () => true)).toBe(
        '/receipts?tab=cash_box_transfer&doc=ctr-1',
      );

      // Opening rows or unknown kinds have no link
      expect(getStatementRowLink(null, null, () => true)).toBeNull();
      expect(getStatementRowLink('doc-1', 'unknown_kind', () => true)).toBeNull();

      // User with only goods.sale.view cannot link into receipts (SEC-F3)
      const saleOnlyCan = (perm: string) => perm === 'goods.sale.view';
      expect(getStatementRowLink('inv-1', 'sale', saleOnlyCan)).toBe('/invoices?tab=sale&doc=inv-1');
      expect(getStatementRowLink('rcp-1', 'in', saleOnlyCan)).toBeNull();
      expect(getStatementRowLink('wtr-1', 'warehouse_transfer', saleOnlyCan)).toBeNull();
    });

    it('maps get_document_detail statuses cleanly (ok, not_found, forbidden, deleted_forbidden)', async () => {
      const rpcMock = vi.mocked(supabase.rpc);

      rpcMock.mockResolvedValueOnce({
        data: { status: 'ok', doc: { id: 'inv-1', kind: 'sale' }, lines: [{ item_id: 'itm-1', qty: 2, unit_price: 10 }] },
        error: null,
      } as never);
      const okRes = await fetchDocumentDetail('invoice', 'inv-1');
      expect(rpcMock).toHaveBeenCalledWith('get_document_detail', {
        p_scope: 'invoice',
        p_doc_id: 'inv-1',
      });
      expect(okRes).toEqual({
        ok: true,
        doc: { id: 'inv-1', kind: 'sale' },
        lines: [{ item_id: 'itm-1', qty: 2, unit_price: 10 }],
      });

      rpcMock.mockResolvedValueOnce({ data: { status: 'forbidden' }, error: null } as never);
      expect(await fetchDocumentDetail('receipt', 'rcp-secret')).toEqual({
        ok: false,
        status: 'forbidden',
        message: 'لا تملك صلاحية عرض هذا المستند',
      });

      rpcMock.mockResolvedValueOnce({ data: { status: 'deleted_forbidden' }, error: null } as never);
      expect(await fetchDocumentDetail('warehouse_transfer', 'wtr-del')).toEqual({
        ok: false,
        status: 'deleted_forbidden',
        message: 'هذا المستند محذوف ولا تملك صلاحية عرضه أو استعادته',
      });

      rpcMock.mockResolvedValueOnce({ data: { status: 'not_found' }, error: null } as never);
      expect(await fetchDocumentDetail('cash_box_transfer', 'missing-id')).toEqual({
        ok: false,
        status: 'not_found',
        message: 'المستند المطلوب غير موجود',
      });
    });
  });

  describe('T-16 DocumentListToolbar active filter badge & SkeletonRows', () => {
    const baseOptions: DocumentExportOptions = {
      scope: 'invoice',
      kind: 'sale',
      filters: {},
      dateFrom: '2026-11-01',
      dateTo: '2026-11-13',
      showDeleted: false,
      sortOrder: 'date-desc',
      canViewProfit: false,
      title: 'فواتير المبيعات',
    };

    it('shows active filter count pill when filters exist and resets all filters on click', () => {
      const onReset = vi.fn();
      const { rerender } = render(
        <DocumentListToolbar options={baseOptions} onDatesChange={vi.fn()} onResetFilters={onReset} />,
      );
      expect(screen.queryByRole('button', { name: /فلاتر نشطة/ })).not.toBeInTheDocument();

      rerender(
        <DocumentListToolbar
          options={{ ...baseOptions, filters: { number: 'INV-1', notes: 'عاجل', account_id: '  ' } }}
          onDatesChange={vi.fn()}
          onResetFilters={onReset}
        />,
      );

      const pill = screen.getByRole('button', { name: /فلاتر نشطة/ });
      expect(pill).toHaveTextContent('2');
      fireEvent.click(pill);
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('renders SkeletonRows with accessible status message inside table body', () => {
      render(
        <table>
          <tbody>
            <SkeletonRows columns={4} />
          </tbody>
        </table>,
      );
      expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحميل…');
      expect(document.querySelectorAll('tr.skeleton-row')).toHaveLength(4);
    });
  });

  describe('T-17 UserPermissions dirty banner & switch confirmation', () => {
    it('shows unsaved banner when editing permissions and asks confirmation before switching employees', async () => {
      render(
        <MemoryRouter>
          <UserPermissions />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'موظف أول' })).toBeInTheDocument();
      });
      expect(screen.queryByText('توجد تعديلات غير محفوظة على صلاحيات هذا الموظف')).not.toBeInTheDocument();

      const createSaleCheckbox = screen.getByLabelText('إضافة — فواتير المبيعات');
      fireEvent.click(createSaleCheckbox);

      expect(screen.getByText('توجد تعديلات غير محفوظة على صلاحيات هذا الموظف')).toBeInTheDocument();

      // Switch to second employee -> must stay on emp-1 and open confirmation modal
      fireEvent.click(screen.getByRole('button', { name: /موظف ثاني/ }));
      expect(screen.getByText('تغييرات غير محفوظة')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'موظف أول' })).toBeInTheDocument();

      // Confirm discarding changes -> switches to emp-2 and hides banner
      fireEvent.click(screen.getByRole('button', { name: 'تجاهل التعديلات' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'موظف ثاني' })).toBeInTheDocument();
      });
      expect(screen.queryByText('توجد تعديلات غير محفوظة على صلاحيات هذا الموظف')).not.toBeInTheDocument();
    });
  });
});

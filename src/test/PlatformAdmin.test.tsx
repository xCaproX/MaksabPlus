import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlatformAdmin from '../pages/PlatformAdmin';

const companiesFixture = [
  {
    id: 'comp-1',
    name: 'شركة الأمل',
    currency: 'EGP',
    is_active: true,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    users_count: 3,
    active_users_count: 2,
    invoices_count: 18,
    last_activity_at: '2026-11-12T12:00:00Z',
    admin_notes: 'عميل باقة سنوية',
  },
  {
    id: 'comp-2',
    name: 'شركة البدر',
    currency: 'EGP',
    is_active: false,
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    users_count: 1,
    active_users_count: 1,
    invoices_count: 4,
    last_activity_at: '2026-11-01T10:00:00Z',
    admin_notes: 'موقوف لحين التجديد',
  },
];

const usersFixture = [
  {
    user_id: 'user-owner-1',
    email: 'owner@alamal.test',
    full_name: 'أحمد المالك',
    is_active: true,
    access_role: 'owner',
    created_at: '2026-10-01T10:00:00Z',
    email_confirmed_at: '2026-10-01T10:05:00Z',
  },
  {
    user_id: 'user-emp-1',
    email: 'emp@alamal.test',
    full_name: 'سعيد الموظف',
    is_active: false,
    access_role: 'employee',
    created_at: '2026-10-05T10:00:00Z',
    email_confirmed_at: null,
  },
];

const rpcSpy = vi.fn();
const invokeSpy = vi.fn();

vi.mock('../lib/access', () => ({
  useAccess: () => ({
    access: { role: 'platform_admin', permissions: [] },
    loading: false,
    can: () => false,
    canViewProfit: false,
    canViewPurchasePrice: false,
  }),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpcSpy(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeSpy(...args),
    },
    auth: {
      signOut: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
    },
  },
}));

describe('PlatformAdmin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcSpy.mockImplementation(async (fn: string) => {
      if (fn === 'get_platform_admin_identity') {
        return {
          data: [{ user_id: 'admin-1', email: 'dev@platform.test', full_name: 'مطور النظام' }],
          error: null,
        };
      }
      if (fn === 'platform_list_companies') {
        return { data: companiesFixture, error: null };
      }
      if (fn === 'platform_list_company_users') {
        return { data: usersFixture, error: null };
      }
      return { data: null, error: null };
    });

    invokeSpy.mockResolvedValue({
      data: { ok: true, company_id: 'comp-new', user_id: 'user-new' },
      error: null,
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <PlatformAdmin />
      </MemoryRouter>,
    );
  }

  it('renders KPIs, company table, and filters by search and active status', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('شركة الأمل')).toBeInTheDocument();
      expect(screen.getByText('شركة البدر')).toBeInTheDocument();
    });
    expect(screen.getByText('عميل باقة سنوية')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('الحالة'), { target: { value: 'suspended' } });
    expect(screen.queryByText('شركة الأمل')).not.toBeInTheDocument();
    expect(screen.getByText('شركة البدر')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('الحالة'), { target: { value: 'all' } });
    fireEvent.change(screen.getByPlaceholderText('ابحث باسم الشركة أو ملاحظات المطور...'), {
      target: { value: 'باقة سنوية' },
    });
    expect(screen.getByText('شركة الأمل')).toBeInTheDocument();
    expect(screen.queryByText('شركة البدر')).not.toBeInTheDocument();
  });

  it('creates a new company with direct password via manage-companies Edge Function', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('شركة الأمل')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'شركة جديدة' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('اسم الشركة'), {
      target: { value: 'شركة الفتح' },
    });
    fireEvent.change(within(dialog).getByLabelText('الاسم الكامل للمالك'), {
      target: { value: 'كريم حسن' },
    });
    fireEvent.change(within(dialog).getByLabelText('البريد الإلكتروني للدخول'), {
      target: { value: 'karim@fath.test' },
    });
    fireEvent.change(within(dialog).getByLabelText('كلمة المرور الأولية (8 أحرف على الأقل)'), {
      target: { value: 'Strong#1234' },
    });
    fireEvent.change(within(dialog).getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'Strong#1234' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء الشركة' }));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith('manage-companies', {
        body: expect.objectContaining({
          action: 'create',
          company_name: 'شركة الفتح',
          owner_full_name: 'كريم حسن',
          owner_email: 'karim@fath.test',
          auth_mode: 'password',
          owner_password: 'Strong#1234',
        }),
      });
    });
  });

  it('opens company detail panel, updates notes, resets user password, toggles company status, and requires exact name on delete', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('شركة الأمل')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'شركة الأمل' }));

    const drawer = await screen.findByLabelText('تفاصيل شركة شركة الأمل');
    expect(within(drawer).getByText('أحمد المالك')).toBeInTheDocument();
    expect(within(drawer).getByText('emp@alamal.test')).toBeInTheDocument();
    expect(within(drawer).getByText('بانتظار التفعيل')).toBeInTheDocument();

    // Update company notes
    const notesBox = within(drawer).getByLabelText('ملاحظات المطور (سرية للمنصة فقط)');
    fireEvent.change(notesBox, { target: { value: 'تم التواصل وتمديد الاشتراك' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('platform_update_company', {
        p_company_id: 'comp-1',
        p_name: 'شركة الأمل',
        p_admin_notes: 'تم التواصل وتمديد الاشتراك',
        p_is_active: true,
      });
    });

    // Reset owner password from drawer user menu
    fireEvent.click(within(drawer).getByRole('button', { name: 'خيارات أحمد المالك' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'تغيير كلمة المرور' }));

    const pwdDialog = screen.getByRole('dialog');
    fireEvent.change(within(pwdDialog).getByLabelText(/^كلمة المرور الجديدة/), {
      target: { value: 'OwnerPass#2026' },
    });
    fireEvent.change(within(pwdDialog).getByLabelText('تأكيد كلمة المرور الجديدة'), {
      target: { value: 'OwnerPass#2026' },
    });
    fireEvent.click(within(pwdDialog).getByRole('button', { name: 'حفظ كلمة المرور' }));

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('platform_set_company_user_password', {
        p_company_id: 'comp-1',
        p_user_id: 'user-owner-1',
        p_password: 'OwnerPass#2026',
      });
    });

    // Suspend company via ConfirmDialog
    fireEvent.click(within(drawer).getByRole('button', { name: 'إيقاف الشركة مؤقتًا' }));
    const suspendDialog = screen.getByRole('dialog');
    fireEvent.click(within(suspendDialog).getByRole('button', { name: 'إيقاف مؤقت' }));

    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('platform_update_company', {
        p_company_id: 'comp-1',
        p_name: 'شركة الأمل',
        p_admin_notes: 'عميل باقة سنوية',
        p_is_active: false,
      });
    });

    // Double-confirmation delete modal requires exact company name
    fireEvent.click(within(drawer).getByRole('button', { name: 'حذف الشركة بالكامل…' }));
    const deleteDialog = screen.getByRole('dialog');
    const confirmDeleteBtn = within(deleteDialog).getByRole('button', { name: 'حذف الشركة نهائيًا' });
    expect(confirmDeleteBtn).toBeDisabled();

    const confirmInput = within(deleteDialog).getByPlaceholderText('شركة الأمل');
    fireEvent.change(confirmInput, { target: { value: 'اسم مختلف' } });
    expect(confirmDeleteBtn).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'شركة الأمل' } });
    expect(confirmDeleteBtn).toBeEnabled();
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith('manage-companies', {
        body: {
          action: 'delete',
          company_id: 'comp-1',
          confirm_name: 'شركة الأمل',
        },
      });
    });
  });
});

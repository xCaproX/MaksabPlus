import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  canViewProfit,
  canViewPurchasePrice,
  hasPermission,
  type AccessState,
} from '../lib/accessCheck';
import type { InactiveAccessStatus } from '../lib/access';
import { AuthenticatedRoutes } from '../App';

const mockAccessState: {
  access: AccessState | null;
  inactiveStatus: InactiveAccessStatus | null;
  loading: boolean;
} = {
  access: null,
  inactiveStatus: null,
  loading: false,
};

const masterDataSpy = vi.fn();
const layoutSpy = vi.fn();

vi.mock('../lib/access', async () => {
  const actual = await vi.importActual<typeof import('../lib/access')>('../lib/access');
  return {
    ...actual,
    useAccess: () => ({
      access: mockAccessState.access,
      inactiveStatus: mockAccessState.inactiveStatus,
      loading: mockAccessState.loading,
      can: (...keys: string[]) => hasPermission(mockAccessState.access, ...keys),
      canViewProfit: canViewProfit(mockAccessState.access),
      canViewPurchasePrice: canViewPurchasePrice(mockAccessState.access),
      refreshAccess: vi.fn(async () => undefined),
    }),
  };
});

vi.mock('../context/MasterDataContext', () => ({
  MasterDataProvider: ({ children }: { children: ReactNode }) => {
    masterDataSpy();
    return <div data-testid="master-data-provider">{children}</div>;
  },
}));

vi.mock('../components/Layout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    default: () => {
      layoutSpy();
      return (
        <div data-testid="erp-layout">
          <Outlet />
        </div>
      );
    },
  };
});

vi.mock('../pages/Home', () => ({
  default: () => <h1>الصفحة الرئيسية للشركة</h1>,
}));

vi.mock('../pages/PlatformAdmin', () => ({
  default: () => <h1>لوحة إدارة الشركات للمطور</h1>,
}));

describe('platform_admin accessCheck & shell routing', () => {
  beforeEach(() => {
    masterDataSpy.mockClear();
    layoutSpy.mockClear();
    mockAccessState.inactiveStatus = null;
    mockAccessState.loading = false;
  });

  it('never grants tenant ERP permissions, profit, or purchase prices to platform_admin', () => {
    const adminAccess: AccessState = { role: 'platform_admin', permissions: ['*'] };
    expect(hasPermission(adminAccess, 'goods.sale.view')).toBe(false);
    expect(hasPermission(adminAccess, 'management.users.view')).toBe(false);
    expect(canViewProfit(adminAccess)).toBe(false);
    expect(canViewPurchasePrice(adminAccess)).toBe(false);
  });

  it('routes verified platform_admin directly to PlatformAdmin without mounting ERP Layout or MasterDataProvider', async () => {
    mockAccessState.access = { role: 'platform_admin', permissions: [] };

    render(
      <MemoryRouter initialEntries={['/invoices']}>
        <AuthenticatedRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة إدارة الشركات للمطور' })).toBeInTheDocument();
    });
    expect(masterDataSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('erp-layout')).not.toBeInTheDocument();
  });

  it('routes company owner into ERP Layout and never renders PlatformAdmin', async () => {
    mockAccessState.access = { role: 'owner', permissions: ['*'] };

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'الصفحة الرئيسية للشركة' })).toBeInTheDocument();
    });
    expect(masterDataSpy).toHaveBeenCalledTimes(1);
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'لوحة إدارة الشركات للمطور' })).not.toBeInTheDocument();
  });

  it('shows suspended company notice with optional reason without mounting MasterDataProvider or Layout', () => {
    mockAccessState.access = null;
    mockAccessState.inactiveStatus = {
      reasonCode: 'company_suspended',
      companyName: 'شركة النور',
      suspensionReason: 'يرجى تجديد الاشتراك الشهري',
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'تم إيقاف حساب الشركة مؤقتًا' })).toBeInTheDocument();
    expect(screen.getByText(/شركة النور/)).toBeInTheDocument();
    expect(screen.getByText('يرجى تجديد الاشتراك الشهري')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث الحالة' })).toBeInTheDocument();
    expect(masterDataSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('shows user deactivated message cleanly without mounting ERP shell', () => {
    mockAccessState.access = null;
    mockAccessState.inactiveStatus = {
      reasonCode: 'user_deactivated',
      companyName: 'شركة النور',
      suspensionReason: '',
    };

    render(
      <MemoryRouter initialEntries={['/invoices']}>
        <AuthenticatedRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'تم تعطيل هذا الحساب' })).toBeInTheDocument();
    expect(screen.getByText(/تواصل مع مدير الشركة/)).toBeInTheDocument();
    expect(masterDataSpy).not.toHaveBeenCalled();
    expect(layoutSpy).not.toHaveBeenCalled();
  });
});

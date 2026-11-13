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
import { AuthenticatedRoutes } from '../App';

const mockAccessState: {
  access: AccessState | null;
  loading: boolean;
} = {
  access: null,
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
      loading: mockAccessState.loading,
      can: (...keys: string[]) => hasPermission(mockAccessState.access, ...keys),
      canViewProfit: canViewProfit(mockAccessState.access),
      canViewPurchasePrice: canViewPurchasePrice(mockAccessState.access),
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
});

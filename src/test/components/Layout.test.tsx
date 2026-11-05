import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../../components/Layout';

vi.mock('../../lib/company', () => ({
  getCurrentUserIdentity: vi.fn().mockResolvedValue({
    userId: 'sidebar-test', userName: 'مستخدم تجريبي', companyName: 'شركة تجريبية',
  }),
}));
vi.mock('../../lib/access', () => ({
  useAccess: () => ({ access: { role: 'owner', permissions: ['*'] }, can: () => true }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../../components/ChangePasswordModal', () => ({ default: () => null }));

const storageKey = 'maksab_nav_sections_sidebar-test';

function renderLayout(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<Layout />}>
      <Route path="*" element={<Link to="/receipts?tab=in">انتقال من المحتوى</Link>} />
    </Route></Routes>
  </MemoryRouter>);
}

async function waitForIdentity() {
  await screen.findByText('مستخدم تجريبي');
}

function storedOpenSections() {
  const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>;
  return Object.keys(stored).filter((key) => stored[key]);
}

describe('sidebar single open section', () => {
  beforeEach(() => localStorage.clear());

  it('opening another section by mouse or keyboard closes the previous one', async () => {
    renderLayout('/invoices?tab=sale');
    await waitForIdentity();
    expect(screen.getByText('فواتير المبيعات')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'طي أو فتح قسم الأرصدة' }));
    expect(screen.queryByText('فواتير المبيعات')).not.toBeInTheDocument();
    expect(screen.getByText('حسابات العملاء')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'طي أو فتح قسم الفلوس' }), { key: 'Enter' });
    expect(screen.queryByText('حسابات العملاء')).not.toBeInTheDocument();
    expect(screen.getByText('إيصالات استلام')).toBeInTheDocument();
    expect(storedOpenSections()).toEqual(['money']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'طي أو فتح قسم الفلوس' }), { key: ' ' });
    expect(screen.queryByText('إيصالات استلام')).not.toBeInTheDocument();
    expect(storedOpenSections()).toEqual([]);
  });

  it('route section wins over legacy storage containing several open sections', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ goods: true, money: true, management: true }));
    renderLayout('/balances?tab=customers');
    await waitForIdentity();
    expect(screen.getByText('حسابات العملاء')).toBeInTheDocument();
    expect(screen.queryByText('فواتير المبيعات')).not.toBeInTheDocument();
    expect(screen.queryByText('إيصالات استلام')).not.toBeInTheDocument();
    expect(screen.queryByText('افتتاحيات العملاء')).not.toBeInTheDocument();
    await waitFor(() => expect(storedOpenSections()).toEqual(['balances']));
  });

  it('normalizes legacy storage on home and restores the latest choice per user', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ goods: true, money: true }));
    localStorage.setItem('maksab_nav_sections_other-user', JSON.stringify({ data: true }));
    const first = renderLayout();
    await waitForIdentity();
    expect(screen.getByText('فواتير المبيعات')).toBeInTheDocument();
    expect(screen.queryByText('إيصالات استلام')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'طي أو فتح قسم الإدارة' }));
    expect(storedOpenSections()).toEqual(['management']);
    first.unmount();
    renderLayout();
    await waitForIdentity();
    expect(screen.getByText('افتتاحيات العملاء')).toBeInTheDocument();
    expect(screen.queryByText('فواتير المبيعات')).not.toBeInTheDocument();
    expect(localStorage.getItem('maksab_nav_sections_other-user')).toBe('{"data":true}');
  });

  it('navigation from a section heading or page content opens only the destination', async () => {
    renderLayout('/invoices?tab=sale');
    await waitForIdentity();
    fireEvent.click(screen.getByRole('link', { name: 'البيانات' }));
    expect(screen.getByText('العملاء')).toBeInTheDocument();
    expect(screen.queryByText('فواتير المبيعات')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('انتقال من المحتوى'));
    expect(screen.getByText('إيصالات استلام')).toBeInTheDocument();
    expect(screen.queryByText('العملاء')).not.toBeInTheDocument();
    expect(storedOpenSections()).toEqual(['money']);
  });

  it('invalid saved data does not prevent opening the current route section', async () => {
    localStorage.setItem(storageKey, '{invalid');
    renderLayout('/management?tab=customers');
    await waitForIdentity();
    expect(screen.getByText('افتتاحيات العملاء')).toBeInTheDocument();
    await waitFor(() => expect(storedOpenSections()).toEqual(['management']));
  });
});

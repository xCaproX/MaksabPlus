import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AccessProvider, AccessRoute, type AccessState } from '../../lib/access';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

it.each([
  { permissions: ['goods.sale.view'], destination: 'فواتير المبيعات' },
  { permissions: [], destination: 'الدخول مرفوض' },
])('shows a skeleton before resolving access to a direct invoice link', async ({ permissions, destination }) => {
  let resolveAccess!: (response: { data: AccessState; error: null }) => void;
  const request = new Promise((resolve) => {
    resolveAccess = resolve;
  });
  vi.mocked(supabase.rpc).mockReturnValue(request as never);

  render(
    <MemoryRouter initialEntries={['/invoices?tab=sale']}>
      <AccessProvider>
        <Routes>
          <Route path="/invoices" element={
            <AccessRoute permissions={['goods.sale.view']}><h1>فواتير المبيعات</h1></AccessRoute>
          } />
          <Route path="/access-denied" element={<h1>الدخول مرفوض</h1>} />
        </Routes>
      </AccessProvider>
    </MemoryRouter>,
  );

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('جارٍ تحميل الصلاحيات');
  expect(status.closest('.loading-layout')?.querySelector('.loading-skeleton')).toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();

  await act(async () => resolveAccess({ data: { role: 'employee', permissions }, error: null }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: destination })).toBeInTheDocument();
});

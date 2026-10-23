import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabase';

export type AccessState = { role: 'owner' | 'employee'; permissions: string[] };
type AccessContextValue = { access: AccessState | null; loading: boolean; can: (...keys: string[]) => boolean };
const AccessContext = createContext<AccessContextValue>({ access: null, loading: true, can: () => false });

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void supabase.rpc('get_my_access').then(({ data, error }) => {
      if (!alive) return;
      const value = data as AccessState | null;
      if (error || !value?.role) setAccess(null);
      else setAccess(value);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);
  const value = useMemo<AccessContextValue>(() => ({
    access,
    loading,
    can: (...keys) => Boolean(access && (access.role === 'owner' || keys.some((key) => access.permissions.includes(key)))),
  }), [access, loading]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() { return useContext(AccessContext); }

export function AccessRoute({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { loading, can } = useAccess();
  if (loading) return <div className="card empty">جارٍ تحميل الصلاحيات…</div>;
  if (!can(...permissions)) return <Navigate to="/access-denied" replace />;
  return children;
}

export function HomeRedirect() {
  const { loading, can } = useAccess();
  if (loading) return <div className="card empty">جارٍ تحميل الصلاحيات…</div>;
  if (can('goods.view','goods.create','goods.edit','goods.delete')) return <Navigate to="/invoices" replace />;
  if (can('money.view','money.create','money.edit','money.delete')) return <Navigate to="/receipts" replace />;
  if (can('data.view','data.create','data.edit','data.delete')) return <Navigate to="/data" replace />;
  if (can('balances.view')) return <Navigate to="/balances" replace />;
  if (can('management.view','management.edit')) return <Navigate to="/management" replace />;
  return <Navigate to="/access-denied" replace />;
}

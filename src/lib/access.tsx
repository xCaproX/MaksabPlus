import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { supabase } from './supabase';
import { hasPermission, canViewProfit, canViewPurchasePrice, type AccessState } from './accessCheck';

export type { AccessState };
export { hasPermission, canViewProfit, canViewPurchasePrice };
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
    can: (...keys) => hasPermission(access, ...keys),
  }), [access, loading]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);
  return {
    ...context,
    canViewProfit: canViewProfit(context.access),
    canViewPurchasePrice: canViewPurchasePrice(context.access),
  };
}

export function AccessRoute({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { loading, can } = useAccess();
  if (loading) return <LoadingSkeleton label="جارٍ تحميل الصلاحيات…" />;
  if (!can(...permissions)) return <Navigate to="/access-denied" replace />;
  return children;
}


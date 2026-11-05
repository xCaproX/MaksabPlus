import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabase';
import { hasPermission, type AccessState } from './accessCheck';

export type { AccessState };
export { hasPermission };
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

export function useAccess() { return useContext(AccessContext); }

export function AccessRoute({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { loading, can } = useAccess();
  if (loading) return <div className="card empty">جارٍ تحميل الصلاحيات…</div>;
  if (!can(...permissions)) return <Navigate to="/access-denied" replace />;
  return children;
}


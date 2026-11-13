import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { supabase } from './supabase';
import { hasPermission, canViewProfit, canViewPurchasePrice, type AccessState } from './accessCheck';

export type { AccessState };
export { hasPermission, canViewProfit, canViewPurchasePrice };

export type InactiveAccessReasonCode = 'company_suspended' | 'user_deactivated' | 'no_profile';

export interface InactiveAccessStatus {
  reasonCode: InactiveAccessReasonCode;
  companyName: string;
  suspensionReason: string;
}

type AccessContextValue = {
  access: AccessState | null;
  inactiveStatus: InactiveAccessStatus | null;
  loading: boolean;
  can: (...keys: string[]) => boolean;
  refreshAccess: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue>({
  access: null,
  inactiveStatus: null,
  loading: true,
  can: () => false,
  refreshAccess: async () => undefined,
});

function parseInactiveStatus(rawData: unknown): InactiveAccessStatus | null {
  const row = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object') return null;

  const code = row.reason_code;
  if (code !== 'company_suspended' && code !== 'user_deactivated' && code !== 'no_profile') {
    return null;
  }

  return {
    reasonCode: code,
    companyName: typeof row.company_name === 'string' ? row.company_name : '',
    suspensionReason: typeof row.suspension_reason === 'string' ? row.suspension_reason : '',
  };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [inactiveStatus, setInactiveStatus] = useState<InactiveAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const loadAccess = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_access');
      if (seq !== requestSeq.current) return;

      const value = data as AccessState | null;
      if (!error && value?.role) {
        setAccess(value);
        setInactiveStatus(null);
        setLoading(false);
        return;
      }

      setAccess(null);
      let nextInactive: InactiveAccessStatus | null = null;
      try {
        const inactiveRes = await supabase.rpc('get_my_inactive_status');
        if (seq !== requestSeq.current) return;
        if (inactiveRes && !inactiveRes.error) {
          nextInactive = parseInactiveStatus(inactiveRes.data);
        }
      } catch {
        nextInactive = null;
      }
      if (seq !== requestSeq.current) return;
      setInactiveStatus(nextInactive);
      setLoading(false);
    } catch {
      if (seq !== requestSeq.current) return;
      setAccess(null);
      setInactiveStatus(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccess();
    return () => {
      requestSeq.current += 1;
    };
  }, [loadAccess]);

  const value = useMemo<AccessContextValue>(() => ({
    access,
    inactiveStatus,
    loading,
    can: (...keys) => hasPermission(access, ...keys),
    refreshAccess: loadAccess,
  }), [access, inactiveStatus, loadAccess, loading]);

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

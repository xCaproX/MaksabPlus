import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ConfirmDialog from './ConfirmDialog';

interface NavigationGuardContextValue {
  hasDirtyGuards: () => boolean;
  isDirty: boolean;
  registerGuard: (id: string, dirty: boolean) => void;
  confirmNavigationIfDirty: (message?: string) => Promise<boolean>;
}

const DEFAULT_NAV_DIRTY_MESSAGE = 'لديك تعديلات غير محفوظة. هل تريد مغادرة الصفحة وتجاهلها؟';

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const resolverRef = useRef<((allowed: boolean) => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const registerGuard = useCallback((id: string, dirty: boolean) => {
    setDirtyMap((prev) => {
      if (!dirty) {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (prev[id] === true) return prev;
      return { ...prev, [id]: true };
    });
  }, []);

  const isDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(true);
        resolverRef.current = null;
      }
    };
  }, []);

  const hasDirtyGuards = useCallback(() => isDirtyRef.current, []);

  const confirmNavigationIfDirty = useCallback((message?: string) => {
    if (!isDirtyRef.current) {
      return Promise.resolve(true);
    }
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setConfirmMessage(message ?? DEFAULT_NAV_DIRTY_MESSAGE);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finishConfirm = useCallback((allowed: boolean) => {
    setConfirmMessage(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(allowed);
  }, []);

  const value = useMemo<NavigationGuardContextValue>(
    () => ({ hasDirtyGuards, isDirty, registerGuard, confirmNavigationIfDirty }),
    [hasDirtyGuards, isDirty, registerGuard, confirmNavigationIfDirty],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      {confirmMessage && (
        <ConfirmDialog
          title="تجاهل التغييرات؟"
          message={confirmMessage}
          confirmLabel="تجاهل ومغادرة"
          danger
          onConfirm={() => finishConfirm(true)}
          onCancel={() => finishConfirm(false)}
        />
      )}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

/**
 * يسجل حالة التعديلات غير المحفوظة للصفحة الكاملة لحمايتها عند الانتقال عبر الشريط الجانبي أو إغلاق التبويب.
 */
export function useNavigationDirtyGuard(dirty: boolean) {
  const ctx = useNavigationGuard();
  const guardId = useId();
  const registerGuard = ctx?.registerGuard;

  useEffect(() => {
    if (registerGuard) {
      registerGuard(guardId, dirty);
      return () => registerGuard(guardId, false);
    }
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [registerGuard, guardId, dirty]);
}

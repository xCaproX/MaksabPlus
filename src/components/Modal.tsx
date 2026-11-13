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
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

const DEFAULT_DIRTY_MESSAGE = 'لديك تعديلات غير محفوظة. هل تريد تجاهلها وإغلاق النافذة؟';

// مكدس مركزي لتحديد النافذة العليا حسب عمق التداخل ثم ترتيب الفتح
interface ModalStackEntry {
  token: symbol;
  depth: number;
  order: number;
}

let modalOrderCounter = 0;
const modalStack: ModalStackEntry[] = [];
const ModalDepthContext = createContext<number>(0);

function isTopModal(token: symbol): boolean {
  if (modalStack.length === 0) return false;
  let top = modalStack[0];
  for (let i = 1; i < modalStack.length; i += 1) {
    const entry = modalStack[i];
    if (entry.depth > top.depth || (entry.depth === top.depth && entry.order > top.order)) {
      top = entry;
    }
  }
  return top.token === token;
}

interface ModalDirtyRegistration {
  dirty: boolean;
  message?: string;
}

interface ModalContextValue {
  registerDirtyState: (sourceId: string, state: ModalDirtyRegistration | null) => void;
  requestClose: (proceed: () => void) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * يسجل حالة التعديلات غير المحفوظة للنموذج داخل أقرب نافذة منبثقة،
 * ويعيد دالة لطلب الإغلاق الآمن من أزرار الإلغاء الداخلية.
 */
export function useModalDirtyGuard(isDirty: boolean, confirmMessage?: string) {
  const ctx = useContext(ModalContext);
  const sourceId = useId();
  const registerDirtyState = ctx?.registerDirtyState;
  const ctxRequestClose = ctx?.requestClose;

  useEffect(() => {
    if (!registerDirtyState) return;
    registerDirtyState(sourceId, isDirty ? { dirty: true, message: confirmMessage } : null);
    return () => {
      registerDirtyState(sourceId, null);
    };
  }, [registerDirtyState, sourceId, isDirty, confirmMessage]);

  const requestClose = useCallback(
    (proceed: () => void) => {
      if (ctxRequestClose) {
        ctxRequestClose(proceed);
      } else {
        proceed();
      }
    },
    [ctxRequestClose],
  );

  return { requestClose };
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  dismissible?: boolean;
  isDirty?: boolean;
  dirtyConfirmMessage?: string;
}

export default function Modal({
  title,
  onClose,
  children,
  className,
  backdropClassName,
  dismissible = true,
  isDirty = false,
  dirtyConfirmMessage,
}: ModalProps) {
  const depth = useContext(ModalDepthContext);
  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('modal');
  }

  const [childDirtyMap, setChildDirtyMap] = useState<Record<string, ModalDirtyRegistration>>({});
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);

  const registerDirtyState = useCallback(
    (sourceId: string, state: ModalDirtyRegistration | null) => {
      setChildDirtyMap((prev) => {
        const hadKey = Object.prototype.hasOwnProperty.call(prev, sourceId);
        if (!state) {
          if (!hadKey) return prev;
          const next = { ...prev };
          delete next[sourceId];
          return next;
        }
        const existing = prev[sourceId];
        if (existing && existing.dirty === state.dirty && existing.message === state.message) {
          return prev;
        }
        return { ...prev, [sourceId]: state };
      });
    },
    [],
  );

  const childDirtyEntries = Object.values(childDirtyMap);
  const effectiveDirty = Boolean(isDirty || childDirtyEntries.some((entry) => entry.dirty));
  const effectiveDirtyMessage =
    dirtyConfirmMessage ??
    childDirtyEntries.find((entry) => entry.dirty && entry.message)?.message ??
    DEFAULT_DIRTY_MESSAGE;

  const requestClose = useCallback(
    (proceed: () => void) => {
      if (!effectiveDirty) {
        proceed();
        return;
      }
      setPendingCloseAction(() => proceed);
    },
    [effectiveDirty],
  );

  const attemptDismiss = useCallback(() => {
    if (!dismissible) return;
    requestClose(onClose);
  }, [dismissible, requestClose, onClose]);

  useEffect(() => {
    const token = modalTokenRef.current!;
    modalOrderCounter += 1;
    modalStack.push({ token, depth, order: modalOrderCounter });
    return () => {
      const idx = modalStack.findIndex((entry) => entry.token === token);
      if (idx !== -1) {
        modalStack.splice(idx, 1);
      }
    };
  }, [depth]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !dismissible) return;
      if (!isTopModal(modalTokenRef.current!)) return;
      attemptDismiss();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [dismissible, attemptDismiss]);

  const contextValue = useMemo<ModalContextValue>(
    () => ({ registerDirtyState, requestClose }),
    [registerDirtyState, requestClose],
  );

  const modalNode = (
    <ModalDepthContext.Provider value={depth + 1}>
      <ModalContext.Provider value={contextValue}>
        <div
          className={['modal-backdrop', backdropClassName].filter(Boolean).join(' ')}
          role="presentation"
          style={depth > 0 ? { zIndex: 200 + depth * 10 } : undefined}
          onClick={() => {
            if (isTopModal(modalTokenRef.current!)) {
              attemptDismiss();
            }
          }}
        >
          <div
            className={className ? `modal ${className}` : 'modal'}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{title}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={attemptDismiss}
                aria-label="إغلاق"
                disabled={!dismissible}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
          </div>
        </div>

        {pendingCloseAction && (
          <ConfirmDialog
            title="تجاهل التغييرات؟"
            message={effectiveDirtyMessage}
            confirmLabel="تجاهل وإغلاق"
            danger
            onConfirm={() => {
              const action = pendingCloseAction;
              setPendingCloseAction(null);
              action();
            }}
            onCancel={() => setPendingCloseAction(null)}
          />
        )}
      </ModalContext.Provider>
    </ModalDepthContext.Provider>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}

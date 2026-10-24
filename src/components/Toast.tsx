import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type Listener = (toasts: ToastMessage[]) => void;
let activeToasts: ToastMessage[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener([...activeToasts]));
}

export const toast = {
  show(type: ToastType, message: string, duration = 4500) {
    if (!message || !message.trim()) return;
    const cleanMessage = message.trim();

    // Prevent identical toasts stacking
    if (activeToasts.some((t) => t.message === cleanMessage && t.type === type)) {
      return;
    }

    const id = crypto.randomUUID();
    const item: ToastMessage = { id, type, message: cleanMessage, duration };
    activeToasts = [...activeToasts, item];
    emit();

    if (duration > 0) {
      setTimeout(() => {
        toast.dismiss(id);
      }, duration);
    }
  },

  error(message: string, duration = 5000) {
    toast.show('error', message, duration);
  },

  success(message: string, duration = 3500) {
    toast.show('success', message, duration);
  },

  warning(message: string, duration = 4500) {
    toast.show('warning', message, duration);
  },

  info(message: string, duration = 4000) {
    toast.show('info', message, duration);
  },

  dismiss(id: string) {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    emit();
  },

  clear() {
    activeToasts = [];
    emit();
  },
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="الإشعارات والتنبيهات">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-item toast-${item.type}`}
          role="alert"
          aria-live={item.type === 'error' ? 'assertive' : 'polite'}
        >
          <div className="toast-icon-box">
            {item.type === 'error' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {item.type === 'warning' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
            {item.type === 'success' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {item.type === 'info' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
          </div>
          <span className="toast-message">{item.message}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => toast.dismiss(item.id)}
            aria-label="إغلاق التنبيه"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;

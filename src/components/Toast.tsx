import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

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
            {item.type === 'error' && <AlertCircle size={18} strokeWidth={2.2} />}
            {item.type === 'warning' && <AlertTriangle size={18} strokeWidth={2.2} />}
            {item.type === 'success' && <CheckCircle2 size={18} strokeWidth={2.2} />}
            {item.type === 'info' && <Info size={18} strokeWidth={2.2} />}
          </div>
          <span className="toast-message">{item.message}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => toast.dismiss(item.id)}
            aria-label="إغلاق التنبيه"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;

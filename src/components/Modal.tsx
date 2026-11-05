import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  isDirty?: boolean;
  confirmOnDismiss?: boolean;
}

export default function Modal({
  title,
  onClose,
  children,
  className,
  backdropClassName,
  isDirty = false,
  confirmOnDismiss = false,
}: ModalProps) {
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);

  const handleDismissRequest = useCallback(() => {
    if (isDirty && confirmOnDismiss) {
      setShowDiscardPrompt(true);
    } else {
      onClose();
    }
  }, [isDirty, confirmOnDismiss, onClose]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (showDiscardPrompt) {
          setShowDiscardPrompt(false);
        } else {
          handleDismissRequest();
        }
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleDismissRequest, showDiscardPrompt]);

  return (
    <div
      className={['modal-backdrop', backdropClassName].filter(Boolean).join(' ')}
      role="presentation"
      onClick={handleDismissRequest}
    >
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={handleDismissRequest} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>

        {showDiscardPrompt && (
          <div
            className="modal-discard-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="modal-discard-title"
            aria-describedby="modal-discard-message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-discard-prompt">
              <div className="modal-discard-header">
                <div className="confirm-icon-wrap danger">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 id="modal-discard-title" className="modal-discard-title">تأكيد الإغلاق</h3>
                  <p id="modal-discard-message" className="modal-discard-message">
                    توجد تعديلات غير محفوظة، هل أنت متأكد من رغبتك في الإغلاق وتجاهل التعديلات؟
                  </p>
                </div>
              </div>
              <div className="form-modal-actions confirm-actions">
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setShowDiscardPrompt(false);
                    onClose();
                  }}
                >
                  إغلاق وتجاهل التعديلات
                </button>
                <button
                  type="button"
                  className="btn primary"
                  autoFocus
                  onClick={() => setShowDiscardPrompt(false)}
                >
                  متابعة التعديل
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

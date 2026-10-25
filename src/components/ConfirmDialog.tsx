import Modal from './Modal';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} className="confirm-modal">
      <div className="confirm-dialog-content">
        <div className={`confirm-icon-wrap ${danger ? 'danger' : 'info'}`}>
          {danger ? <AlertTriangle size={24} /> : <HelpCircle size={24} />}
        </div>
        <div className="confirm-text-wrap">
          <p className="confirm-message">{message}</p>
        </div>
      </div>
      <div className="actions confirm-actions">
        <button type="button" className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn outline" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

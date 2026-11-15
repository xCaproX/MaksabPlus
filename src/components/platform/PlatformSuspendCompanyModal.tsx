import { useState, type FormEvent } from 'react';
import Modal, { ModalCancelButton } from '../Modal';
import { errorMessage } from '../../lib/errors';
import type { PlatformCompany } from '../../lib/platformAdmin';

interface PlatformSuspendCompanyModalProps {
  company: PlatformCompany;
  onClose: () => void;
  onConfirmSuspend: (suspensionReason: string) => Promise<void>;
}

export default function PlatformSuspendCompanyModal({
  company,
  onClose,
  onConfirmSuspend,
}: PlatformSuspendCompanyModalProps) {
  const [reason, setReason] = useState(company.suspension_reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirmSuspend(reason.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const initialReason = (company.suspension_reason ?? '').trim();

  return (
    <Modal
      title={`إيقاف شركة «${company.name}»`}
      onClose={onClose}
      dismissible={!busy}
      isDirty={reason.trim() !== initialReason}
    >
      <form className="stack" onSubmit={handleSubmit} aria-busy={busy}>
        <fieldset className="form-fields stack" disabled={busy}>
          <div className="alert warning" role="note">
            سيتم حجب الدخول والعمليات فورًا عن جميع مستخدمي شركة «<strong>{company.name}</strong>» لحين إعادة التفعيل، مع بقاء كافة البيانات محفوظة.
          </div>

          <label>
            <span>سبب الإيقاف الظاهر لمستخدمي الشركة (اختياري)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="مثال: برجاء تجديد الاشتراك الشهري والتواصل مع الدعم الفني على..."
              autoFocus
            />
          </label>

          <p className="hint">
            يظهر هذا النص للعميل عند محاولة الدخول، بينما تظل ملاحظات المطور سرية للمنصة فقط.
          </p>

          {error && <div className="alert error" role="alert">{error}</div>}

          <div className="form-modal-actions">
            <button type="submit" className="btn danger" disabled={busy}>
              {busy ? 'جارٍ الإيقاف…' : 'إيقاف مؤقت'}
            </button>
            <ModalCancelButton className="btn outline" onCancel={onClose} disabled={busy} label="تراجع" />
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

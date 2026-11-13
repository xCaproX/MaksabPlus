import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
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
      setError(err instanceof Error ? err.message : 'تعذر إيقاف الشركة مؤقتًا.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`إيقاف شركة «${company.name}»`}
      onClose={onClose}
      dismissible={!busy}
      isDirty={Boolean(reason)}
    >
      <form className="stack" onSubmit={handleSubmit}>
        <div className="alert warning" role="note">
          سيتم حجب الدخول والعمليات فورًا عن جميع مستخدمي شركة «<strong>{company.name}</strong>» لحين إعادة التفعيل، مع بقاء كافة البيانات محفوظة.
        </div>

        <label>
          <span>سبب الإيقاف الظاهر لمستخدمي الشركة (اختياري)</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: برجاء تجديد الاشتراك الشهري والتواصل مع الدعم الفني على..."
            autoFocus
          />
        </label>

        <p className="hint">
          يظهر هذا النص للعميل عند محاولة الدخول، بينما تظل ملاحظات المطور سرية للمنصة فقط.
        </p>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            تراجع
          </button>
          <button type="submit" className="btn danger" disabled={busy}>
            {busy ? 'جارٍ الإيقاف…' : 'إيقاف مؤقت'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

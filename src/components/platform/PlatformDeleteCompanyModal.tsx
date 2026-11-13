import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import { deletePlatformCompany, type PlatformCompany } from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformDeleteCompanyModalProps {
  company: PlatformCompany;
  onClose: () => void;
  onDeleted: (companyId: string) => Promise<void> | void;
}

export default function PlatformDeleteCompanyModal({
  company,
  onClose,
  onDeleted,
}: PlatformDeleteCompanyModalProps) {
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expectedName = company.name.trim();
  const isMatch = typedName.trim() === expectedName && expectedName.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isMatch) {
      setError('يجب كتابة اسم الشركة مطابقًا تمامًا قبل الحذف النهائي.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await deletePlatformCompany({
        companyId: company.id,
        confirmName: typedName.trim(),
      });
      if (result.failed_user_ids?.length > 0) {
        toast.error(
          `تم حذف بيانات الشركة «${expectedName}»، لكن تعذر حذف ${result.failed_user_ids.length} حساب دخول من Auth.`,
        );
      } else {
        toast.success(`تم حذف شركة «${expectedName}» وجميع بياناتها ومستخدميها نهائيًا.`);
      }
      await onDeleted(company.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الشركة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`تأكيد حذف شركة «${expectedName}» نهائيًا`}
      onClose={onClose}
      dismissible={!busy}
      isDirty={Boolean(typedName)}
    >
      <form className="stack" onSubmit={handleSubmit}>
        <div className="alert error" role="alert">
          <strong>تحذير شديد الخطورة: لا يمكن التراجع عن هذه العملية!</strong>
          <p>
            سيتم حذف جميع بيانات شركة «<strong>{expectedName}</strong>» نهائيًا، بما في ذلك الفواتير والإيصالات والمخازن والخزن والأصناف والحسابات، وحذف جميع حسابات مستخدميها (<span dir="ltr" className="tabular-nums">{company.users_count}</span>) من النظام.
          </p>
        </div>

        <label>
          <span>
            للمتابعة، اكتب اسم الشركة بالكامل: <strong className="platform-confirm-target">{expectedName}</strong>
          </span>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={expectedName}
            autoFocus
            required
          />
        </label>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            تراجع
          </button>
          <button type="submit" className="btn danger" disabled={busy || !isMatch}>
            {busy ? 'جارٍ الحذف النهائي…' : 'حذف الشركة نهائيًا'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

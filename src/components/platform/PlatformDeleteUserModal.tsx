import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import {
  deletePlatformCompanyUser,
  type PlatformCompanyUser,
} from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformDeleteUserModalProps {
  companyId: string;
  companyName: string;
  user: PlatformCompanyUser;
  isLastActiveOwner: boolean;
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
}

export default function PlatformDeleteUserModal({
  companyId,
  companyName,
  user,
  isLastActiveOwner,
  onClose,
  onDeleted,
}: PlatformDeleteUserModalProps) {
  const [typedIdentifier, setTypedIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expectedEmail = user.email.trim().toLowerCase();
  const expectedName = user.full_name.trim();
  const trimmedInput = typedIdentifier.trim();
  const isMatch =
    (expectedEmail.length > 0 && trimmedInput.toLowerCase() === expectedEmail) ||
    (expectedName.length > 0 && trimmedInput === expectedName);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLastActiveOwner) {
      setError('لا يمكن حذف آخر مالك نشط للشركة. أضف مالكًا نشطًا آخر أولًا.');
      return;
    }
    if (!isMatch) {
      setError('يجب كتابة البريد الإلكتروني أو الاسم الكامل للمستخدم مطابقًا للتأكيد.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await deletePlatformCompanyUser({
        companyId,
        userId: user.user_id,
        confirmIdentifier: trimmedInput,
      });
      if (result.auth_delete_failed) {
        toast.error(
          `تم حذف «${user.full_name || user.email}» من الشركة، لكن تعذر حذف حساب الدخول من Auth.`,
        );
      } else {
        toast.success(`تم حذف المستخدم «${user.full_name || user.email}» من شركة «${companyName}» نهائيًا.`);
      }
      await onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المستخدم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`تأكيد حذف المستخدم «${user.full_name || user.email}»`}
      onClose={onClose}
      dismissible={!busy}
      isDirty={Boolean(typedIdentifier)}
    >
      <form className="stack" onSubmit={handleSubmit}>
        {isLastActiveOwner ? (
          <div className="alert error" role="alert">
            <strong>لا يمكن حذف آخر مالك نشط للشركة</strong>
            <p>
              المستخدم «{user.full_name || user.email}» هو المالك النشط الوحيد في شركة «{companyName}». أضف مالكًا نشطًا آخر أو فعّل مالكًا بديلًا قبل الحذف.
            </p>
          </div>
        ) : (
          <>
            <div className="alert error" role="alert">
              <strong>تحذير: لا يمكن التراجع عن حذف المستخدم!</strong>
              <p>
                سيتم حذف دخول «<strong>{user.full_name || user.email}</strong>» من شركة «{companyName}» وحذف حسابه نهائيًا، مع بقاء اسم المنشئ محفوظًا على المستندات السابقة.
              </p>
            </div>

            <label>
              <span>
                للمتابعة، اكتب البريد الإلكتروني (<bdi dir="ltr" className="platform-confirm-target">{user.email}</bdi>)
                {expectedName ? ` أو الاسم (${expectedName})` : ''}:
              </span>
              <input
                type="text"
                dir="ltr"
                value={typedIdentifier}
                onChange={(e) => setTypedIdentifier(e.target.value)}
                placeholder={user.email}
                autoFocus
                required
              />
            </label>
          </>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busy}>
            تراجع
          </button>
          <button
            type="submit"
            className="btn danger"
            disabled={busy || isLastActiveOwner || !isMatch}
          >
            {busy ? 'جارٍ الحذف…' : 'حذف المستخدم نهائيًا'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

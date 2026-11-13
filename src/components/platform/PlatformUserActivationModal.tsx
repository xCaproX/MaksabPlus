import { useState } from 'react';
import { Check, Copy, Link2, Mail } from 'lucide-react';
import Modal from '../Modal';
import {
  requestPlatformUserActivation,
  type PlatformCompanyUser,
} from '../../lib/platformAdmin';
import { toast } from '../Toast';

interface PlatformUserActivationModalProps {
  companyId: string;
  companyName: string;
  user: PlatformCompanyUser;
  onClose: () => void;
}

export default function PlatformUserActivationModal({
  companyId,
  companyName,
  user,
  onClose,
}: PlatformUserActivationModalProps) {
  const [busyMode, setBusyMode] = useState<'email' | 'link' | null>(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleSendEmail() {
    setBusyMode('email');
    setError('');
    try {
      await requestPlatformUserActivation({
        companyId,
        userId: user.user_id,
        delivery: 'email',
      });
      toast.success(`تم إرسال رابط التفعيل إلى بريد «${user.email}».`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال دعوة البريد.');
    } finally {
      setBusyMode(null);
    }
  }

  async function handleGenerateLink() {
    setBusyMode('link');
    setError('');
    setCopied(false);
    try {
      const result = await requestPlatformUserActivation({
        companyId,
        userId: user.user_id,
        delivery: 'link',
      });
      if (!result.action_link) {
        throw new Error('تعذر استلام رابط التفعيل.');
      }
      setGeneratedLink(result.action_link);
      toast.success('تم إنشاء رابط التفعيل. انسخه وأرسله للمستخدم.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء رابط التفعيل.');
    } finally {
      setBusyMode(null);
    }
  }

  async function handleCopy() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast.success('تم نسخ رابط التفعيل.');
    } catch {
      toast.error('تعذر النسخ التلقائي؛ حدد الرابط وانسخه يدويًا.');
    }
  }

  return (
    <Modal
      title={`تفعيل حساب «${user.full_name || user.email}»`}
      onClose={onClose}
      dismissible={busyMode === null}
    >
      <div className="stack">
        <p className="hint">
          الحساب داخل شركة «<strong>{companyName}</strong>» ما زال بانتظار التفعيل على البريد{' '}
          <bdi dir="ltr" className="tabular-nums">{user.email}</bdi>.
        </p>

        <div className="platform-inline-actions">
          <button
            type="button"
            className="btn outline"
            onClick={() => void handleSendEmail()}
            disabled={busyMode !== null}
          >
            <Mail size={15} aria-hidden="true" />
            <span>{busyMode === 'email' ? 'جارٍ الإرسال…' : 'إرسال دعوة بالبريد'}</span>
          </button>

          <button
            type="button"
            className="btn primary"
            onClick={() => void handleGenerateLink()}
            disabled={busyMode !== null}
          >
            <Link2 size={15} aria-hidden="true" />
            <span>{busyMode === 'link' ? 'جارٍ الإنشاء…' : 'إنشاء رابط تفعيل للنسخ'}</span>
          </button>
        </div>

        {generatedLink && (
          <div className="stack platform-activation-result">
            <label>
              <span>رابط التفعيل وتعيين كلمة المرور (جاهز للإرسال عبر واتساب)</span>
              <div className="platform-copy-row">
                <input
                  type="text"
                  dir="ltr"
                  readOnly
                  value={generatedLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className="btn outline sm" onClick={() => void handleCopy()}>
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>
              </div>
            </label>
            <p className="hint">تنبيه: إنشاء رابط جديد يُبطل أي رابط تفعيل سابق أُرسل لهذا المستخدم.</p>
          </div>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="form-modal-actions">
          <button type="button" className="btn outline" onClick={onClose} disabled={busyMode !== null}>
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}

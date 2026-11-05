import { useState } from 'react';
import { Play, ShieldAlert, Sparkles } from 'lucide-react';
import Modal from '../../components/Modal';

interface RunReconciliationModalProps {
  onClose: () => void;
  onConfirm: (mode: 'reconcile' | 'simulation', notes: string) => Promise<void>;
  loading: boolean;
}

export default function RunReconciliationModal({
  onClose,
  onConfirm,
  loading,
}: RunReconciliationModalProps) {
  const [mode, setMode] = useState<'reconcile' | 'simulation'>('reconcile');
  const [notes, setNotes] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onConfirm(mode, notes);
  }

  return (
    <Modal onClose={onClose} title="بدء فحص ومطابقة الأرصدة والمخزون">
      <form onSubmit={handleSubmit} className="stack gap-4">
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
          يقوم النظام بمراجعة وتدقيق كافة حركات الدفاتر (الفواتير، الإيصالات، التحويلات، والتسويات)
          ومقارنتها بالأرصدة الحالية للعملاء والموردين والخزن النقدية وكميات المخزون.
        </p>

        <div className="stack gap-3">
          <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>نوع الفحص المطلوب:</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${mode === 'reconcile' ? 'var(--primary)' : 'var(--line)'}`,
                background: mode === 'reconcile' ? 'var(--primary-subtle, #f0fdf4)' : 'var(--bg-surface)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="reconciliation_mode"
                value="reconcile"
                checked={mode === 'reconcile'}
                onChange={() => setMode('reconcile')}
                disabled={loading}
                style={{ marginBlockStart: '3px' }}
              />
              <div>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="var(--primary)" />
                  <span>فحص وتصحيح فوري</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBlockStart: '4px' }}>
                  يكتشف الفروقات، يعيد مزامنة الأرصدة فوراً مع الدفاتر، ويوثق النتائج في السجل.
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${mode === 'simulation' ? 'var(--warning, #d97706)' : 'var(--line)'}`,
                background: mode === 'simulation' ? '#fffbeb' : 'var(--bg-surface)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="reconciliation_mode"
                value="simulation"
                checked={mode === 'simulation'}
                onChange={() => setMode('simulation')}
                disabled={loading}
                style={{ marginBlockStart: '3px' }}
              />
              <div>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={16} color="#d97706" />
                  <span>فحص استكشافي (محاكاة)</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBlockStart: '4px' }}>
                  يكتشف ويوثق أي فروقات دون تعديل أو لمس الأرصدة الحالية في الجداول.
                </div>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="reconciliation-notes" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px' }}>
            سبب أو ملاحظات الفحص (اختياري):
          </label>
          <input
            id="reconciliation-notes"
            type="text"
            className="input full-width"
            placeholder="مثال: جرد نهاية الشهر، مراجعة بعد تسوية فواتير، تدقيق دوري…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={loading}
          />
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginBlockStart: '8px' }}>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            disabled={loading}
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={loading}
          >
            <Play size={16} />
            <span>{loading ? 'جارٍ التدقيق والمطابقة…' : 'بدء الفحص الآن'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

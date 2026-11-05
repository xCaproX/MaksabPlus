import { CheckCircle2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { money } from '../../lib/format';

export interface DiscrepancyItem {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  old_balance: number;
  reconciled_balance: number;
  discrepancy: number;
}

export interface ReconcileModalData {
  isOpen: boolean;
  accountsCount: number;
  cashBoxesCount: number;
  discrepancies: DiscrepancyItem[];
}

interface ReconcileBalancesModalProps {
  data: ReconcileModalData;
  onClose: () => void;
}

export default function ReconcileBalancesModal({ data, onClose }: ReconcileBalancesModalProps) {
  return (
    <Modal onClose={onClose} title="نتيجة فحص ومطابقة الأرصدة">
      <div className="stack gap-4">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>حسابات مفحوصة</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }} className="tabular-nums" dir="ltr">
              <bdi>{data.accountsCount}</bdi>
            </div>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>خزن مفحوصة</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }} className="tabular-nums" dir="ltr">
              <bdi>{data.cashBoxesCount}</bdi>
            </div>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>فروقات تم تصحيحها</div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: data.discrepancies.length > 0 ? 'var(--warning)' : 'var(--success)',
              }}
              className="tabular-nums"
              dir="ltr"
            >
              <bdi>{data.discrepancies.length}</bdi>
            </div>
          </div>
        </div>

        {data.discrepancies.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'var(--success-light)',
              border: '1px solid var(--success-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <CheckCircle2 style={{ color: 'var(--success)', flexShrink: 0 }} size={24} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--success-hover)' }}>الأرصدة متطابقة 100%</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>
                كافة أرصدة العملاء والموردين والخزن مطابقة تماماً لحركات الدفاتر ولا توجد أي فروقات.
              </div>
            </div>
          </div>
        ) : (
          <div className="stack gap-2">
            <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
              تم اكتشاف الفروقات التالية وتمت إعادة مزامنتها تلقائياً لتطابق الدفاتر:
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>النوع</th>
                    <th>الاسم</th>
                    <th>الرصيد السابق</th>
                    <th>الرصيد بعد المطابقة</th>
                    <th>مقدار التعديل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.discrepancies.map((item) => (
                    <tr key={item.entity_id}>
                      <td>{item.entity_type === 'cash_box' ? 'خزينة' : 'حساب'}</td>
                      <td style={{ fontWeight: 600 }}>{item.entity_name}</td>
                      <td className="tabular-nums" dir="ltr">
                        <bdi>{money(item.old_balance)} ج.م</bdi>
                      </td>
                      <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600 }}>
                        <bdi>{money(item.reconciled_balance)} ج.م</bdi>
                      </td>
                      <td className="tabular-nums" dir="ltr" style={{ fontWeight: 600, color: 'var(--warning)' }}>
                        <bdi>{item.discrepancy > 0 ? `+${money(item.discrepancy)}` : money(item.discrepancy)} ج.م</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="actions" style={{ justifyContent: 'flex-end', marginBlockStart: '1rem' }}>
          <button type="button" className="btn primary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}

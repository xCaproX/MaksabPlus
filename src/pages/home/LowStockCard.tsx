import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { qty } from '../../lib/format';
import DashboardCardAction from './DashboardCardAction';

export interface LowStockItem {
  item_id: string;
  item_name: string;
  unit: string;
  code?: string;
  current_qty: number;
}

interface LowStockCardProps {
  items: LowStockItem[] | null;
}

export default function LowStockCard({ items }: LowStockCardProps) {
  if (!items) return null;

  return (
    <div className={`dashboard-card ${items.length === 0 ? 'dashboard-card--ok' : 'dashboard-card--alert'}`}>
      <div className="dashboard-card-head">
        <h3 className="dashboard-card-title">
          <AlertTriangle size={15} className="text-warning" />
          <span>نواقص المخزن (أوشكت على النفاد)</span>
        </h3>
        <DashboardCardAction to="/balances?tab=items" label="عرض أرصدة الأصناف" />
      </div>

      {items.length === 0 ? (
        <div className="empty-state-card" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={24} />
          <p style={{ margin: 0, fontWeight: 600 }}>المخزون مستقر ولا توجد نواقص حرجة حالياً</p>
        </div>
      ) : (
        <div className="low-stock-list" role="list">
          {items.map((item) => (
            <div key={item.item_id} className="low-stock-row" role="listitem">
              <div className="low-stock-item-info">
                <span className="low-stock-name">{item.item_name}</span>
                {item.code && (
                  <span className="low-stock-code">
                    كود: <bdi dir="ltr">{item.code}</bdi>
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="low-stock-qty-badge">
                  المتبقي: <bdi dir="ltr" className="num tabular-nums">{qty(item.current_qty)}</bdi> {item.unit}
                </span>

                <DashboardCardAction
                  to="/invoices?tab=purchase&action=new"
                  label="إنشاء فاتورة شراء لطلب الصنف"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <section className={items.length ? 'dashboard-card low-stock-card' : 'low-stock-stable'} aria-label="حالة المخزون">
      {items.length === 0 ? (
        <>
          <p><CheckCircle2 size={17} aria-hidden="true" /> المخزون مستقر ولا توجد نواقص حرجة حالياً</p>
          <DashboardCardAction to="/balances?tab=items" label="عرض أرصدة الأصناف" />
        </>
      ) : (
        <>
          <div className="dashboard-card-head">
            <h2 className="dashboard-card-title">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>نواقص المخزون</span>
            </h2>
            <DashboardCardAction to="/balances?tab=items" label="عرض أرصدة الأصناف" />
          </div>
          <div className="low-stock-list" role="list">
            {items.map((item) => (
              <div key={item.item_id} className="low-stock-row" role="listitem">
                <div className="low-stock-item-info">
                  <span className="low-stock-name" title={item.item_name}>{item.item_name}</span>
                  {item.code && (
                    <span className="low-stock-code">
                      كود: <bdi dir="ltr">{item.code}</bdi>
                    </span>
                  )}
                </div>

                <div className="low-stock-actions">
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
        </>
      )}
    </section>
  );
}

import { Wallet, Users, Truck } from 'lucide-react';
import DashboardCardAction from './DashboardCardAction';
import { money } from '../../lib/format';

interface FinancialPulseCardsProps {
  cashBalance: number | null;
  receivablesBalance: number | null;
  payablesBalance: number | null;
}

export default function FinancialPulseCards({
  cashBalance,
  receivablesBalance,
  payablesBalance,
}: FinancialPulseCardsProps) {
  const hasAny = cashBalance !== null || receivablesBalance !== null || payablesBalance !== null;
  if (!hasAny) return null;

  return (
    <section className="home-sales-section" aria-label="النبض المالي والأرصدة">
      <div className="home-financial-grid">
        {/* الفلوس في الخزن */}
        {cashBalance !== null && (
          <div className="financial-pulse-card metric-card metric-card-success">
            <div className="metric-card-icon fin-icon-box" aria-hidden="true">
              <Wallet size={17} />
            </div>
            <div className="fin-content">
              <span className="fin-label">الفلوس في الخزن</span>
              <div className="fin-value-group">
                <bdi dir="ltr" className="fin-value num tabular-nums">
                  {money(cashBalance)}
                </bdi>
                <span className="fin-unit">ج.م</span>
              </div>
            </div>
            <DashboardCardAction to="/balances?tab=cashBoxes" label="عرض كشف الخزن" />
          </div>
        )}

        {/* مستحقات العملاء */}
        {receivablesBalance !== null && (
          <div className="financial-pulse-card metric-card metric-card-info">
            <div className="metric-card-icon fin-icon-box" aria-hidden="true">
              <Users size={17} />
            </div>
            <div className="fin-content">
              <span className="fin-label">فلوسنا في السوق (العملاء)</span>
              <div className="fin-value-group">
                <bdi dir="ltr" className="fin-value num tabular-nums">
                  {money(receivablesBalance)}
                </bdi>
                <span className="fin-unit">ج.م</span>
              </div>
            </div>
            <DashboardCardAction to="/balances?tab=customers" label="عرض أرصدة العملاء" />
          </div>
        )}

        {/* ديون الموردين */}
        {payablesBalance !== null && (
          <div className="financial-pulse-card metric-card metric-card-warning">
            <div className="metric-card-icon fin-icon-box" aria-hidden="true">
              <Truck size={17} />
            </div>
            <div className="fin-content">
              <span className="fin-label">ديون الموردين (التزامات)</span>
              <div className="fin-value-group">
                <bdi dir="ltr" className="fin-value num tabular-nums">
                  {money(payablesBalance)}
                </bdi>
                <span className="fin-unit">ج.م</span>
              </div>
            </div>
            <DashboardCardAction to="/balances?tab=suppliers" label="عرض حسابات الموردين" />
          </div>
        )}
      </div>
    </section>
  );
}

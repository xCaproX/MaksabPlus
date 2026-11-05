import { Wallet, Users, Truck, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
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
          <div className="financial-pulse-card">
            <div className="fin-icon-box fin-cash">
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
            <Link
              to="/balances?tab=cashBoxes"
              className="dashboard-card-action"
              title="عرض كشف الخزن"
            >
              <ArrowLeft size={16} />
            </Link>
          </div>
        )}

        {/* مستحقات العملاء */}
        {receivablesBalance !== null && (
          <div className="financial-pulse-card">
            <div className="fin-icon-box fin-receivables">
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
            <Link
              to="/balances?tab=customers"
              className="dashboard-card-action"
              title="عرض أرصدة العملاء"
            >
              <ArrowLeft size={16} />
            </Link>
          </div>
        )}

        {/* ديون الموردين */}
        {payablesBalance !== null && (
          <div className="financial-pulse-card">
            <div className="fin-icon-box fin-payables">
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
            <Link
              to="/balances?tab=suppliers"
              className="dashboard-card-action"
              title="عرض حسابات الموردين"
            >
              <ArrowLeft size={16} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

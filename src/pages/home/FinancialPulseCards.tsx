import { ArrowLeft, Truck, Users, Wallet } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import MoneyDisplay from '../../components/MoneyDisplay';

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
  const balanceId = useId();
  const balances = [
    {
      tab: 'cashBoxes', balance: cashBalance, icon: Wallet,
      label: 'الفلوس في الخزن', action: 'عرض كشف الخزن',
    },
    {
      tab: 'customers', balance: receivablesBalance, icon: Users,
      label: 'فلوسنا في السوق (العملاء)', action: 'عرض أرصدة العملاء',
    },
    {
      tab: 'suppliers', balance: payablesBalance, icon: Truck,
      label: 'ديون الموردين (التزامات)', action: 'عرض حسابات الموردين',
    },
  ].filter(({ balance }) => balance !== null);

  if (!balances.length) return null;

  return (
    <section className="home-financial-grid" aria-label="النبض المالي والأرصدة">
      {balances.map(({ tab, balance, icon: Icon, label, action }) => (
        <Link
          key={tab}
          to={`/balances?tab=${tab}`}
          className="financial-pulse-card"
          aria-label={action}
          aria-describedby={`${balanceId}-${tab}`}
          title={action}
        >
          <span className="fin-icon-box"><Icon size={18} aria-hidden="true" /></span>
          <span className="fin-content" id={`${balanceId}-${tab}`}>
            <span className="fin-label">{label}</span>
            <MoneyDisplay value={balance} currency className="fin-value" />
          </span>
          <ArrowLeft className="fin-arrow" size={16} aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}

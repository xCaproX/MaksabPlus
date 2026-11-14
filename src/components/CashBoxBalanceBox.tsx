import MoneyDisplay from './MoneyDisplay';

interface CashBoxBalanceBoxProps {
  label: string;
  balance: number | null;
  danger?: boolean;
}

/** عرض موحد لرصيد الخزنة المتاح/الحالي بجانب قائمة الخزنة في الإيصالات والفواتير */
export default function CashBoxBalanceBox({
  label,
  balance,
  danger = false,
}: CashBoxBalanceBoxProps) {
  const isDanger = Boolean(danger || (balance !== null && balance < 0));
  return (
    <div className="field-cashbox-balance">
      <span className="field-label-text">{label}</span>
      <div className={`readonly-val-box cashbox-balance-box ${isDanger ? 'is-danger' : ''}`.trim()}>
        {balance !== null ? (
          <MoneyDisplay value={balance} tone={isDanger ? 'danger' : 'default'} />
        ) : (
          '—'
        )}
      </div>
    </div>
  );
}

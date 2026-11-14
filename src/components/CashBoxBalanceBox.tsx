import MoneyDisplay from './MoneyDisplay';

interface CashBoxBalanceBoxProps {
  balance: number | null;
  danger?: boolean;
  ariaLabel?: string;
}

/** عرض موحد لرصيد الخزنة المتاح/الحالي بجانب قائمة الخزنة في الإيصالات والفواتير */
export default function CashBoxBalanceBox({
  balance,
  danger = false,
  ariaLabel = 'رصيد الخزنة',
}: CashBoxBalanceBoxProps) {
  const isDanger = Boolean(danger || (balance !== null && balance < 0));
  return (
    <div className="field-cashbox-balance">
      <div
        className={`readonly-val-box cashbox-balance-box ${isDanger ? 'is-danger' : ''}`.trim()}
        aria-label={ariaLabel}
      >
        {balance !== null ? (
          <MoneyDisplay value={balance} tone={isDanger ? 'danger' : 'default'} />
        ) : (
          '—'
        )}
      </div>
    </div>
  );
}

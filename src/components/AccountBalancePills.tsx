import { money, getBalanceStatus } from '../lib/format';
import type { AccountKind } from '../lib/types';

export interface AccountBalancePillsProps {
  accountKind?: AccountKind;
  balanceBefore: number;
  delta: number;
  balanceAfter: number;
  titleBefore?: string;
  deltaLabel?: string;
  titleAfter?: string;
}

export default function AccountBalancePills({
  accountKind = 'customer',
  balanceBefore,
  delta,
  balanceAfter,
  titleBefore = 'المديونية قبل:',
  deltaLabel = 'صافي المستند:',
  titleAfter = 'المديونية بعد:',
}: AccountBalancePillsProps) {
  const statusBefore = getBalanceStatus(balanceBefore, accountKind);
  const statusAfter = getBalanceStatus(balanceAfter, accountKind);

  return (
    <div className="account-balance-pills" aria-label="موقف مديونية الحساب">
      <div className="stat-pill">
        <span>{titleBefore}</span>
        <strong dir="ltr" className="num">
          {money(Math.abs(balanceBefore))}
        </strong>
        <span className={`stat-pill-tag tag-${statusBefore.type}`}>
          {statusBefore.text}
        </span>
      </div>

      <div className="stat-pill">
        <span>{deltaLabel}</span>
        <strong dir="ltr" className="num">
          {money(delta)}
        </strong>
      </div>

      <div className="stat-pill">
        <span>{titleAfter}</span>
        <strong dir="ltr" className="num">
          {money(Math.abs(balanceAfter))}
        </strong>
        <span className={`stat-pill-tag tag-${statusAfter.type}`}>
          {statusAfter.text}
        </span>
      </div>
    </div>
  );
}

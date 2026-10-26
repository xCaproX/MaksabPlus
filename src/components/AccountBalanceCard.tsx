import { money, round2 } from '../lib/format';
import type { AccountKind } from '../lib/types';

interface AccountBalanceCardProps {
  accountKind?: AccountKind;
  balanceBefore: number;
  delta: number;
  balanceAfter: number;
  titleBefore?: string;
  deltaLabel?: string;
  titleAfter?: string;
}

export default function AccountBalanceCard({
  accountKind = 'customer',
  balanceBefore,
  delta,
  balanceAfter,
  titleBefore = 'الرصيد قبل',
  deltaLabel = 'صافي مديونية',
  titleAfter = 'الرصيد بعد',
}: AccountBalanceCardProps) {
  const isCust = accountKind === 'customer';

  // Helper for balance badge
  function renderBalanceBadge(amount: number) {
    const rounded = round2(amount);
    if (rounded === 0) {
      return <span className="badge ok">خالص</span>;
    }
    if (isCust) {
      return rounded > 0 ? (
        <span className="badge danger">عليه</span>
      ) : (
        <span className="badge ok">له</span>
      );
    } else {
      return rounded > 0 ? (
        <span className="badge ok">له</span>
      ) : (
        <span className="badge danger">عليه</span>
      );
    }
  }

  // Helper for delta badge
  function renderDeltaBadge(d: number) {
    const rounded = round2(d);
    if (rounded === 0) {
      return (
        <span className="badge neutral symbol-badge symbol-dot" title="ثبات وعدم التغيير" aria-label="ثبات وعدم التغيير">
          •
        </span>
      );
    }
    if (rounded > 0) {
      return (
        <span className="badge ok symbol-badge" title="زيادة" aria-label="زيادة">
          +
        </span>
      );
    }
    return (
      <span className="badge danger symbol-badge" title="نقصان" aria-label="نقصان">
        -
      </span>
    );
  }

  const roundedDelta = round2(delta);
  const deltaFormatted = money(Math.abs(roundedDelta));

  return (
    <div className="form-account-balance-card" aria-label="موقف حساب العميل/المورد">
      {/* 1. الرصيد قبل */}
      <div className="balance-card-col">
        <span className="balance-card-label">{titleBefore}</span>
        <div className="balance-val-group">
          <span dir="ltr" className="balance-card-val num">
            {money(Math.abs(round2(balanceBefore)))}
          </span>
          {renderBalanceBadge(balanceBefore)}
        </div>
      </div>

      {/* 2. الصافي / الحركة */}
      <div className="balance-card-col">
        <span className="balance-card-label">{deltaLabel}</span>
        <div className="balance-val-group">
          <span dir="ltr" className="balance-card-val num">
            {deltaFormatted}
          </span>
          {renderDeltaBadge(delta)}
        </div>
      </div>

      {/* 3. الرصيد بعد (الأبرز والأهم بصرياً) */}
      <div className="balance-card-col highlight balance-after-col">
        <span className="balance-card-label highlight-label">{titleAfter}</span>
        <div className="balance-val-group">
          <strong dir="ltr" className="balance-card-val highlight-val num">
            {money(Math.abs(round2(balanceAfter)))}
          </strong>
          {renderBalanceBadge(balanceAfter)}
        </div>
      </div>
    </div>
  );
}

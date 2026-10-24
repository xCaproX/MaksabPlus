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
  titleBefore = 'الرصيد قبل الفاتورة',
  deltaLabel = 'صافي حركة الفاتورة',
  titleAfter = 'الرصيد بعد الفاتورة',
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
      return <span className="badge">لا تغيير</span>;
    }
    if (isCust) {
      return rounded > 0 ? (
        <span className="badge danger">زيادة دين</span>
      ) : (
        <span className="badge ok">تخفيض دين</span>
      );
    } else {
      return rounded > 0 ? (
        <span className="badge ok">مستحق له</span>
      ) : (
        <span className="badge danger">خصم مستحق</span>
      );
    }
  }

  const roundedDelta = round2(delta);
  const deltaFormatted =
    roundedDelta > 0
      ? `+${money(roundedDelta)}`
      : roundedDelta < 0
      ? `-${money(Math.abs(roundedDelta))}`
      : money(0);

  return (
    <div className="form-account-balance-card" aria-label="موقف حساب العميل/المورد">
      {/* 1. الرصيد قبل */}
      <div className="balance-card-row">
        <span className="balance-card-label">{titleBefore}</span>
        <div className="balance-val-group">
          <span dir="ltr" className="balance-card-val num">
            {money(Math.abs(round2(balanceBefore)))}
          </span>
          {renderBalanceBadge(balanceBefore)}
        </div>
      </div>

      {/* 2. الصافي / الحركة */}
      <div className="balance-card-row">
        <span className="balance-card-label">{deltaLabel}</span>
        <div className="balance-val-group">
          <span dir="ltr" className="balance-card-val num">
            {deltaFormatted}
          </span>
          {renderDeltaBadge(delta)}
        </div>
      </div>

      {/* 3. الرصيد بعد (الأبرز والأهم بصرياً) */}
      <div className="balance-card-row highlight balance-after-row">
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

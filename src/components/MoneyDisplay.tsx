import { money } from '../lib/format';

export interface MoneyDisplayProps {
  value: number | string | null | undefined;
  currency?: boolean | string;
  className?: string;
  strong?: boolean;
  /** لون دلالي اختياري للقيمة (اتركها افتراضياً للون النص العادي) */
  tone?: 'default' | 'success' | 'primary' | 'danger';
}

/**
 * مكون مركزي موحد لعرض المبالغ والعملات المالية
 * يضمن تطبيق dir="ltr" و tabular-nums و bdi لمنع أخطاء BiDi في بيئة RTL
 */
export default function MoneyDisplay({
  value,
  currency = false,
  className = '',
  strong = false,
  tone = 'default',
}: MoneyDisplayProps) {
  const formatted = money(value);
  const currencyLabel = typeof currency === 'string' ? currency : currency ? 'ج.م' : null;
  const toneClass = tone !== 'default' ? `money-${tone}` : '';

  return (
    <span
      dir="ltr"
      className={`num tabular-nums ${strong ? 'strong' : ''} ${toneClass} ${className}`.trim()}
    >
      <bdi>{formatted}</bdi>
      {currencyLabel && <span className="currency-suffix" dir="rtl"> {currencyLabel}</span>}
    </span>
  );
}

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  revealed?: boolean;
  onToggleReveal?: () => void;
}

/**
 * حقل كلمة مرور موحد مزود بزر إظهار/إخفاء قابل للوصول عبر لوحة المفاتيح.
 */
export default function PasswordInput({
  className = '',
  revealed,
  onToggleReveal,
  ...rest
}: PasswordInputProps) {
  const [internalRevealed, setInternalRevealed] = useState(false);
  const isRevealed = revealed ?? internalRevealed;
  const handleToggle = onToggleReveal ?? (() => setInternalRevealed((prev) => !prev));

  return (
    <div className="pwd-input-wrap">
      <input
        {...rest}
        type={isRevealed ? 'text' : 'password'}
        className={`pwd-input pwd-password-input ${className}`.trim()}
      />
      <button
        type="button"
        className="icon-btn pwd-eye-btn"
        onClick={handleToggle}
        aria-pressed={isRevealed}
        title={isRevealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        aria-label={isRevealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

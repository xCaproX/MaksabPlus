import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

interface DateInputProps {
  value: string; // ISO format: YYYY-MM-DD
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

/** Convert ISO 'YYYY-MM-DD' to display 'DD/MM/YYYY' */
function toDisplay(iso: string): string {
  if (!iso || !iso.includes('-')) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/** Convert display 'DD/MM/YYYY' or typed input to ISO 'YYYY-MM-DD' */
function toIso(display: string): string | null {
  const parts = display.trim().split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

export default function DateInput({
  value,
  onChange,
  required = false,
  disabled = false,
  id,
  ariaLabel = 'التاريخ',
  className = '',
}: DateInputProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  function handleTextChange(e: ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/[^\d/]/g, '');

    // Auto-insert slashes as user types numbers
    if (raw.length === 2 && !raw.includes('/')) {
      raw = `${raw}/`;
    } else if (raw.length === 5 && raw.split('/').length === 2) {
      raw = `${raw}/`;
    }

    if (raw.length <= 10) {
      setText(raw);
      const iso = toIso(raw);
      if (iso) {
        onChange(iso);
      }
    }
  }

  function handleBlur() {
    const iso = toIso(text);
    if (iso) {
      onChange(iso);
      setText(toDisplay(iso));
    } else if (value) {
      // Revert to current valid value if typed input is incomplete
      setText(toDisplay(value));
    }
  }

  function handlePickerClick() {
    if (disabled) return;
    try {
      if (hiddenDateRef.current && 'showPicker' in HTMLInputElement.prototype) {
        hiddenDateRef.current.showPicker();
      } else {
        hiddenDateRef.current?.focus();
        hiddenDateRef.current?.click();
      }
    } catch {
      hiddenDateRef.current?.focus();
    }
  }

  return (
    <div className={`date-input-wrap ${disabled ? 'disabled' : ''} ${className}`.trim()}>
      <input
        type="text"
        id={id}
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        dir="ltr"
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className="date-input-text num"
      />
      <button
        type="button"
        tabIndex={-1}
        className="date-picker-trigger"
        onClick={handlePickerClick}
        disabled={disabled}
        aria-label="اختيار التاريخ من التقويم"
      >
        <CalendarIcon size={16} />
      </button>

      {/* Invisible native picker to leverage browser calendar */}
      <input
        ref={hiddenDateRef}
        type="date"
        value={value}
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
            setText(toDisplay(e.target.value));
          }
        }}
        className="date-hidden-picker"
        aria-hidden="true"
      />
    </div>
  );
}

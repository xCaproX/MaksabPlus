import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

export interface PickerInputProps {
  kind: 'date' | 'time';
  value: string; // ISO date or HH:MM
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
  showPicker?: boolean;
  placeholder?: string;
}

/** Convert ISO 'YYYY-MM-DD' to display 'DD/MM/YYYY' */
function toDisplay(iso: string): string {
  if (!iso || !iso.includes('-')) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}/\u200f${m.padStart(2, '0')}/\u200f${y}`;
}

/** Convert display 'DD/MM/YYYY' or typed input to ISO 'YYYY-MM-DD' */
function toIso(display: string): string | null {
  const clean = display.replace(/\u200f/g, '').trim();
  const parts = clean.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

export default function PickerInput({
  kind,
  value,
  onChange,
  required = false,
  disabled = false,
  id,
  ariaLabel,
  className = '',
  showPicker = true,
  placeholder,
}: PickerInputProps) {
  const display = kind === 'date' ? toDisplay : (raw: string) => raw.slice(0, 5);
  const parse = kind === 'date' ? toIso : (raw: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
  const [text, setText] = useState(() => display(value));
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(kind === 'date' ? toDisplay(value) : value.slice(0, 5));
  }, [value, kind]);

  function handleTextChange(e: ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/\u200f/g, '').replace(kind === 'date' ? /[^\d/]/g : /[^\d:]/g, '');
    const separator = kind === 'date' ? '/' : ':';
    if (raw.length === 2 && !raw.includes(separator)) raw += separator;
    else if (kind === 'date' && raw.length === 5 && raw.split('/').length === 2) raw += '/';
    if (raw.length <= (kind === 'date' ? 10 : 5)) {
      if (kind === 'date') {
        const parts = raw.split('/');
        const rlmVal = parts.join('/\u200f');
        setText(rlmVal);
      } else {
        setText(raw);
      }
      const parsed = parse(raw);
      if (!raw) onChange('');
      else if (parsed) onChange(parsed);
    }
  }

  function handleBlur() {
    const iso = parse(text);
    if (iso) {
      onChange(iso);
      setText(display(iso));
    } else {
      // Incomplete picker values never remain visible as active filters.
      setText(display(value));
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
    <div className={`date-input-wrap picker-input ${disabled ? 'disabled' : ''} ${className}`.trim()}>
      <input
        type="text"
        id={id}
        inputMode="numeric"
        placeholder={placeholder ?? (kind === 'date' ? 'يوم/شهر/سنة' : 'HH:MM')}
        dir={kind === 'date' ? 'rtl' : 'ltr'}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel ?? (kind === 'date' ? 'التاريخ' : 'الوقت')}
        className="date-input-text num"
      />
      {showPicker && <button
        type="button"
        tabIndex={-1}
        className="date-picker-trigger"
        onClick={handlePickerClick}
        disabled={disabled}
        aria-label={kind === 'date' ? 'اختيار التاريخ من التقويم' : 'اختيار الوقت'}
      >
        {kind === 'date' ? <CalendarIcon size={16} /> : <Clock size={16} />}
      </button>}

      {/* Invisible native picker to leverage browser calendar */}
      <input
        ref={hiddenDateRef}
        type={kind}
        value={value}
        step={kind === 'time' ? 60 : undefined}
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
            setText(display(e.target.value));
          }
        }}
        className="date-hidden-picker"
        aria-hidden="true"
      />
    </div>
  );
}

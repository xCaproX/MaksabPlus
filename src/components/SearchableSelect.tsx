import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface SearchOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'اختر…',
  searchPlaceholder = 'اكتب للبحث عن حساب…',
  emptyMessage = 'لا توجد حسابات مطابقة',
  required = false,
  disabled = false,
}: SearchableSelectProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  function choose(option: SearchOption) {
    onChange(option.value);
    setQuery('');
    setActiveIndex(-1);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const option = filteredOptions[activeIndex >= 0 ? activeIndex : 0];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className="searchable-select" ref={containerRef}>
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        value={open ? query : selected?.label ?? ''}
        placeholder={open ? searchPlaceholder : placeholder}
        onFocus={() => {
          setQuery('');
          setActiveIndex(-1);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setQuery('');
            setActiveIndex(-1);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
          onChange('');
        }}
        onKeyDown={handleKeyDown}
        required={required}
        disabled={disabled}
      />
      {open && !disabled && (
        <div className="searchable-select-options" id={`${id}-options`} role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              id={`${id}-option-${index}`}
              className={index === activeIndex ? 'searchable-select-option active' : 'searchable-select-option'}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          )) : (
            <div className="searchable-select-empty">{emptyMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}

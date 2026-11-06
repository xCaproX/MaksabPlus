import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

export interface SearchOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  options?: SearchOption[];
  loadOptions?: (query: string) => Promise<SearchOption[]>;
  onChange: (value: string) => void;
  onSelectOption?: (option: SearchOption) => void;
  selectedLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  showIcon?: boolean;
  portal?: boolean;
  label?: string;
  inputRef?: Ref<HTMLInputElement>;
  onBarcodeScan?: (code: string) => void;
}

export default function SearchableSelect({
  value,
  options,
  loadOptions,
  onChange,
  onSelectOption,
  selectedLabel,
  placeholder = 'اختر…',
  searchPlaceholder = 'اكتب للبحث…',
  emptyMessage = 'لا توجد نتائج مطابقة',
  loadingMessage = 'جاري البحث…',
  required = false,
  disabled = false,
  className = '',
  ariaLabel,
  showIcon = true,
  portal = false,
  label,
  inputRef,
  onBarcodeScan,
}: SearchableSelectProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState({ start: 0, top: 0, width: 180, height: 260 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const isAsync = Boolean(loadOptions);
  const [asyncOptions, setAsyncOptions] = useState<SearchOption[]>([]);
  const [loadingAsync, setLoadingAsync] = useState(false);
  const [savedOption, setSavedOption] = useState<SearchOption | null>(null);

  // الخيارات الفعالة
  const effectiveOptions = useMemo(() => {
    if (!isAsync) return options ?? [];

    // في النمط غير المتزامن، نحرص على عدم فقدان الخيار المحدد حاليًا
    if (value && !asyncOptions.some((o) => o.value === value)) {
      if (savedOption && savedOption.value === value) {
        return [savedOption, ...asyncOptions];
      }
      if (selectedLabel) {
        return [{ value, label: selectedLabel }, ...asyncOptions];
      }
    }
    return asyncOptions;
  }, [isAsync, options, asyncOptions, value, savedOption, selectedLabel]);

  const selected = effectiveOptions.find((option) => option.value === value);

  // تصفية الخيارات في النمط المتزامن
  const filteredOptions = useMemo(() => {
    if (isAsync) return effectiveOptions;
    return effectiveOptions.filter((option) =>
      option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    );
  }, [isAsync, effectiveOptions, query]);

  // إغلاق القائمة عند النقر بالخارج
  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  // Table filters must not widen their cells; render their menu outside the
  // scrolling table so short/empty lists cannot clip the available choices.
  useLayoutEffect(() => {
    if (!portal || !open) return;
    function positionMenu() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const showAbove = below < 120 && above > below;
      const height = Math.max(36, Math.min(260, showAbove ? above : below));
      const start = document.documentElement.dir === 'rtl' ? window.innerWidth - rect.right : rect.left;
      setPopupPosition({ start: Math.max(8, Math.min(start, window.innerWidth - width - 8)),
        top: showAbove ? rect.top - height - 5 : rect.bottom + 5, width, height });
    }
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [portal, open]);

  // جلب البيانات لحظيًا مع تأخير (Debounce 250ms) في النمط غير المتزامن
  useEffect(() => {
    if (!isAsync || !open) return;

    let active = true;
    setLoadingAsync(true);

    const timer = setTimeout(async () => {
      try {
        const results = await loadOptions!(query);
        if (active) {
          setAsyncOptions(results || []);
        }
      } catch (err) {
        console.error('Failed to load async options in SearchableSelect:', err);
      } finally {
        if (active) {
          setLoadingAsync(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isAsync, open, query, loadOptions]);

  function choose(option: SearchOption) {
    setSavedOption(option);
    onChange(option.value);
    onSelectOption?.(option);
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
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const currentQuery = query.trim();

      // مسح الباركود السريع
      if (onBarcodeScan && currentQuery) {
        onBarcodeScan(currentQuery);
        setQuery('');
        setOpen(false);
        return;
      }

      if (open) {
        const option = filteredOptions[activeIndex >= 0 ? activeIndex : 0];
        if (option) choose(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const displayPlaceholder = open
    ? (selected ? selected.label : searchPlaceholder)
    : (selected ? selected.label : placeholder);

  const menu = open && !disabled ? (
    <div ref={popupRef} style={portal ? { position: 'fixed', insetInlineStart: popupPosition.start,
          insetInlineEnd: 'auto', insetBlockStart: popupPosition.top, inlineSize: popupPosition.width,
          maxBlockSize: popupPosition.height, zIndex: 1000 } : undefined} className="searchable-select-options" id={`${id}-options`} role="listbox">
          {loadingAsync && filteredOptions.length === 0 ? (
            <div className="searchable-select-loading">
              <Loader2 size={14} className="spinner-icon" />
              <span>{loadingMessage}</span>
            </div>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  id={`${id}-option-${index}`}
                  className={`searchable-select-option ${index === activeIndex ? 'active' : ''} ${isSelected ? 'selected' : ''}`.trim()}
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  disabled={option.disabled}
                >
                  <div className="searchable-select-option-content">
                    <span>{option.label}</span>
                    {option.sublabel && (
                      <span className="searchable-select-sublabel">{option.sublabel}</span>
                    )}
                  </div>
                  {isSelected && <Check size={14} className="searchable-select-check" />}
                </button>
              );
            })
          ) : (
            <div className="searchable-select-empty">{emptyMessage}</div>
          )}
        </div>
  ) : null;

  return (
    <div
      className={`searchable-select ${open ? 'is-open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
      data-value={value}
      ref={containerRef}
    >
      {label && <label className="filter-label" htmlFor={`${id}-input`}>{label}</label>}
      <div className="searchable-select-input-wrap">
        <input
          id={`${id}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-label={ariaLabel ?? label}
          aria-controls={`${id}-options`}
          aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          value={open ? query : selected?.label ?? selectedLabel ?? ''}
          placeholder={displayPlaceholder}
          onFocus={() => {
            if (!disabled) {
              setQuery('');
              setActiveIndex(-1);
              setOpen(true);
            }
          }}
          onClick={() => {
            if (!disabled && !open) {
              setQuery('');
              setActiveIndex(-1);
              setOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          required={required && !value}
          disabled={disabled}
        />
        {showIcon && <div className="searchable-select-arrow" aria-hidden="true">
          {loadingAsync ? (
            <Loader2 size={15} className="spinner-icon" />
          ) : (
            <ChevronDown size={15} />
          )}
        </div>}
      </div>
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}

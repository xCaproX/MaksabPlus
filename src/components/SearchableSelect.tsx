import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { normalizeDigits } from '../lib/format';

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
  const loadOptionsRef = useRef(loadOptions);
  loadOptionsRef.current = loadOptions;
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [asyncOptions, setAsyncOptions] = useState<SearchOption[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [loadingAsync, setLoadingAsync] = useState(false);
  const [savedOption, setSavedOption] = useState<SearchOption | null>(null);

  const trimmedQuery = normalizeDigits(query).trim();

  // الخيارات الفعالة
  const effectiveOptions = useMemo(() => {
    if (!isAsync) return options ?? [];

    // في النمط غير المتزامن، نحرص على عدم فقدان الخيار المحدد حاليًا عند فتح القائمة بدون بحث
    if (!trimmedQuery && value && !asyncOptions.some((o) => o.value === value)) {
      if (savedOption && savedOption.value === value) {
        return [savedOption, ...asyncOptions];
      }
      if (selectedLabel) {
        return [{ value, label: selectedLabel }, ...asyncOptions];
      }
    }
    return asyncOptions;
  }, [isAsync, options, asyncOptions, trimmedQuery, value, savedOption, selectedLabel]);

  const selected = useMemo(() => {
    const fromEffective = effectiveOptions.find((option) => option.value === value);
    if (fromEffective) return fromEffective;
    if (savedOption && savedOption.value === value) return savedOption;
    const fromStatic = options?.find((option) => option.value === value);
    if (fromStatic) return fromStatic;
    if (value && selectedLabel) return { value, label: selectedLabel };
    return undefined;
  }, [effectiveOptions, savedOption, options, value, selectedLabel]);

  // تصفية الخيارات في النمط المتزامن
  const filteredOptions = useMemo(() => {
    if (isAsync) return effectiveOptions;
    const lowered = trimmedQuery.toLocaleLowerCase();
    return effectiveOptions.filter((option) =>
      normalizeDigits(option.label).toLocaleLowerCase().includes(lowered),
    );
  }, [isAsync, effectiveOptions, trimmedQuery]);

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

  // جلب البيانات لحظيًا مع تأخير (Debounce 250ms) في النمط غير المتزامن وحفظ ترتيب الطلبات
  useEffect(() => {
    if (!isAsync || !open) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setLoadingAsync(false);
      setResolvedQuery(null);
      return;
    }

    let active = true;
    const activeQuery = query;
    const requestId = ++requestIdRef.current;
    setLoadingAsync(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const loader = loadOptionsRef.current;
        const results = loader ? await loader(activeQuery) : [];
        if (active && requestId === requestIdRef.current) {
          setAsyncOptions(results || []);
          setResolvedQuery(activeQuery);
        }
      } catch (err) {
        console.error('Failed to load async options in SearchableSelect:', err);
      } finally {
        if (active && requestId === requestIdRef.current) {
          setLoadingAsync(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isAsync, open, query]);

  function findNextEnabledIndex(startIndex: number, step: 1 | -1): number {
    if (filteredOptions.length === 0) return -1;
    let idx = startIndex;
    for (let tried = 0; tried < filteredOptions.length; tried += 1) {
      idx += step;
      if (idx < 0) idx = 0;
      if (idx >= filteredOptions.length) idx = filteredOptions.length - 1;
      if (!filteredOptions[idx]?.disabled) return idx;
      if ((step === -1 && idx === 0) || (step === 1 && idx === filteredOptions.length - 1)) {
        break;
      }
    }
    return startIndex >= 0 && !filteredOptions[startIndex]?.disabled ? startIndex : -1;
  }

  function choose(option: SearchOption) {
    if (option.disabled) return;
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
      setActiveIndex((current) => findNextEnabledIndex(current, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => findNextEnabledIndex(current < 0 ? filteredOptions.length : current, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const currentQuery = normalizeDigits(query.trim());

      if (open && activeIndex >= 0 && filteredOptions[activeIndex] && !filteredOptions[activeIndex].disabled) {
        choose(filteredOptions[activeIndex]);
        return;
      }

      if (isAsync && query !== resolvedQuery) {
        if (onBarcodeScan && currentQuery) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          requestIdRef.current += 1;
          setLoadingAsync(false);
          onBarcodeScan(currentQuery);
          setQuery('');
          setActiveIndex(-1);
          setOpen(false);
        }
        return;
      }

      const firstEnabled = filteredOptions.find((option) => !option.disabled);
      if (open && !loadingAsync && firstEnabled) {
        choose(firstEnabled);
        return;
      }

      // مسح الباركود السريع عند عدم وجود خيار مطابق في القائمة أو أثناء الإدخال السريع للباركود
      if (onBarcodeScan && currentQuery) {
        onBarcodeScan(currentQuery);
        setQuery('');
        setActiveIndex(-1);
        setOpen(false);
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

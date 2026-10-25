import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  subLabel?: string
  meta?: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | null
  onChange?: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  clearable?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  searchPlaceholder = "بحث...",
  emptyMessage = "لا توجد نتائج",
  disabled,
  clearable = true,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = React.useMemo(() => {
    return options.find((opt) => opt.value === value)
  }, [options, value])

  const filtered = React.useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q)
      const matchSub = opt.subLabel?.toLowerCase().includes(q)
      const matchMeta = opt.meta?.toLowerCase().includes(q)
      return matchLabel || matchSub || matchMeta
    })
  }, [options, query])

  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery("")
    }
  }, [open])

  const handleSelect = (val: string) => {
    onChange?.(val)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span
              className={cn(
                "truncate text-start",
                !selectedOption && "text-muted-foreground"
              )}
            >
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <div className="flex items-center gap-1">
              {clearable && value && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onChange?.(null)
                    }
                  }}
                  className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label="مسح الاختيار"
                >
                  <XIcon className="size-3" />
                </span>
              )}
              <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground opacity-60" />
            </div>
          </button>
        }
      />
      <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-[220px] p-1">
        <div className="flex items-center border-b border-border px-2 pb-1.5 pt-1">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground me-2" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-start transition-colors outline-none",
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted focus:bg-muted text-foreground",
                    opt.disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  <div className="flex flex-col truncate">
                    <span>{opt.label}</span>
                    {opt.subLabel && (
                      <span className="text-xs text-muted-foreground">
                        {opt.subLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {opt.meta && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {opt.meta}
                      </span>
                    )}
                    {isSelected && <CheckIcon className="size-4 text-primary" />}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

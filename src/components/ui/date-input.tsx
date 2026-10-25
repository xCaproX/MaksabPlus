import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { arEG } from "date-fns/locale"
import { CalendarIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> {
  value?: string | null // ISO yyyy-mm-dd
  onChange?: (isoDate: string | null) => void
  min?: string // ISO yyyy-mm-dd
  max?: string // ISO yyyy-mm-dd
  clearable?: boolean
  className?: string
}

function normalizeArabicDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
}

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ""
  try {
    const parsed = parse(iso, "yyyy-MM-dd", new Date())
    if (isValid(parsed)) {
      return format(parsed, "dd/MM/yyyy")
    }
  } catch {}
  return ""
}

function displayToIso(display: string): string | null {
  if (!display || display.length !== 10) return null
  try {
    const parsed = parse(display, "dd/MM/yyyy", new Date())
    if (isValid(parsed)) {
      return format(parsed, "yyyy-MM-dd")
    }
  } catch {}
  return null
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      clearable = true,
      className,
      disabled,
      placeholder = "dd/mm/yyyy",
      ...props
    },
    ref
  ) => {
    const [displayVal, setDisplayVal] = React.useState<string>(() => isoToDisplay(value))
    const [open, setOpen] = React.useState(false)

    React.useEffect(() => {
      setDisplayVal(isoToDisplay(value))
    }, [value])

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = normalizeArabicDigits(e.target.value).replace(/[^\d/]/g, "")
      
      // Auto-insert slash after day and month if typing digits
      if (raw.length === 2 && !raw.includes("/")) {
        raw = raw + "/"
      } else if (raw.length === 5 && raw.split("/").length === 2) {
        raw = raw + "/"
      }

      if (raw.length > 10) {
        raw = raw.slice(0, 10)
      }

      setDisplayVal(raw)

      if (raw === "") {
        onChange?.(null)
        return
      }

      if (raw.length === 10) {
        const iso = displayToIso(raw)
        if (iso) {
          if (min && iso < min) return
          if (max && iso > max) return
          onChange?.(iso)
        }
      }
    }

    const handleCalendarSelect = (date: Date | undefined) => {
      if (!date) {
        onChange?.(null)
        setDisplayVal("")
        setOpen(false)
        return
      }
      const iso = format(date, "yyyy-MM-dd")
      if (min && iso < min) return
      if (max && iso > max) return
      onChange?.(iso)
      setDisplayVal(format(date, "dd/MM/yyyy"))
      setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange?.(null)
      setDisplayVal("")
    }

    const selectedDate = React.useMemo(() => {
      if (!value) return undefined
      try {
        const d = parse(value, "yyyy-MM-dd", new Date())
        return isValid(d) ? d : undefined
      } catch {
        return undefined
      }
    }, [value])

    const minDate = React.useMemo(() => {
      if (!min) return undefined
      try {
        const d = parse(min, "yyyy-MM-dd", new Date())
        return isValid(d) ? d : undefined
      } catch {
        return undefined
      }
    }, [min])

    const maxDate = React.useMemo(() => {
      if (!max) return undefined
      try {
        const d = parse(max, "yyyy-MM-dd", new Date())
        return isValid(d) ? d : undefined
      } catch {
        return undefined
      }
    }, [max])

    return (
      <div
        className={cn(
          "group flex h-9 w-full items-center rounded-lg border border-input bg-transparent text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <input
          ref={ref}
          type="text"
          dir="ltr"
          value={displayVal}
          onChange={handleTextChange}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-1.5 text-start font-mono font-medium tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          {...props}
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="مسح التاريخ"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                disabled={disabled}
                className="flex h-9 w-9 shrink-0 items-center justify-center border-s border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed"
                aria-label="فتح التقويم"
              >
                <CalendarIcon className="size-4" />
              </button>
            }
          />
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCalendarSelect}
              locale={arEG}
              weekStartsOn={6}
              disabled={[
                ...(minDate ? [{ before: minDate }] : []),
                ...(maxDate ? [{ after: maxDate }] : []),
              ]}
              startMonth={minDate}
              endMonth={maxDate}
            />
          </PopoverContent>
        </Popover>
      </div>
    )
  }
)
DateInput.displayName = "DateInput"

export { DateInput }

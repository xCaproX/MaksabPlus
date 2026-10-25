import * as React from "react"
import { cn } from "@/lib/utils"

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> {
  value?: number | string | null
  onChange?: (value: number | null) => void
  unit?: string
  decimals?: number
  min?: number
  max?: number
}

function normalizeArabicDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      unit,
      decimals = 2,
      min,
      max,
      className,
      placeholder = "0.00",
      disabled,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [displayVal, setDisplayVal] = React.useState<string>(() => {
      if (value === null || value === undefined || value === "") return ""
      return String(value)
    })

    React.useEffect(() => {
      if (value === null || value === undefined || value === "") {
        setDisplayVal("")
      } else {
        setDisplayVal(String(value))
      }
    }, [value])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = normalizeArabicDigits(e.target.value)
      // Allow only digits and a single decimal point or minus
      raw = raw.replace(/[^\d.-]/g, "")
      
      const parts = raw.split(".")
      if (parts.length > 2) {
        raw = parts[0] + "." + parts.slice(1).join("")
      }

      setDisplayVal(raw)

      if (raw === "" || raw === "-") {
        onChange?.(null)
        return
      }

      const parsed = parseFloat(raw)
      if (!isNaN(parsed)) {
        if (min !== undefined && parsed < min) {
          // let user finish typing
        }
        if (max !== undefined && parsed > max) {
          // let user finish typing
        }
        onChange?.(parsed)
      } else {
        onChange?.(null)
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (displayVal !== "" && displayVal !== "-") {
        let num = parseFloat(displayVal)
        if (!isNaN(num)) {
          if (min !== undefined && num < min) num = min
          if (max !== undefined && num > max) num = max
          if (decimals !== undefined && decimals >= 0) {
            const formatted = num.toFixed(decimals)
            setDisplayVal(formatted)
            onChange?.(parseFloat(formatted))
          } else {
            setDisplayVal(String(num))
            onChange?.(num)
          }
        }
      }
      onBlur?.(e)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.select()
      onFocus?.(e)
    }

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
          inputMode="decimal"
          dir="ltr"
          value={displayVal}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-1.5 text-start font-medium tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          {...props}
        />
        {unit && (
          <span
            data-slot="number-input-unit"
            className="flex shrink-0 items-center border-s border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground select-none"
          >
            {unit}
          </span>
        )}
      </div>
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }

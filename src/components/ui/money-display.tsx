import * as React from "react"
import { cn } from "cn"

export interface MoneyDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number | string | null | undefined
  size?: "sm" | "md" | "lg" | "xl"
  tone?: "neutral" | "positive" | "negative" | "muted"
  signed?: boolean
  currency?: string
}

function formatAmount(val: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

export function MoneyDisplay({
  amount,
  size = "md",
  tone = "neutral",
  signed = false,
  currency = "ج.م",
  className,
  ...props
}: MoneyDisplayProps) {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0)
  const isNaNVal = isNaN(num)
  const validNum = isNaNVal ? 0 : num

  const sign = signed && validNum > 0 ? "+" : ""
  const formatted = `${sign}${formatAmount(validNum, 2)}`

  return (
    <span
      data-slot="money-display"
      className={cn(
        "inline-flex items-baseline gap-1 font-medium select-text",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-base font-semibold",
        size === "xl" && "text-xl font-bold",
        tone === "neutral" && "text-foreground",
        tone === "positive" && "text-status-paid-text",
        tone === "negative" && "text-status-unpaid-text",
        tone === "muted" && "text-muted-foreground",
        className
      )}
      {...props}
    >
      <bdi dir="ltr" className="tabular-nums font-mono font-semibold">
        {formatted}
      </bdi>
      <span className="text-[0.8em] font-normal text-muted-foreground select-none">
        {currency}
      </span>
    </span>
  )
}

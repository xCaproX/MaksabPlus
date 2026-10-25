import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        paid: "border-status-paid-border bg-status-paid-bg text-status-paid-text",
        partial: "border-status-partial-border bg-status-partial-bg text-status-partial-text",
        unpaid: "border-status-unpaid-border bg-status-unpaid-bg text-status-unpaid-text",
        linked: "border-status-linked-border bg-status-linked-bg text-status-linked-text",
        neutral: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "paid" | "partial" | "unpaid" | "linked" | "neutral"
  children: React.ReactNode
}

function StatusBadge({ status, children, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        status === "paid" && "border-status-paid-border bg-status-paid-bg text-status-paid-text",
        status === "partial" && "border-status-partial-border bg-status-partial-bg text-status-partial-text",
        status === "unpaid" && "border-status-unpaid-border bg-status-unpaid-bg text-status-unpaid-text",
        status === "linked" && "border-status-linked-border bg-status-linked-bg text-status-linked-text",
        status === "neutral" && "border-status-neutral-border bg-status-neutral-bg text-status-neutral-text",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { Badge, badgeVariants, StatusBadge }

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface PageLayoutProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  primaryAction?: React.ReactNode
  secondaryActions?: React.ReactNode
  filterBar?: React.ReactNode
  children: React.ReactNode
  detailPanel?: React.ReactNode
  isDetailOpen?: boolean
  className?: string
}

export interface DetailPanelProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function DetailPanel({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
}: DetailPanelProps) {
  return (
    <aside
      data-slot="detail-panel"
      className={cn(
        "flex h-full w-[360px] shrink-0 flex-col border-s border-border bg-card shadow-xs lg:w-[420px] xl:w-[460px]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border p-3.5">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="إغلاق اللوحة الجانبية"
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">{children}</div>

      {footer && (
        <div className="sticky bottom-0 border-t border-border bg-card/95 p-3.5 backdrop-blur-xs">
          {footer}
        </div>
      )}
    </aside>
  )
}

export function PageLayout({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  filterBar,
  children,
  detailPanel,
  isDetailOpen = false,
  className,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1800px] flex-col gap-4 p-4 md:p-6",
        className
      )}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions && (
            <div className="flex items-center gap-1.5">{secondaryActions}</div>
          )}
          {primaryAction && <div>{primaryAction}</div>}
        </div>
      </header>

      {filterBar && (
        <section
          aria-label="شريط الفلاتر"
          className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card p-3"
        >
          {filterBar}
        </section>
      )}

      <main className="flex min-h-[500px] flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex-1 overflow-x-auto p-4">{children}</div>
        {isDetailOpen && detailPanel}
      </main>
    </div>
  )
}

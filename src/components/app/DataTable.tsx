import * as React from "react"
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Table as TanStackTable,
} from "@tanstack/react-table"
import { ArrowUpDownIcon, Columns3Icon } from "lucide-react"
import { cn } from "cn"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  tableId: string
  loading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (row: TData) => void
  selectedRowId?: string | number | null
  getRowId?: (row: TData) => string | number
  detailOpen?: boolean
  totalsRow?: React.ReactNode | ((table: TanStackTable<TData>) => React.ReactNode)
  className?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  tableId,
  loading = false,
  emptyState,
  onRowClick,
  selectedRowId,
  getRowId,
  detailOpen = false,
  totalsRow,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const storageKey = `table_cols_${tableId}`
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const handleVisibilityChange = React.useCallback(
    (updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setColumnVisibility((prev) => {
        const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [storageKey]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: handleVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground">
          إجمالي السجلات: <span className="font-semibold tabular-nums text-foreground">{data.length}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Columns3Icon className="size-3.5" />
                <span>الأعمدة</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>إظهار الأعمدة</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
              .map((column) => {
                const headerVal = column.columnDef.header
                const title = typeof headerVal === "string" ? headerVal : column.id
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {title}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative max-h-[650px] overflow-auto rounded-lg border border-border bg-card">
        <Table className="w-full text-xs md:text-sm">
          <TableHeader className="sticky top-0 z-10 border-b border-border bg-card shadow-xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { priority?: "high" | "medium" | "low"; isNumeric?: boolean }
                    | undefined

                  const shouldHide = detailOpen && meta?.priority === "low"

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-9 px-3 font-semibold text-muted-foreground select-none",
                        meta?.isNumeric && "text-end tabular-nums",
                        shouldHide && "hidden"
                      )}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            "flex items-center gap-1.5",
                            meta?.isNumeric && "justify-end",
                            header.column.getCanSort() && "cursor-pointer select-none"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <ArrowUpDownIcon className="size-3 text-muted-foreground opacity-60" />
                          )}
                        </div>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx} className="p-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  {emptyState ?? "لا توجد بيانات متاحة"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const currentId = getRowId ? getRowId(row.original) : (row.original as any)?.id
                const isSelected = selectedRowId !== undefined && selectedRowId !== null && currentId === selectedRowId

                return (
                  <TableRow
                    key={row.id}
                    data-selected={isSelected}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(
                      "transition-colors",
                      onRowClick && "cursor-pointer hover:bg-muted/60",
                      isSelected && "bg-accent/80 font-medium"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | { priority?: "high" | "medium" | "low"; isNumeric?: boolean }
                        | undefined
                      const shouldHide = detailOpen && meta?.priority === "low"

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "px-3 py-2 text-foreground",
                            meta?.isNumeric && "text-end tabular-nums font-mono",
                            shouldHide && "hidden"
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {totalsRow && (
            <TableFooter className="border-t-2 border-border bg-muted/40 font-semibold">
              {typeof totalsRow === "function" ? totalsRow(table) : totalsRow}
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  )
}

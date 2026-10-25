import * as React from "react"
import { MoreVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export interface ExtraAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

export interface RowActionsProps {
  recordNumber: string
  onEdit?: () => void
  onDelete?: () => void | Promise<void>
  editLabel?: string
  deleteLabel?: string
  canEdit?: boolean
  canDelete?: boolean
  extraActions?: ExtraAction[]
}

export function RowActions({
  recordNumber,
  onEdit,
  onDelete,
  editLabel = "تعديل",
  deleteLabel = "حذف",
  canEdit = true,
  canDelete = true,
  extraActions = [],
}: RowActionsProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const hasStandardActions = (canEdit && onEdit) || (canDelete && onDelete)
  const hasExtra = extraActions.length > 0

  if (!hasStandardActions && !hasExtra) {
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label="قائمة الإجراءات"
            >
              <MoreVerticalIcon className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-36">
          {canEdit && onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon className="size-3.5 me-2" />
              <span>{editLabel}</span>
            </DropdownMenuItem>
          )}

          {hasExtra && (
            <>
              {canEdit && onEdit && <DropdownMenuSeparator />}
              {extraActions.map((action, i) => (
                <DropdownMenuItem
                  key={i}
                  disabled={action.disabled}
                  variant={action.destructive ? "destructive" : "default"}
                  onClick={action.onClick}
                >
                  {action.icon && <span className="me-2">{action.icon}</span>}
                  <span>{action.label}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {canDelete && onDelete && (
            <>
              {(canEdit && onEdit || hasExtra) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon className="size-3.5 me-2" />
                <span>{deleteLabel}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canDelete && onDelete && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          recordNumber={`حذف ${recordNumber}`}
          description="هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً؟"
          onConfirm={onDelete}
        />
      )}
    </>
  )
}

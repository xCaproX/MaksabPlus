import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { MoreVertical, Pencil, Trash2, RotateCcw } from 'lucide-react';

export interface RowActionItem {
  label: string;
  icon?: typeof Pencil;
  danger?: boolean;
  onClick: () => void;
}

interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  restoreLabel?: string;
  customActions?: RowActionItem[];
}

export default function RowActions({
  onEdit,
  onDelete,
  onRestore,
  editLabel = 'تعديل',
  deleteLabel = 'حذف',
  restoreLabel = 'استعادة',
  customActions = [],
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () => document.removeEventListener('pointerdown', handleClickOutside);
    }
  }, [open]);

  function handleTrigger(e: MouseEvent) {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }

  function handleAction(e: MouseEvent, action: () => void) {
    e.stopPropagation();
    setOpen(false);
    action();
  }

  const hasAnyAction = onEdit || onDelete || onRestore || customActions.length > 0;
  if (!hasAnyAction) return null;

  return (
    <div className="row-actions-menu-wrap" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="row-actions-trigger-btn"
        aria-label="قائمة الإجراءات"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleTrigger}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div className="row-actions-dropdown" role="menu">
          {onEdit && (
            <button
              type="button"
              className="row-actions-item"
              role="menuitem"
              onClick={(e) => handleAction(e, onEdit)}
            >
              <Pencil size={14} className="action-item-icon" />
              <span>{editLabel}</span>
            </button>
          )}

          {onRestore && (
            <button
              type="button"
              className="row-actions-item"
              role="menuitem"
              onClick={(e) => handleAction(e, onRestore)}
            >
              <RotateCcw size={14} className="action-item-icon" />
              <span>{restoreLabel}</span>
            </button>
          )}

          {customActions.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={index}
                type="button"
                className={`row-actions-item ${item.danger ? 'danger' : ''}`}
                role="menuitem"
                onClick={(e) => handleAction(e, item.onClick)}
              >
                {Icon && <Icon size={14} className="action-item-icon" />}
                <span>{item.label}</span>
              </button>
            );
          })}

          {onDelete && (
            <button
              type="button"
              className="row-actions-item danger"
              role="menuitem"
              onClick={(e) => handleAction(e, onDelete)}
            >
              <Trash2 size={14} className="action-item-icon" />
              <span>{deleteLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

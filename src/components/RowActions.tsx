import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
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
  trigger?: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  className?: string;
  placement?: 'top' | 'bottom';
}

export default function RowActions({
  onEdit,
  onDelete,
  onRestore,
  editLabel = 'تعديل',
  deleteLabel = 'حذف',
  restoreLabel = 'استعادة',
  customActions = [],
  trigger,
  triggerLabel = 'قائمة الإجراءات',
  triggerClassName = 'row-actions-trigger-btn',
  className = '',
  placement = 'bottom',
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef(0);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[initialFocus.current === -1 ? items.length - 1 : 0]?.focus();
  }, [open]);

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
    initialFocus.current = 0;
    setOpen((prev) => !prev);
  }

  function handleAction(e: MouseEvent, action: () => void) {
    e.stopPropagation();
    setOpen(false);
    triggerRef.current?.focus();
    action();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (!open && !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!open) {
      initialFocus.current = event.key === 'ArrowUp' ? -1 : 0;
      setOpen(true);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const current = items.findIndex((item) => item === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  const hasAnyAction = onEdit || onDelete || onRestore || customActions.length > 0;
  if (!hasAnyAction) return null;

  return (
    <div className={`row-actions-menu-wrap ${className}`.trim()} ref={menuRef}
      onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={handleTrigger}
      >
        {trigger ?? <MoreVertical size={16} aria-hidden="true" />}
      </button>

      {open && (
        <div id={menuId} className="row-actions-dropdown" data-placement={placement} role="menu" aria-label={triggerLabel}>
          {onEdit && (
            <button
              type="button"
              className="row-actions-item"
              role="menuitem"
              tabIndex={-1}
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
              tabIndex={-1}
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
                tabIndex={-1}
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
              tabIndex={-1}
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

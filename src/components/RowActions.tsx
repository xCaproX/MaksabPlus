import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  portal?: boolean;
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
  portal = true,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef(0);
  const menuId = useId();

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!portal || !open || !trigger || !popup) return;

    function positionMenu() {
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const above = rect.top - 8;
      const below = window.innerHeight - rect.bottom - 8;
      const showAbove = placement === 'top' ? above >= height || above > below : below < height && above > below;
      const top = showAbove ? rect.top - height - 5 : rect.bottom + 5;
      const start = document.documentElement.dir === 'rtl' ? window.innerWidth - rect.left - width : rect.right - width;
      popup.style.insetInlineStart = `${Math.max(8, Math.min(start, window.innerWidth - width - 8))}px`;
      popup.style.insetBlockStart = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    }

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, placement, portal]);

  useEffect(() => {
    if (!open) return;
    const items = popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[initialFocus.current === -1 ? items.length - 1 : 0]?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) {
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
    const items = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const current = items.findIndex((item) => item === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  }

  const hasAnyAction = onEdit || onDelete || onRestore || customActions.length > 0;
  if (!hasAnyAction) return null;

  const menu = open && (
    <div ref={popupRef} id={menuId} className={`row-actions-dropdown${portal ? ' row-actions-dropdown-portal' : ''}`} data-placement={placement} role="menu" aria-label={triggerLabel}>
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
  );

  return (
    <div className={`row-actions-menu-wrap ${className}`.trim()} ref={menuRef}
      onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && !popupRef.current?.contains(e.relatedTarget)) setOpen(false);
      }}>
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
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}

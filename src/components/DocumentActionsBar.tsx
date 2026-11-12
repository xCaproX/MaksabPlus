import { Pencil, Printer, RotateCcw, Save, Trash2, X } from 'lucide-react';

interface DocumentActionsBarProps {
  isReadOnly: boolean;
  isEditing: boolean;
  busy: boolean;
  saveDisabled?: boolean;
  containerClassName?: string;
  readOnlyContainerClassName?: string;
  saveLabel: string;
  restoreLabel: string;
  editLabel: string;
  printLabel?: string;
  deleteLabel?: string;
  closeLabel?: string;
  cancelLabel?: string;
  resetLabel?: string;
  cancelTitle?: string;
  resetTitle?: string;
  showCancelIcon?: boolean;
  saveClassName?: string;
  restoreClassName?: string;
  editClassName?: string;
  printClassName?: string;
  deleteClassName?: string;
  closeClassName?: string;
  cancelClassName?: string;
  resetClassName?: string;
  onRestore?: () => void;
  onEdit?: () => void;
  onPrint?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  onResetNew?: () => void;
}

/**
 * شريط أزرار الإجراءات الموحد لنماذج المستندات (القراءة فقط والتحرير/الإنشاء).
 */
export default function DocumentActionsBar({
  isReadOnly,
  isEditing,
  busy,
  saveDisabled = false,
  containerClassName = 'left-actions-group',
  readOnlyContainerClassName,
  saveLabel,
  restoreLabel,
  editLabel,
  printLabel = 'طباعة',
  deleteLabel = 'حذف',
  closeLabel = 'إغلاق',
  cancelLabel = 'إلغاء',
  resetLabel = 'مسح / جديد',
  cancelTitle,
  resetTitle,
  showCancelIcon = true,
  saveClassName = '',
  restoreClassName = '',
  editClassName = '',
  printClassName = '',
  deleteClassName = '',
  closeClassName = '',
  cancelClassName = '',
  resetClassName = '',
  onRestore,
  onEdit,
  onPrint,
  onDelete,
  onCancel,
  onResetNew,
}: DocumentActionsBarProps) {
  if (isReadOnly) {
    const readOnlyGroupClass = readOnlyContainerClassName ?? `${containerClassName} readonly-actions-group`;
    return (
      <div className={readOnlyGroupClass}>
        {onRestore && (
          <button
            type="button"
            className={`btn primary ${restoreClassName}`.trim()}
            onClick={onRestore}
          >
            <RotateCcw size={15} />
            <span>{restoreLabel}</span>
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className={`${onRestore ? 'btn' : 'btn primary'} ${editClassName}`.trim()}
            onClick={onEdit}
          >
            <Pencil size={15} />
            <span>{editLabel}</span>
          </button>
        )}
        <button
          type="button"
          className={`btn ${printClassName}`.trim()}
          onClick={onPrint ?? (() => window.print())}
        >
          <Printer size={15} />
          <span>{printLabel}</span>
        </button>
        {onDelete && (
          <button
            type="button"
            className={`btn danger ${deleteClassName}`.trim()}
            onClick={onDelete}
          >
            <Trash2 size={15} />
            <span>{deleteLabel}</span>
          </button>
        )}
        <button
          type="button"
          className={`btn ${closeClassName}`.trim()}
          onClick={onCancel}
        >
          <span>{closeLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <button
        type="submit"
        className={`btn primary ${saveClassName}`.trim()}
        disabled={busy || saveDisabled}
      >
        <Save size={16} />
        <span>{busy ? 'جارٍ الحفظ…' : saveLabel}</span>
      </button>

      {isEditing ? (
        <button
          type="button"
          className={`btn ${cancelClassName}`.trim()}
          onClick={onCancel}
          disabled={busy}
          title={cancelTitle}
        >
          {showCancelIcon && <X size={15} />}
          <span>{cancelLabel}</span>
        </button>
      ) : (
        onResetNew && (
          <button
            type="button"
            className={`btn ${resetClassName}`.trim()}
            onClick={onResetNew}
            disabled={busy}
            title={resetTitle}
          >
            <RotateCcw size={14} />
            <span>{resetLabel}</span>
          </button>
        )
      )}
    </div>
  );
}

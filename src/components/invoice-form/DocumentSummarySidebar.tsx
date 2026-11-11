import type { ReactNode } from 'react';
import { Pencil, Printer, RotateCcw, Save, Trash2, X } from 'lucide-react';

interface DocumentSummarySidebarProps {
  isReadOnly: boolean;
  isEditing: boolean;
  notes: string;
  busy: boolean;
  notesPlaceholder?: string;
  emptyNotesText?: string;
  saveLabel: string;
  restoreLabel: string;
  editLabel: string;
  printLabel?: string;
  deleteLabel?: string;
  resetTitle?: string;
  cancelTitle?: string;
  onNotesChange: (notes: string) => void;
  onResetNew: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPrint?: () => void;
  extraContent?: ReactNode;
  children: ReactNode;
}

/**
 * الغلاف المشترك للشريط الجانبي الأيسر في نماذج المستندات ثنائية الأعمدة:
 * يعرض شرائط الملخص الممررة، ثم حقل الملاحظات، ثم أزرار الإنشاء/التعديل/العرض.
 */
export default function DocumentSummarySidebar({
  isReadOnly,
  isEditing,
  notes,
  busy,
  notesPlaceholder = 'ملاحظات اختيارية…',
  emptyNotesText = 'لا توجد ملاحظات',
  saveLabel,
  restoreLabel,
  editLabel,
  printLabel = 'طباعة',
  deleteLabel = 'حذف',
  resetTitle = 'مسح البيانات الحالية والبدء من جديد',
  cancelTitle = 'إلغاء التعديل والعودة',
  onNotesChange,
  onResetNew,
  onCancel,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
  extraContent,
  children,
}: DocumentSummarySidebarProps) {
  return (
    <div className="invoice-part-left">
      {children}

      <div className="left-field-box">
        <label>
          <span>ملاحظات</span>
          {isReadOnly ? (
            <div className="readonly-val-box readonly-notes">
              {notes || emptyNotesText}
            </div>
          ) : (
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder={notesPlaceholder}
              className="left-notes-textarea"
            />
          )}
        </label>
      </div>

      {extraContent}

      {isReadOnly ? (
        <div className="left-actions-group readonly-actions-group">
          {onRestore && (
            <button
              type="button"
              className="btn primary btn-invoice-restore"
              onClick={onRestore}
            >
              <RotateCcw size={15} />
              <span>{restoreLabel}</span>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className={onRestore ? 'btn btn-invoice-edit' : 'btn primary btn-invoice-edit'}
              onClick={onEdit}
            >
              <Pencil size={15} />
              <span>{editLabel}</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-invoice-print"
            onClick={onPrint ?? (() => window.print())}
          >
            <Printer size={15} />
            <span>{printLabel}</span>
          </button>
          {onDelete && (
            <button
              type="button"
              className="btn danger btn-invoice-delete"
              onClick={onDelete}
            >
              <Trash2 size={15} />
              <span>{deleteLabel}</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-invoice-close"
            onClick={onCancel}
          >
            <span>إغلاق</span>
          </button>
        </div>
      ) : (
        <div className="left-actions-group">
          <button
            type="submit"
            className="btn primary btn-invoice-save"
            disabled={busy}
          >
            <Save size={16} />
            <span>{busy ? 'جارٍ الحفظ…' : saveLabel}</span>
          </button>

          {isEditing ? (
            <button
              type="button"
              className="btn btn-invoice-clear"
              onClick={onCancel}
              disabled={busy}
              title={cancelTitle}
            >
              <X size={15} />
              <span>إلغاء</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-invoice-clear"
              onClick={onResetNew}
              disabled={busy}
              title={resetTitle}
            >
              <RotateCcw size={14} />
              <span>مسح / جديد</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

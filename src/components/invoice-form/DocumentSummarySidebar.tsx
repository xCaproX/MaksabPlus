import type { ReactNode } from 'react';
import DocumentActionsBar from '../DocumentActionsBar';

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

      <DocumentActionsBar
        isReadOnly={isReadOnly}
        isEditing={isEditing}
        busy={busy}
        containerClassName="left-actions-group"
        saveLabel={saveLabel}
        restoreLabel={restoreLabel}
        editLabel={editLabel}
        printLabel={printLabel}
        deleteLabel={deleteLabel}
        cancelTitle={cancelTitle}
        resetTitle={resetTitle}
        saveClassName="btn-invoice-save"
        restoreClassName="btn-invoice-restore"
        editClassName="btn-invoice-edit"
        printClassName="btn-invoice-print"
        deleteClassName="btn-invoice-delete"
        closeClassName="btn-invoice-close"
        cancelClassName="btn-invoice-clear"
        resetClassName="btn-invoice-clear"
        onRestore={onRestore}
        onEdit={onEdit}
        onPrint={onPrint}
        onDelete={onDelete}
        onCancel={onCancel}
        onResetNew={onResetNew}
      />
    </div>
  );
}

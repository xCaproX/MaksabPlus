import { Check, Pencil, Printer, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { money } from '../../lib/format';
import SearchableSelect from '../SearchableSelect';
import type { CashBoxRow, InvoiceRow, LineDraft } from '../../lib/types';

export interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

interface InvoiceSummarySidebarProps {
  isReadOnly: boolean;
  isWaste: boolean;
  isReturn: boolean;
  total: number;
  paid: string;
  paidNumber: number;
  remaining: number;
  cashAccountSelected: boolean;
  effectiveCashBoxId: string;
  selectableCashBoxes: CashBoxRow[];
  notes: string;
  busy: boolean;
  editing: EditingInvoice | null;
  onPaidChange: (val: string) => void;
  onPaidBlur: () => void;
  onQuickPaidAll: () => void;
  onQuickPaidZero: () => void;
  onCashBoxChange: (id: string) => void;
  onNotesChange: (notes: string) => void;
  onResetNew: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPrint?: () => void;
}

export default function InvoiceSummarySidebar({
  isReadOnly,
  isWaste,
  isReturn,
  total,
  paid,
  paidNumber,
  remaining,
  effectiveCashBoxId,
  selectableCashBoxes,
  notes,
  busy,
  editing,
  onPaidChange,
  onPaidBlur,
  onQuickPaidAll,
  onQuickPaidZero,
  onCashBoxChange,
  onNotesChange,
  onResetNew,
  onCancel,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
}: InvoiceSummarySidebarProps) {
  return (
    <div className="invoice-part-left">
      {/* 1. إجمالي الفاتورة والخانة على نفس السطر */}
      <div className="left-row-strip left-total-strip">
        <span className="strip-label">
          إجمالي {isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}
        </span>
        <div className="strip-value-box">
          <strong dir="ltr" className="strip-value strip-value-total num">
            {money(total)}
          </strong>
        </div>
      </div>

      {/* 2. المدفوع والخانة على نفس السطر */}
      {!isWaste && (
        <div className="left-row-strip left-paid-strip">
          <span className="strip-label">{isReturn ? 'المسترد' : 'المدفوع'}</span>
          {!isReadOnly && (
            <div className="strip-center-slot">
              <div className="paid-quick-actions">
                <button
                  type="button"
                  className="btn-paid-quick btn-paid-all"
                  onClick={onQuickPaidAll}
                  title={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                  aria-label={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                >
                  <Check size={14} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  className="btn-paid-quick btn-paid-zero"
                  onClick={onQuickPaidZero}
                  title={isReturn ? 'عدم استرداد شيء (صفر)' : 'عدم دفع شيء (صفر)'}
                  aria-label={isReturn ? 'عدم استرداد شيء (تصفير)' : 'عدم دفع شيء (تصفير)'}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
          <div className="strip-value-box strip-paid-box">
            {isReadOnly ? (
              <strong dir="ltr" className="strip-value num">
                {money(paidNumber)}
              </strong>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                value={paid}
                onFocus={(e) => e.target.select()}
                onChange={(e) => onPaidChange(e.target.value)}
                onBlur={onPaidBlur}
                className="no-spinner num left-paid-input"
                aria-label={isReturn ? 'المبلغ المسترد' : 'المدفوع'}
              />
            )}
          </div>
        </div>
      )}

      {/* 3. المتبقي والخانة على نفس السطر */}
      {!isWaste && (
        <div className={`left-row-strip left-remaining-strip ${remaining === 0 ? 'is-zero' : 'is-due'}`}>
          <span className="strip-label">{isReturn ? 'حالة الاسترداد' : 'المتبقي'}</span>
          <div className="strip-center-slot">
            <span
              className={`status-badge ${remaining === 0 ? 'paid' : 'unpaid'}`}
              style={{ fontSize: '10.5px' }}
            >
              {isReturn
                ? remaining === 0
                  ? 'مسترد بالكامل'
                  : 'غير مسترد'
                : remaining === 0
                  ? 'خالص'
                  : 'آجل'}
            </span>
          </div>
          <div className="strip-value-box">
            <strong dir="ltr" className="strip-value strip-value-remaining num">
              {money(remaining)}
            </strong>
          </div>
        </div>
      )}

      {/* 4. الخزنة */}
      {!isWaste && (
        <div className={`left-field-box ${paidNumber <= 0 ? 'disabled' : ''}`}>
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{isReturn ? 'الخزنة المنصرف منها' : 'الخزنة'}</span>
              {paidNumber <= 0 && <span className="no-paid-hint">(لا يوجد مدفوع)</span>}
            </div>
            {isReadOnly ? (
              <div className="readonly-val-box">
                {selectableCashBoxes.find((b) => b.id === effectiveCashBoxId)?.name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                value={effectiveCashBoxId}
                options={selectableCashBoxes.map((box) => ({
                  value: box.id,
                  label: `${box.name} (${money(box.balance)})`,
                }))}
                onChange={onCashBoxChange}
                placeholder="اختر الخزنة…"
                searchPlaceholder="اكتب للبحث عن خزنة…"
                emptyMessage="لا توجد خزنة مطابقة"
                disabled={paidNumber <= 0}
                required={paidNumber > 0}
              />
            )}
          </label>
        </div>
      )}

      {/* 5. ملاحظات */}
      <div className="left-field-box">
        <label>
          <span>ملاحظات</span>
          {isReadOnly ? (
            <div className="readonly-val-box readonly-notes">
              {notes || 'لا توجد ملاحظات على الفاتورة'}
            </div>
          ) : (
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="ملاحظات اختيارية على الفاتورة…"
              className="left-notes-textarea"
            />
          )}
        </label>
      </div>

      {/* السند المالي المرتبط إن وجد */}
      {editing?.invoice.receipt_number && (
        <div className="left-field-box linked-receipt-box">
          <span style={{ fontSize: '12px', fontWeight: 650, color: '#475569' }}>السند المالي المرتبط</span>
          <div className="linked-receipt-badge">
            <span>إيصال</span>
            <bdi className="num" dir="ltr">
              {editing.invoice.receipt_number}
            </bdi>
            <span>
              (
              <bdi className="num" dir="ltr">
                {money(editing.invoice.receipt_amount ?? 0)}
              </bdi>{' '}
              ج.م)
            </span>
          </div>
        </div>
      )}

      {/* 6. أزرار الإجراءات */}
      {isReadOnly ? (
        <div className="left-actions-group readonly-actions-group">
          {onRestore && (
            <button
              type="button"
              className="btn primary btn-invoice-restore"
              onClick={onRestore}
            >
              <RotateCcw size={15} />
              <span>استعادة {isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}</span>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="btn primary btn-invoice-edit"
              onClick={onEdit}
            >
              <Pencil size={15} />
              <span>تعديل الفاتورة</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-invoice-print"
            onClick={onPrint ?? (() => window.print())}
          >
            <Printer size={15} />
            <span>طباعة الفاتورة</span>
          </button>
          {onDelete && (
            <button
              type="button"
              className="btn danger btn-invoice-delete"
              onClick={onDelete}
            >
              <Trash2 size={15} />
              <span>حذف الفاتورة</span>
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
            <span>
              {busy
                ? 'جارٍ الحفظ…'
                : editing
                  ? 'حفظ التعديلات'
                  : isReturn
                    ? 'حفظ المرتجع'
                    : isWaste
                      ? 'حفظ الهالك'
                      : 'حفظ الفاتورة'}
            </span>
          </button>

          {editing ? (
            <button
              type="button"
              className="btn btn-invoice-clear"
              onClick={onCancel}
              disabled={busy}
              title="إلغاء التعديل والعودة"
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
              title="مسح بيانات الفاتورة الحالية والبدء من جديد"
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

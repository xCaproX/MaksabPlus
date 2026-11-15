import { Check, ExternalLink, X } from 'lucide-react';
import { calculateInvoiceCashBoxState } from '../../lib/invoiceValidation';
import { toCashBoxOption } from '../../lib/masterDataQueries';
import CashBoxBalanceBox from '../CashBoxBalanceBox';
import GuardedLink from '../GuardedLink';
import SearchableSelect from '../SearchableSelect';
import MoneyDisplay from '../MoneyDisplay';
import StatusBadge from '../StatusBadge';
import DocumentSummarySidebar from './DocumentSummarySidebar';
import type { CashBoxRow, InvoiceKind, InvoiceRow, LineDraft } from '../../lib/types';

export interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

interface InvoiceSummarySidebarProps {
  kind: InvoiceKind;
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
  onRequestNavigate?: (proceed: () => void) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPrint?: () => void;
}

export default function InvoiceSummarySidebar({
  kind,
  isReadOnly,
  isWaste,
  isReturn,
  cashAccountSelected,
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
  onRequestNavigate,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
}: InvoiceSummarySidebarProps) {
  const {
    isCashOut,
    displayBalance: cashBoxDisplayBalance,
    isOverdraft: isCashBoxOverdraft,
  } = calculateInvoiceCashBoxState({
    kind,
    isReadOnly,
    paidNumber,
    effectiveCashBoxId,
    cashBoxes: selectableCashBoxes,
    editingInvoice: editing?.invoice,
  });
  const selectedCashBox = selectableCashBoxes.find((b) => b.id === effectiveCashBoxId);
  const saveLabel = editing
    ? 'حفظ التعديلات'
    : isReturn
      ? 'حفظ المرتجع'
      : isWaste
        ? 'حفظ الهالك'
        : 'حفظ الفاتورة';

  const docWord = isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة';
  const restoreLabel = `استعادة ${docWord}`;

  const linkedReceiptDirection =
    editing?.invoice.kind === 'purchase' || editing?.invoice.kind === 'sale_return'
      ? 'out'
      : 'in';
  const linkedReceiptUrl = editing?.invoice.receipt_id
    ? `/receipts?tab=${linkedReceiptDirection}&doc=${encodeURIComponent(editing.invoice.receipt_id)}`
    : `/receipts?tab=${linkedReceiptDirection}&search=${encodeURIComponent(editing?.invoice.receipt_number ?? '')}`;

  const linkedReceiptContent = editing?.invoice.receipt_number ? (
    <>
      <span>إيصال</span>
      <bdi className="num" dir="ltr">
        {editing.invoice.receipt_number}
      </bdi>
      <MoneyDisplay value={editing.invoice.receipt_amount ?? 0} currency />
      <ExternalLink size={13} className="link-ext-icon" aria-hidden="true" />
    </>
  ) : null;

  const linkedReceiptNode = editing?.invoice.receipt_number ? (
    <div className="left-field-box linked-receipt-box">
      <span className="linked-receipt-title">السند المالي المرتبط</span>
      <GuardedLink
        to={linkedReceiptUrl}
        className="linked-receipt-badge receipt-linked-link"
        title={`فتح الإيصال ${editing.invoice.receipt_number}`}
        onBeforeNavigate={(proceed) => {
          if (onRequestNavigate) {
            onRequestNavigate(proceed);
          } else {
            onCancel();
            proceed();
          }
        }}
      >
        {linkedReceiptContent}
      </GuardedLink>
    </div>
  ) : null;

  return (
    <DocumentSummarySidebar
      isReadOnly={isReadOnly}
      isEditing={Boolean(editing)}
      notes={notes}
      busy={busy}
      saveDisabled={isCashBoxOverdraft}
      notesPlaceholder={`ملاحظات اختيارية على ${docWord}…`}
      emptyNotesText={`لا توجد ملاحظات على ${docWord}`}
      saveLabel={saveLabel}
      restoreLabel={restoreLabel}
      editLabel={`تعديل ${docWord}`}
      printLabel={`طباعة ${docWord}`}
      deleteLabel={`حذف ${docWord}`}
      resetTitle={`مسح بيانات ${docWord} ${isReturn || isWaste ? 'الحالي' : 'الحالية'} والبدء من جديد`}
      onNotesChange={onNotesChange}
      onResetNew={onResetNew}
      onCancel={onCancel}
      onEdit={onEdit}
      onDelete={onDelete}
      onRestore={onRestore}
      onPrint={onPrint}
      extraContent={linkedReceiptNode}
    >
      {/* 1. إجمالي الفاتورة والخانة على نفس السطر */}
      <div className="left-row-strip left-total-strip">
        <span className="strip-label">
          إجمالي {isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}
        </span>
        <div className="strip-value-box">
          <MoneyDisplay value={total} strong className="strip-value strip-value-total" />
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
                  disabled={cashAccountSelected}
                  title={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                  aria-label={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                >
                  <Check size={14} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  className="btn-paid-quick btn-paid-zero"
                  onClick={onQuickPaidZero}
                  disabled={cashAccountSelected}
                  title={isReturn ? 'عدم استرداد شيء (صفر)' : 'عدم دفع شيء (صفر)'}
                  aria-label={isReturn ? 'عدم استرداد شيء (تصفير)' : 'عدم دفع شيء (تصفير)'}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
          <div className={`strip-value-box strip-paid-box ${!isReadOnly && cashAccountSelected ? 'is-disabled' : ''}`}>
            {isReadOnly ? (
              <MoneyDisplay value={paidNumber} strong className="strip-value" />
            ) : (
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={paid}
                onFocus={(e) => e.target.select()}
                onChange={(e) => onPaidChange(e.target.value)}
                onBlur={onPaidBlur}
                disabled={cashAccountSelected}
                title={
                  cashAccountSelected
                    ? isReturn
                      ? 'الحساب النقدي يسترد بالكامل تلقائياً'
                      : 'الحساب النقدي يسدد بالكامل تلقائياً'
                    : undefined
                }
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
          <span className="strip-label">المتبقي</span>
          <div className="strip-center-slot">
            <StatusBadge variant={remaining === 0 ? 'paid' : 'unpaid'}>
              {remaining === 0 ? 'خالص' : 'آجل'}
            </StatusBadge>
          </div>
          <div className="strip-value-box">
            <MoneyDisplay value={remaining} strong className="strip-value strip-value-remaining" />
          </div>
        </div>
      )}

      {/* 4. الخزنة ورصيدها */}
      {!isWaste && (
        <div className={`left-field-box ${paidNumber <= 0 ? 'disabled' : ''}`}>
          {isReadOnly ? (
            <label>
              <div className="left-field-label-row">
                <span>{isCashOut ? 'الخزنة المنصرف منها' : 'الخزنة'}</span>
              </div>
              <div className="readonly-val-box">
                {selectedCashBox?.name ?? editing?.invoice.cash_box_name ?? '—'}
              </div>
            </label>
          ) : (
            <div className="left-cashbox-group">
              <div className="left-field-label-row">
                <span>{isCashOut ? 'الخزنة المنصرف منها' : 'الخزنة'}</span>
                {paidNumber <= 0 && (
                  <StatusBadge variant="neutral">لا يوجد مدفوع</StatusBadge>
                )}
              </div>
              <div className="left-cashbox-balance-row">
                <SearchableSelect
                  portal
                  ariaLabel={isCashOut ? 'الخزنة المنصرف منها' : 'الخزنة'}
                  value={effectiveCashBoxId}
                  selectedLabel={
                    effectiveCashBoxId
                      ? (selectedCashBox?.name ?? editing?.invoice.cash_box_name ?? undefined)
                      : undefined
                  }
                  options={selectableCashBoxes.map(toCashBoxOption)}
                  onChange={onCashBoxChange}
                  placeholder={paidNumber <= 0 ? '' : 'اختر الخزنة…'}
                  searchPlaceholder="اكتب للبحث عن خزنة…"
                  emptyMessage="لا توجد خزنة مطابقة"
                  disabled={paidNumber <= 0}
                  required={paidNumber > 0}
                />
                <CashBoxBalanceBox
                  balance={cashBoxDisplayBalance}
                  danger={isCashBoxOverdraft}
                  ariaLabel={isCashOut ? 'الرصيد المتاح' : 'الرصيد'}
                />
              </div>
              {isCashBoxOverdraft && (
                <div className="overdraft-warning-badge" role="alert">
                  تنبيه: المبلغ يتجاوز الرصيد المتوفر بالخزنة المحددة
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </DocumentSummarySidebar>
  );
}

import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import DocumentActionsBar from './DocumentActionsBar';
import { supabase } from '../lib/supabase';
import { money, round2, today } from '../lib/format';
import DateDisplay from './DateDisplay';
import { translateDbError } from '../lib/errors';
import { tafqeet } from '../lib/tafqeet';
import { toast } from './Toast';
import SearchableSelect from './SearchableSelect';
import DateInput from './DateInput';
import MoneyDisplay from './MoneyDisplay';
import { useModalDirtyGuard, useReportBusy } from './Modal';
import { resolveDefaultCashBox } from '../lib/defaults';
import { toCashBoxOption } from '../lib/masterDataQueries';
import type { CashBoxRow, CashBoxTransferRow } from '../lib/types';

interface Props {
  cashBoxes: CashBoxRow[];
  editing: CashBoxTransferRow | null;
  onBusyChange?: (busy: boolean) => void;
  onSaved: (message: string) => void;
  onCancel: () => void;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPrint?: () => void;
}

export default function CashBoxTransferForm({
  cashBoxes,
  editing,
  onBusyChange,
  onSaved,
  onCancel,
  readOnly = false,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
}: Props) {
  const isReadOnly = Boolean(readOnly);
  const activeBoxes = cashBoxes.filter(
    (box) => box.is_active || box.id === editing?.source_cash_box_id || box.id === editing?.destination_cash_box_id,
  );
  const [sourceId, setSourceId] = useState(
    editing?.source_cash_box_id ?? resolveDefaultCashBox(activeBoxes)?.id ?? '',
  );
  const [destinationId, setDestinationId] = useState(
    editing?.destination_cash_box_id ?? activeBoxes.find((box) => box.id !== sourceId)?.id ?? '',
  );
  const [date, setDate] = useState(editing?.transfer_date ?? today());
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  useReportBusy(busy, onBusyChange);

  const numAmount = Number(amount || 0);
  const roundedAmount = round2(numAmount);

  const [initialSnapshot] = useState(() => ({
    sourceId,
    destinationId,
    date,
    amount: editing ? round2(Number(editing.amount || 0)).toFixed(2) : '0.00',
    notes: notes.trim(),
  }));

  const isDirty =
    !isReadOnly &&
    (sourceId !== initialSnapshot.sourceId ||
      destinationId !== initialSnapshot.destinationId ||
      date !== initialSnapshot.date ||
      roundedAmount.toFixed(2) !== initialSnapshot.amount ||
      notes.trim() !== initialSnapshot.notes);

  const { requestClose } = useModalDirtyGuard(isDirty);
  const tafqeetText = numAmount > 0 ? tafqeet(numAmount) : '';

  // حساب الأرصدة قبل وبعد
  const sourceBox = cashBoxes.find((box) => box.id === sourceId);
  const destBox = cashBoxes.find((box) => box.id === destinationId);

  const prevAmount = editing ? Number(editing.amount) : 0;
  const editSourceAdj = editing?.source_cash_box_id === sourceId ? prevAmount : editing?.destination_cash_box_id === sourceId ? -prevAmount : 0;
  const editDestAdj = editing?.destination_cash_box_id === destinationId ? -prevAmount : editing?.source_cash_box_id === destinationId ? prevAmount : 0;

  const sourceAvailableBalance = Number(sourceBox?.balance ?? 0) + editSourceAdj;
  const destInitialBalance = Number(destBox?.balance ?? 0) + editDestAdj;

  const sourceBalanceAfter = sourceAvailableBalance - numAmount;
  const destBalanceAfter = destInitialBalance + numAmount;

  const isOverdraft = !isReadOnly && roundedAmount > sourceAvailableBalance;
  const isDestOverdraft = !isReadOnly && Boolean(destBox) && destInitialBalance + roundedAmount < 0;

  function handleSettleAll() {
    if (!sourceId) {
      toast.warning('اختر خزنة المصدر أولاً');
      return;
    }
    if (sourceAvailableBalance <= 0) {
      toast.info('خزنة المصدر رصيدها صفر حالياً');
      setAmount('0.00');
      return;
    }
    setAmount(round2(sourceAvailableBalance).toFixed(2));
    toast.info(`تم إدراج كامل رصيد خزنة المصدر (${money(sourceAvailableBalance)})`);
  }

  function handleReset() {
    setDate(today());
    setAmount('');
    setNotes('');
    toast.info('تم تفريغ الحقول للبدء من جديد');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnly) return;
    if (!date) return toast.error('أدخل التاريخ');
    if (!sourceId || !destinationId || sourceId === destinationId) {
      return toast.error('اختر خزنتين مختلفتين (خزنة المصدر وخزنة الوجهة)');
    }
    if (!(roundedAmount > 0)) {
      return toast.error('أدخل مبلغًا صحيحاً أكبر من صفر');
    }
    if (isOverdraft) {
      return toast.error(`المبلغ المطلوب تحويله يتجاوز رصيد خزنة المصدر (${money(sourceAvailableBalance)})`);
    }
    if (isDestOverdraft) {
      return toast.error(`لا يمكن تقليل مبلغ التحويل لأن خزنة الوجهة (${destBox?.name ?? ''}) تم الصرف منها وسيصبح رصيدها سالباً`);
    }

    setBusy(true);
    const args = {
      p_source_cash_box_id: sourceId,
      p_destination_cash_box_id: destinationId,
      p_transfer_date: date,
      p_amount: roundedAmount,
      p_notes: notes.trim() || null,
    };
    const { error: rpcError } = editing
      ? await supabase.rpc('update_cash_box_transfer', { p_transfer_id: editing.id, ...args })
      : await supabase.rpc('create_cash_box_transfer', args);
    setBusy(false);

    if (rpcError) return toast.error(translateDbError(rpcError.message));
    onSaved(editing ? `تم تعديل التحويل ${editing.number}` : 'تم حفظ التحويل بين الخزن بنجاح');
  }

  return (
    <form className={`cashbox-transfer-form ${isReadOnly ? 'is-readonly' : ''}`} onSubmit={submit}>
      {/* سطر التاريخ */}
      <div className="account-header-card cashbox-date-card">
        <span className="cashbox-date-label">تاريخ التحويل:</span>
        {isReadOnly ? (
          <div className="readonly-val-box num cashbox-date-readonly">
            <DateDisplay value={date} />
          </div>
        ) : (
          <div className="cashbox-date-input-wrap">
            <DateInput value={date} onChange={setDate} ariaLabel="تاريخ التحويل" required />
          </div>
        )}
      </div>

      {/* شبكة الخزنتين وبطاقات الأرصدة الموحدة */}
      <div className="cashbox-transfer-boxes-grid">
        {/* خزنة المصدر */}
        <div className="account-header-card box-card-clean">
          <label className="box-card-label">
            <span>من خزنة (المصدر)</span>
            {isReadOnly ? (
              <div className="readonly-val-box strong">
                {sourceBox?.name ?? editing?.source_cash_box_name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                portal
                value={sourceId}
                options={activeBoxes.map(toCashBoxOption)}
                onChange={(next) => {
                  setSourceId(next);
                  if (next === destinationId) {
                    setDestinationId(activeBoxes.find((box) => box.id !== next)?.id ?? '');
                  }
                }}
                placeholder="اختر خزنة المصدر…"
                searchPlaceholder="ابحث باسم الخزنة…"
                emptyMessage="لا توجد خزن متاحة"
                required
              />
            )}
          </label>
          {sourceBox && (
            <div className="account-balance-pills">
              <div className="stat-pill">
                <span>الرصيد المتاح:</span>
                <MoneyDisplay value={sourceAvailableBalance} strong />
              </div>
              <div className="stat-pill">
                <span>الرصيد بعد:</span>
                <MoneyDisplay value={sourceBalanceAfter} strong />
                {sourceBalanceAfter < 0 && (
                  <span className="stat-pill-tag tag-debit">عجز</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* خزنة الوجهة */}
        <div className="account-header-card box-card-clean">
          <label className="box-card-label">
            <span>إلى خزنة (الوجهة)</span>
            {isReadOnly ? (
              <div className="readonly-val-box strong">
                {destBox?.name ?? editing?.destination_cash_box_name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                portal
                value={destinationId}
                options={activeBoxes
                  .filter((box) => box.id !== sourceId)
                  .map(toCashBoxOption)}
                onChange={setDestinationId}
                placeholder="اختر خزنة الوجهة…"
                searchPlaceholder="ابحث باسم الخزنة…"
                emptyMessage="لا توجد خزن متاحة"
                required
              />
            )}
          </label>
          {destBox && (
            <div className="account-balance-pills">
              <div className="stat-pill">
                <span>الرصيد الحالي:</span>
                <MoneyDisplay value={destInitialBalance} strong />
              </div>
              <div className="stat-pill">
                <span>الرصيد بعد:</span>
                <MoneyDisplay value={destBalanceAfter} strong />
                {destBalanceAfter < 0 ? (
                  <span className="stat-pill-tag tag-debit">عجز</span>
                ) : numAmount > 0 ? (
                  <span className="stat-pill-tag tag-credit">زيادة</span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* بطاقة المبلغ المراد تحويله والتفقيط بالعربي */}
      <div className="receipt-amount-card">
        <div className="row-amount-tafqeet">
          <div className="field-amount-slot">
            <label>
              <span>المبلغ المحوّل</span>
              {isReadOnly ? (
                <div className="readonly-val-box readonly-amount-display">
                  <MoneyDisplay value={numAmount} strong tone="primary" />
                </div>
              ) : (
                <div className="amount-input-with-action">
                  <input
                    aria-label="المبلغ المراد تحويله"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setAmount(e.target.value)}
                    className="receipt-amount-input no-spinner num"
                    required
                  />
                  <button
                    type="button"
                    className="btn-settle-all-action"
                    onClick={handleSettleAll}
                    title="نقل كامل رصيد خزنة المصدر"
                    aria-label="نقل كامل رصيد خزنة المصدر"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>كامل الرصيد</span>
                  </button>
                </div>
              )}
            </label>
          </div>

          <div className="field-tafqeet-card" title={tafqeetText || 'المبلغ بالحروف'}>
            <span className={`tafqeet-text ${tafqeetText ? 'has-value' : 'empty'}`}>
              {tafqeetText || '—'}
            </span>
          </div>
        </div>
      </div>

      {isOverdraft && (
        <div className="overdraft-warning-badge" role="alert">
          تنبيه: المبلغ (<bdi dir="ltr" className="tabular-nums">{money(numAmount)}</bdi>) يتجاوز رصيد خزنة المصدر المتاح (<bdi dir="ltr" className="tabular-nums">{money(sourceAvailableBalance)}</bdi>)
        </div>
      )}

      {isDestOverdraft && (
        <div className="overdraft-warning-badge" role="alert">
          تنبيه: بعد تعديل التحويل سيصبح رصيد خزنة الوجهة ({destBox?.name ?? ''}) سالباً بقيمة{' '}
          <bdi dir="ltr" className="tabular-nums">{money(destBalanceAfter)}</bdi>{' '}
          لأن جزءاً من المبلغ تم صرفه بالفعل
        </div>
      )}

      {/* ملاحظات التحويل */}
      <div className="account-header-card cashbox-notes-card">
        {isReadOnly ? (
          <div className="cashbox-notes-field">
            <span className="cashbox-notes-label">ملاحظات</span>
            <div className="readonly-val-box readonly-notes cashbox-notes-readonly">
              {notes || 'لا توجد ملاحظات على التحويل'}
            </div>
          </div>
        ) : (
          <label className="cashbox-notes-field">
            <span>ملاحظات</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ملاحظات اختيارية على عملية التحويل…"
              className="left-notes-textarea"
              aria-label="ملاحظات التحويل"
            />
          </label>
        )}
      </div>

      {/* أزرار الإجراءات الموحدة */}
      <DocumentActionsBar
        isReadOnly={isReadOnly}
        isEditing={Boolean(editing)}
        busy={busy}
        saveDisabled={isOverdraft || isDestOverdraft}
        containerClassName="form-modal-actions"
        saveLabel={editing ? 'حفظ التعديلات' : 'حفظ التحويل بين الخزن'}
        restoreLabel="استعادة التحويل"
        editLabel="تعديل التحويل"
        showCancelIcon={false}
        onRestore={onRestore}
        onEdit={onEdit}
        onPrint={onPrint}
        onDelete={onDelete}
        onCancel={() => requestClose(onCancel)}
        onResetNew={handleReset}
      />
    </form>
  );
}

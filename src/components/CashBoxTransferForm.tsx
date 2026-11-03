import { useState, type FormEvent } from 'react';
import { Check, Pencil, Printer, RotateCcw, Save, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, round2, today, formatDate } from '../lib/format';
import { translateDbError } from '../lib/errors';
import { tafqeet } from '../lib/tafqeet';
import { toast } from './Toast';
import SearchableSelect from './SearchableSelect';
import DateInput from './DateInput';
import type { CashBoxRow, CashBoxTransferRow } from '../lib/types';

interface Props {
  cashBoxes: CashBoxRow[];
  editing: CashBoxTransferRow | null;
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
    editing?.source_cash_box_id ?? activeBoxes.find((box) => box.is_primary)?.id ?? activeBoxes[0]?.id ?? '',
  );
  const [destinationId, setDestinationId] = useState(
    editing?.destination_cash_box_id ?? activeBoxes.find((box) => box.id !== sourceId)?.id ?? '',
  );
  const [date, setDate] = useState(editing?.transfer_date ?? today());
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const numAmount = Number(amount || 0);
  const tafqeetText = numAmount > 0 ? tafqeet(numAmount) : '';

  // حساب الأرصدة قبل وبعد
  const sourceBox = cashBoxes.find((box) => box.id === sourceId);
  const destBox = cashBoxes.find((box) => box.id === destinationId);

  const prevAmount = editing ? Number(editing.amount) : 0;
  const editSourceAdj = editing?.source_cash_box_id === sourceId ? prevAmount : editing?.destination_cash_box_id === sourceId ? -prevAmount : 0;
  const editDestAdj = editing?.destination_cash_box_id === destinationId ? -prevAmount : editing?.source_cash_box_id === destinationId ? prevAmount : 0;

  const sourceAvailableBalance = Math.max(0, Number(sourceBox?.balance ?? 0) + editSourceAdj);
  const destInitialBalance = Math.max(0, Number(destBox?.balance ?? 0) + editDestAdj);

  const sourceBalanceAfter = sourceAvailableBalance - numAmount;
  const destBalanceAfter = destInitialBalance + numAmount;

  const isOverdraft = !isReadOnly && numAmount > sourceAvailableBalance;

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
    setAmount('');
    setNotes('');
    toast.info('تم تفريغ الحقول للبدء من جديد');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnly) return;
    if (!sourceId || !destinationId || sourceId === destinationId) {
      return toast.error('اختر خزنتين مختلفتين (خزنة المصدر وخزنة الوجهة)');
    }
    if (!(numAmount > 0)) {
      return toast.error('أدخل مبلغًا صحيحاً أكبر من صفر');
    }
    if (isOverdraft) {
      return toast.error(`المبلغ المطلوب تحويله يتجاوز رصيد خزنة المصدر (${money(sourceAvailableBalance)})`);
    }

    setBusy(true);
    const args = {
      p_source_cash_box_id: sourceId,
      p_destination_cash_box_id: destinationId,
      p_transfer_date: date,
      p_amount: round2(numAmount),
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
      <div className="account-header-card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>تاريخ التحويل:</span>
        {isReadOnly ? (
          <div className="readonly-val-box num" dir="ltr" style={{ minHeight: '34px', padding: '0 10px' }}>
            {formatDate(date)}
          </div>
        ) : (
          <div style={{ width: '160px' }}>
            <DateInput value={date} onChange={setDate} />
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
                value={sourceId}
                options={activeBoxes.map((box) => ({
                  value: box.id,
                  label: `${box.name} (${money(box.balance)})`,
                }))}
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
            <div className="account-balance-pills" style={{ marginTop: '8px' }}>
              <div className="stat-pill">
                <span>الرصيد المتاح:</span>
                <strong dir="ltr" className="num">{money(sourceAvailableBalance)}</strong>
              </div>
              <div className="stat-pill">
                <span>الرصيد بعد:</span>
                <strong dir="ltr" className="num">{money(sourceBalanceAfter)}</strong>
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
                value={destinationId}
                options={activeBoxes
                  .filter((box) => box.id !== sourceId)
                  .map((box) => ({
                    value: box.id,
                    label: `${box.name} (${money(box.balance)})`,
                  }))}
                onChange={setDestinationId}
                placeholder="اختر خزنة الوجهة…"
                searchPlaceholder="ابحث باسم الخزنة…"
                emptyMessage="لا توجد خزن متاحة"
                required
              />
            )}
          </label>
          {destBox && (
            <div className="account-balance-pills" style={{ marginTop: '8px' }}>
              <div className="stat-pill">
                <span>الرصيد الحالي:</span>
                <strong dir="ltr" className="num">{money(destInitialBalance)}</strong>
              </div>
              <div className="stat-pill">
                <span>الرصيد بعد:</span>
                <strong dir="ltr" className="num">{money(destBalanceAfter)}</strong>
                <span className="stat-pill-tag tag-credit">زيادة</span>
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
                <div
                  className="readonly-val-box num strong"
                  dir="ltr"
                  style={{ fontSize: '16px', color: 'var(--primary, #0f172a)' }}
                >
                  {money(numAmount)}
                </div>
              ) : (
                <div className="amount-input-with-action">
                  <input
                    aria-label="المبلغ المراد تحويله"
                    type="number"
                    inputMode="decimal"
                    min="0.0001"
                    step="0.0001"
                    dir="ltr"
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
            <span className="tafqeet-label">المبلغ بالحروف</span>
            <span className={`tafqeet-text ${tafqeetText ? 'has-value' : 'empty'}`}>
              {tafqeetText || 'سيظهر تفقيط المبلغ بالعربية هنا…'}
            </span>
          </div>
        </div>
      </div>

      {isOverdraft && (
        <div className="overdraft-warning-badge" role="alert">
          تنبيه: المبلغ ({money(numAmount)}) يتجاوز رصيد خزنة المصدر المتاح ({money(sourceAvailableBalance)})
        </div>
      )}

      {/* ملاحظات التحويل */}
      <div className="account-header-card" style={{ padding: '8px 12px' }}>
        {isReadOnly ? (
          <div className="readonly-val-box readonly-notes" style={{ minHeight: '38px' }}>
            {notes || 'لا توجد ملاحظات على التحويل'}
          </div>
        ) : (
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="ملاحظات اختيارية على عملية التحويل…"
            className="account-notes-input"
            aria-label="ملاحظات التحويل"
          />
        )}
      </div>

      {/* أزرار الإجراءات الموحدة */}
      {isReadOnly ? (
        <div className="form-modal-actions readonly-actions-group" style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: '10px' }}>
          {onRestore && (
            <button type="button" className="btn primary" onClick={onRestore}>
              <RotateCcw size={15} />
              <span>استعادة التحويل</span>
            </button>
          )}
          {onEdit && (
            <button type="button" className="btn primary" onClick={onEdit}>
              <Pencil size={15} />
              <span>تعديل التحويل</span>
            </button>
          )}
          <button type="button" className="btn" onClick={onPrint ?? (() => window.print())}>
            <Printer size={15} />
            <span>طباعة</span>
          </button>
          {onDelete && (
            <button type="button" className="btn danger" onClick={onDelete}>
              <Trash2 size={15} />
              <span>حذف</span>
            </button>
          )}
          <button type="button" className="btn" onClick={onCancel}>
            <span>إغلاق</span>
          </button>
        </div>
      ) : (
        <div className="form-modal-actions">
          <button type="submit" className="btn primary" disabled={busy || isOverdraft}>
            <Save size={16} />
            <span>{busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ التحويل بين الخزن'}</span>
          </button>
          {editing ? (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              <span>إلغاء</span>
            </button>
          ) : (
            <button type="button" className="btn" onClick={handleReset} disabled={busy}>
              <RotateCcw size={14} />
              <span>مسح / جديد</span>
            </button>
          )}
        </div>
      )}
    </form>
  );
}

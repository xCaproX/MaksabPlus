import { useState, type FormEvent } from 'react';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, round2, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import { toast } from './Toast';
import SearchableSelect from './SearchableSelect';
import DateInput from './DateInput';
import type { CashBoxRow, CashBoxTransferRow } from '../lib/types';

interface Props {
  cashBoxes: CashBoxRow[];
  editing: CashBoxTransferRow | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

export default function CashBoxTransferForm({ cashBoxes, editing, onSaved, onCancel: _onCancel }: Props) {
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

  const isOverdraft = numAmount > sourceAvailableBalance;

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
    <form className="cashbox-transfer-form" onSubmit={submit}>
      {/* شبكة الخزنتين وبطاقات الأرصدة الديناميكية */}
      <div className="cashbox-transfer-boxes-grid">
        {/* خزنة المصدر */}
        <div className="box-card source-box-card">
          <label className="box-card-label">
            <span>من خزنة (المصدر)</span>
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
          </label>
          {sourceBox && (
            <div className="box-balance-dynamic-strip">
              <div className="bal-pill">
                <span>الرصيد المتاح:</span>
                <strong dir="ltr" className="num">{money(sourceAvailableBalance)}</strong>
              </div>
              <div className={`bal-pill ${sourceBalanceAfter < 0 ? 'is-danger' : ''}`}>
                <span>الرصيد بعد التحويل:</span>
                <strong dir="ltr" className="num">{money(sourceBalanceAfter)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* خزنة الوجهة */}
        <div className="box-card dest-box-card">
          <label className="box-card-label">
            <span>إلى خزنة (الوجهة)</span>
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
          </label>
          {destBox && (
            <div className="box-balance-dynamic-strip">
              <div className="bal-pill">
                <span>الرصيد الحالي:</span>
                <strong dir="ltr" className="num">{money(destInitialBalance)}</strong>
              </div>
              <div className="bal-pill is-increase">
                <span>الرصيد بعد التحويل:</span>
                <strong dir="ltr" className="num">{money(destBalanceAfter)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* صف المبلغ والتاريخ */}
      <div className="cashbox-transfer-amount-row">
        <div className="transfer-amount-card">
          <span className="card-title">المبلغ المراد تحويله</span>
          <div className="amount-input-wrap">
            <div className="amount-quick-btns">
              <button
                type="button"
                className="btn-paid-quick btn-paid-all"
                onClick={handleSettleAll}
                title="نقل كامل رصيد خزنة المصدر"
                aria-label="نقل كامل الرصيد"
              >
                <Check size={14} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className="btn-paid-quick btn-paid-zero"
                onClick={() => setAmount('0.00')}
                title="تصفير المبلغ"
                aria-label="تصفير المبلغ"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <input
              aria-label="المبلغ المنقول"
              type="number"
              min="0.0001"
              step="0.0001"
              dir="ltr"
              placeholder="0.00"
              value={amount}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setAmount(e.target.value)}
              className="transfer-amount-input no-spinner num"
              required
            />
          </div>
        </div>

        <label className="transfer-date-label">
          <span>تاريخ التحويل</span>
          <DateInput value={date} onChange={setDate} required />
        </label>
      </div>

      {isOverdraft && (
        <div className="overdraft-warning-badge" role="alert">
          تنبيه: المبلغ ({money(numAmount)}) يتجاوز رصيد خزنة المصدر المتاح ({money(sourceAvailableBalance)})
        </div>
      )}

      {/* الملاحظات */}
      <label className="transfer-notes-block">
        <span>ملاحظات التحويل</span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="ملاحظات اختيارية على عملية التحويل…"
          className="transfer-notes-input"
        />
      </label>

      {/* أزرار الإجراءات */}
      <div className="transfer-actions-bar">
        <button type="submit" className="btn primary btn-transfer-save" disabled={busy || isOverdraft}>
          <Save size={16} />
          <span>{busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ التحويل بين الخزن'}</span>
        </button>
        <button type="button" className="btn btn-transfer-clear" onClick={handleReset} disabled={busy}>
          <RotateCcw size={14} />
          <span>مسح / جديد</span>
        </button>
      </div>
    </form>
  );
}

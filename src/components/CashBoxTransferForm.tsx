import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { money, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import { toast } from './Toast';
import type { CashBoxRow, CashBoxTransferRow } from '../lib/types';

interface Props {
  cashBoxes: CashBoxRow[];
  editing: CashBoxTransferRow | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

export default function CashBoxTransferForm({ cashBoxes, editing, onSaved, onCancel }: Props) {
  const activeBoxes = cashBoxes.filter((box) => box.is_active || box.id === editing?.source_cash_box_id || box.id === editing?.destination_cash_box_id);
  const [sourceId, setSourceId] = useState(editing?.source_cash_box_id ?? activeBoxes.find((box) => box.is_primary)?.id ?? activeBoxes[0]?.id ?? '');
  const [destinationId, setDestinationId] = useState(editing?.destination_cash_box_id ?? activeBoxes.find((box) => box.id !== sourceId)?.id ?? '');
  const [date] = useState(editing?.transfer_date ?? today());
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const sourceBalance = Number(cashBoxes.find((box) => box.id === sourceId)?.balance ?? 0);
  const editBalanceAdjustment = editing?.source_cash_box_id === sourceId
    ? Number(editing.amount)
    : editing?.destination_cash_box_id === sourceId ? -Number(editing.amount) : 0;
  const maxAmount = Math.max(0, sourceBalance + editBalanceAdjustment);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!sourceId || !destinationId || sourceId === destinationId) return toast.error('اختر خزنتين مختلفتين');
    if (!(numericAmount > 0)) return toast.error('أدخل مبلغًا أكبر من صفر');
    setBusy(true);
    const args = {
      p_source_cash_box_id: sourceId,
      p_destination_cash_box_id: destinationId,
      p_transfer_date: date,
      p_amount: numericAmount,
      p_notes: notes.trim() || null,
    };
    const { error: rpcError } = editing
      ? await supabase.rpc('update_cash_box_transfer', { p_transfer_id: editing.id, ...args })
      : await supabase.rpc('create_cash_box_transfer', args);
    setBusy(false);
    if (rpcError) return toast.error(translateDbError(rpcError.message));
    onSaved(editing ? `تم تعديل التحويل ${editing.number}` : 'تم حفظ التحويل بين الخزن');
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="form-grid-col-6">
          من خزنة (المصدر)
          <select value={sourceId} onChange={(event) => {
            const next = event.target.value;
            setSourceId(next);
            if (next === destinationId) setDestinationId(activeBoxes.find((box) => box.id !== next)?.id ?? '');
          }} required>
            <option value="">اختر خزنة المصدر…</option>
            {activeBoxes.map((box) => <option key={box.id} value={box.id}>{box.name} — رصيدها: {money(box.balance)}</option>)}
          </select>
        </label>
        <label className="form-grid-col-6">
          إلى خزنة (الوجهة)
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
            <option value="">اختر خزنة الوجهة…</option>
            {activeBoxes.filter((box) => box.id !== sourceId).map((box) => <option key={box.id} value={box.id}>{box.name} — رصيدها: {money(box.balance)}</option>)}
          </select>
        </label>
        <label className="form-grid-col-4">
          المبلغ المنقول
          <input
            type="number"
            min="0.0001"
            step="0.0001"
            dir="ltr"
            placeholder="0.00"
            max={maxAmount}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        <label className="form-grid-col-8">
          ملاحظات التحويل
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات التحويل (اختياري)…" />
        </label>
      </div>

      {Number(amount) > 0 && (
        <div className="invoice-totals-bar">
          <div className="total-stat-box grand-total">
            <span className="stat-box-title">المبلغ المراد تحويله بين الخزنتين</span>
            <strong className="stat-box-num">{money(Number(amount))}</strong>
          </div>
        </div>
      )}

      <div className="form-modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ التحويل'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

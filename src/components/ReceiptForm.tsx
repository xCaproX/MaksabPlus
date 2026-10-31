import { useState, type FormEvent } from 'react';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, round2, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import DateInput from './DateInput';
import { toast } from './Toast';
import type {
  AccountKind,
  AccountRow,
  CashBoxRow,
  ReceiptDirection,
  ReceiptRow,
} from '../lib/types';

interface ReceiptFormProps {
  direction: ReceiptDirection;
  accounts: AccountRow[];
  cashBoxes: CashBoxRow[];
  editing: ReceiptRow | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

export default function ReceiptForm({
  direction,
  accounts,
  cashBoxes,
  editing,
  onSaved,
  onCancel: _onCancel,
}: ReceiptFormProps) {
  const isIn = direction === 'in';
  const defaultAccountKind: AccountKind = editing?.account_kind ?? (isIn ? 'customer' : 'supplier');
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultAccountKind);
  const [accountId, setAccountId] = useState(editing?.account_id ?? '');

  const activeCashBoxes = cashBoxes.filter((box) => box.is_active || box.id === editing?.cash_box_id);
  const defaultCashBox = activeCashBoxes.find((b) => b.is_primary) ?? activeCashBoxes[0];
  const [cashBoxId, setCashBoxId] = useState(editing?.cash_box_id ?? defaultCashBox?.id ?? '');

  const [date, setDate] = useState(editing?.receipt_date ?? today());
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [description, setDescription] = useState(editing?.statement ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const selectableAccounts = accounts.filter((account) => account.kind === accountKind);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCust = (selectedAccount?.kind ?? accountKind) === 'customer';
  const currentBalance = Number(selectedAccount?.balance || 0);
  const prevAmount = editing ? Number(editing.amount || 0) : 0;

  // الرصيد قبل المعاملة الحالية
  let balanceBefore = currentBalance;
  if (editing) {
    if (isCust) {
      balanceBefore = editing.direction === 'in' ? currentBalance + prevAmount : currentBalance - prevAmount;
    } else {
      balanceBefore = editing.direction === 'out' ? currentBalance + prevAmount : currentBalance - prevAmount;
    }
  }

  const numAmount = Number(amount || 0);

  // الرصيد بعد المعاملة الحالية
  let balanceAfter = balanceBefore;
  if (isCust) {
    balanceAfter = isIn ? balanceBefore - numAmount : balanceBefore + numAmount;
  } else {
    balanceAfter = isIn ? balanceBefore + numAmount : balanceBefore - numAmount;
  }

  function getBalanceStatus(balance: number, kind: AccountKind): { text: string; type: 'settled' | 'debit' | 'credit' } {
    const rounded = round2(balance);
    if (rounded === 0) return { text: 'خالص', type: 'settled' };
    if (kind === 'customer') {
      return rounded > 0 ? { text: 'عليه', type: 'debit' } : { text: 'له', type: 'credit' };
    }
    return rounded > 0 ? { text: 'له', type: 'credit' } : { text: 'عليه', type: 'debit' };
  }

  const statusBefore = getBalanceStatus(balanceBefore, isCust ? 'customer' : 'supplier');
  const statusAfter = getBalanceStatus(balanceAfter, isCust ? 'customer' : 'supplier');

  const selectedCashBox = cashBoxes.find((b) => b.id === cashBoxId);
  const cashBoxAvailableBalance = Number(selectedCashBox?.balance || 0) + (editing && editing.cash_box_id === cashBoxId ? prevAmount : 0);
  const isOverdraft = !isIn && numAmount > cashBoxAvailableBalance;

  function handleAccountKindChange(nextKind: AccountKind) {
    setAccountKind(nextKind);
    setAccountId('');
  }

  function handleSettleAll() {
    if (!selectedAccount) {
      toast.warning('اختر الحساب أولاً');
      return;
    }
    if (isCust && isIn) {
      if (balanceBefore <= 0) {
        toast.info('العميل ليس عليه مديونية حالياً');
        setAmount('0.00');
        return;
      }
      setAmount(round2(balanceBefore).toFixed(2));
      toast.info(`تم إدراج كامل مديونية العميل (${money(balanceBefore)})`);
    } else if (!isCust && !isIn) {
      if (balanceBefore <= 0) {
        toast.info('المورد ليس له مستحقات حالياً');
        setAmount('0.00');
        return;
      }
      setAmount(round2(balanceBefore).toFixed(2));
      toast.info(`تم إدراج كامل مستحقات المورد (${money(balanceBefore)})`);
    } else {
      setAmount(round2(Math.abs(balanceBefore)).toFixed(2));
    }
  }

  function handleResetNew() {
    setAmount('');
    setDescription('');
    setNotes('');
    if (!editing) {
      setAccountId('');
    }
    toast.info('تم تفريغ الحقول للبدء من جديد');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId) return toast.error('اختر الحساب أولاً');
    if (!cashBoxId) return toast.error('اختر الخزنة');
    if (!date) return toast.error('أدخل التاريخ');
    if (!(numAmount > 0)) return toast.error('أدخل مبلغاً صحيحاً أكبر من صفر');

    if (isOverdraft) {
      return toast.error(`رصيد الخزنة غير كافٍ لصرف هذا المبلغ. الرصيد المتاح هو ${money(cashBoxAvailableBalance)}`);
    }

    setBusy(true);
    const args = {
      p_account_id: accountId,
      p_cash_box_id: cashBoxId,
      p_receipt_date: date,
      p_amount: round2(numAmount),
      p_description: description.trim() || null,
      p_notes: notes.trim() || null,
    };

    const { error: rpcError } = editing
      ? await supabase.rpc('update_free_receipt', { p_receipt_id: editing.id, ...args })
      : await supabase.rpc('create_free_receipt', { p_direction: direction, ...args });

    setBusy(false);

    if (rpcError) {
      toast.error(translateDbError(rpcError.message));
      return;
    }

    onSaved(
      editing
        ? `تم تعديل الإيصال ${editing.number}`
        : `تم حفظ إيصال ${isIn ? 'الاستلام' : 'الصرف'} بنجاح`,
    );
  }

  return (
    <form className="receipt-form receipt-two-parts-layout" onSubmit={submit}>
      {/* ====================================================================
          الجانب الأيمن: بيانات الحساب، شريط المديونيات، وتفاصيل الإيصال
          ==================================================================== */}
      <div className="receipt-part-right">
        {/* كارت الحساب وشريط المديونية */}
        <div className="right-card receipt-account-card">
          <div className="receipt-account-row1">
            <label className="field-account-kind">
              <span>نوع الحساب</span>
              <SearchableSelect
                value={accountKind}
                options={[
                  { value: 'customer', label: 'عميل' },
                  { value: 'supplier', label: 'مورد' },
                ]}
                onChange={(val) => handleAccountKindChange(val as AccountKind)}
                placeholder="اختر النوع…"
                searchPlaceholder="بحث في الأنواع…"
              />
            </label>

            <label className="field-account-select">
              <span>{isIn ? 'استلام من (الطرف المسدد)' : 'صرف إلى (المستفيد)'}</span>
              <SearchableSelect
                value={accountId}
                options={selectableAccounts.map((account) => ({
                  value: account.id,
                  label: account.phone ? `${account.name} — ${account.phone}` : account.name,
                }))}
                onChange={setAccountId}
                placeholder="ابحث باسم أو هاتف الحساب…"
                searchPlaceholder="اكتب اسم أو هاتف الحساب…"
                emptyMessage="لا يوجد حساب مطابق"
              />
            </label>
          </div>

          {/* شريط المديونيات الموحد (المديونية قبل - صافي الإيصال - المديونية بعد) */}
          <div className="receipt-debt-strip">
            <div className="debt-stat-pill">
              <span className="stat-label">المديونية قبل:</span>
              <strong dir="ltr" className="stat-amount num">
                {money(Math.abs(balanceBefore))}
              </strong>
              <span className={`status-badge-mini status-${statusBefore.type}`}>
                {statusBefore.text}
              </span>
            </div>

            <div className="debt-stat-pill pill-net-invoice">
              <span className="stat-label">صافي الإيصال:</span>
              <strong dir="ltr" className="stat-amount num">
                {money(numAmount)}
              </strong>
            </div>

            <div className="debt-stat-pill">
              <span className="stat-label">المديونية بعد:</span>
              <strong dir="ltr" className="stat-amount num">
                {money(Math.abs(balanceAfter))}
              </strong>
              <span className={`status-badge-mini status-${statusAfter.type}`}>
                {statusAfter.text}
              </span>
            </div>
          </div>
        </div>

        {/* كارت التفاصيل: التاريخ والبيان والملاحظات */}
        <div className="right-card receipt-details-card">
          <div className="receipt-details-row1">
            <label className="field-receipt-date">
              <span>تاريخ الإيصال</span>
              <DateInput value={date} onChange={setDate} required />
            </label>

            <label className="field-receipt-cashbox">
              <span>الخزنة {isIn ? 'المستلمة' : 'المنصرفة'}</span>
              <SearchableSelect
                value={cashBoxId}
                options={activeCashBoxes.map((box) => ({
                  value: box.id,
                  label: `${box.name} (${money(box.balance)})`,
                }))}
                onChange={setCashBoxId}
                placeholder="اختر الخزنة…"
                searchPlaceholder="ابحث باسم الخزنة…"
                emptyMessage="لا توجد خزنة نشطة"
              />
            </label>
          </div>

          <label className="receipt-field-block">
            <span>البيان</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="سبب أو وصف المعاملة…"
              className="receipt-input-full"
            />
          </label>

          <label className="receipt-field-block">
            <span>ملاحظات</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية على الإيصال…"
              className="receipt-textarea"
            />
          </label>
        </div>
      </div>

      {/* ====================================================================
          الجانب الأيسر: كارت المبلغ، أزرار السداد السريع، وزر الحفظ
          ==================================================================== */}
      <div className="receipt-part-left">
        {/* كارت المبلغ الكبير والبارز */}
        <div className="left-row-strip left-amount-strip">
          <span className="strip-label">
            المبلغ المراد {isIn ? 'قبضه' : 'صرفه'}
          </span>
          <div className="strip-center-slot">
            <div className="amount-quick-actions">
              <button
                type="button"
                className="btn-paid-quick btn-paid-all"
                onClick={handleSettleAll}
                title="تسوية كامل المديونية بنقرة واحدة"
                aria-label="تسوية كامل المديونية"
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
          </div>
          <div className="strip-value-box">
            <input
              aria-label="مبلغ الإيصال"
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
          </div>
        </div>

        {/* تنبيه الرصيد المتاح عند الصرف */}
        {!isIn && (
          <div className={`cashbox-balance-hint ${isOverdraft ? 'is-danger' : ''}`}>
            <span>رصيد الخزنة المتاح:</span>
            <strong dir="ltr" className="num">
              {money(cashBoxAvailableBalance)}
            </strong>
          </div>
        )}

        {isOverdraft && (
          <div className="overdraft-warning-badge" role="alert">
            تنبيه: المبلغ يتجاوز الرصيد المتوفر بالخزنة المحددة
          </div>
        )}

        {/* أزرار الإجراءات الرئيسية */}
        <div className="receipt-actions-group">
          <button
            type="submit"
            className="btn primary btn-receipt-save"
            disabled={busy || isOverdraft}
          >
            <Save size={16} />
            <span>
              {busy
                ? 'جارٍ الحفظ…'
                : editing
                ? 'حفظ التعديلات'
                : `حفظ إيصال ${isIn ? 'الاستلام' : 'الصرف'}`}
            </span>
          </button>

          <button
            type="button"
            className="btn btn-receipt-clear"
            onClick={handleResetNew}
            disabled={busy}
            title="مسح الحقول والبدء من جديد"
          >
            <RotateCcw size={14} />
            <span>مسح / جديد</span>
          </button>
        </div>
      </div>
    </form>
  );
}

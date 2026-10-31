import { useState, type FormEvent } from 'react';
import { Check, RotateCcw, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, round2, today, getBalanceStatus } from '../lib/format';
import { tafqeet } from '../lib/tafqeet';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
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

  // التاريخ يتم حفظه تلقائياً بالتاريخ الحالي دون الحاجة لحقل إدخال بالواجهة
  const date = editing?.receipt_date ?? today();
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? editing?.statement ?? '');
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
        return;
      }
      setAmount(round2(balanceBefore).toFixed(2));
      toast.info(`تم إدراج كامل مديونية العميل (${money(balanceBefore)})`);
    } else if (!isCust && !isIn) {
      if (balanceBefore <= 0) {
        toast.info('المورد ليس له مستحقات حالياً');
        return;
      }
      setAmount(round2(balanceBefore).toFixed(2));
      toast.info(`تم إدراج كامل مستحقات المورد (${money(balanceBefore)})`);
    } else {
      const positiveBal = Math.abs(balanceBefore);
      if (positiveBal <= 0) {
        toast.info('لا يوجد رصيد مستحق على هذا الحساب');
        return;
      }
      setAmount(round2(positiveBal).toFixed(2));
    }
  }

  function handleResetNew() {
    setAmount('');
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
    if (!(numAmount > 0)) return toast.error('أدخل مبلغاً صحيحاً أكبر من صفر');

    if (isOverdraft) {
      return toast.error(`رصيد الخزنة غير كافٍ لصرف هذا المبلغ. الرصيد المتاح هو ${money(cashBoxAvailableBalance)}`);
    }

    setBusy(true);
    const trimmedNotes = notes.trim() || null;
    const args = {
      p_account_id: accountId,
      p_cash_box_id: cashBoxId,
      p_receipt_date: date,
      p_amount: round2(numAmount),
      p_description: trimmedNotes,
      p_notes: trimmedNotes,
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

  const tafqeetText = numAmount > 0 ? tafqeet(numAmount) : '';

  return (
    <form className="receipt-form receipt-single-layout" onSubmit={submit}>
      {/* -------------------------------------------------------------------
          بطاقة الحساب الموحدة (السطر الأول: نوع الحساب والحساب + السطر الثاني: الملاحظات والمديونيات)
          مطابقة تامة وموحدة مع فاتورة المبيعات
          ------------------------------------------------------------------- */}
      <div className="account-header-card">
        <div className="account-header-row1 receipt-account-row1">
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

          <label className="field-account-main">
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

        <div className="account-header-row2">
          <div className="field-account-notes">
            <input
              type="text"
              readOnly
              value={selectedAccount?.notes || ''}
              placeholder="لا توجد ملاحظات على الحساب"
              className="account-notes-input"
              title={selectedAccount?.notes || 'لا توجد ملاحظات على الحساب'}
              aria-label="ملاحظات الحساب"
            />
          </div>

          <div className="account-balance-pills">
            <div className="stat-pill">
              <span>المديونية قبل:</span>
              <strong dir="ltr" className="num">
                {money(Math.abs(balanceBefore))}
              </strong>
              <span className={`stat-pill-tag tag-${statusBefore.type}`}>
                {statusBefore.text}
              </span>
            </div>

            <div className="stat-pill">
              <span>صافي الإيصال:</span>
              <strong dir="ltr" className="num">
                {money(numAmount)}
              </strong>
            </div>

            <div className="stat-pill">
              <span>المديونية بعد:</span>
              <strong dir="ltr" className="num">
                {money(Math.abs(balanceAfter))}
              </strong>
              <span className={`stat-pill-tag tag-${statusAfter.type}`}>
                {statusAfter.text}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          السطر الثالث: المبلغ المراد استلامه - زرار استلام كامل المديونية - تفقيط المبلغ بالعربي
          ------------------------------------------------------------------- */}
      <div className="receipt-amount-card">
        <div className="row-amount-tafqeet">
          <div className="field-amount-slot">
            <label>
              <span>{isIn ? 'المبلغ المراد استلامه' : 'المبلغ المراد صرفه'}</span>
              <div className="amount-input-with-action">
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
                <button
                  type="button"
                  className="btn-settle-all-action"
                  onClick={handleSettleAll}
                  title="استلام كامل المديونية"
                  aria-label="استلام كامل المديونية"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>كامل المديونية</span>
                </button>
              </div>
            </label>
          </div>

          <div className="field-tafqeet-card">
            <span className="tafqeet-label">تفقيط المبلغ:</span>
            <span className={`tafqeet-text ${tafqeetText ? 'has-value' : 'empty'}`}>
              {tafqeetText || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          السطر الرابع: الخزنة المستلمة - ملاحظات
          ------------------------------------------------------------------- */}
      <div className="receipt-meta-card">
        <div className="row-cashbox-notes">
          <label className="field-cashbox-select">
            <span>الخزنة {isIn ? 'المستلمة' : 'المنصرف منها'}</span>
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

          <label className="field-receipt-notes">
            <span>ملاحظات</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية على الإيصال…"
              className="receipt-notes-input"
            />
          </label>
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

      {/* -------------------------------------------------------------------
          السطر الخامس: حفظ - مسح / جديد
          ------------------------------------------------------------------- */}
      <div className="row-actions-group">
        <button
          type="submit"
          className="btn primary btn-receipt-save-full"
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
          className="btn btn-receipt-clear-full"
          onClick={handleResetNew}
          disabled={busy}
          title="مسح الحقول والبدء من جديد"
        >
          <RotateCcw size={14} />
          <span>مسح / جديد</span>
        </button>
      </div>
    </form>
  );
}

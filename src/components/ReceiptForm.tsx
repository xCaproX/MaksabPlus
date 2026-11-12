import DateDisplay from './DateDisplay';
import AccountBalancePills from './AccountBalancePills';
import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, FileText } from 'lucide-react';
import DocumentActionsBar from './DocumentActionsBar';
import { supabase } from '../lib/supabase';
import { money, round2, today } from '../lib/format';
import { tafqeet } from '../lib/tafqeet';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import { searchAccountsAsync } from '../lib/masterDataQueries';
import { resolveDefaultCashBox, sortCashBoxesWithPrimaryFirst } from '../lib/defaults';
import DateInput from './DateInput';
import MoneyDisplay from './MoneyDisplay';
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
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onPrint?: () => void;
}

function linkKind(k: string | null | undefined) {
  if (k === 'sale') return 'فاتورة مبيعات';
  if (k === 'purchase') return 'فاتورة مشتريات';
  if (k === 'sale_return') return 'مرتجع مبيعات';
  if (k === 'purchase_return') return 'مرتجع مشتريات';
  return 'فاتورة';
}

export default function ReceiptForm({
  direction,
  accounts,
  cashBoxes,
  editing,
  onSaved,
  onCancel,
  readOnly = false,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
}: ReceiptFormProps) {
  const isReadOnly = Boolean(readOnly);
  const isIn = direction === 'in';
  const defaultAccountKind: AccountKind = editing?.account_kind ?? (isIn ? 'customer' : 'supplier');
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultAccountKind);
  const [accountId, setAccountId] = useState(editing?.account_id ?? '');

  const activeCashBoxes = cashBoxes.filter((box) => box.is_active || box.id === editing?.cash_box_id);
  const defaultCashBox = resolveDefaultCashBox(activeCashBoxes);
  const [cashBoxId, setCashBoxId] = useState(editing?.cash_box_id ?? defaultCashBox?.id ?? '');

  // ترتيب الخزائن بحيث تتصدر الخزنة الرئيسية القائمة
  const sortedCashBoxes = sortCashBoxesWithPrimaryFirst(activeCashBoxes);

  // تعيين الخزنة الرئيسية تلقائياً عند تحميل الخزائن إذا لم تكن محددة
  useEffect(() => {
    if (!cashBoxId && !editing && activeCashBoxes.length > 0) {
      const primaryBox = resolveDefaultCashBox(activeCashBoxes);
      if (primaryBox) {
        setCashBoxId(primaryBox.id);
      }
    }
  }, [activeCashBoxes, cashBoxId, editing]);

  const [date, setDate] = useState(editing?.receipt_date ?? today());
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? editing?.statement ?? '');
  const [busy, setBusy] = useState(false);

  const selectableAccounts = accounts.filter((account) => account.kind === accountKind);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCust = (selectedAccount?.kind ?? accountKind) === 'customer';
  const currentBalance = Number(selectedAccount?.balance || 0);
  const prevAmount = editing ? Number(editing.amount || 0) : 0;

  // الرصيد قبل المعاملة الحالية
  const isSameEditingAccount = Boolean(editing) && accountId === editing?.account_id;
  let balanceBefore = currentBalance;
  if (isSameEditingAccount && editing) {
    if (isCust) {
      balanceBefore = editing.direction === 'in' ? currentBalance + prevAmount : currentBalance - prevAmount;
    } else {
      balanceBefore = editing.direction === 'out' ? currentBalance + prevAmount : currentBalance - prevAmount;
    }
  }

  const numAmount = Number(amount || 0);
  const roundedAmount = round2(numAmount);

  // الرصيد بعد المعاملة الحالية
  let balanceAfter: number;
  if (isCust) {
    balanceAfter = isIn ? balanceBefore - numAmount : balanceBefore + numAmount;
  } else {
    balanceAfter = isIn ? balanceBefore + numAmount : balanceBefore - numAmount;
  }



  const selectedCashBox = cashBoxes.find((b) => b.id === cashBoxId);
  const cashBoxAvailableBalance = Number(selectedCashBox?.balance || 0) + (editing && editing.cash_box_id === cashBoxId ? prevAmount : 0);
  const isOverdraft = !isIn && !isReadOnly && roundedAmount > cashBoxAvailableBalance;

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
      const primaryBox = resolveDefaultCashBox(activeCashBoxes);
      setCashBoxId(primaryBox?.id ?? '');
    }
    toast.info('تم تفريغ الحقول للبدء من جديد');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnly) return;
    if (!accountId) return toast.error('اختر الحساب أولاً');
    if (!cashBoxId) return toast.error('اختر الخزنة');
    if (!(roundedAmount > 0)) return toast.error('أدخل مبلغاً صحيحاً أكبر من صفر');

    if (isOverdraft) {
      return toast.error(`رصيد الخزنة غير كافٍ لصرف هذا المبلغ. الرصيد المتاح هو ${money(cashBoxAvailableBalance)}`);
    }

    setBusy(true);
    const trimmedNotes = notes.trim() || null;
    const args = {
      p_account_id: accountId,
      p_cash_box_id: cashBoxId,
      p_receipt_date: date,
      p_amount: roundedAmount,
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
    <form className={`receipt-form receipt-single-layout ${isReadOnly ? 'is-readonly' : ''}`} onSubmit={submit}>
      {/* -------------------------------------------------------------------
          بطاقة الحساب الموحدة (السطر الأول: التاريخ، نوع الحساب، والحساب + السطر الثاني: الملاحظات والمديونيات)
          مطابقة تامة وموحدة مع فاتورة المبيعات
          ------------------------------------------------------------------- */}
      <div className="account-header-card">
        <div className="account-header-row1 receipt-account-row1">
          <label className="field-receipt-date">
            <span>تاريخ الإيصال</span>
            {isReadOnly ? (
              <div className="readonly-val-box num">
                <DateDisplay value={date} />
              </div>
            ) : (
              <DateInput value={date} onChange={setDate} />
            )}
          </label>

          <label className="field-account-kind">
            <span>نوع الحساب</span>
            {isReadOnly || editing ? (
              <div className="readonly-val-box">
                {accountKind === 'customer' ? 'عميل' : 'مورد'}
              </div>
            ) : (
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
            )}
          </label>

          <label className="field-account-main">
            <span>{isIn ? 'استلام من (الطرف المسدد)' : 'صرف إلى (المستفيد)'}</span>
            {isReadOnly ? (
              <div className="readonly-val-box strong">
                {selectedAccount?.name ?? editing?.account_name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                value={accountId}
                selectedLabel={selectedAccount?.name ?? editing?.account_name}
                options={selectableAccounts.map((account) => ({
                  value: account.id,
                  label: account.phone ? `${account.name} — ${account.phone}` : account.name,
                }))}
                loadOptions={async (q) => {
                  if (selectableAccounts.length > 0 && selectableAccounts.length <= 50) {
                    const term = q.trim().toLowerCase();
                    return selectableAccounts
                      .filter((a) => !term || a.name.toLowerCase().includes(term) || (a.phone && a.phone.includes(term)))
                      .map((a) => ({
                        value: a.id,
                        label: a.phone ? `${a.name} — ${a.phone}` : a.name,
                      }));
                  }
                  return searchAccountsAsync(accountKind, q);
                }}
                onChange={setAccountId}
                placeholder="ابحث باسم أو هاتف الحساب…"
                searchPlaceholder="اكتب اسم أو هاتف الحساب…"
                emptyMessage="لا يوجد حساب مطابق"
              />
            )}
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

          <AccountBalancePills
            accountKind={accountKind}
            balanceBefore={balanceBefore}
            delta={numAmount}
            balanceAfter={balanceAfter}
            titleBefore="المديونية قبل:"
            deltaLabel="صافي الإيصال:"
            titleAfter="المديونية بعد:"
          />
        </div>
      </div>

      {/* -------------------------------------------------------------------
          السطر الثالث: المبلغ - زرار استلام كامل المديونية - تفقيط المبلغ بالعربي
          ------------------------------------------------------------------- */}
      <div className="receipt-amount-card">
        <div className="row-amount-tafqeet">
          <div className="field-amount-slot">
            <label>
              <span>{isIn ? 'المبلغ المستلم' : 'المبلغ المصروف'}</span>
              {isReadOnly ? (
                <div className="readonly-val-box readonly-amount-display">
                  <MoneyDisplay
                    value={numAmount}
                    strong
                    tone={isIn ? 'success' : 'primary'}
                  />
                </div>
              ) : (
                <div className="amount-input-with-action">
                  <input
                    aria-label="مبلغ الإيصال"
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
                  <span className="line-unit-suffix">ج.م</span>
                  <button
                    type="button"
                    className="btn-settle-all-action"
                    onClick={handleSettleAll}
                    title={isIn ? 'استلام كامل المديونية' : 'سداد كامل المستحق'}
                    aria-label={isIn ? 'استلام كامل المديونية' : 'سداد كامل المستحق'}
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>كامل المديونية</span>
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

      {/* -------------------------------------------------------------------
          السطر الرابع: الخزنة المستلمة - ملاحظات
          ------------------------------------------------------------------- */}
      <div className="receipt-meta-card">
        <div className="row-cashbox-notes">
          <label className="field-cashbox-select">
            <span>الخزنة {isIn ? 'المستلمة' : 'المنصرف منها'}</span>
            {isReadOnly ? (
              <div className="readonly-val-box">
                {selectedCashBox?.name ?? editing?.cash_box_name ?? '—'}
              </div>
            ) : (
              <SearchableSelect
                value={cashBoxId}
                options={sortedCashBoxes.map((box) => ({
                  value: box.id,
                  label: `${box.name} (${money(box.balance)})`,
                }))}
                onChange={setCashBoxId}
                placeholder="اختر الخزنة…"
                searchPlaceholder="ابحث باسم الخزنة…"
                emptyMessage="لا توجد خزنة نشطة"
              />
            )}
          </label>

          <label className="field-receipt-notes">
            <span>ملاحظات</span>
            {isReadOnly ? (
              <div className="readonly-val-box readonly-notes">
                {notes || 'لا توجد ملاحظات'}
              </div>
            ) : (
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية على الإيصال…"
                className="receipt-notes-input receipt-notes-textarea"
              />
            )}
          </label>
        </div>
      </div>

      {/* تنبيه الرصيد المتاح عند الصرف */}
      {!isIn && !isReadOnly && (
        <div className={`cashbox-balance-hint ${isOverdraft ? 'is-danger' : ''}`}>
          <span>رصيد الخزنة المتاح:</span>
          <MoneyDisplay value={cashBoxAvailableBalance} strong />
        </div>
      )}

      {isOverdraft && (
        <div className="overdraft-warning-badge" role="alert">
          تنبيه: المبلغ يتجاوز الرصيد المتوفر بالخزنة المحددة
        </div>
      )}

      {/* بطاقة الربط بفاتورة إن كان الإيصال مرتبطاً */}
      {editing && !editing.is_free && (
        <div className="linked-receipt-box">
          <span className="linked-receipt-label">هذا الإيصال مُنشأ تلقائيًا ومربوط بـ:</span>
          <Link
            to={`/invoices?tab=${editing.invoice_kind ?? 'sale'}&search=${encodeURIComponent(editing.invoice_number ?? '')}`}
            className="receipt-linked-link"
            onClick={onCancel}
          >
            <FileText size={15} />
            <span>{linkKind(editing.invoice_kind)} {editing.invoice_number}</span>
            <ExternalLink size={13} className="link-ext-icon" />
          </Link>
          <span className="muted" style={{ fontSize: '12px', marginInlineStart: 'auto' }}>
            يتم تعديله أو حذفه من داخل الفاتورة نفسها
          </span>
        </div>
      )}

      {/* -------------------------------------------------------------------
          السطر الخامس: أزرار الإجراءات (قراءة فقط أو تحرير/إضافة)
          ------------------------------------------------------------------- */}
      <DocumentActionsBar
        isReadOnly={isReadOnly}
        isEditing={Boolean(editing)}
        busy={busy}
        saveDisabled={isOverdraft}
        containerClassName="row-actions-group"
        saveLabel={editing ? 'حفظ التعديلات' : `حفظ إيصال ${isIn ? 'الاستلام' : 'الصرف'}`}
        restoreLabel="استعادة الإيصال"
        editLabel="تعديل الإيصال"
        printLabel="طباعة الإيصال"
        deleteLabel="حذف الإيصال"
        cancelTitle="إلغاء التعديل والعودة"
        resetTitle="مسح الحقول والبدء من جديد"
        showCancelIcon={false}
        saveClassName="btn-receipt-save-full"
        restoreClassName="btn-receipt-restore"
        editClassName="btn-receipt-edit"
        printClassName="btn-receipt-print"
        deleteClassName="btn-receipt-delete"
        closeClassName="btn-receipt-close"
        cancelClassName="btn-receipt-clear-full"
        resetClassName="btn-receipt-clear-full"
        onRestore={onRestore}
        onEdit={editing?.is_free ? onEdit : undefined}
        onPrint={onPrint}
        onDelete={editing?.is_free ? onDelete : undefined}
        onCancel={onCancel}
        onResetNew={handleResetNew}
      />
    </form>
  );
}

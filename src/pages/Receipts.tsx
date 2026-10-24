import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { creationTime, money, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import CashBoxTransferForm from '../components/CashBoxTransferForm';
import ConfirmDialog from '../components/ConfirmDialog';
import type {
  AccountRow,
  AccountKind,
  CashBoxRow,
  ReceiptDirection,
  ReceiptRow,
  CashBoxTransferRow,
} from '../lib/types';
import { useAccess } from '../lib/access';

function linkKind(kind: ReceiptRow['invoice_kind']) {
  return kind === 'sale_return' || kind === 'purchase_return' ? 'مرتجع' : 'فاتورة';
}

interface ConfirmationRequest { title: string; message: string; confirmLabel: string; resolve: (confirmed: boolean) => void }

const VALID_RECEIPT_TABS = ['in', 'out', 'cash_box_transfer'] as const;
type ReceiptTab = typeof VALID_RECEIPT_TABS[number];

export default function Receipts() {
  const { can } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ReceiptTab | null;
  const initialTab: ReceiptTab = (tabParam && VALID_RECEIPT_TABS.includes(tabParam)) ? tabParam : 'in';
  const [tab, setTab] = useState<ReceiptDirection | 'cash_box_transfer'>(initialTab);
  const [direction, setDirection] = useState<ReceiptDirection>(initialTab === 'cash_box_transfer' ? 'in' : initialTab);

  useEffect(() => {
    const targetTab = (tabParam && VALID_RECEIPT_TABS.includes(tabParam)) ? tabParam : 'in';
    if (targetTab !== tab) {
      setTab(targetTab);
      if (targetTab === 'in' || targetTab === 'out') {
        setDirection(targetTab);
        resetForm(targetTab);
      } else {
        resetForm();
      }
      setFormOpen(false);
      setEditing(null);
      setEditingTransfer(null);
    }
  }, [tabParam]);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [transferRows, setTransferRows] = useState<CashBoxTransferRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<CashBoxTransferRow | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [version, setVersion] = useState(0);
  const [cashBoxFilter, setCashBoxFilter] = useState('all');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const [accountId, setAccountId] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [cashBoxId, setCashBoxId] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function askConfirmation(message: string, confirmLabel: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmation({ title: 'تأكيد العملية', message, confirmLabel, resolve }));
  }

  function finishConfirmation(confirmed: boolean) {
    const request = confirmation;
    setConfirmation(null);
    request?.resolve(confirmed);
  }

  const isCashBoxTransfer = tab === 'cash_box_transfer';
  const isIn = direction === 'in';
  const selectableAccounts = accounts.filter(
    (account) => account.kind === accountKind && account.system_key === null,
  );
  const selectableCashBoxes = cashBoxes.filter((box) => box.is_active);
  const filteredRows = cashBoxFilter === 'all'
    ? rows
    : rows.filter((receipt) => receipt.cash_box_id === cashBoxFilter);
  const filteredTransferRows = cashBoxFilter === 'all'
    ? transferRows
    : transferRows.filter((transfer) => transfer.source_cash_box_id === cashBoxFilter || transfer.destination_cash_box_id === cashBoxFilter);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      const [accountsRes, boxesRes] = await Promise.all([
        supabase
          .from('v_account_balances')
          .select('*')
          .eq('is_active', true)
          .order('kind')
          .order('name'),
        supabase
          .from('v_cash_box_balances')
          .select('*')
          .order('name'),
      ]);

      let receiptData: ReceiptRow[] = [];
      let transferData: CashBoxTransferRow[] = [];
      let documentError: { message: string } | null = null;
      if (isCashBoxTransfer) {
        const query = supabase.from('v_cash_box_transfer_list').select('*');
        const result = showDeleted
          ? await query.not('deleted_at', 'is', null).order('transfer_date', { ascending: false }).order('number', { ascending: false })
          : await query.is('deleted_at', null).order('transfer_date', { ascending: false }).order('number', { ascending: false });
        documentError = result.error;
        transferData = (result.data ?? []) as CashBoxTransferRow[];
      } else {
        const query = supabase.from('v_receipt_list').select('*').eq('direction', direction);
        const result = showDeleted
          ? await query.not('deleted_at', 'is', null).order('receipt_date', { ascending: false }).order('number', { ascending: false })
          : await query.is('deleted_at', null).order('receipt_date', { ascending: false }).order('number', { ascending: false });
        documentError = result.error;
        receiptData = (result.data ?? []) as ReceiptRow[];
      }

      if (!alive) return;

      const firstError = documentError ?? accountsRes.error ?? boxesRes.error;
      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setRows(receiptData);
      setTransferRows(transferData);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setCashBoxes((boxesRes.data ?? []) as CashBoxRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [direction, tab, version, showDeleted]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // اختر أول خزنة نشطة تلقائيًا بعد التحميل.
  useEffect(() => {
    if (!cashBoxId && selectableCashBoxes.length > 0) setCashBoxId(selectableCashBoxes[0].id);
  }, [cashBoxId, selectableCashBoxes]);

  function resetForm(forDirection: ReceiptDirection = direction) {
    setEditing(null);
    setAccountId('');
    setAccountKind(forDirection === 'in' ? 'customer' : 'supplier');
    setCashBoxId(selectableCashBoxes[0]?.id ?? '');
    setDate(today());
    setAmount('');
    setDescription('');
    setNotes('');
    setError('');
  }

  function switchDirection(next: ReceiptDirection) {
    if (next === tab) return;
    setDirection(next);
    setTab(next);
    setSearchParams({ tab: next });
    setFormOpen(false);
    setEditingTransfer(null);
    resetForm(next);
  }

  function switchToCashTransfer() {
    setTab('cash_box_transfer');
    setSearchParams({ tab: 'cash_box_transfer' });
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
    setError('');
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    resetForm();
    setEditingTransfer(null);
  }

  function openNew() {
    if (isCashBoxTransfer) {
      setEditing(null);
      setEditingTransfer(null);
      setFormOpen(true);
      return;
    }
    resetForm();
    setFormOpen(true);
  }

  function startEdit(receipt: ReceiptRow) {
    setEditingTransfer(null);
    setEditing(receipt);
    setAccountKind(receipt.account_kind);
    setAccountId(receipt.account_id);
    setCashBoxId(receipt.cash_box_id);
    setDate(receipt.receipt_date);
    setAmount(String(Number(receipt.amount)));
    setDescription(receipt.description ?? '');
    setNotes(receipt.notes ?? '');
    setError('');
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingTransfer(null);
    resetForm();
  }

  async function removeTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيُعاد المبلغ إلى خزنة المصدر.`, 'حذف'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('delete_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    setVersion((current) => current + 1);
  }

  async function restoreTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيُخصم المبلغ من خزنة المصدر ويضاف للوجهة.`, 'استعادة'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('restore_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم استعادة التحويل ${transfer.number}`);
    setVersion((current) => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!accountId) return setError('اختر الحساب');
    if (!cashBoxId) return setError('اختر الخزنة');
    if (!date) return setError('أدخل التاريخ');

    const amountNumber = Number(amount);
    if (!(amountNumber > 0)) return setError('المبلغ يجب أن يكون أكبر من صفر');

    const args = {
      p_account_id: accountId,
      p_cash_box_id: cashBoxId,
      p_receipt_date: date,
      p_amount: amountNumber,
      p_notes: notes.trim() || null,
      p_description: description.trim() || null,
    };

    setBusy(true);
    const { error: rpcError } = editing
      ? await supabase.rpc('update_free_receipt', { p_receipt_id: editing.id, ...args })
      : await supabase.rpc('create_free_receipt', { ...args, p_direction: direction });
    setBusy(false);

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(
      editing
        ? 'تم تعديل الإيصال'
        : `تم حفظ إيصال ${isIn ? 'الاستلام' : 'الصرف'}`,
    );
    setVersion((current) => current + 1);
    closeForm();
  }

  async function remove(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `حذف الإيصال ${receipt.number}؟\n` +
        'سيُستثنى من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».',
      'حذف',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('delete_free_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم نقل الإيصال ${receipt.number} إلى المحذوفات`);
    setVersion((current) => current + 1);
  }

  async function restore(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `استعادة الإيصال ${receipt.number}؟\nسيُعاد تأثيره على رصيد الحساب والخزنة.`,
      'استعادة',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('restore_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم استعادة الإيصال ${receipt.number}`);
    setVersion((current) => current + 1);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>الفلوس</h1>
          <p className="muted">
            {isCashBoxTransfer ? 'انقل النقد بين الخزن؛ لا يتغير مجموع النقد ولا أرصدة العملاء والموردين.' : 'إيصال الاستلام يدخّل نقدًا للخزنة، وإيصال الصرف يخرّج نقدًا. الحساب قد يكون عميلًا أو موردًا في أي اتجاه.'}
          </p>
        </div>
        <div className="actions">
          {can('money.delete') && <button type="button" className="btn" onClick={toggleDeleted}>
            {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
          </button>}
          {!showDeleted && can('money.create') && (
            <button type="button" className="btn primary" onClick={openNew}>
              {isCashBoxTransfer ? '+ تحويل بين الخزن' : `+ إيصال ${isIn ? 'استلام' : 'صرف'}`}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'in' ? 'tab active' : 'tab'}
          aria-pressed={tab === 'in'}
          onClick={() => switchDirection('in')}
        >
          إيصالات استلام
        </button>
        <button
          type="button"
          className={tab === 'out' ? 'tab active' : 'tab'}
          aria-pressed={tab === 'out'}
          onClick={() => switchDirection('out')}
        >
          إيصالات صرف
        </button>
        <button type="button" className={tab === 'cash_box_transfer' ? 'tab active' : 'tab'} aria-pressed={tab === 'cash_box_transfer'} onClick={switchToCashTransfer}>
          تحويل بين الخزن
        </button>
      </div>

      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}
      {showDeleted && (
        <p className="hint">
          {isCashBoxTransfer ? 'التحويلات المحذوفة لا تؤثر على أرصدة الخزن.' : 'هذه الإيصالات محذوفة: لا تؤثر على الأرصدة أو الخزنة. إيصال الفاتورة يُستعاد من صفحة البضاعة مع فاتورته.'}
        </p>
      )}

      <div className="filter-row">
        <label>
          تصفية حسب الخزنة
          <select value={cashBoxFilter} onChange={(event) => setCashBoxFilter(event.target.value)}>
            <option value="all">كل الخزن</option>
            {cashBoxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.name}{!box.is_active ? ' — موقوفة' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {formOpen && !showDeleted && (isCashBoxTransfer ? <Modal
        className="transaction-entry-modal"
        backdropClassName="transaction-entry-backdrop"
        title={editingTransfer ? `تعديل التحويل ${editingTransfer.number}` : 'تحويل جديد بين الخزن'}
        onClose={closeForm}
      >
        <CashBoxTransferForm cashBoxes={cashBoxes} editing={editingTransfer}
          onSaved={(message) => { setNotice(message); setFormOpen(false); setEditingTransfer(null); setVersion((current) => current + 1); }}
          onCancel={closeForm} />
      </Modal> : <Modal
        className="transaction-entry-modal"
        backdropClassName="transaction-entry-backdrop"
        title={editing ? `تعديل الإيصال ${editing.number}` : `إيصال ${isIn ? 'استلام' : 'صرف'} جديد`}
        onClose={closeForm}
      >
        <form className="inline-form" onSubmit={submit}>

          <div className="form-grid">
            <label>
              نوع الحساب
              <select
                value={accountKind}
                onChange={(e) => {
                  setAccountKind(e.target.value as AccountKind);
                  setAccountId('');
                }}
                required
              >
                <option value="customer">عميل</option>
                <option value="supplier">مورد</option>
              </select>
            </label>

            <label>
              الحساب
              <SearchableSelect
                value={accountId}
                options={selectableAccounts.map((account) => ({ value: account.id, label: account.name }))}
                onChange={setAccountId}
                placeholder="اختر الحساب…"
                required
              />
            </label>

            <label>
              الخزنة
              <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} required>
                <option value="">اختر الخزنة…</option>
                {selectableCashBoxes.length === 0 && <option value="" disabled>لا توجد خزن نشطة</option>}
                {selectableCashBoxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name} — {money(box.balance)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              التاريخ
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label>
              المبلغ
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>

            <label className="span-2">
              البيان
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isIn ? 'بيان التحصيل، مثال: دفعة تحت الحساب' : 'بيان الصرف، مثال: سداد جزء من المديونية'}
              />
            </label>

            <label className="span-2">
              ملاحظات
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اختياري"
              />
            </label>
          </div>

          <p className="hint">
            {isIn
              ? 'استلام من عميل يقلّل رصيده، ومن مورد يزيد رصيده؛ ويزيد رصيد الخزنة.'
              : 'صرف لعميل يزيد رصيده، ولمورد يقلّل رصيده؛ وينقص رصيد الخزنة.'}
          </p>

          <div className="actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ الإيصال'}
            </button>
            <button type="button" className="btn" onClick={closeForm} disabled={busy}>
              إلغاء
            </button>
          </div>
        </form>
        </Modal>)}

      {isCashBoxTransfer ? <div className="card"><div className="table-wrap responsive-table"><table className="table">
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>وقت الإنشاء</th><th>من خزنة</th><th>إلى خزنة</th><th>المبلغ</th><th>ملاحظات</th><th /></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={8} className="empty">جارٍ التحميل…</td></tr>}
          {!loading && filteredTransferRows.length === 0 && <tr><td colSpan={8} className="empty">{cashBoxFilter !== 'all' ? 'لا توجد تحويلات في الخزنة المحددة.' : showDeleted ? 'لا توجد تحويلات محذوفة.' : 'لا توجد تحويلات بين الخزن بعد.'}</td></tr>}
          {!loading && filteredTransferRows.map((transfer) => <tr className="responsive-row" key={transfer.id}>
            <td className="num" data-label="الرقم">{transfer.number}</td><td className="num" data-label="التاريخ">{transfer.transfer_date}</td><td className="num" data-label="وقت الإنشاء">{creationTime(transfer.created_at)}</td>
            <td data-label="من خزنة">{transfer.source_cash_box_name}</td><td data-label="إلى خزنة">{transfer.destination_cash_box_name}</td>
            <td className="num strong" data-label="المبلغ">{money(transfer.amount)}</td><td data-label="ملاحظات">{transfer.notes || '—'}</td>
            <td className="row-actions" data-label="الإجراءات">{showDeleted
              ? can('money.delete') && <button type="button" className="link" onClick={() => restoreTransfer(transfer)}>استعادة</button>
              : <>{can('money.edit') && <button type="button" className="link" onClick={() => { setEditingTransfer(transfer); setFormOpen(true); }}>تعديل</button>}{can('money.delete') && <button type="button" className="link danger" onClick={() => void removeTransfer(transfer)}>حذف</button>}</>}
            </td>
          </tr>)}
        </tbody>
      </table></div></div> : <div className="card">
        <div className="table-wrap responsive-table">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>وقت الإنشاء</th>
                <th>الحساب</th>
                <th>الخزنة</th>
                <th>المبلغ</th>
                <th>البيان</th>
                <th>ملاحظات</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="empty">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    {cashBoxFilter !== 'all'
                      ? 'لا توجد إيصالات في الخزنة المحددة.'
                      : showDeleted
                      ? 'لا توجد إيصالات محذوفة.'
                      : `لا توجد إيصالات ${isIn ? 'استلام' : 'صرف'} بعد.`}
                  </td>
                </tr>
              )}

              {!loading &&
                filteredRows.map((receipt) => (
                  <tr className="responsive-row" key={receipt.id}>
                    <td className="num" data-label="الرقم">{receipt.number}</td>
                    <td className="num" data-label="التاريخ">{receipt.receipt_date}</td>
                    <td className="num" data-label="وقت الإنشاء">{creationTime(receipt.created_at)}</td>
                    <td data-label="الحساب">
                      {receipt.account_name}{' '}
                      <span className="muted">
                        ({receipt.account_kind === 'customer' ? 'عميل' : receipt.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                      </span>
                    </td>
                    <td data-label="الخزنة">{receipt.cash_box_name}</td>
                    <td className="num strong" data-label="المبلغ">{money(receipt.amount)}</td>
                    <td className="muted" data-label="البيان">{receipt.statement ?? '—'}</td>
                    <td className="muted" data-label="ملاحظات">{receipt.notes ?? '—'}</td>
                    <td className="row-actions" data-label="الإجراءات">
                      {showDeleted ? can('money.delete') ? (
                        receipt.is_free ? (
                          <button
                            type="button"
                            className="link"
                            onClick={() => restore(receipt)}
                          >
                            استعادة
                          </button>
                        ) : (
                          <span
                            className="badge"
                            title={`يُستعاد من صفحة البضاعة مع ${
                              linkKind(receipt.invoice_kind) === 'مرتجع' ? 'مرتجعه' : 'فاتورته'
                            }`}
                          >
                            محذوف مع{' '}
                            {linkKind(receipt.invoice_kind) === 'مرتجع' ? 'مرتجعه' : 'فاتورته'}
                          </span>
                        )
                      ) : null : receipt.is_free ? (
                        <>
                          {can('money.edit') && <button
                            type="button"
                            className="link"
                            onClick={() => startEdit(receipt)}
                          >
                            تعديل
                          </button>}
                          {can('money.delete') && <button
                            type="button"
                            className="link danger"
                            onClick={() => remove(receipt)}
                          >
                            حذف
                          </button>}
                        </>
                      ) : (
                        <span
                          className="badge"
                          title={`يُعدَّل من داخل ${
                            linkKind(receipt.invoice_kind) === 'مرتجع' ? 'المرتجع' : 'الفاتورة'
                          }`}
                        >
                          مرتبط بـ{linkKind(receipt.invoice_kind)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>}
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.confirmLabel === 'حذف'}
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </div>
  );
}

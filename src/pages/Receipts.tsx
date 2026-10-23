import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { money, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import type {
  AccountRow,
  CashBoxRow,
  ReceiptDirection,
  ReceiptRow,
} from '../lib/types';

function linkKind(kind: ReceiptRow['invoice_kind']) {
  return kind === 'sale_return' || kind === 'purchase_return' ? 'مرتجع' : 'فاتورة';
}

export default function Receipts() {
  const [direction, setDirection] = useState<ReceiptDirection>('in');
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [version, setVersion] = useState(0);

  const [accountId, setAccountId] = useState('');
  const [cashBoxId, setCashBoxId] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const isIn = direction === 'in';

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      let receiptsQuery = supabase
        .from('v_receipt_list')
        .select('*')
        .eq('direction', direction);
      receiptsQuery = showDeleted
        ? receiptsQuery.not('deleted_at', 'is', null)
        : receiptsQuery.is('deleted_at', null);

      const [receiptsRes, accountsRes, boxesRes] = await Promise.all([
        receiptsQuery
          .order('receipt_date', { ascending: false })
          .order('number', { ascending: false }),
        supabase
          .from('v_account_balances')
          .select('*')
          .eq('is_active', true)
          .order('kind')
          .order('name'),
        supabase
          .from('v_cash_box_balances')
          .select('*')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (!alive) return;

      const firstError = receiptsRes.error ?? accountsRes.error ?? boxesRes.error;
      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setRows((receiptsRes.data ?? []) as ReceiptRow[]);
      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      setCashBoxes((boxesRes.data ?? []) as CashBoxRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [direction, version, showDeleted]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // لو اتفتح النموذج قبل تحميل الخزائن، اختر أول خزنة تلقائيًا بعد التحميل.
  useEffect(() => {
    if (!cashBoxId && cashBoxes.length > 0) setCashBoxId(cashBoxes[0].id);
  }, [cashBoxId, cashBoxes]);

  function resetForm() {
    setEditing(null);
    setAccountId('');
    setCashBoxId(cashBoxes[0]?.id ?? '');
    setDate(today());
    setAmount('');
    setDescription('');
    setNotes('');
    setError('');
  }

  function switchDirection(next: ReceiptDirection) {
    if (next === direction) return;
    setDirection(next);
    setFormOpen(false);
    resetForm();
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    resetForm();
  }

  function openNew() {
    resetForm();
    setFormOpen(true);
  }

  function startEdit(receipt: ReceiptRow) {
    setEditing(receipt);
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
    resetForm();
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
    const confirmed = window.confirm(
      `حذف الإيصال ${receipt.number}؟\n` +
        'سيُستثنى من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».',
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
    const confirmed = window.confirm(
      `استعادة الإيصال ${receipt.number}؟\nسيُعاد تأثيره على رصيد الحساب والخزنة.`,
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
          <h1>الإيصالات</h1>
          <p className="muted">
            إيصال الاستلام يدخّل نقدًا للخزنة، وإيصال الصرف يخرّج نقدًا. الحساب قد يكون عميلًا
            أو موردًا في أي اتجاه.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={toggleDeleted}>
            {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
          </button>
          {!showDeleted && (
            <button type="button" className="btn primary" onClick={openNew}>
              + إيصال {isIn ? 'استلام' : 'صرف'}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={direction === 'in' ? 'tab active' : 'tab'}
          onClick={() => switchDirection('in')}
        >
          إيصالات استلام
        </button>
        <button
          type="button"
          className={direction === 'out' ? 'tab active' : 'tab'}
          onClick={() => switchDirection('out')}
        >
          إيصالات صرف
        </button>
      </div>

      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}
      {showDeleted && (
        <p className="hint">
          هذه الإيصالات محذوفة: لا تؤثر على الأرصدة أو الخزنة. إيصال الفاتورة يُستعاد من صفحة
          الفواتير مع فاتورته.
        </p>
      )}

      {formOpen && !showDeleted && (
        <form className="card inline-form" onSubmit={submit}>
          <div className="card-head">
            <h2>
              {editing
                ? `تعديل الإيصال ${editing.number}`
                : `إيصال ${isIn ? 'استلام' : 'صرف'} جديد`}
            </h2>
            <span className="badge">ترقيم تلقائي: {isIn ? 'RCP' : 'PAY'}</span>
          </div>

          <div className="form-grid">
            <label>
              الحساب
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                <option value="">اختر…</option>
              {accounts.filter((account) => account.kind !== 'waste').map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {account.kind === 'customer' ? 'عميل' : 'مورد'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              الخزنة
              <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} required>
                {cashBoxes.length === 0 && <option value="">لا توجد خزنة</option>}
                {cashBoxes.map((box) => (
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
              ? 'استلام: يقلّل رصيد الحساب (عميل أو مورد) ويزيد الخزنة.'
              : 'صرف: يقلّل رصيد الحساب (عميل أو مورد) وينقص الخزنة.'}
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
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
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
                  <td colSpan={8} className="empty">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    {showDeleted
                      ? 'لا توجد إيصالات محذوفة.'
                      : `لا توجد إيصالات ${isIn ? 'استلام' : 'صرف'} بعد.`}
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="num">{receipt.number}</td>
                    <td className="num">{receipt.receipt_date}</td>
                    <td>
                      {receipt.account_name}{' '}
                      <span className="muted">
                        ({receipt.account_kind === 'customer' ? 'عميل' : receipt.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                      </span>
                    </td>
                    <td>{receipt.cash_box_name}</td>
                    <td className="num strong">{money(receipt.amount)}</td>
                    <td className="muted">{receipt.statement ?? '—'}</td>
                    <td className="muted">{receipt.notes ?? '—'}</td>
                    <td className="row-actions">
                      {showDeleted ? (
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
                            title={`يُستعاد من صفحة الفواتير مع ${
                              linkKind(receipt.invoice_kind) === 'مرتجع' ? 'مرتجعه' : 'فاتورته'
                            }`}
                          >
                            محذوف مع{' '}
                            {linkKind(receipt.invoice_kind) === 'مرتجع' ? 'مرتجعه' : 'فاتورته'}
                          </span>
                        )
                      ) : receipt.is_free ? (
                        <>
                          <button
                            type="button"
                            className="link"
                            onClick={() => startEdit(receipt)}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="link danger"
                            onClick={() => remove(receipt)}
                          >
                            حذف
                          </button>
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
      </div>
    </div>
  );
}

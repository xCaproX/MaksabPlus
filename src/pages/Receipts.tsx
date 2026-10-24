import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { creationTime, money, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import CashBoxTransferForm from '../components/CashBoxTransferForm';
import ConfirmDialog from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
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

type ReceiptSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
const PAGE_SIZE = 20;

const VALID_RECEIPT_TABS = ['in', 'out', 'cash_box_transfer'] as const;
type ReceiptTab = typeof VALID_RECEIPT_TABS[number];

export default function Receipts() {
  const { can } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ReceiptTab | null;
  const initialTab: ReceiptTab = (tabParam && VALID_RECEIPT_TABS.includes(tabParam)) ? tabParam : 'in';
  const [tab, setTab] = useState<ReceiptDirection | 'cash_box_transfer'>(initialTab);
  const [direction, setDirection] = useState<ReceiptDirection>(initialTab === 'cash_box_transfer' ? 'in' : initialTab);

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [transferRows, setTransferRows] = useState<CashBoxTransferRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  function setError(msg: string) {
    if (msg) toast.error(msg);
  }
  function setNotice(msg: string) {
    if (msg) toast.success(msg);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<CashBoxTransferRow | null>(null);
  const [viewing, setViewing] = useState<ReceiptRow | null>(null);
  const [viewingTransfer, setViewingTransfer] = useState<CashBoxTransferRow | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [version, setVersion] = useState(0);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [cashBoxFilter, setCashBoxFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<ReceiptSort>('date-desc');
  const [page, setPage] = useState(1);

  // حقول نموذج الإيصال
  const [accountId, setAccountId] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [cashBoxId, setCashBoxId] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

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
      setViewing(null);
      setViewingTransfer(null);
      setSearchTerm('');
      setCashBoxFilter('all');
      setDateFrom('');
      setDateTo('');
      setPage(1);
    }
  }, [tabParam]);

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

  const tabTitle = isCashBoxTransfer ? 'تحويلات الخزن' : isIn ? 'إيصالات الاستلام' : 'إيصالات الصرف';

  // تصفية إيصالات القبض والصرف
  const filteredReceiptRows = useMemo(() => {
    if (isCashBoxTransfer) return [];
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const next = rows.filter((receipt) => {
      const matchesText = !query || [receipt.number, receipt.account_name, receipt.cash_box_name, receipt.statement || '', receipt.notes || '']
        .some((value) => value.toLocaleLowerCase('ar').includes(query));
      const matchesCashBox = cashBoxFilter === 'all' || receipt.cash_box_id === cashBoxFilter;
      const matchesFrom = !dateFrom || receipt.receipt_date >= dateFrom;
      const matchesTo = !dateTo || receipt.receipt_date <= dateTo;
      return matchesText && matchesCashBox && matchesFrom && matchesTo;
    });
    return next.sort((a, b) => {
      if (sortOrder === 'amount-desc') return Number(b.amount) - Number(a.amount);
      if (sortOrder === 'amount-asc') return Number(a.amount) - Number(b.amount);
      const comparison = a.receipt_date.localeCompare(b.receipt_date) || a.number.localeCompare(b.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [rows, isCashBoxTransfer, searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder]);

  // تصفية تحويلات الخزن
  const filteredTransferRows = useMemo(() => {
    if (!isCashBoxTransfer) return [];
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const next = transferRows.filter((transfer) => {
      const matchesText = !query || [transfer.number, transfer.source_cash_box_name, transfer.destination_cash_box_name, transfer.notes || '']
        .some((value) => value.toLocaleLowerCase('ar').includes(query));
      const matchesCashBox = cashBoxFilter === 'all' || transfer.source_cash_box_id === cashBoxFilter || transfer.destination_cash_box_id === cashBoxFilter;
      const matchesFrom = !dateFrom || transfer.transfer_date >= dateFrom;
      const matchesTo = !dateTo || transfer.transfer_date <= dateTo;
      return matchesText && matchesCashBox && matchesFrom && matchesTo;
    });
    return next.sort((a, b) => {
      if (sortOrder === 'amount-desc') return Number(b.amount) - Number(a.amount);
      if (sortOrder === 'amount-asc') return Number(a.amount) - Number(b.amount);
      const comparison = a.transfer_date.localeCompare(b.transfer_date) || a.number.localeCompare(b.number);
      return sortOrder === 'date-asc' ? comparison : -comparison;
    });
  }, [transferRows, isCashBoxTransfer, searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder]);

  const activeTotalCount = isCashBoxTransfer ? filteredTransferRows.length : filteredReceiptRows.length;
  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));
  const pageReceipts = filteredReceiptRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageTransfers = filteredTransferRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      const [accountsRes, cashBoxesRes] = await Promise.all([
        supabase
          .from('v_account_balances')
          .select('*')
          .eq('is_active', true)
          .order('kind')
          .order('name'),
        supabase.from('v_cash_box_balances').select('*').order('name'),
      ]);

      const [receiptsRes, transfersRes] = await Promise.all([
        isCashBoxTransfer
          ? Promise.resolve({ data: [], error: null })
          : (showDeleted
              ? supabase.from('v_receipt_list').select('*').eq('direction', direction).not('deleted_at', 'is', null)
              : supabase.from('v_receipt_list').select('*').eq('direction', direction).is('deleted_at', null))
              .order('receipt_date', { ascending: false }).order('number', { ascending: false }),
        isCashBoxTransfer
          ? (showDeleted
              ? supabase.from('v_cash_box_transfer_list').select('*').not('deleted_at', 'is', null)
              : supabase.from('v_cash_box_transfer_list').select('*').is('deleted_at', null))
              .order('transfer_date', { ascending: false }).order('number', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!alive) return;

      const firstError = accountsRes.error ?? cashBoxesRes.error ?? receiptsRes.error ?? transfersRes.error;
      if (firstError) {
        setError(translateDbError(firstError.message));
        setLoading(false);
        return;
      }

      setAccounts((accountsRes.data ?? []) as AccountRow[]);
      const boxes = (cashBoxesRes.data ?? []) as CashBoxRow[];
      setCashBoxes(boxes);
      setRows((receiptsRes.data ?? []) as ReceiptRow[]);
      setTransferRows((transfersRes.data ?? []) as CashBoxTransferRow[]);

      if (!cashBoxId && boxes.length > 0) {
        const defaultBox = boxes.find((box) => box.is_primary && box.is_active) ?? boxes.find((b) => b.is_active);
        if (defaultBox) setCashBoxId(defaultBox.id);
      }

      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [tab, direction, version, showDeleted, isCashBoxTransfer]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, cashBoxFilter, dateFrom, dateTo, sortOrder, tab]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function resetForm(nextDirection = direction) {
    setEditing(null);
    setAccountId('');
    setAccountKind(nextDirection === 'in' ? 'customer' : 'supplier');
    const defaultBox = cashBoxes.find((box) => box.is_primary && box.is_active) ?? cashBoxes.find((b) => b.is_active);
    setCashBoxId(defaultBox?.id ?? '');
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
    setViewing(null);
    setViewingTransfer(null);
    resetForm(next);
  }

  function switchToCashTransfer() {
    setTab('cash_box_transfer');
    setSearchParams({ tab: 'cash_box_transfer' });
    setFormOpen(false);
    setEditing(null);
    setEditingTransfer(null);
    setViewing(null);
    setViewingTransfer(null);
    setError('');
  }

  function toggleDeleted() {
    setShowDeleted((current) => !current);
    setFormOpen(false);
    setViewing(null);
    setViewingTransfer(null);
    resetForm();
    setEditingTransfer(null);
  }

  function openNew() {
    if (isCashBoxTransfer) {
      setEditingTransfer(null);
    } else {
      resetForm();
    }
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
    setEditingTransfer(null);
  }

  function startEdit(receipt: ReceiptRow) {
    setEditing(receipt);
    setAccountId(receipt.account_id);
    setAccountKind(receipt.account_kind as AccountKind);
    setCashBoxId(receipt.cash_box_id);
    setDate(receipt.receipt_date);
    setAmount(String(receipt.amount));
    setDescription(receipt.statement ?? '');
    setNotes(receipt.notes ?? '');
    setError('');
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    if (editing) {
      const { error: rpcError } = await supabase.rpc('update_receipt', {
        p_receipt_id: editing.id,
        p_account_id: accountId,
        p_cash_box_id: cashBoxId,
        p_receipt_date: date,
        p_amount: Number(amount),
        p_statement: description.trim() || null,
        p_notes: notes.trim() || null,
      });

      setBusy(false);

      if (rpcError) {
        setError(translateDbError(rpcError.message));
        return;
      }

      setNotice(`تم تعديل الإيصال ${editing.number}`);
    } else {
      const { data, error: rpcError } = await supabase.rpc('create_receipt', {
        p_direction: direction,
        p_account_id: accountId,
        p_cash_box_id: cashBoxId,
        p_receipt_date: date,
        p_amount: Number(amount),
        p_statement: description.trim() || null,
        p_notes: notes.trim() || null,
      });

      setBusy(false);

      if (rpcError) {
        setError(translateDbError(rpcError.message));
        return;
      }

      const receiptNumber = (data as { number?: string })?.number ?? '';
      setNotice(`تم إنشاء الإيصال ${receiptNumber}`);
    }

    closeForm();
    setViewing(null);
    setVersion((current) => current + 1);
  }

  async function remove(receipt: ReceiptRow) {
    const confirmed = await askConfirmation(
      `حذف الإيصال ${receipt.number}؟\n` +
        'سيُستثنى من الأرصدة والتقارير، ويمكن استعادته من «عرض المحذوفات».',
      'حذف',
    );
    if (!confirmed) return;

    setError('');
    const { error: rpcError } = await supabase.rpc('delete_receipt', {
      p_receipt_id: receipt.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    setNotice(`تم نقل الإيصال ${receipt.number} إلى المحذوفات`);
    setViewing(null);
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
    setViewing(null);
    setVersion((current) => current + 1);
  }

  async function removeTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`حذف التحويل ${transfer.number}؟ سيعود الرصيد إلى الخزنة المصدر.`, 'حذف'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('delete_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم نقل التحويل ${transfer.number} إلى المحذوفات`);
    setViewingTransfer(null);
    setVersion((current) => current + 1);
  }

  async function restoreTransfer(transfer: CashBoxTransferRow) {
    if (!(await askConfirmation(`استعادة التحويل ${transfer.number}؟ سيعاد تطبيق حركة الخزن.`, 'استعادة'))) return;
    setError('');
    const { error: rpcError } = await supabase.rpc('restore_cash_box_transfer', { p_transfer_id: transfer.id });
    if (rpcError) return setError(translateDbError(rpcError.message));
    setNotice(`تم استعادة التحويل ${transfer.number}`);
    setViewingTransfer(null);
    setVersion((current) => current + 1);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{showDeleted ? `المحذوفات — ${tabTitle}` : tabTitle}</h1>
          <p className="muted">
            {isCashBoxTransfer
              ? 'انقل النقد بين الخزن؛ لا يتغير مجموع النقد ولا أرصدة العملاء والموردين.'
              : isIn
              ? 'إيصالات الاستلام (القبض): تُدخل نقدًا إلى الخزنة وتؤثر على رصيد العميل أو المورد.'
              : 'إيصالات الصرف (الدفع): تُخرج نقدًا من الخزنة وتؤثر على رصيد العميل أو المورد.'}
          </p>
        </div>
        <div className="actions">
          {can(`money.${tab}.delete`) && (
            <button type="button" className="btn" onClick={toggleDeleted}>
              {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
            </button>
          )}
          {!showDeleted && can(`money.${tab}.create`) && (
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
        <button
          type="button"
          className={tab === 'cash_box_transfer' ? 'tab active' : 'tab'}
          aria-pressed={tab === 'cash_box_transfer'}
          onClick={switchToCashTransfer}
        >
          تحويل بين الخزن
        </button>
      </div>

      {showDeleted && (
        <p className="hint">
          {isCashBoxTransfer
            ? 'التحويلات المحذوفة لا تؤثر على أرصدة الخزن.'
            : 'هذه الإيصالات محذوفة: لا تؤثر على الأرصدة أو الخزنة. إيصال الفاتورة يُستعاد من صفحة البضاعة مع فاتورته.'}
        </p>
      )}

      {/* الـ ERP Workspace لقسم الفلوس */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${tabTitle}`}>
          <div className="erp-toolbar">
            <div className="erp-toolbar-title">
              <strong>{tabTitle}</strong>
              <span>{activeTotalCount} نتيجة</span>
            </div>
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={isCashBoxTransfer ? 'بحث بالرقم أو الخزنة أو الملاحظات…' : 'بحث بالرقم أو الحساب أو البيان…'}
                />
              </label>

              <select aria-label="ترتيب النتائج" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as ReceiptSort)}>
                <option value="date-desc">الأحدث أولًا</option>
                <option value="date-asc">الأقدم أولًا</option>
                <option value="amount-desc">الأعلى مبلغًا</option>
                <option value="amount-asc">الأقل مبلغًا</option>
              </select>

              <select aria-label="تصفية حسب الخزنة" value={cashBoxFilter} onChange={(event) => setCashBoxFilter(event.target.value)}>
                <option value="all">كل الخزن</option>
                {cashBoxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name}{!box.is_active ? ' — موقوفة' : ''}
                  </option>
                ))}
              </select>

              <label className="erp-date"><span>من</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
              <label className="erp-date"><span>إلى</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            </div>
          </div>

          <div className="erp-table-wrap">
            {isCashBoxTransfer ? (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th>من خزنة</th>
                    <th>إلى خزنة</th>
                    <th className="num">المبلغ</th>
                    <th>ملاحظات</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageTransfers.length === 0 && <tr><td colSpan={7} className="empty">لا توجد تحويلات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageTransfers.map((transfer) => {
                    const isSelected = viewingTransfer?.id === transfer.id;
                    return (
                      <tr
                        key={transfer.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => { setViewing(null); setViewingTransfer(transfer); }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setViewing(null); setViewingTransfer(transfer); }
                        }}
                      >
                        <td className="num strong">{transfer.number}</td>
                        <td className="num">{transfer.transfer_date}</td>
                        <td>{transfer.source_cash_box_name}</td>
                        <td>{transfer.destination_cash_box_name}</td>
                        <td className="num strong">{money(transfer.amount)}</td>
                        <td>{transfer.notes || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                          {showDeleted ? (
                            can('money.delete') && <button type="button" className="link" onClick={() => void restoreTransfer(transfer)}>استعادة</button>
                          ) : (
                            <>
                              {can('money.edit') && <button type="button" className="link" onClick={() => { setEditingTransfer(transfer); setFormOpen(true); }}>تعديل</button>}
                              {can('money.delete') && <button type="button" className="link danger" onClick={() => void removeTransfer(transfer)}>حذف</button>}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th>الحساب</th>
                    <th>الخزنة</th>
                    <th className="num">المبلغ</th>
                    <th>نوع الإيصال</th>
                    <th>البيان</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageReceipts.length === 0 && <tr><td colSpan={8} className="empty">لا توجد إيصالات تطابق البحث أو الفلاتر.</td></tr>}
                  {!loading && pageReceipts.map((receipt) => {
                    const isSelected = viewing?.id === receipt.id;
                    return (
                      <tr
                        key={receipt.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => { setViewingTransfer(null); setViewing(receipt); }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setViewingTransfer(null); setViewing(receipt); }
                        }}
                      >
                        <td className="num strong">{receipt.number}</td>
                        <td className="num">{receipt.receipt_date}</td>
                        <td>
                          {receipt.account_name}{' '}
                          <span className="muted">
                            ({receipt.account_kind === 'customer' ? 'عميل' : receipt.account_kind === 'supplier' ? 'مورد' : 'هالك'})
                          </span>
                        </td>
                        <td>{receipt.cash_box_name}</td>
                        <td className="num strong">{money(receipt.amount)}</td>
                        <td>
                          {receipt.is_free ? (
                            <span className="status-badge paid">إيصال حر</span>
                          ) : (
                            <span className="status-badge partial">مرتبط بـ{linkKind(receipt.invoice_kind)}</span>
                          )}
                        </td>
                        <td className="muted">{receipt.statement || '—'}</td>
                        <td className="row-actions erp-row-actions" onClick={(event) => event.stopPropagation()}>
                          {showDeleted ? (
                            can('money.delete') ? (
                              receipt.is_free ? (
                                <button type="button" className="link" onClick={() => void restore(receipt)}>استعادة</button>
                              ) : (
                                <span className="muted" title="يُستعاد مع الفاتورة">مرتبط</span>
                              )
                            ) : null
                          ) : receipt.is_free ? (
                            <>
                              {can('money.edit') && <button type="button" className="link" onClick={() => startEdit(receipt)}>تعديل</button>}
                              {can('money.delete') && <button type="button" className="link danger" onClick={() => void remove(receipt)}>حذف</button>}
                            </>
                          ) : (
                            <span className="muted" title={`يُعدَّل من داخل ${linkKind(receipt.invoice_kind)}`}>مرتبط</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="erp-pagination">
            <span>
              عرض {activeTotalCount ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, activeTotalCount)} من {activeTotalCount}
            </span>
            <div>
              <button type="button" className="btn compact" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
              <span>{page} / {pageCount}</span>
              <button type="button" className="btn compact" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>التالي</button>
            </div>
          </div>
        </section>

        {/* اللوحة الجانبية للتفاصيل */}
        <aside className={viewing || viewingTransfer ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل المعاملة">
          {viewingTransfer ? (
            <>
              <div className="erp-detail-head">
                <div><span>تحويل بين الخزن</span><h2 className="num">{viewingTransfer.number}</h2></div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setViewingTransfer(null)}>×</button>
              </div>
              <dl className="erp-detail-summary">
                <div><dt>من خزنة</dt><dd>{viewingTransfer.source_cash_box_name}</dd></div>
                <div><dt>إلى خزنة</dt><dd>{viewingTransfer.destination_cash_box_name}</dd></div>
                <div><dt>التاريخ</dt><dd className="num">{viewingTransfer.transfer_date}</dd></div>
                <div><dt>وقت الإنشاء</dt><dd className="num">{creationTime(viewingTransfer.created_at)}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>المبلغ المحوّل</span><strong className="num">{money(viewingTransfer.amount)}</strong>
              </div>

              {viewingTransfer.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{viewingTransfer.notes}</p>}

              <div className="erp-detail-actions">
                {showDeleted ? (
                  can('money.delete') && <button type="button" className="btn" onClick={() => void restoreTransfer(viewingTransfer)}>استعادة التحويل</button>
                ) : (
                  <>
                    {can('money.edit') && <button type="button" className="btn" onClick={() => { setEditingTransfer(viewingTransfer); setFormOpen(true); }}>تعديل التحويل</button>}
                    {can('money.delete') && <button type="button" className="btn danger" onClick={() => void removeTransfer(viewingTransfer)}>حذف</button>}
                  </>
                )}
              </div>
            </>
          ) : viewing ? (
            <>
              <div className="erp-detail-head">
                <div><span>{viewing.direction === 'in' ? 'إيصال استلام' : 'إيصال صرف'}</span><h2 className="num">{viewing.number}</h2></div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setViewing(null)}>×</button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الحساب</dt><dd>{viewing.account_name} ({viewing.account_kind === 'customer' ? 'عميل' : 'مورد'})</dd></div>
                <div><dt>الخزنة</dt><dd>{viewing.cash_box_name}</dd></div>
                <div><dt>التاريخ</dt><dd className="num">{viewing.receipt_date}</dd></div>
                <div><dt>وقت الإنشاء</dt><dd className="num">{creationTime(viewing.created_at)}</dd></div>
                <div><dt>الارتباط</dt><dd>{viewing.is_free ? 'إيصال حر' : `مربوط بـ ${linkKind(viewing.invoice_kind)}`}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>قيمة الإيصال</span>
                <strong className={`num ${viewing.direction === 'in' ? 'remaining' : ''}`}>{money(viewing.amount)}</strong>
              </div>

              {viewing.statement && <p className="erp-detail-notes"><span>البيان</span>{viewing.statement}</p>}
              {viewing.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{viewing.notes}</p>}

              <div className="erp-detail-actions">
                {showDeleted ? (
                  can('money.delete') && viewing.is_free && <button type="button" className="btn" onClick={() => void restore(viewing)}>استعادة الإيصال</button>
                ) : viewing.is_free ? (
                  <>
                    {can('money.edit') && <button type="button" className="btn" onClick={() => startEdit(viewing)}>تعديل الإيصال</button>}
                    {can('money.delete') && <button type="button" className="btn danger" onClick={() => void remove(viewing)}>حذف</button>}
                  </>
                ) : (
                  <p className="hint">هذا الإيصال مُنشأ تلقائيًا ومربوط بـ{linkKind(viewing.invoice_kind)}. يمكن تعديله أو حذفه من داخل الفاتورة نفسها.</p>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر {isCashBoxTransfer ? 'تحويلًا' : 'إيصالًا'}</strong>
              <span>ستظهر تفاصيله وملاحظاته هنا من دون مغادرة القائمة.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نموذج الإضافة والتعديل */}
      {formOpen && !showDeleted && (
        isCashBoxTransfer ? (
          <Modal
            className="transaction-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title={editingTransfer ? `تعديل التحويل ${editingTransfer.number}` : 'تحويل جديد بين الخزن'}
            onClose={closeForm}
          >
            <CashBoxTransferForm
              cashBoxes={cashBoxes}
              editing={editingTransfer}
              onSaved={(msg) => { setNotice(msg); setFormOpen(false); setEditingTransfer(null); setVersion((v) => v + 1); }}
              onCancel={closeForm}
            />
          </Modal>
        ) : (
          <Modal
            className="transaction-entry-modal"
            backdropClassName="transaction-entry-backdrop"
            title={editing ? `تعديل الإيصال ${editing.number}` : `إيصال ${isIn ? 'استلام' : 'صرف'} جديد`}
            onClose={closeForm}
          >
            <form className="inline-form" onSubmit={submit}>
              <div className="form-grid">
                <label className="form-grid-col-5">
                  {isIn ? 'استلام من (العميل / الحساب)' : 'صرف إلى (المورد / الحساب)'}
                  <SearchableSelect
                    value={accountId}
                    options={selectableAccounts.map((account) => ({ value: account.id, label: account.name }))}
                    onChange={setAccountId}
                    placeholder="اختر الحساب…"
                    required
                  />
                </label>

                <label className="form-grid-col-3">
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

                <label className="form-grid-col-4">
                  الخزنة {isIn ? 'المستلمة' : 'المنصرفة'}
                  <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} required>
                    {selectableCashBoxes.map((box) => (
                      <option key={box.id} value={box.id}>
                        {box.name} ({money(box.balance)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-grid-col-4">
                  المبلغ
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    dir="ltr"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>

                <label className="form-grid-col-3">
                  التاريخ
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </label>

                <label className="form-grid-col-5">
                  البيان
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="سبب أو وصف المعاملة…"
                  />
                </label>

                <label className="form-grid-col-12">
                  ملاحظات
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي ملاحظات إضافية على الإيصال (اختياري)…"
                  />
                </label>
              </div>

              {Number(amount) > 0 && (
                <div className="invoice-totals-bar" style={{ marginTop: '4px' }}>
                  <div className="total-stat-box grand-total">
                    <span className="stat-box-title">قيمة الإيصال المحصلة / المنصرفة</span>
                    <strong className="stat-box-num">{money(Number(amount))}</strong>
                  </div>
                </div>
              )}

              <div className="form-footer-smart-hint">
                <span>
                  {isIn
                    ? '💡 استلام من عميل يقلّل رصيده، ومن مورد يزيد رصيده؛ ويزيد رصيد الخزنة.'
                    : '💡 صرف لعميل يزيد رصيده، ولمورد يقلّل رصيده؛ وينقص رصيد الخزنة.'}
                </span>
              </div>

              <div className="form-modal-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : `حفظ إيصال ${isIn ? 'الاستلام' : 'الصرف'}`}
                </button>
                <button type="button" className="btn" onClick={closeForm} disabled={busy}>
                  إلغاء
                </button>
              </div>
            </form>
          </Modal>
        )
      )}

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

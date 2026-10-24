import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabase';
import { money, qty as formatQty, round2, today } from '../lib/format';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import type {
  AccountKind,
  AccountRow,
  CashBoxRow,
  InvoiceKind,
  InvoiceRow,
  ItemRow,
  LineDraft,
  StockOpeningRow,
  WarehouseOption,
} from '../lib/types';

interface EditingInvoice {
  invoice: InvoiceRow;
  lines: LineDraft[];
}

interface InvoiceFormProps {
  kind: InvoiceKind;
  accounts: AccountRow[];
  warehouses: WarehouseOption[];
  cashBoxes: CashBoxRow[];
  items: ItemRow[];
  stockRows: StockOpeningRow[];
  editing: EditingInvoice | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), item_id: '', qty: '1', unit_price: '' };
}

export default function InvoiceForm({
  kind,
  accounts,
  warehouses,
  cashBoxes,
  items,
  stockRows,
  editing,
  onSaved,
  onCancel,
}: InvoiceFormProps) {
  const isPurchase = kind === 'purchase' || kind === 'purchase_return';
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const isRefundIn = kind === 'purchase_return';
  const isWaste = kind === 'waste';
  const defaultSystemKey = isWaste
    ? 'waste'
    : kind === 'sale' || kind === 'sale_return'
      ? 'cash_customer'
      : 'cash_supplier';
  const defaultAccountId = accounts.find((account) => account.system_key === defaultSystemKey)?.id ?? '';
  const defaultAccountKind: AccountKind = editing?.invoice.account_kind ?? (
    isWaste ? 'waste' : kind === 'sale' || kind === 'sale_return' ? 'customer' : 'supplier'
  );
  const [date, setDate] = useState(editing?.invoice.invoice_date ?? today());
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultAccountKind);
  const [accountId, setAccountId] = useState(editing?.invoice.account_id ?? defaultAccountId);
  const [warehouseId, setWarehouseId] = useState(
    editing?.invoice.warehouse_id ?? warehouses.find((warehouse) => warehouse.is_active !== false)?.id ?? '',
  );
  const [cashBoxId, setCashBoxId] = useState(
    editing?.invoice.cash_box_id ?? cashBoxes.find((box) => box.is_active)?.id ?? '',
  );
  const [paid, setPaid] = useState(editing ? String(Number(editing.invoice.paid)) : '0');
  const [notes, setNotes] = useState(editing?.invoice.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    editing ? [...editing.lines, emptyLine()] : [emptyLine()],
  );
  const [error, setError] = useState('');
  const [lineWarning, setLineWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const itemSearchRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusSearchKey, setFocusSearchKey] = useState<string | null>(null);

  useEffect(() => {
    if (!focusSearchKey) return;
    itemSearchRefs.current[focusSearchKey]?.focus();
    setFocusSearchKey(null);
  }, [focusSearchKey, lines]);

  const activeLines = lines.filter((line) => line.item_id);
  const total = round2(
    activeLines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0),
  );
  const paidNumber = Number(paid || 0);
  const remaining = round2(total - (Number.isFinite(paidNumber) ? paidNumber : 0));
  const cashAccountSelected = accounts.some(
    (account) => account.id === accountId && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
  );
  const selectableAccounts = accounts.filter((account) => account.kind === accountKind);
  const selectableWarehouses = warehouses.filter(
    (warehouse) => warehouse.is_active !== false || warehouse.id === editing?.invoice.warehouse_id,
  );
  const selectableCashBoxes = cashBoxes.filter(
    (box) => box.is_active || box.id === editing?.invoice.cash_box_id,
  );
  const effectiveCashBoxId = cashBoxId || editing?.invoice.cash_box_id || cashBoxes.find((box) => box.is_active)?.id || '';

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectItem(key: string, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    const price = item
      ? isWaste
        ? 0
        : isPurchase
        ? Number(item.purchase_price)
        : Number(item.sale_price)
      : undefined;

    setLines((current) => {
      const updated = current.map((line) =>
        line.key === key
          ? {
              ...line,
              item_id: itemId,
              unit_price: price === undefined ? line.unit_price : String(price),
            }
          : line,
      );

      // Auto-append a new empty row if the last row now has an item selected
      const lastLine = updated[updated.length - 1];
      if (itemId && lastLine && lastLine.item_id) {
        return [...updated, emptyLine()];
      }
      return updated;
    });
  }

  function moveFromQuantity(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const row = event.currentTarget.closest('tr');
    row?.querySelector<HTMLInputElement>('input[aria-label="سعر الوحدة"]')?.focus();
  }

  function addLineFromPrice(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const row = event.currentTarget.closest('tr');
    const nextRow = row?.nextElementSibling;
    const nextSearch = nextRow?.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (nextSearch) {
      nextSearch.focus();
    }
  }

  function removeLine(key: string) {
    setLines((current) => {
      const remaining = current.filter((line) => line.key !== key);
      if (remaining.length === 0 || remaining[remaining.length - 1].item_id) {
        return [...remaining, emptyLine()];
      }
      return remaining;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const activeLines = lines.filter((line) => line.item_id);

    if (!accountId) return setError(isWaste ? 'حساب الهالك الثابت غير موجود' : 'اختر الحساب');
    if (!warehouseId) return setError('اختر المخزن');
    if (paidNumber > 0 && !effectiveCashBoxId) return setError('اختر الخزنة التي استلمت أو صرفت المبلغ');
    if (!date) return setError('أدخل التاريخ');
    if (activeLines.length === 0) return setError('اختر صنفًا واحدًا على الأقل في الفاتورة');

    const hasInvalidLine = activeLines.some(
      (line) => !(Number(line.qty) > 0) || !(Number(line.unit_price) >= 0),
    );
    if (hasInvalidLine) return setError('أدخل كمية وسعرًا صحيحين لكل الأصناف');

    if (!(paidNumber >= 0)) return setError(`قيمة ${isReturn ? 'المسترد' : 'المدفوع'} غير صحيحة`);
    if (paidNumber > total)
      return setError(`${isReturn ? 'المسترد' : 'المدفوع'} أكبر من إجمالي ${isReturn ? 'المرتجع' : 'الفاتورة'}`);
    if (cashAccountSelected && paidNumber !== total)
      return setError('عند استخدام حساب نقدي يجب أن يساوي المدفوع/المسترد إجمالي المستند');

    const args = {
      p_account_id: accountId,
      p_warehouse_id: warehouseId,
      p_invoice_date: date,
      p_paid: round2(paidNumber),
      p_cash_box_id: paidNumber > 0 ? effectiveCashBoxId : null,
      p_notes: notes.trim() || null,
      p_lines: activeLines.map((line) => ({
        item_id: line.item_id,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price || 0),
      })),
    };

    setBusy(true);
    const { error: rpcError } = editing
      ? await supabase.rpc('update_invoice_with_cash_box', { p_invoice_id: editing.invoice.id, ...args })
      : await supabase.rpc('create_invoice_with_cash_box', { p_kind: kind, ...args });
    setBusy(false);

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    onSaved(
      editing
        ? `تم تعديل ${isReturn ? 'المرتجع' : 'الفاتورة'}${paidNumber > 0 ? ' وتحديث الإيصال' : ''}`
        : `تم حفظ ${isReturn ? 'المرتجع' : 'الفاتورة'}${paidNumber > 0 ? ' وإنشاء الإيصال' : ''}`,
    );
  }

  return (
    <form className="invoice-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="form-grid-col-5">
          {isWaste ? 'الحساب' : kind === 'sale' || kind === 'sale_return' ? 'العميل' : 'المورد'}
          {isWaste ? (
            <select value={accountId} disabled required>
              <option value={accountId}>
                {accounts.find((account) => account.id === accountId)?.name ?? 'حساب الهالك الثابت غير موجود'}
              </option>
            </select>
          ) : (
            <SearchableSelect
              value={accountId}
              options={selectableAccounts.map((account) => ({ value: account.id, label: account.name }))}
              onChange={setAccountId}
              placeholder="اختر الحساب…"
              required
            />
          )}
        </label>

        <label className="form-grid-col-2">
          نوع الحساب
          <select
            value={accountKind}
            onChange={(e) => {
              setAccountKind(e.target.value as AccountKind);
              setAccountId('');
            }}
            disabled={isWaste}
            required
          >
            {isWaste ? (
              <option value="waste">هالك</option>
            ) : (
              <>
                <option value="customer">عميل</option>
                <option value="supplier">مورد</option>
              </>
            )}
          </select>
        </label>

        <label className="form-grid-col-2">
          التاريخ
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label className="form-grid-col-3">
          المخزن
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
            {selectableWarehouses.length === 0 && <option value="">لا يوجد مخزن نشط</option>}
            {selectableWarehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}{warehouse.is_active === false ? ' — موقوف (للفواتير القديمة)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="form-grid-col-12">
          ملاحظات
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية على الفاتورة (اختياري)…"
          />
        </label>
      </div>

      <div className="lines">
        <div className="lines-head-bar">
          <div className="lines-head-title">
            <h3>الأصناف</h3>
            <span className="lines-count-badge">
              {activeLines.length} {activeLines.length === 1 ? 'صنف' : 'أصناف'}
            </span>
          </div>
        </div>

        {lineWarning && <p className="alert warning" role="status" style={{ margin: '8px 0' }}>{lineWarning}</p>}

        <div className="lines-wrap">
          <table className="lines-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th className="w-qty">الكمية</th>
                <th className="w-price">{isWaste ? 'سعر البيع' : 'السعر'}</th>
                <th className="w-total">الإجمالي</th>
                <th className="w-action center">حذف</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const selectedItem = items.find((item) => item.id === line.item_id);
                const lineTotal = round2(
                  Number(line.qty || 0) * Number(line.unit_price || 0),
                );
                return (
                  <tr key={line.key}>
                    <td data-label="الصنف">
                      <SearchableSelect
                        inputRef={(element) => { itemSearchRefs.current[line.key] = element; }}
                        value={line.item_id}
                        options={items.map((item) => ({
                          value: item.id,
                          label: `${item.code} — ${item.name} — متاح: ${formatQty(stockRows.find((row) => row.item_id === item.id && row.warehouse_id === warehouseId)?.current_qty ?? 0)} ${item.unit}`,
                        }))}
                        onChange={(value) => {
                          if (lines.some((candidate) => candidate.key !== line.key && candidate.item_id === value)) {
                            setLineWarning('هذا الصنف موجود بالفعل في الفاتورة. اختَر صنفًا آخر.');
                            return;
                          }
                          setLineWarning('');
                          selectItem(line.key, value);
                          if (value) quantityRefs.current[line.key]?.focus();
                        }}
                        placeholder="اختر صنفًا…"
                        searchPlaceholder="ابحث باسم أو كود الصنف…"
                        emptyMessage="لا توجد أصناف مطابقة"
                      />
                    </td>
                    <td data-label={selectedItem ? `الكمية (${selectedItem.unit})` : 'الكمية'}>
                      <div className="line-qty-cell">
                        <input
                          ref={(element) => { quantityRefs.current[line.key] = element; }}
                          aria-label={`الكمية${selectedItem ? ` — ${selectedItem.name} (${selectedItem.unit})` : ''}`}
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.qty}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          onKeyDown={moveFromQuantity}
                        />
                        {selectedItem && <span className="line-unit-badge">{selectedItem.unit}</span>}
                      </div>
                    </td>
                    <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                      <input
                        aria-label={isWaste ? 'سعر البيع' : 'سعر الوحدة'}
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        placeholder="0.00"
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                        onKeyDown={addLineFromPrice}
                        disabled={isWaste}
                      />
                    </td>
                    <td className="line-total" data-label="الإجمالي">{money(lineTotal)}</td>
                    <td className="center" data-label="إجراء">
                      <button
                        type="button"
                        className="line-delete-btn"
                        title="حذف هذا الصنف"
                        aria-label="حذف سطر الصنف"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1 && !line.item_id}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-footer">
        <div className="invoice-totals-bar">
          <div className="total-stat-box grand-total">
            <span className="stat-box-title">إجمالي {isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}</span>
            <strong className="stat-box-num">{money(total)}</strong>
          </div>

          {!isWaste && (
            <div className="total-input-box">
              <label>
                <span className="stat-box-title">{isReturn ? 'المبلغ المسترد' : 'المبلغ المدفوع'}</span>
                <div className="input-with-action-wrap">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    placeholder="0.00"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                  {total > 0 && Number(paid) !== total && (
                    <button
                      type="button"
                      className="btn-pay-full-pill"
                      title="سداد كامل المبلغ"
                      onClick={() => setPaid(String(total))}
                    >
                      كامل المبلغ
                    </button>
                  )}
                </div>
              </label>
            </div>
          )}

          {!isWaste && (
            <div className={`total-stat-box ${remaining === 0 ? 'paid-full' : 'has-remaining'}`}>
              <span className="stat-box-title">
                {isReturn
                  ? remaining === 0 ? 'مسترد بالكامل' : 'غير مسترد'
                  : remaining === 0 ? 'خالص بالكامل' : 'المتبقي (آجل)'}
              </span>
              <strong className="stat-box-num">{money(remaining)}</strong>
            </div>
          )}

          {!isWaste && (
            <div className={`total-input-box ${paidNumber <= 0 ? 'disabled' : ''}`}>
              <label>
                <span className="stat-box-title">
                  {isReturn ? 'الخزنة المنصرف منها' : 'الخزنة المستلمة'}
                  {paidNumber <= 0 && (
                    <span className="muted-text" style={{ fontSize: '10px', fontWeight: 'normal', marginInlineStart: '4px' }}>
                      (مُعطلة — لا يوجد مدفوع)
                    </span>
                  )}
                </span>
                <select
                  value={effectiveCashBoxId}
                  onChange={(event) => setCashBoxId(event.target.value)}
                  disabled={paidNumber <= 0}
                  required={paidNumber > 0}
                >
                  <option value="">اختر الخزنة…</option>
                  {selectableCashBoxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name} ({money(box.balance)})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className={`form-footer-smart-hint ${cashAccountSelected ? 'notice-cash' : ''}`}>
          <span>
            {isWaste
              ? 'تُحسب خسارة الهالك من متوسط تكلفة الصنف في هذا المخزن وقت الحفظ. لا يترتب عليه مبلغ أو إيصال.'
              : cashAccountSelected
              ? `💡 الحساب نقدي: يجب أن يساوي ${isReturn ? 'المسترد' : 'المدفوع'} إجمالي المستند (${money(total)})، وسينشأ الإيصال آليًا.`
              : isReturn
              ? paidNumber > 0
                ? `سيتم إنشاء إيصال ${isRefundIn ? 'استلام من' : 'صرف إلى'} الحساب بقيمة المسترد (${money(paidNumber)}) وربطه بالمرتجع.`
                : 'لا يوجد مسترد: لن يتم إنشاء إيصال، وسيبقى المبلغ رصيدًا دائنًا للحساب.'
              : paidNumber > 0
                ? `سيتم إنشاء إيصال نقدية تلقائي بقيمة المدفوع (${money(paidNumber)}) وربطه بالفاتورة.`
                : 'فاتورة آجلة: لا يوجد مدفوع نقدي، وستضاف القيمة لحساب العميل/المورد.'}
          </span>
        </div>

        {error && <p className="alert error">{error}</p>}

        <div className="form-modal-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : `حفظ ${isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}`}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            إلغاء
          </button>
        </div>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, qty as formatQty, round2, today } from '../lib/format';
import { calculateInvoiceSubtotal, calculateRemaining, calculateBalancePreview } from '../lib/invoiceMath';
import { translateDbError } from '../lib/errors';
import SearchableSelect from './SearchableSelect';
import ConfirmDialog from './ConfirmDialog';
import { toast } from './Toast';
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
  const defaultWarehouse = warehouses.find((w) => w.is_primary && w.is_active !== false)
    ?? warehouses.find((w) => w.name === 'المخزن الرئيسي' && w.is_active !== false)
    ?? warehouses.find((w) => w.is_active !== false);

  const [date] = useState(editing?.invoice.invoice_date ?? today());
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultAccountKind);
  const [accountId, setAccountId] = useState(editing?.invoice.account_id ?? defaultAccountId);
  const [warehouseId, setWarehouseId] = useState(
    editing?.invoice.warehouse_id ?? defaultWarehouse?.id ?? '',
  );
  const [cashBoxId, setCashBoxId] = useState(
    editing?.invoice.cash_box_id ?? cashBoxes.find((box) => box.is_active)?.id ?? '',
  );
  const [paid, setPaid] = useState(editing ? String(Number(editing.invoice.paid)) : '0');
  const [notes, setNotes] = useState(editing?.invoice.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    editing ? [...editing.lines, emptyLine()] : [emptyLine()],
  );
  const [busy, setBusy] = useState(false);
  const [confirmZeroPriceOpen, setConfirmZeroPriceOpen] = useState(false);

  const itemSearchRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusSearchKey, setFocusSearchKey] = useState<string | null>(null);

  useEffect(() => {
    if (!focusSearchKey) return;
    itemSearchRefs.current[focusSearchKey]?.focus();
    setFocusSearchKey(null);
  }, [focusSearchKey, lines]);

  const total = calculateInvoiceSubtotal(lines);
  const paidNumber = Number(paid || 0);
  const remaining = calculateRemaining(total, paid);
  const cashAccountSelected = accounts.some(
    (account) => account.id === accountId && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
  );

  // السداد الكامل التلقائي للحسابات النقدية عند تغير الإجمالي
  useEffect(() => {
    if (cashAccountSelected && !editing) {
      setPaid(String(total));
    }
  }, [total, cashAccountSelected, editing]);

  const selectableAccounts = accounts.filter((account) => account.kind === accountKind);
  const selectableWarehouses = warehouses.filter(
    (warehouse) => warehouse.is_active !== false || warehouse.id === editing?.invoice.warehouse_id,
  );
  const selectableCashBoxes = cashBoxes.filter(
    (box) => box.is_active || box.id === editing?.invoice.cash_box_id,
  );
  const effectiveCashBoxId = cashBoxId || editing?.invoice.cash_box_id || cashBoxes.find((box) => box.is_active)?.id || '';

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const { netInvoiceDebt, balanceBefore, balanceAfter } = calculateBalancePreview({
    currentAccountBalance: Number(selectedAccount?.balance || 0),
    isReturn,
    total,
    paid: paidNumber,
    isEditing: Boolean(editing),
    editingTotal: Number(editing?.invoice.total || 0),
    editingPaid: Number(editing?.invoice.paid || 0),
  });

  const accountNotesDisplay = selectedAccount
    ? [selectedAccount.notes, selectedAccount.phone ? `هاتف: ${selectedAccount.phone}` : ''].filter(Boolean).join(' — ')
    : '';

  function handleAccountKindChange(nextKind: AccountKind) {
    setAccountKind(nextKind);
    const nextCashKey = nextKind === 'customer' ? 'cash_customer' : 'cash_supplier';
    const nextAccountId = accounts.find((a) => a.system_key === nextCashKey)?.id ?? '';
    setAccountId(nextAccountId);
    if (!editing) {
      setPaid(String(total));
    }
  }

  function handleAccountChange(id: string) {
    setAccountId(id);
    const isCash = accounts.some(
      (account) => account.id === id && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
    );
    if (isCash && !editing) {
      setPaid(String(total));
    }
  }

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

      // Auto-append empty row if last row selected
      const lastLine = updated[updated.length - 1];
      if (itemId && lastLine && lastLine.item_id) {
        return [...updated, emptyLine()];
      }
      return updated;
    });
  }

  function addEmptyLine() {
    setLines((current) => [...current, emptyLine()]);
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

  function handleResetNew() {
    setLines([emptyLine()]);
    setPaid('0');
    setNotes('');
    if (!editing) {
      setAccountId(defaultAccountId);
      setAccountKind(defaultAccountKind);
    }
    toast.info('تم مسح الفاتورة وبدء فاتورة جديدة');
  }

  async function executeSave() {
    const activeLines = lines.filter((line) => line.item_id);

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
      toast.error(translateDbError(rpcError.message));
      return;
    }

    onSaved(
      editing
        ? `تم تعديل ${isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}${paidNumber > 0 ? ' وتحديث الإيصال' : ''}`
        : `تم حفظ ${isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}${paidNumber > 0 ? ' وإنشاء الإيصال' : ''}`,
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activeLines = lines.filter((line) => line.item_id);

    if (!accountId) return toast.error(isWaste ? 'حساب الهالك الثابت غير موجود' : 'اختر الحساب');
    if (!warehouseId) return toast.error('اختر المخزن');
    if (paidNumber > 0 && !effectiveCashBoxId) return toast.error('اختر الخزنة التي استلمت أو صرفت المبلغ');
    if (!date) return toast.error('أدخل التاريخ');
    if (activeLines.length === 0) return toast.error('اختر صنفًا واحدًا على الأقل في الفاتورة');

    const hasInvalidLine = activeLines.some(
      (line) => !(Number(line.qty) > 0) || !(Number(line.unit_price) >= 0),
    );
    if (hasInvalidLine) return toast.error('أدخل كمية وسعرًا صحيحين لكل الأصناف (الكمية يجب أن تكون أكبر من صفر)');

    const itemIds = activeLines.map((line) => line.item_id);
    if (new Set(itemIds).size !== itemIds.length) {
      return toast.error('لا يمكن تكرار نفس الصنف في أكثر من سطر بالفاتورة. يرجى تعديل الكمية في سطر واحد.');
    }

    if (!(paidNumber >= 0)) return toast.error(`قيمة ${isReturn ? 'المسترد' : 'المدفوع'} غير صحيحة`);
    if (paidNumber > total)
      return toast.error(`${isReturn ? 'المسترد' : 'المدفوع'} أكبر من إجمالي ${isReturn ? 'المرتجع' : 'الفاتورة'}`);
    if (cashAccountSelected && paidNumber !== total)
      return toast.error(`الحساب نقدي: يجب أن يساوي ${isReturn ? 'المسترد' : 'المدفوع'} إجمالي المستند (${money(total)})`);

    // تأكيد صريح في حال وجود صنف بسعر صفر
    const hasZeroPrice = !isWaste && activeLines.some((line) => Number(line.unit_price || 0) === 0);
    if (hasZeroPrice) {
      setConfirmZeroPriceOpen(true);
      return;
    }

    void executeSave();
  }

  return (
    <>
      <form className="invoice-form invoice-two-parts-layout" onSubmit={submit}>
        {/* ====================================================================
            الجزء اليمين: نوع الحساب - الحساب - ملاحظات الحساب - الرصيد قبل - الرصيد بعد - صافي المديونية - المخزن - الاصناف
            ==================================================================== */}
        <div className="invoice-part-right">
          {/* كارت رأس الحساب والبيانات الأساسية */}
          <div className="right-card account-header-card">
            {/* الصف الأول: نوع الحساب - الحساب - ملاحظات الحساب */}
            <div className="account-header-grid">
              {!isWaste && (
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
                    required
                  />
                </label>
              )}

              {!isWaste && (
                <label className="field-account-select">
                  <span>الحساب</span>
                  <SearchableSelect
                    value={accountId}
                    options={selectableAccounts.map((account) => ({ value: account.id, label: account.name }))}
                    onChange={handleAccountChange}
                    placeholder="اختر الحساب…"
                    searchPlaceholder="اكتب للبحث عن حساب…"
                    emptyMessage="لا توجد حسابات مطابقة"
                    required
                  />
                </label>
              )}

              {!isWaste && (
                <label className="field-account-notes">
                  <span>ملاحظات الحساب</span>
                  <input
                    type="text"
                    readOnly
                    value={accountNotesDisplay}
                    placeholder="لا توجد ملاحظات على الحساب"
                    className="account-notes-input"
                    title={accountNotesDisplay || 'لا توجد ملاحظات على الحساب'}
                  />
                </label>
              )}
            </div>

            {/* الصف الثاني: الرصيد قبل - الرصيد بعد - صافي المديونية - المخزن */}
            <div className="balance-warehouse-strip">
              {selectedAccount && !isWaste && (
                <>
                  <div className="stat-pill">
                    <span>الرصيد قبل:</span>
                    <strong
                      dir="ltr"
                      className={`num ${balanceBefore > 0 ? 'text-due' : balanceBefore < 0 ? 'text-credit' : ''}`}
                    >
                      {money(Math.abs(balanceBefore))}
                    </strong>
                    <span className="stat-pill-tag">
                      {balanceBefore > 0
                        ? accountKind === 'customer' ? 'مدين (عليه)' : 'دائن (له)'
                        : balanceBefore < 0
                        ? accountKind === 'customer' ? 'دائن (له)' : 'مدين (عنده)'
                        : 'خالص'}
                    </span>
                  </div>

                  <div className="stat-pill">
                    <span>الرصيد بعد:</span>
                    <strong
                      dir="ltr"
                      className={`num ${balanceAfter > 0 ? 'text-due' : balanceAfter < 0 ? 'text-credit' : ''}`}
                    >
                      {money(Math.abs(balanceAfter))}
                    </strong>
                    <span className="stat-pill-tag">
                      {balanceAfter > 0
                        ? accountKind === 'customer' ? 'مدين (عليه)' : 'دائن (له)'
                        : balanceAfter < 0
                        ? accountKind === 'customer' ? 'دائن (له)' : 'مدين (عنده)'
                        : 'خالص'}
                    </span>
                  </div>

                  <div className="stat-pill highlight">
                    <span>صافي المديونية:</span>
                    <strong dir="ltr" className="num">
                      {money(netInvoiceDebt)}
                    </strong>
                  </div>
                </>
              )}

              <label className="field-warehouse-select" style={{ marginInlineStart: 'auto', minWidth: '200px' }}>
                <span>المخزن</span>
                <SearchableSelect
                  value={warehouseId}
                  options={selectableWarehouses.map((warehouse) => ({
                    value: warehouse.id,
                    label: `${warehouse.name}${warehouse.is_active === false ? ' — موقوف' : ''}`,
                  }))}
                  onChange={setWarehouseId}
                  placeholder={selectableWarehouses.length === 0 ? 'لا يوجد مخزن نشط' : 'اختر المخزن…'}
                  searchPlaceholder="اكتب للبحث عن مخزن…"
                  emptyMessage="لا يوجد مخزن مطابق"
                  required
                />
              </label>
            </div>
          </div>

          {/* جدول الأصناف */}
          <div className="right-card items-table-card">
            <div className="table-header-title-bar">
              <span className="items-title">الأصناف</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={addEmptyLine}
                title="إضافة سطر صنف جديد"
              >
                <Plus size={14} /> إضافة سطر
              </button>
            </div>

            <div className="lines-wrap">
              <table className="lines-table">
                <thead>
                  <tr>
                    <th className="w-num center">#</th>
                    <th>الصنف</th>
                    <th className="w-qty">الكمية</th>
                    <th className="w-price">{isWaste ? 'سعر البيع' : 'السعر'}</th>
                    <th className="w-total">الإجمالي</th>
                    <th className="w-action center">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const selectedItem = items.find((item) => item.id === line.item_id);
                    const lineTotal = round2(
                      Number(line.qty || 0) * Number(line.unit_price || 0),
                    );

                    const stockRow = stockRows.find(
                      (row) => row.item_id === line.item_id && row.warehouse_id === warehouseId,
                    );
                    const availableStock = stockRow ? Number(stockRow.current_qty) : 0;
                    const isStockExceeded =
                      Boolean(line.item_id) &&
                      (kind === 'sale' || kind === 'waste' || kind === 'purchase_return') &&
                      Number(line.qty) > availableStock;

                    const isEmptyLine = !line.item_id;

                    return (
                      <tr key={line.key} className={isEmptyLine ? 'empty-line-row' : ''}>
                        <td className="w-num center line-index-cell" data-label="#">
                          {index + 1}
                        </td>
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
                                toast.warning('هذا الصنف موجود بالفعل في الفاتورة. اختَر صنفًا آخر.');
                                return;
                              }
                              selectItem(line.key, value);
                              if (value) quantityRefs.current[line.key]?.focus();
                            }}
                            placeholder="اختر صنفًا…"
                            searchPlaceholder="ابحث باسم أو كود الصنف…"
                            emptyMessage="لا توجد أصناف مطابقة"
                          />
                        </td>
                        <td data-label={selectedItem ? `الكمية (${selectedItem.unit})` : 'الكمية'}>
                          <div className="line-qty-group">
                            <input
                              ref={(element) => { quantityRefs.current[line.key] = element; }}
                              aria-label={`الكمية${selectedItem ? ` — ${selectedItem.name} (${selectedItem.unit})` : ''}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.0001"
                              dir="ltr"
                              value={line.qty}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                              onKeyDown={moveFromQuantity}
                              className="no-spinner num"
                            />
                            <span className="line-unit-suffix">{selectedItem ? selectedItem.unit : 'قطعة'}</span>
                          </div>
                          {isStockExceeded && (
                            <span className="stock-warning-text" role="alert">
                              تنبيه: الكمية ({line.qty}) تتجاوز المتاح ({formatQty(availableStock)})
                            </span>
                          )}
                        </td>
                        <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                          <input
                            aria-label={isWaste ? 'سعر البيع' : 'سعر الوحدة'}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            dir="ltr"
                            placeholder="0.00"
                            value={line.unit_price}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                            onKeyDown={addLineFromPrice}
                            disabled={isWaste}
                            className="no-spinner num"
                          />
                        </td>
                        <td className="line-total" data-label="الإجمالي">
                          <span dir="ltr" className="num">{money(lineTotal)}</span>
                        </td>
                        <td className="center" data-label="إجراء">
                          <button
                            type="button"
                            className="line-delete-btn"
                            title="حذف هذا الصنف"
                            aria-label="حذف سطر الصنف"
                            onClick={() => removeLine(line.key)}
                            disabled={lines.length === 1 && !line.item_id}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ====================================================================
            الجزء عاليسار: اجمالي الفاتورة - المدفوع - المتبقي - الخزنة - ملاحظات - حفظ الفاتورة - مسح/جديد
            ==================================================================== */}
        <div className="invoice-part-left">
          {/* 1. إجمالي الفاتورة والخانة على نفس السطر */}
          <div className="left-row-strip left-total-strip">
            <span className="strip-label">إجمالي {isReturn ? 'المرتجع' : isWaste ? 'الهالك' : 'الفاتورة'}</span>
            <strong dir="ltr" className="strip-value strip-value-total num">{money(total)}</strong>
          </div>

          {/* 2. المدفوع والخانة على نفس السطر */}
          {!isWaste && (
            <div className="left-row-strip left-paid-strip">
              <div className="paid-label-group">
                <span className="strip-label">{isReturn ? 'المسترد' : 'المدفوع'}</span>
                {total > 0 && Number(paid) !== total && (
                  <button
                    type="button"
                    className="btn-pay-full-pill"
                    onClick={() => setPaid(String(total))}
                    title="دفع كامل المبلغ"
                  >
                    بالكامل
                  </button>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                dir="ltr"
                placeholder="0.00"
                value={paid}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPaid(e.target.value)}
                className="no-spinner num left-paid-input"
                aria-label={isReturn ? 'المبلغ المسترد' : 'المدفوع'}
              />
            </div>
          )}

          {/* 3. المتبقي والخانة على نفس السطر */}
          {!isWaste && (
            <div className={`left-row-strip left-remaining-strip ${remaining === 0 ? 'is-zero' : 'is-due'}`}>
              <div className="remaining-label-group">
                <span className="strip-label">{isReturn ? 'حالة الاسترداد:' : 'المتبقي:'}</span>
                <span className={`status-badge ${remaining === 0 ? 'paid' : 'unpaid'}`} style={{ fontSize: '10.5px' }}>
                  {isReturn
                    ? remaining === 0 ? 'مسترد بالكامل' : 'غير مسترد'
                    : remaining === 0 ? 'خالص' : 'آجل'}
                </span>
              </div>
              <strong dir="ltr" className="strip-value strip-value-remaining num">
                {money(remaining)}
              </strong>
            </div>
          )}

          {/* 4. الخزنة */}
          {!isWaste && (
            <div className={`left-field-box ${paidNumber <= 0 ? 'disabled' : ''}`}>
              <label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{isReturn ? 'الخزنة المنصرف منها' : 'الخزنة'}</span>
                  {paidNumber <= 0 && (
                    <span className="muted-text" style={{ fontSize: '10.5px' }}>
                      (لا يوجد مدفوع)
                    </span>
                  )}
                </div>
                <SearchableSelect
                  value={effectiveCashBoxId}
                  options={selectableCashBoxes.map((box) => ({
                    value: box.id,
                    label: `${box.name} (${money(box.balance)})`,
                  }))}
                  onChange={(val) => setCashBoxId(val)}
                  placeholder="اختر الخزنة…"
                  searchPlaceholder="اكتب للبحث عن خزنة…"
                  emptyMessage="لا توجد خزنة مطابقة"
                  disabled={paidNumber <= 0}
                  required={paidNumber > 0}
                />
              </label>
            </div>
          )}

          {/* 5. ملاحظات */}
          <div className="left-field-box">
            <label>
              <span>ملاحظات</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية على الفاتورة…"
                className="left-notes-textarea"
              />
            </label>
          </div>

          {/* 6. حفظ الفاتورة & 7. مسح / جديد */}
          <div className="left-actions-group">
            <button
              type="submit"
              className="btn primary btn-invoice-save"
              disabled={busy}
            >
              <Save size={16} />
              <span>
                {busy
                  ? 'جارٍ الحفظ…'
                  : editing
                  ? 'حفظ التعديلات'
                  : isReturn
                  ? 'حفظ المرتجع'
                  : isWaste
                  ? 'حفظ الهالك'
                  : 'حفظ الفاتورة'}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-invoice-clear"
              onClick={handleResetNew}
              disabled={busy}
              title="مسح بيانات الفاتورة الحالية والبدء من جديد"
            >
              <RotateCcw size={14} />
              <span>مسح / جديد</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={busy}
              style={{ fontSize: '11.5px', minHeight: '28px' }}
            >
              إلغاء النافذة
            </button>
          </div>
        </div>
      </form>

      {confirmZeroPriceOpen && (
        <ConfirmDialog
          title="تأكيد حفظ صنف بسعر صفر"
          message="يوجد صنف أو أكثر في الفاتورة بسعر 0.00 ج.م. هل أنت متأكد من حفظ الفاتورة بهذا السعر؟"
          confirmLabel="نعم، احفظ بسعر صفر"
          danger={false}
          onConfirm={() => {
            setConfirmZeroPriceOpen(false);
            void executeSave();
          }}
          onCancel={() => setConfirmZeroPriceOpen(false)}
        />
      )}
    </>
  );
}

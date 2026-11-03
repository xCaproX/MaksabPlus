import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Plus, RotateCcw, Save, Trash2, X, Pencil, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate, money, qty as formatQty, round2, today } from '../lib/format';
import { calculateInvoiceSubtotal, calculateRemaining, calculateBalancePreview } from '../lib/invoiceMath';
import { translateDbError } from '../lib/errors';
import { calculateAvailableStock } from '../lib/invoiceValidation';
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
  readOnly?: boolean;
  onSaved: (message: string) => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
}

export default function InvoiceForm({
  kind,
  accounts,
  warehouses,
  cashBoxes,
  items,
  stockRows,
  editing,
  readOnly = false,
  onSaved,
  onCancel,
  onEdit,
  onDelete,
  onPrint,
}: InvoiceFormProps) {
  const isReadOnly = Boolean(readOnly);
  const isPurchase = kind === 'purchase' || kind === 'purchase_return';
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const isWaste = kind === 'waste';

  const defaultSystemKey = isWaste
    ? 'waste'
    : kind === 'sale' || kind === 'sale_return'
      ? 'cash_customer'
      : 'cash_supplier';
  const defaultAccountKind: AccountKind = editing?.invoice.account_kind ?? (
    isWaste ? 'waste' : kind === 'sale' || kind === 'sale_return' ? 'customer' : 'supplier'
  );
  const defaultAccountId = accounts.find((account) => account.system_key === defaultSystemKey)?.id
    ?? accounts.find((account) => account.name.includes('عميل نقدي'))?.id
    ?? accounts.find((account) => account.kind === defaultAccountKind)?.id
    ?? '';
  const defaultWarehouse = warehouses.find((w) => w.is_primary && w.is_active !== false)
    ?? warehouses.find((w) => w.name.includes('المخزن الرئيسي') && w.is_active !== false)
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
  const [paid, setPaid] = useState(editing ? Number(editing.invoice.paid).toFixed(2) : '0.00');
  const [notes, setNotes] = useState(editing?.invoice.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (editing?.lines?.length) {
      return editing.lines.filter((l) => Boolean(l.item_id));
    }
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [confirmZeroPriceOpen, setConfirmZeroPriceOpen] = useState(false);

  // حالة شريط الإدخال الثابت أعلى الجدول
  const [entryItemId, setEntryItemId] = useState('');
  const [entryQty, setEntryQty] = useState('1');
  const [entryUnitPrice, setEntryUnitPrice] = useState('');

  const entryItemSearchRef = useRef<HTMLInputElement>(null);
  const entryQtyInputRef = useRef<HTMLInputElement>(null);
  const entryPriceInputRef = useRef<HTMLInputElement>(null);
  const pendingSaveLines = useRef<LineDraft[] | null>(null);

  const total = calculateInvoiceSubtotal(lines);
  const paidNumber = Number(paid || 0);
  const remaining = calculateRemaining(total, paid);
  const cashAccountSelected = accounts.some(
    (account) => account.id === accountId && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
  );

  // السداد الكامل التلقائي للحسابات النقدية عند تغير الإجمالي، وضبط المدفوع ألا يتجاوز الإجمالي
  useEffect(() => {
    if (cashAccountSelected) {
      setPaid(Number(total).toFixed(2));
    } else if (paidNumber > total) {
      setPaid(Number(total).toFixed(2));
    }
  }, [total, cashAccountSelected, paidNumber]);

  const selectableAccounts = accounts.filter((account) => account.kind === accountKind);
  const selectableWarehouses = warehouses.filter(
    (warehouse) => warehouse.is_active !== false || warehouse.id === editing?.invoice.warehouse_id,
  );
  const selectableCashBoxes = cashBoxes.filter(
    (box) => box.is_active || box.id === editing?.invoice.cash_box_id,
  );
  const effectiveCashBoxId = cashBoxId || editing?.invoice.cash_box_id || cashBoxes.find((box) => box.is_active)?.id || '';

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);
  const { netInvoiceDebt, balanceBefore, balanceAfter } = calculateBalancePreview({
    currentAccountBalance: Number(selectedAccount?.balance || 0),
    isReturn,
    total,
    paid: paidNumber,
    isEditing: Boolean(editing),
    editingTotal: Number(editing?.invoice.total || 0),
    editingPaid: Number(editing?.invoice.paid || 0),
  });

  const accountNotesDisplay = selectedAccount?.notes || '';

  function getBalanceStatus(balance: number, kind: AccountKind): { text: string; type: 'settled' | 'debit' | 'credit' } {
    if (balance === 0) return { text: 'خالص', type: 'settled' };
    if (kind === 'customer') {
      return balance > 0 ? { text: 'عليه', type: 'debit' } : { text: 'له', type: 'credit' };
    }
    return balance > 0 ? { text: 'له', type: 'credit' } : { text: 'عليه', type: 'debit' };
  }

  const statusBefore = getBalanceStatus(balanceBefore, accountKind);
  const statusAfter = getBalanceStatus(balanceAfter, accountKind);

  function handleAccountKindChange(nextKind: AccountKind) {
    setAccountKind(nextKind);
    const nextCashKey = nextKind === 'customer' ? 'cash_customer' : 'cash_supplier';
    const nextAccountId = accounts.find((a) => a.system_key === nextCashKey)?.id ?? '';
    setAccountId(nextAccountId);
    setPaid(Number(total).toFixed(2));
  }

  function handleAccountChange(id: string) {
    setAccountId(id);
    const isCash = accounts.some(
      (account) => account.id === id && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
    );
    if (isCash) {
      setPaid(Number(total).toFixed(2));
    }
  }

    function getItemAvailableStock(itemId: string, targetWarehouseId = warehouseId): number {
    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    return calculateAvailableStock({
      itemId,
      warehouseId: targetWarehouseId,
      stockRows,
      editingWarehouseId: isStockLimited ? editing?.invoice.warehouse_id : undefined,
      editingLines: editing?.lines,
    });
  }

  function handleWarehouseChange(nextWarehouseId: string) {
    setWarehouseId(nextWarehouseId);
    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    if (!isStockLimited) return;

    // التحقق من توفر الصنف قيد الإدخال في المخزن الجديد
    if (entryItemId) {
      const availableStock = getItemAvailableStock(entryItemId, nextWarehouseId);
      if (availableStock <= 0) {
        toast.warning('الصنف قيد الإدخال غير متوفر في المخزن المحدد، تم إلغاء اختياره');
        setEntryItemId('');
        setEntryQty('1');
        setEntryUnitPrice('');
      } else if (Number(entryQty) > availableStock) {
        toast.warning(`تم تعديل كمية الصنف قيد الإدخال إلى الرصيد المتاح بالمخزن (${formatQty(availableStock)})`);
        setEntryQty(String(availableStock));
      }
    }

    setLines((current) =>
      current
        .map((line) => {
          if (!line.item_id) return line;
          const availableStock = getItemAvailableStock(line.item_id, nextWarehouseId);
          if (availableStock <= 0) {
            toast.warning('أحد الأصناف المدرجة غير متوفر في المخزن المحدد، تم حذفه');
            return null as unknown as LineDraft;
          }
          if (Number(line.qty) > availableStock) {
            toast.warning(`تم تعديل كمية الصنف إلى الرصيد المتاح بالمخزن (${formatQty(availableStock)})`);
            return { ...line, qty: String(availableStock) };
          }
          return line;
        })
        .filter(Boolean),
    );
  }

  const entrySelectedItem = items.find((item) => item.id === entryItemId);
  const entryAvailableStock = entryItemId ? getItemAvailableStock(entryItemId, warehouseId) : 0;
  const entryLineTotal = round2(
    Number(entryQty || 0) * Number(entryUnitPrice || 0),
  );

  function handleEntryItemSelect(itemId: string) {
    if (!itemId) {
      setEntryItemId('');
      setEntryQty('1');
      setEntryUnitPrice('');
      return;
    }

    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    const availableStock = getItemAvailableStock(itemId, warehouseId);

    if (isStockLimited && availableStock <= 0) {
      toast.warning('الصنف غير متوفر');
      return;
    }

    const item = items.find((candidate) => candidate.id === itemId);
    const price = item
      ? isWaste
        ? 0
        : isPurchase
        ? Number(item.purchase_price)
        : Number(item.sale_price)
      : 0;

    setEntryItemId(itemId);
    setEntryUnitPrice(String(price));
    setEntryQty('1');

    setTimeout(() => {
      entryQtyInputRef.current?.focus();
      entryQtyInputRef.current?.select();
    }, 40);
  }

  function handleEntryQtyChange(val: string) {
    if (val === '') {
      setEntryQty('');
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num)) {
      setEntryQty('1');
      return;
    }
    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    if (isStockLimited && entryItemId && entryAvailableStock > 0 && num > entryAvailableStock) {
      setEntryQty(String(entryAvailableStock));
      toast.warning(`الكمية المتاحة (${formatQty(entryAvailableStock)}) هي الحد الأقصى`);
      return;
    }
    if (num < 1 && val !== '0' && val !== '0.') {
      setEntryQty('1');
      return;
    }
    setEntryQty(val);
  }

  function handleEntryQtyBlur() {
    const num = parseFloat(entryQty);
    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    if (isNaN(num) || num < 1) {
      setEntryQty('1');
    } else if (isStockLimited && entryItemId && entryAvailableStock > 0 && num > entryAvailableStock) {
      setEntryQty(String(entryAvailableStock));
    }
  }

  function handleInsertLine() {
    if (!entryItemId) {
      toast.warning('اختر صنفاً أولاً');
      entryItemSearchRef.current?.focus();
      return;
    }

    let qtyNum = Number(entryQty || 0);
    if (qtyNum < 1) {
      toast.warning('الكمية يجب ألا تقل عن 1');
      setEntryQty('1');
      entryQtyInputRef.current?.focus();
      return;
    }

    const priceNum = Number(entryUnitPrice || 0);
    if (priceNum < 0) {
      toast.warning('السعر لا يمكن أن يكون سالباً');
      entryPriceInputRef.current?.focus();
      return;
    }

    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    if (isStockLimited) {
      if (entryAvailableStock <= 0) {
        toast.warning('الصنف غير متوفر بالمخزن');
        return;
      }
      const existingInList = lines.find((l) => l.item_id === entryItemId);
      const currentInList = existingInList ? Number(existingInList.qty || 0) : 0;
      if (currentInList >= entryAvailableStock) {
        toast.warning(`الكمية المتاحة بالكامل (${formatQty(entryAvailableStock)}) موجودة بالفعل في الفاتورة`);
        return;
      }
      if (currentInList + qtyNum > entryAvailableStock) {
        qtyNum = entryAvailableStock - currentInList;
        toast.warning(`تم تعديل الكمية المضافة إلى ${formatQty(qtyNum)} لتتوافق مع المتبقي من الرصيد المتاح`);
      }
    }

    setLines((current) => {
      const existingIndex = current.findIndex((l) => l.item_id === entryItemId);
      if (existingIndex >= 0) {
        const updated = [...current];
        const existing = updated[existingIndex];
        const mergedQty = round2(Number(existing.qty || 0) + qtyNum);
        updated[existingIndex] = {
          ...existing,
          qty: String(mergedQty),
          unit_price: String(priceNum),
        };
        toast.info(`تم تحديث كمية "${entrySelectedItem?.name}" إلى (${formatQty(mergedQty)})`);
        return updated;
      }
      return [
        ...current,
        {
          key: crypto.randomUUID(),
          item_id: entryItemId,
          qty: String(qtyNum),
          unit_price: String(priceNum),
        },
      ];
    });

    setEntryItemId('');
    setEntryQty('1');
    setEntryUnitPrice('');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, 40);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function handleResetNew() {
    setLines([]);
    setEntryItemId('');
    setEntryQty('1');
    setEntryUnitPrice('');
    setPaid('0.00');
    setNotes('');
    if (!editing) {
      setAccountId(defaultAccountId);
      setAccountKind(defaultAccountKind);
    }
    toast.info('تم مسح الفاتورة وبدء فاتورة جديدة');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, 40);
  }

  async function executeSave(linesToSave: LineDraft[] = pendingSaveLines.current ?? lines) {
    const activeLines = linesToSave.filter((line) => line.item_id);

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
    const activeLines = [...lines];

    // إذا كان هناك صنف قيد الإدخال في شريط الإدخال الثابت، ندرجه تلقائياً قبل الحفظ
    if (entryItemId) {
      let qtyNum = Number(entryQty || 0);
      const priceNum = Number(entryUnitPrice || 0);
      if (qtyNum >= 1 && priceNum >= 0) {
        const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
        if (isStockLimited && entryAvailableStock > 0 && qtyNum > entryAvailableStock) {
          qtyNum = entryAvailableStock;
        }
        const existingIndex = activeLines.findIndex((l) => l.item_id === entryItemId);
        if (existingIndex >= 0) {
          const existing = activeLines[existingIndex];
          activeLines[existingIndex] = {
            ...existing,
            qty: String(round2(Number(existing.qty || 0) + qtyNum)),
            unit_price: String(priceNum),
          };
        } else {
          activeLines.push({
            key: crypto.randomUUID(),
            item_id: entryItemId,
            qty: String(qtyNum),
            unit_price: String(priceNum),
          });
        }
        setLines(activeLines);
        setEntryItemId('');
        setEntryQty('1');
        setEntryUnitPrice('');
      }
    }

    pendingSaveLines.current = activeLines;

    if (!accountId) return toast.error(isWaste ? 'حساب الهالك الثابت غير موجود' : 'اختر الحساب');
    if (!warehouseId) return toast.error('اختر المخزن');
    if (paidNumber > 0 && !effectiveCashBoxId) return toast.error('اختر الخزنة التي استلمت أو صرفت المبلغ');
    if (!date) return toast.error('أدخل التاريخ');
    if (activeLines.length === 0) return toast.error('اختر صنفًا واحدًا على الأقل في الفاتورة');

    const hasInvalidLine = activeLines.some(
      (line) => !(Number(line.qty) >= 1) || !(Number(line.unit_price) >= 0),
    );
    if (hasInvalidLine) return toast.error('أدخل كمية وسعرًا صحيحين لكل الأصناف (الكمية يجب ألا تقل عن 1)');

    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    if (isStockLimited) {
      for (const line of activeLines) {
        const availableStock = getItemAvailableStock(line.item_id, warehouseId);
        if (availableStock <= 0) {
          return toast.error('أحد الأصناف المختارة غير متوفر بالمخزن');
        }
        if (Number(line.qty) > availableStock) {
          return toast.error(`الكمية المطلوبة للصنف تتجاوز الرصيد المتاح بالمخزن (${formatQty(availableStock)})`);
        }
      }
    }

    const currentTotal = calculateInvoiceSubtotal(activeLines);

    if (!(paidNumber >= 0)) {
      setPaid('0.00');
      return toast.error(`قيمة ${isReturn ? 'المسترد' : 'المدفوع'} غير صحيحة`);
    }
    if (paidNumber > currentTotal) {
      setPaid(Number(currentTotal).toFixed(2));
      return toast.error(`${isReturn ? 'المسترد' : 'المدفوع'} أكبر من إجمالي ${isReturn ? 'المرتجع' : 'الفاتورة'}`);
    }
    if (cashAccountSelected && paidNumber !== currentTotal) {
      setPaid(Number(currentTotal).toFixed(2));
      return toast.error(`الحساب نقدي: يلزم سداد كامل قيمة المستند (${money(currentTotal)})`);
    }

    // تأكيد صريح في حال وجود صنف بسعر صفر
    const hasZeroPrice = !isWaste && activeLines.some((line) => Number(line.unit_price || 0) === 0);
    if (hasZeroPrice) {
      setConfirmZeroPriceOpen(true);
      return;
    }

    void executeSave(activeLines);
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
            {/* الصف الأول: التاريخ - المخزن - نوع الحساب - الحساب */}
            <div className="account-header-row1">
              <label className="field-date">
                <span>التاريخ</span>
                <div className="readonly-val-box num" dir="ltr">{formatDate(date)}</div>
              </label>

              <label className="field-warehouse-select">
                <span>المخزن</span>
                {isReadOnly ? (
                  <div className="readonly-val-box">{selectedWarehouse?.name ?? '—'}</div>
                ) : (
                  <SearchableSelect
                    value={warehouseId}
                    options={selectableWarehouses.map((warehouse) => ({
                      value: warehouse.id,
                      label: `${warehouse.name}${warehouse.is_active === false ? ' — موقوف' : ''}`,
                    }))}
                    onChange={handleWarehouseChange}
                    placeholder={selectableWarehouses.length === 0 ? 'لا يوجد مخزن نشط' : 'اختر المخزن…'}
                    searchPlaceholder="اكتب للبحث عن مخزن…"
                    emptyMessage="لا يوجد مخزن مطابق"
                    required
                  />
                )}
              </label>

              {!isWaste && (
                <label className="field-account-kind">
                  <span>نوع الحساب</span>
                  {isReadOnly ? (
                    <div className="readonly-val-box">{accountKind === 'customer' ? 'عميل' : 'مورد'}</div>
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
                      required
                    />
                  )}
                </label>
              )}

              {!isWaste && (
                <label className="field-account-select">
                  <span>الحساب</span>
                  {isReadOnly ? (
                    <div className="readonly-val-box strong">{selectedAccount?.name ?? '—'}</div>
                  ) : (
                    <SearchableSelect
                      value={accountId}
                      options={selectableAccounts.map((account) => ({
                        value: account.id,
                        label: account.phone ? `${account.name} — ${account.phone}` : account.name,
                      }))}
                      onChange={handleAccountChange}
                      placeholder="اختر الحساب…"
                      searchPlaceholder="اكتب للبحث عن حساب…"
                      emptyMessage="لا توجد حسابات مطابقة"
                      required
                    />
                  )}
                </label>
              )}
            </div>

            {/* الصف الثاني: ملاحظات الحساب - المديونية قبل - صافي الفاتورة - المديونية بعد */}
            <div className="account-header-row2">
              {!isWaste && (
                <div className="field-account-notes">
                  <input
                    type="text"
                    readOnly
                    value={accountNotesDisplay}
                    placeholder="لا توجد ملاحظات على الحساب"
                    className="account-notes-input"
                    title={accountNotesDisplay || 'لا توجد ملاحظات على الحساب'}
                    aria-label="ملاحظات الحساب"
                  />
                </div>
              )}

              {selectedAccount && !isWaste && (
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
                    <span>صافي الفاتورة:</span>
                    <strong dir="ltr" className="num">
                      {money(netInvoiceDebt)}
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
              )}
            </div>
          </div>

          {/* جدول الأصناف */}
          <div className="right-card items-table-card">
            <div className="lines-wrap">
              <table className="lines-table">
                <thead>
                  <tr>
                    <th className="w-num center">#</th>
                    <th>الصنف</th>
                    <th className="w-qty">الكمية</th>
                    <th className="w-price">{isWaste ? 'سعر البيع' : 'السعر'}</th>
                    <th className="w-total">الإجمالي</th>
                    {!isReadOnly && <th className="w-action center">إجراء</th>}
                  </tr>
                </thead>
                <tbody>
                  {/* شريط الإدخال الثابت أعلى الجدول */}
                  {!isReadOnly && (
                    <tr className="entry-line-row">
                      <td className="w-num center line-index-cell" data-label="#">
                        <span className="entry-badge" title="سطر إدخال صنف جديد">+</span>
                      </td>
                      <td data-label="الصنف">
                        <SearchableSelect
                          inputRef={entryItemSearchRef}
                          value={entryItemId}
                          options={items.map((item) => {
                            const stock = getItemAvailableStock(item.id, warehouseId);
                            const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                            const isOut = isStockLimited && Number(stock) <= 0;
                            return {
                              value: item.id,
                              label: `${item.code} — ${item.name} — متاح: ${formatQty(stock)} ${item.unit}${isOut ? ' (غير متوفر)' : ''}`,
                            };
                          })}
                          onChange={handleEntryItemSelect}
                          placeholder="اختر صنفاً للإدراج…"
                          searchPlaceholder="ابحث باسم أو كود الصنف…"
                          emptyMessage="لا توجد أصناف مطابقة"
                        />
                      </td>
                      <td data-label={entrySelectedItem ? `الكمية (${entrySelectedItem.unit})` : 'الكمية'}>
                        <div className="line-qty-group">
                          <input
                            ref={entryQtyInputRef}
                            aria-label={`كمية الصنف${entrySelectedItem ? ` — ${entrySelectedItem.name} (${entrySelectedItem.unit})` : ''}`}
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.0001"
                            dir="ltr"
                            value={entryQty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleEntryQtyChange(e.target.value)}
                            onBlur={handleEntryQtyBlur}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                entryPriceInputRef.current?.focus();
                                entryPriceInputRef.current?.select();
                              }
                            }}
                            className="no-spinner num"
                          />
                          <span className="line-unit-suffix">{entrySelectedItem ? entrySelectedItem.unit : 'قطعة'}</span>
                        </div>
                      </td>
                      <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                        <input
                          ref={entryPriceInputRef}
                          aria-label={isWaste ? 'سعر البيع' : 'سعر الوحدة'}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          dir="ltr"
                          placeholder="0.00"
                          value={entryUnitPrice}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEntryUnitPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleInsertLine();
                            }
                          }}
                          disabled={isWaste}
                          className="no-spinner num"
                        />
                      </td>
                      <td className="line-total" data-label="الإجمالي">
                        <span dir="ltr" className="num">{money(entryLineTotal)}</span>
                      </td>
                      <td className="center" data-label="إجراء">
                        <button
                          type="button"
                          className="btn-insert-line"
                          onClick={handleInsertLine}
                          disabled={!entryItemId}
                          title="إدراج الصنف في الفاتورة"
                        >
                          <Plus size={15} />
                          <span>إدراج</span>
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* قائمة الأصناف المدرجة أسفل شريط الإدخال */}
                  {lines.length === 0 ? (
                    <tr className="empty-lines-placeholder-row">
                      <td colSpan={isReadOnly ? 5 : 6}>
                        {isReadOnly ? 'لا توجد بنود في هذه الفاتورة.' : 'لم يتم إدراج أصناف بعد. اختر صنفاً من الشريط أعلاه واضغط إدراج أو Enter.'}
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, index) => {
                      const selectedItem = items.find((item) => item.id === line.item_id);
                      const lineTotal = round2(
                        Number(line.qty || 0) * Number(line.unit_price || 0),
                      );

                      const availableStock = getItemAvailableStock(line.item_id, warehouseId);
                      const isStockExceeded =
                        Boolean(line.item_id) &&
                        (kind === 'sale' || kind === 'waste' || kind === 'purchase_return') &&
                        Number(line.qty) > availableStock;

                      return (
                        <tr key={line.key} className="inserted-line-row">
                          <td className="w-num center line-index-cell" data-label="#">
                            {index + 1}
                          </td>
                          <td data-label="الصنف">
                            <div className="inserted-item-info">
                              <span className="item-name">{selectedItem?.name ?? '—'}</span>
                              {selectedItem?.code && (
                                <span className="item-code-tag">{selectedItem.code}</span>
                              )}
                            </div>
                          </td>
                          <td data-label={selectedItem ? `الكمية (${selectedItem.unit})` : 'الكمية'}>
                            {isReadOnly ? (
                              <div className="readonly-line-qty-box">
                                <bdi className="num" dir="ltr">{formatQty(line.qty)}</bdi>
                                <span className="line-unit-suffix">{selectedItem ? selectedItem.unit : 'قطعة'}</span>
                              </div>
                            ) : (
                              <div className="line-qty-group">
                                <input
                                  aria-label={`الكمية — ${selectedItem?.name ?? ''} (${selectedItem?.unit ?? 'قطعة'})`}
                                  type="number"
                                  inputMode="decimal"
                                  min="1"
                                  step="0.0001"
                                  dir="ltr"
                                  value={line.qty}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      updateLine(line.key, { qty: '' });
                                      return;
                                    }
                                    const num = parseFloat(val);
                                    if (isNaN(num)) {
                                      updateLine(line.key, { qty: '1' });
                                      return;
                                    }
                                    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                                    if (isStockLimited && line.item_id && availableStock > 0 && num > availableStock) {
                                      updateLine(line.key, { qty: String(availableStock) });
                                      toast.warning(`الكمية المتاحة (${formatQty(availableStock)}) هي الحد الأقصى`);
                                      return;
                                    }
                                    if (num < 1 && val !== '0' && val !== '0.') {
                                      updateLine(line.key, { qty: '1' });
                                      return;
                                    }
                                    updateLine(line.key, { qty: val });
                                  }}
                                  onBlur={() => {
                                    const num = parseFloat(line.qty);
                                    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
                                    if (isNaN(num) || num < 1) {
                                      updateLine(line.key, { qty: '1' });
                                    } else if (isStockLimited && line.item_id && availableStock > 0 && num > availableStock) {
                                      updateLine(line.key, { qty: String(availableStock) });
                                    }
                                  }}
                                  className="no-spinner num"
                                />
                                <span className="line-unit-suffix">{selectedItem ? selectedItem.unit : 'قطعة'}</span>
                              </div>
                            )}
                            {!isReadOnly && isStockExceeded && (
                              <span className="stock-warning-text" role="alert">
                                تنبيه: الكمية ({line.qty}) تتجاوز المتاح ({formatQty(availableStock)})
                              </span>
                            )}
                          </td>
                          <td data-label={isWaste ? 'سعر البيع' : 'السعر'}>
                            {isReadOnly ? (
                              <span className="readonly-line-price num" dir="ltr">
                                <bdi>{money(line.unit_price)}</bdi>
                              </span>
                            ) : (
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
                                disabled={isWaste}
                                className="no-spinner num"
                              />
                            )}
                          </td>
                          <td className="line-total" data-label="الإجمالي">
                            <span dir="ltr" className="num">{money(lineTotal)}</span>
                          </td>
                          {!isReadOnly && (
                            <td className="center" data-label="إجراء">
                              <button
                                type="button"
                                className="line-delete-btn"
                                title="حذف هذا الصنف من الفاتورة"
                                aria-label="حذف سطر الصنف"
                                onClick={() => removeLine(line.key)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
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
            <div className="strip-value-box">
              <strong dir="ltr" className="strip-value strip-value-total num">{money(total)}</strong>
            </div>
          </div>

          {/* 2. المدفوع والخانة على نفس السطر */}
          {!isWaste && (
            <div className="left-row-strip left-paid-strip">
              <span className="strip-label">{isReturn ? 'المسترد' : 'المدفوع'}</span>
              {!isReadOnly && (
                <div className="strip-center-slot">
                  <div className="paid-quick-actions">
                    <button
                      type="button"
                      className="btn-paid-quick btn-paid-all"
                      onClick={() => setPaid(Number(total).toFixed(2))}
                      title={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                      aria-label={isReturn ? 'استرداد بالكامل' : 'دفع بالكامل'}
                    >
                      <Check size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="btn-paid-quick btn-paid-zero"
                      onClick={() => {
                        if (cashAccountSelected) {
                          toast.warning('العميل النقدي يلزم سداد كامل قيمة الفاتورة ولا يمكن تصفير المدفوع');
                          setPaid(Number(total).toFixed(2));
                          return;
                        }
                        setPaid('0.00');
                      }}
                      title={cashAccountSelected ? 'العميل النقدي يلزم سداد كامل الفاتورة' : 'عدم دفع شيء (صفر)'}
                      aria-label={cashAccountSelected ? 'العميل النقدي يلزم سداد كامل الفاتورة' : 'عدم دفع شيء (تصفير)'}
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
              <div className="strip-value-box strip-paid-box">
                {isReadOnly ? (
                  <strong dir="ltr" className="strip-value num">{money(paidNumber)}</strong>
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0.00"
                    value={paid}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!/^\d*\.?\d*$/.test(val)) return;
                      const num = parseFloat(val);
                      if (!isNaN(num) && num > total) {
                        setPaid(Number(total).toFixed(2));
                        toast.warning('المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة');
                        return;
                      }
                      setPaid(val);
                    }}
                    onBlur={() => {
                      let num = parseFloat(paid);
                      if (isNaN(num) || num < 0) {
                        num = 0;
                      } else if (num > total) {
                        num = total;
                      }
                      if (cashAccountSelected && num < total) {
                        num = total;
                        toast.warning('العميل النقدي يلزم سداد كامل قيمة الفاتورة');
                      }
                      const parts = paid.split('.');
                      const decimals = parts[1] ? Math.max(2, parts[1].length) : 2;
                      setPaid(num.toFixed(decimals));
                    }}
                    className="no-spinner num left-paid-input"
                    aria-label={isReturn ? 'المبلغ المسترد' : 'المدفوع'}
                  />
                )}
              </div>
            </div>
          )}

          {/* 3. المتبقي والخانة على نفس السطر */}
          {!isWaste && (
            <div className={`left-row-strip left-remaining-strip ${remaining === 0 ? 'is-zero' : 'is-due'}`}>
              <span className="strip-label">{isReturn ? 'حالة الاسترداد' : 'المتبقي'}</span>
              <div className="strip-center-slot">
                <span className={`status-badge ${remaining === 0 ? 'paid' : 'unpaid'}`} style={{ fontSize: '10.5px' }}>
                  {isReturn
                    ? remaining === 0 ? 'مسترد بالكامل' : 'غير مسترد'
                    : remaining === 0 ? 'خالص' : 'آجل'}
                </span>
              </div>
              <div className="strip-value-box">
                <strong dir="ltr" className="strip-value strip-value-remaining num">
                  {money(remaining)}
                </strong>
              </div>
            </div>
          )}

          {/* 4. الخزنة */}
          {!isWaste && (
            <div className={`left-field-box ${paidNumber <= 0 ? 'disabled' : ''}`}>
              <label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{isReturn ? 'الخزنة المنصرف منها' : 'الخزنة'}</span>
                  {paidNumber <= 0 && (
                    <span className="no-paid-hint">
                      (لا يوجد مدفوع)
                    </span>
                  )}
                </div>
                {isReadOnly ? (
                  <div className="readonly-val-box">
                    {selectableCashBoxes.find((b) => b.id === effectiveCashBoxId)?.name ?? '—'}
                  </div>
                ) : (
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
                )}
              </label>
            </div>
          )}

          {/* 5. ملاحظات */}
          <div className="left-field-box">
            <label>
              <span>ملاحظات</span>
              {isReadOnly ? (
                <div className="readonly-val-box readonly-notes">
                  {notes || 'لا توجد ملاحظات على الفاتورة'}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية على الفاتورة…"
                  className="left-notes-textarea"
                />
              )}
            </label>
          </div>

          {/* السند المالي المرتبط إن وجد */}
          {editing?.invoice.receipt_number && (
            <div className="left-field-box linked-receipt-box">
              <span style={{ fontSize: '12px', fontWeight: 650, color: '#475569' }}>السند المالي المرتبط</span>
              <div className="linked-receipt-badge">
                <span>إيصال</span>
                <bdi className="num" dir="ltr">{editing.invoice.receipt_number}</bdi>
                <span>(<bdi className="num" dir="ltr">{money(editing.invoice.receipt_amount ?? 0)}</bdi> ج.م)</span>
              </div>
            </div>
          )}

          {/* 6. أزرار الإجراءات */}
          {isReadOnly ? (
            <div className="left-actions-group readonly-actions-group">
              {onEdit && (
                <button
                  type="button"
                  className="btn primary btn-invoice-edit"
                  onClick={onEdit}
                >
                  <Pencil size={15} />
                  <span>تعديل الفاتورة</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-invoice-print"
                onClick={onPrint ?? (() => window.print())}
              >
                <Printer size={15} />
                <span>طباعة الفاتورة</span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  className="btn danger btn-invoice-delete"
                  onClick={onDelete}
                >
                  <Trash2 size={15} />
                  <span>حذف الفاتورة</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-invoice-close"
                onClick={onCancel}
              >
                <span>إغلاق</span>
              </button>
            </div>
          ) : (
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
            </div>
          )}
        </div>
      </form>

      {confirmZeroPriceOpen && (
        <ConfirmDialog
          title="تأكيد حفظ صنف بسعر صفر"
          message="يوجد صنف أو أكثر في الفاتورة بسعر 0.00. هل أنت متأكد من حفظ الفاتورة بهذا السعر؟"
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

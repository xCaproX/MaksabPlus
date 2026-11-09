import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { FOCUS_SETTLE_DELAY_MS } from '../lib/ui';
import { money, qty as formatQty, round2, today } from '../lib/format';
import { calculateInvoiceSubtotal, calculateRemaining, calculateBalancePreview } from '../lib/invoiceMath';
import { resolveDefaultAccount, resolveDefaultWarehouse, resolveDefaultCashBox } from '../lib/defaults';
import { clampDocQty, clampDocQtyOnBlur, mergeOrInsertDocLine, flushPendingDocLine } from '../lib/docLineEntry';
import { translateDbError } from '../lib/errors';
import { calculateAvailableStock } from '../lib/invoiceValidation';
import type { WarehouseItemOption } from '../lib/masterDataQueries';
import ConfirmDialog from './ConfirmDialog';
import { toast } from './Toast';
import InvoiceAccountHeader from './invoice-form/InvoiceAccountHeader';
import InvoiceItemsTable from './invoice-form/InvoiceItemsTable';
import InvoiceSummarySidebar from './invoice-form/InvoiceSummarySidebar';
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
  onSaved: (message: string, affectsCash: boolean) => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
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
  onRestore,
  onPrint,
}: InvoiceFormProps) {
  const isReadOnly = Boolean(readOnly);
  const isPurchase = kind === 'purchase' || kind === 'purchase_return';
  const isReturn = kind === 'sale_return' || kind === 'purchase_return';
  const isWaste = kind === 'waste';
  const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';

  const defaultSystemKey = isWaste
    ? 'waste'
    : kind === 'sale' || kind === 'sale_return'
      ? 'cash_customer'
      : 'cash_supplier';
  const defaultAccountKind: AccountKind =
    editing?.invoice.account_kind ??
    (isWaste ? 'waste' : kind === 'sale' || kind === 'sale_return' ? 'customer' : 'supplier');
  const defaultAccountId =
    resolveDefaultAccount(accounts, defaultAccountKind, defaultSystemKey)?.id ?? '';
  const defaultWarehouse = resolveDefaultWarehouse(warehouses);
  const defaultCashBox = resolveDefaultCashBox(cashBoxes);

  const [date, setDate] = useState(editing?.invoice.invoice_date ?? today());
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultAccountKind);
  const [accountId, setAccountId] = useState(editing?.invoice.account_id ?? defaultAccountId);
  const [warehouseId, setWarehouseId] = useState(
    editing?.invoice.warehouse_id ?? defaultWarehouse?.id ?? '',
  );
  const [cashBoxId, setCashBoxId] = useState(
    editing?.invoice.cash_box_id ?? defaultCashBox?.id ?? '',
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
    (account) =>
      account.id === accountId && ['cash_customer', 'cash_supplier'].includes(account.system_key ?? ''),
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
  const effectiveCashBoxId =
    cashBoxId || editing?.invoice.cash_box_id || cashBoxes.find((box) => box.is_active)?.id || '';

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
    accountKind: selectedAccount?.kind,
    invoiceKind: kind,
  });

  const accountNotesDisplay = selectedAccount?.notes || '';



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
        toast.warning(
          `تم تعديل كمية الصنف قيد الإدخال إلى الرصيد المتاح بالمخزن (${formatQty(availableStock)})`,
        );
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
            toast.warning(
              `تم تعديل كمية الصنف إلى الرصيد المتاح بالمخزن (${formatQty(availableStock)})`,
            );
            return { ...line, qty: String(availableStock) };
          }
          return line;
        })
        .filter(Boolean),
    );
  }

  const [entryAsyncOption, setEntryAsyncOption] = useState<WarehouseItemOption | null>(null);

  const entrySelectedItem =
    items.find((item) => item.id === entryItemId) ||
    (entryAsyncOption && entryAsyncOption.value === entryItemId
      ? ({
          id: entryAsyncOption.value,
          name: entryAsyncOption.label.split(' — ')[1] || entryAsyncOption.label,
          code: entryAsyncOption.code,
          unit: entryAsyncOption.unit,
          sale_price: entryAsyncOption.salePrice,
          purchase_price: entryAsyncOption.purchasePrice,
          is_active: true,
          company_id: '',
          created_at: '',
          updated_at: '',
          notes: null,
          serial_number: null,
        } as unknown as ItemRow)
      : undefined);

  const entryAvailableStock = entryItemId
    ? entryAsyncOption && entryAsyncOption.value === entryItemId
      ? entryAsyncOption.stock
      : getItemAvailableStock(entryItemId, warehouseId)
    : 0;
  const entryLineTotal = round2(Number(entryQty || 0) * Number(entryUnitPrice || 0));

  function handleEntryItemSelect(itemId: string, selectedOption?: WarehouseItemOption) {
    if (!itemId) {
      setEntryItemId('');
      setEntryAsyncOption(null);
      setEntryQty('1');
      setEntryUnitPrice('');
      return;
    }

    if (selectedOption) {
      setEntryAsyncOption(selectedOption);
    }

    const isStockLimited = kind === 'sale' || kind === 'waste' || kind === 'purchase_return';
    const availableStock =
      selectedOption !== undefined
        ? selectedOption.stock
        : getItemAvailableStock(itemId, warehouseId);

    if (isStockLimited && availableStock <= 0) {
      toast.warning('الصنف غير متوفر');
      return;
    }

    const item = items.find((candidate) => candidate.id === itemId);
    const price = selectedOption
      ? isWaste
        ? 0
        : isPurchase
          ? Number(selectedOption.purchasePrice)
          : Number(selectedOption.salePrice)
      : item
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
    setEntryQty(clampDocQty(val, entryAvailableStock, isStockLimited));
  }

  function handleEntryQtyBlur() {
    setEntryQty((current) => clampDocQtyOnBlur(current, entryAvailableStock, isStockLimited));
  }

  function handleInsertLine() {
    if (!entryItemId) {
      toast.warning('اختر صنفاً أولاً');
      entryItemSearchRef.current?.focus();
      return;
    }

    const priceNum = Number(entryUnitPrice || 0);
    if (priceNum < 0) {
      toast.warning('السعر لا يمكن أن يكون سالباً');
      entryPriceInputRef.current?.focus();
      return;
    }

    const updated = mergeOrInsertDocLine({
      lines,
      itemId: entryItemId,
      itemName: entrySelectedItem?.name,
      qty: Number(entryQty || 0),
      availableStock: entryAvailableStock,
      isStockLimited,
      extra: { unit_price: String(priceNum) },
      docLabel: 'الفاتورة',
    });

    if (updated) {
      setLines(updated);
      setEntryItemId('');
      setEntryAsyncOption(null);
      setEntryQty('1');
      setEntryUnitPrice('');
      setTimeout(() => {
        entryItemSearchRef.current?.focus();
      }, FOCUS_SETTLE_DELAY_MS);
    }
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
    setEntryAsyncOption(null);
    setEntryQty('1');
    setEntryUnitPrice('');
    setPaid('0.00');
    setNotes('');
    setDate(today());
    if (!editing) {
      setAccountId(defaultAccountId);
      setAccountKind(defaultAccountKind);
    }
    toast.info('تم مسح الفاتورة وبدء فاتورة جديدة');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, FOCUS_SETTLE_DELAY_MS);
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
      ? await supabase.rpc('update_invoice_with_cash_box', {
          p_invoice_id: editing.invoice.id,
          ...args,
        })
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
      args.p_paid > 0 || Number(editing?.invoice.paid ?? 0) > 0,
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceNum = Number(entryUnitPrice || 0);
    const pending = flushPendingDocLine(
      lines,
      entryItemId,
      entryQty,
      entryAvailableStock,
      isStockLimited,
      { unit_price: String(priceNum) },
    );
    if (!pending) return;
    const { lines: activeLines, adjusted } = pending;
    if (activeLines !== lines) {
      setLines(activeLines);
      setEntryItemId('');
      setEntryAsyncOption(null);
      setEntryQty('1');
      setEntryUnitPrice('');
    }
    if (adjusted) return;

    pendingSaveLines.current = activeLines;

    if (!accountId) return toast.error(isWaste ? 'حساب الهالك الثابت غير موجود' : 'اختر الحساب');
    if (!warehouseId) return toast.error('اختر المخزن');
    if (paidNumber > 0 && !effectiveCashBoxId)
      return toast.error('اختر الخزنة التي استلمت أو صرفت المبلغ');
    if (!date) return toast.error('أدخل التاريخ');
    if (activeLines.length === 0) return toast.error('اختر صنفًا واحدًا على الأقل في الفاتورة');

    const hasInvalidLine = activeLines.some(
      (line) => !(Number(line.qty) > 0) || !(Number(line.unit_price) >= 0),
    );
    if (hasInvalidLine)
      return toast.error(
        'أدخل كمية وسعرًا صحيحين لكل الأصناف (الكمية يجب أن تكون أكبر من صفر)',
      );

    if (isStockLimited) {
      for (const line of activeLines) {
        const availableStock = getItemAvailableStock(line.item_id, warehouseId);
        if (availableStock <= 0) {
          return toast.error('أحد الأصناف المختارة غير متوفر بالمخزن');
        }
        if (Number(line.qty) > availableStock) {
          return toast.error(
            `الكمية المطلوبة للصنف تتجاوز الرصيد المتاح بالمخزن (${formatQty(availableStock)})`,
          );
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
      return toast.error(
        `${isReturn ? 'المسترد' : 'المدفوع'} أكبر من إجمالي ${isReturn ? 'المرتجع' : 'الفاتورة'}`,
      );
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
        <div className="invoice-part-right">
          <InvoiceAccountHeader
            isReadOnly={isReadOnly}
            isWaste={isWaste}
            date={date}
            onDateChange={setDate}
            warehouseId={warehouseId}
            selectableWarehouses={selectableWarehouses}
            selectedWarehouse={selectedWarehouse}
            onWarehouseChange={handleWarehouseChange}
            accountKind={accountKind}
            onAccountKindChange={handleAccountKindChange}
            accountId={accountId}
            selectableAccounts={selectableAccounts}
            selectedAccount={selectedAccount}
            onAccountChange={handleAccountChange}
            accountNotesDisplay={accountNotesDisplay}
            balanceBefore={balanceBefore}
            netInvoiceDebt={netInvoiceDebt}
            balanceAfter={balanceAfter}
          />

          <InvoiceItemsTable
            isReadOnly={isReadOnly}
            isWaste={isWaste}
            kind={kind}
            warehouseId={warehouseId}
            items={items}
            lines={lines}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
            entryItemId={entryItemId}
            entryQty={entryQty}
            entryUnitPrice={entryUnitPrice}
            entrySelectedItem={entrySelectedItem}
            entryLineTotal={entryLineTotal}
            entryItemSearchRef={entryItemSearchRef}
            entryQtyInputRef={entryQtyInputRef}
            entryPriceInputRef={entryPriceInputRef}
            onEntryItemSelect={handleEntryItemSelect}
            onEntryQtyChange={handleEntryQtyChange}
            onEntryQtyBlur={handleEntryQtyBlur}
            onEntryPriceChange={setEntryUnitPrice}
            onInsertLine={handleInsertLine}
            getItemAvailableStock={getItemAvailableStock}
          />
        </div>

        <InvoiceSummarySidebar
          isReadOnly={isReadOnly}
          isWaste={isWaste}
          isReturn={isReturn}
          total={total}
          paid={paid}
          paidNumber={paidNumber}
          remaining={remaining}
          cashAccountSelected={cashAccountSelected}
          effectiveCashBoxId={effectiveCashBoxId}
          selectableCashBoxes={selectableCashBoxes}
          notes={notes}
          busy={busy}
          editing={editing}
          onPaidChange={(val) => {
            if (!/^\d*\.?\d*$/.test(val)) return;
            const num = parseFloat(val);
            if (!isNaN(num) && num > total) {
              setPaid(Number(total).toFixed(2));
              toast.warning('المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة');
              return;
            }
            setPaid(val);
          }}
          onPaidBlur={() => {
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
          onQuickPaidAll={() => setPaid(Number(total).toFixed(2))}
          onQuickPaidZero={() => {
            if (cashAccountSelected) {
              toast.warning('العميل النقدي يلزم سداد كامل قيمة الفاتورة ولا يمكن تصفير المدفوع');
              setPaid(Number(total).toFixed(2));
              return;
            }
            setPaid('0.00');
          }}
          onCashBoxChange={(val) => setCashBoxId(val)}
          onNotesChange={setNotes}
          onResetNew={handleResetNew}
          onCancel={onCancel}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          onPrint={onPrint}
        />
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

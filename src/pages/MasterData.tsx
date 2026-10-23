import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/company';
import { money, qty as formatQty } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import type { AccountKind, AccountRow, CashBoxRow, ItemRow, StockOpeningRow, WarehouseOption } from '../lib/types';

type Tab = 'accounts' | 'items' | 'opening';
interface WarehouseRecord extends WarehouseOption { is_active: boolean }
type LocationsTab = Tab | 'warehouses' | 'cashBoxes';

export default function MasterData() {
  const [tab, setTab] = useState<LocationsTab>('accounts');
  const [companyId, setCompanyId] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseRows, setWarehouseRows] = useState<WarehouseRecord[]>([]);
  const [stockOpeningRows, setStockOpeningRows] = useState<StockOpeningRow[]>([]);
  const [cashOpeningValues, setCashOpeningValues] = useState<Record<string, string>>({});
  const [stockOpeningValues, setStockOpeningValues] = useState<Record<string, { qty: string; cost: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const visibleAccounts = accounts.filter((account) => account.system_key === null);
  const stockByItem = new Map<string, StockOpeningRow[]>();
  for (const row of stockOpeningRows) {
    const rows = stockByItem.get(row.item_id) ?? [];
    rows.push(row);
    stockByItem.set(row.item_id, rows);
  }

  // حقول حساب (إضافة أو تعديل)
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountActive, setAccountActive] = useState(true);
  const [accountOpeningBalance, setAccountOpeningBalance] = useState('0');

  // حقول صنف (إضافة أو تعديل)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('قطعة');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [itemActive, setItemActive] = useState(true);
  const [itemOpeningWarehouseId, setItemOpeningWarehouseId] = useState('');
  const [itemOpeningQty, setItemOpeningQty] = useState('0');
  const [itemOpeningUnitCost, setItemOpeningUnitCost] = useState('0');
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [editingCashBoxId, setEditingCashBoxId] = useState<string | null>(null);
  const [cashBoxName, setCashBoxName] = useState('');

  const accountFormRef = useRef<HTMLFormElement>(null);
  const itemFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const company = await getCompanyId();

        const [accountsRes, itemsRes, boxesRes, warehousesRes, stockOpeningRes] = await Promise.all([
          supabase.from('v_account_balances').select('*').order('name'),
          supabase.from('v_item_stock').select('*').order('name'),
          supabase.from('v_cash_box_balances').select('*').order('name'),
          supabase.from('warehouses').select('id, name, is_active, is_primary').order('name'),
          supabase.from('v_stock_opening_balances').select('*').order('warehouse_name').order('item_name'),
        ]);

        if (!alive) return;

        const firstError =
          accountsRes.error ?? itemsRes.error ?? boxesRes.error ?? warehousesRes.error ?? stockOpeningRes.error;
        if (firstError) {
          setError(translateDbError(firstError.message));
          return;
        }

        setCompanyId(company);
        setAccounts((accountsRes.data ?? []) as AccountRow[]);
        setItems((itemsRes.data ?? []) as ItemRow[]);
        setCashBoxes((boxesRes.data ?? []) as CashBoxRow[]);
        const loadedWarehouseRows = (warehousesRes.data ?? []) as WarehouseRecord[];
        const loadedWarehouses = loadedWarehouseRows.filter((warehouse) => warehouse.is_active);
        const loadedBoxes = (boxesRes.data ?? []) as CashBoxRow[];
        const loadedStock = (stockOpeningRes.data ?? []) as StockOpeningRow[];
        setWarehouses(loadedWarehouses);
        setWarehouseRows(loadedWarehouseRows);
        setItemOpeningWarehouseId((current) => current || loadedWarehouses[0]?.id || '');
        setCashOpeningValues(Object.fromEntries(loadedBoxes.map((box) => [box.id, String(Number(box.opening_balance))])));
        setStockOpeningRows(loadedStock);
        setStockOpeningValues(Object.fromEntries(loadedStock.map((row) => [
          `${row.warehouse_id}:${row.item_id}`,
          { qty: String(Number(row.opening_qty)), cost: String(Number(row.unit_cost)) },
        ])));
      } catch (loadError) {
        if (alive) setError(errorMessage(loadError));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [version]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function startAccountEdit(account: AccountRow) {
    if (account.system_key) return;
    setEditingAccount(account);
    setAccountName(account.name);
    setAccountKind(account.kind);
    setAccountPhone(account.phone ?? '');
    setAccountActive(account.is_active);
    setAccountOpeningBalance(String(Number(account.opening_balance)));
    setError('');
    accountFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelAccountEdit() {
    setEditingAccount(null);
    setAccountName('');
    setAccountKind('customer');
    setAccountPhone('');
    setAccountActive(true);
    setAccountOpeningBalance('0');
    setError('');
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!accountName.trim()) {
      setError('أدخل اسم الحساب');
      return;
    }

    const openingBalance = Number(accountOpeningBalance || 0);
    if (!Number.isFinite(openingBalance)) {
      setError('أدخل رصيدًا افتتاحيًا صحيحًا');
      return;
    }

    const payload = {
      name: accountName.trim(),
      kind: accountKind,
      phone: accountPhone.trim() || null,
      is_active: accountActive,
    };

    const { error: saveError } = await supabase.rpc('save_account', {
      p_account_id: editingAccount?.id ?? null,
      p_name: payload.name,
      p_kind: payload.kind,
      p_phone: payload.phone,
      p_is_active: payload.is_active,
      p_opening_balance: openingBalance,
    });

    if (saveError) {
      setError(translateDbError(saveError.message));
      return;
    }

    const wasEditing = Boolean(editingAccount);
    cancelAccountEdit();
    setNotice(wasEditing ? 'تم تعديل الحساب' : 'تمت إضافة الحساب');
    setVersion((current) => current + 1);
  }

  async function saveOpeningBalances(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const cashLines = cashBoxes.map((box) => ({
      cash_box_id: box.id,
      opening_balance: Number(cashOpeningValues[box.id] || 0),
    }));
    const stockLines = stockOpeningRows.map((row) => {
      const value = stockOpeningValues[`${row.warehouse_id}:${row.item_id}`] ?? {
        qty: String(Number(row.opening_qty)),
        cost: String(Number(row.unit_cost)),
      };
      return {
        warehouse_id: row.warehouse_id,
        item_id: row.item_id,
        opening_qty: Number(value.qty || 0),
        unit_cost: Number(value.cost || 0),
      };
    });

    if (cashLines.some((line) => !Number.isFinite(line.opening_balance)) ||
        stockLines.some((line) => !Number.isFinite(line.opening_qty) || line.opening_qty < 0 || !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) {
      setError('راجع أرصدة الخزن وكميات المخزون وتكلفة الوحدة. القيم يجب أن تكون صحيحة وغير سالبة.');
      return;
    }

    const { error: saveError } = await supabase.rpc('save_opening_balances', {
      p_cash_boxes: cashLines,
      p_stock: stockLines,
    });
    if (saveError) {
      setError(translateDbError(saveError.message));
      return;
    }
    setNotice('تم حفظ الأرصدة الافتتاحية والتعديلات');
    setVersion((current) => current + 1);
  }

  function startItemEdit(item: ItemRow) {
    setEditingItem(item);
    setItemName(item.name);
    setItemUnit(item.unit);
    setSalePrice(String(Number(item.sale_price)));
    setPurchasePrice(String(Number(item.purchase_price)));
    setItemActive(item.is_active);
    setError('');
    itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function removeAccount(account: AccountRow) {
    if (account.system_key) return;
    const confirmed = window.confirm(
      `حذف الحساب «${account.name}»؟\n` +
        'لو عليه فواتير أو إيصالات سيتم تعطيله بدل الحذف للحفاظ على المستندات.',
    );
    if (!confirmed) return;

    setError('');
    const { data, error: rpcError } = await supabase.rpc('delete_account', {
      p_account_id: account.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    if (editingAccount?.id === account.id) cancelAccountEdit();

    setNotice(
      data === true
        ? `تم حذف الحساب «${account.name}» نهائيًا`
        : `الحساب «${account.name}» عليه مستندات، فتم تعطيله بدل الحذف`,
    );
    setVersion((current) => current + 1);
  }

  async function removeItem(item: ItemRow) {
    const confirmed = window.confirm(
      `حذف الصنف «${item.name}»؟\n` +
        'لو عليه فواتير سيتم تعطيله بدل الحذف للحفاظ على المستندات.',
    );
    if (!confirmed) return;

    setError('');
    const { data, error: rpcError } = await supabase.rpc('delete_item', {
      p_item_id: item.id,
    });

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    if (editingItem?.id === item.id) cancelItemEdit();

    setNotice(
      data === true
        ? `تم حذف الصنف «${item.name}» نهائيًا`
        : `الصنف «${item.name}» عليه فواتير، فتم تعطيله بدل الحذف`,
    );
    setVersion((current) => current + 1);
  }

  function cancelItemEdit() {
    setEditingItem(null);
    setItemName('');
    setItemUnit('قطعة');
    setSalePrice('');
    setPurchasePrice('');
    setItemActive(true);
    setItemOpeningWarehouseId(warehouses[0]?.id ?? '');
    setItemOpeningQty('0');
    setItemOpeningUnitCost('0');
    setError('');
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!itemName.trim()) {
      setError('أدخل اسم الصنف');
      return;
    }

    const sale = Number(salePrice || 0);
    const purchase = Number(purchasePrice || 0);

    if (!(sale >= 0) || !(purchase >= 0)) {
      setError('الأسعار يجب أن تكون أرقامًا موجبة');
      return;
    }

    const payload = {
      name: itemName.trim(),
      unit: itemUnit.trim() || 'قطعة',
      sale_price: sale,
      purchase_price: purchase,
      is_active: itemActive,
    };

    const openingQty = Number(itemOpeningQty || 0);
    const openingUnitCost = Number(itemOpeningUnitCost || 0);
    if (!editingItem && (!Number.isFinite(openingQty) || openingQty < 0 || !Number.isFinite(openingUnitCost) || openingUnitCost < 0)) {
      setError('أدخل كمية افتتاحية وتكلفة وحدة صحيحتين وغير سالبتين');
      return;
    }
    if (!editingItem && openingQty > 0 && !itemOpeningWarehouseId) {
      setError('اختر المخزن لإضافة كمية افتتاحية');
      return;
    }

    const { error: saveError } = editingItem
      ? await supabase.from('items').update(payload).eq('id', editingItem.id)
      : await supabase.rpc('create_item_with_opening_stock', {
          p_name: payload.name,
          p_unit: payload.unit,
          p_sale_price: payload.sale_price,
          p_purchase_price: payload.purchase_price,
          p_is_active: payload.is_active,
          p_warehouse_id: itemOpeningWarehouseId || null,
          p_opening_qty: openingQty,
          p_unit_cost: openingUnitCost,
        });

    if (saveError) {
      setError(translateDbError(saveError.message));
      return;
    }

    const wasEditing = Boolean(editingItem);
    cancelItemEdit();
    setNotice(wasEditing ? 'تم تعديل الصنف' : 'تمت إضافة الصنف');
    setVersion((current) => current + 1);
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!warehouseName.trim()) return setError('أدخل اسم المخزن');
    const result = editingWarehouseId
      ? await supabase.from('warehouses').update({ name: warehouseName.trim() }).eq('id', editingWarehouseId)
      : await supabase.from('warehouses').insert({ company_id: companyId, name: warehouseName.trim() });
    if (result.error) return setError(translateDbError(result.error.message));
    setWarehouseName('');
    setEditingWarehouseId(null);
    setNotice(editingWarehouseId ? 'تم تعديل المخزن' : 'تمت إضافة المخزن');
    setVersion((current) => current + 1);
  }

  async function toggleWarehouse(warehouse: WarehouseRecord) {
    setError('');
    const { error: updateError } = await supabase.from('warehouses')
      .update({ is_active: !warehouse.is_active }).eq('id', warehouse.id);
    if (updateError) return setError(translateDbError(updateError.message));
    setNotice(warehouse.is_active ? 'تم إيقاف المخزن' : 'تم تفعيل المخزن');
    setVersion((current) => current + 1);
  }

  async function removeWarehouse(warehouse: WarehouseRecord) {
    if (warehouse.is_primary) return;
    if (!window.confirm(`حذف المخزن «${warehouse.name}» نهائيًا؟ لا يمكن الحذف إذا كان مرتبطًا بفواتير أو لديه رصيد مخزون.`)) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_warehouse', { p_warehouse_id: warehouse.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    if (editingWarehouseId === warehouse.id) {
      setEditingWarehouseId(null);
      setWarehouseName('');
    }
    setNotice(`تم حذف المخزن «${warehouse.name}»`);
    setVersion((current) => current + 1);
  }

  async function saveCashBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!cashBoxName.trim()) return setError('أدخل اسم الخزنة');
    const result = editingCashBoxId
      ? await supabase.from('cash_boxes').update({ name: cashBoxName.trim() }).eq('id', editingCashBoxId)
      : await supabase.from('cash_boxes').insert({ company_id: companyId, name: cashBoxName.trim() });
    if (result.error) return setError(translateDbError(result.error.message));
    setCashBoxName('');
    setEditingCashBoxId(null);
    setNotice(editingCashBoxId ? 'تم تعديل الخزنة' : 'تمت إضافة الخزنة');
    setVersion((current) => current + 1);
  }

  async function toggleCashBox(box: CashBoxRow) {
    setError('');
    const { error: updateError } = await supabase.from('cash_boxes')
      .update({ is_active: !box.is_active }).eq('id', box.id);
    if (updateError) return setError(translateDbError(updateError.message));
    setNotice(box.is_active ? 'تم إيقاف الخزنة' : 'تم تفعيل الخزنة');
    setVersion((current) => current + 1);
  }

  async function removeCashBox(box: CashBoxRow) {
    if (box.is_primary) return;
    if (!window.confirm(`حذف الخزنة «${box.name}» نهائيًا؟ لا يمكن الحذف إذا كانت مرتبطة بإيصالات أو لديها رصيد/تسويات افتتاحية.`)) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_cash_box', { p_cash_box_id: box.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    if (editingCashBoxId === box.id) {
      setEditingCashBoxId(null);
      setCashBoxName('');
    }
    setNotice(`تم حذف الخزنة «${box.name}»`);
    setVersion((current) => current + 1);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>البيانات</h1>
          <p className="muted">حسابات العملاء والموردين، والأصناف ومخزونها.</p>
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'accounts' ? 'tab active' : 'tab'}
          onClick={() => setTab('accounts')}
        >
          الحسابات
        </button>
        <button
          type="button"
          className={tab === 'items' ? 'tab active' : 'tab'}
          onClick={() => setTab('items')}
        >
          الأصناف
        </button>
        <button
          type="button"
          className={tab === 'opening' ? 'tab active' : 'tab'}
          onClick={() => setTab('opening')}
        >
          الأرصدة الافتتاحية
        </button>
        <button
          type="button"
          className={tab === 'warehouses' ? 'tab active' : 'tab'}
          onClick={() => setTab('warehouses')}
        >
          المخازن
        </button>
        <button
          type="button"
          className={tab === 'cashBoxes' ? 'tab active' : 'tab'}
          onClick={() => setTab('cashBoxes')}
        >
          الخزن
        </button>
      </div>

      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}

      {tab === 'accounts' && (
        <>
          <form className="card inline-form" onSubmit={saveAccount} ref={accountFormRef}>
            <div className="card-head">
              <h2>{editingAccount ? 'تعديل حساب' : 'إضافة حساب'}</h2>
              {editingAccount?.has_documents && <span className="badge">النوع مقفل</span>}
            </div>
            <div className="form-grid">
              <label>
                الاسم
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="اسم العميل أو المورد"
                  required
                />
              </label>

              <label>
                النوع
                <select
                  value={accountKind}
                  onChange={(e) => setAccountKind(e.target.value as AccountKind)}
                  disabled={Boolean(editingAccount?.has_documents)}
                >
                  <option value="customer">عميل</option>
                  <option value="supplier">مورد</option>
                </select>
              </label>

              <label>
                الهاتف
                <input
                  type="text"
                  value={accountPhone}
                  onChange={(e) => setAccountPhone(e.target.value)}
                  placeholder="اختياري"
                  dir="ltr"
                />
              </label>

              <label>
                الرصيد الافتتاحي
                <input
                  type="number"
                  step="0.0001"
                  value={accountOpeningBalance}
                  onChange={(e) => setAccountOpeningBalance(e.target.value)}
                  placeholder="0"
                />
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={accountActive}
                  onChange={(e) => setAccountActive(e.target.checked)}
                />
                نشط
              </label>
            </div>

            <p className="hint">
              {accountKind === 'customer'
                ? 'للعميل: الموجب يعني عليه، والسالب يعني له.'
                : 'للمورد: الموجب يعني له، والسالب يعني عليه.'}
              {editingAccount?.has_documents && ' تعديل هذا الرقم يسجل تصحيحًا جديدًا ويحافظ على الحركات السابقة.'}
            </p>

            {editingAccount?.has_documents && (
              <p className="hint">
                لا يمكن تغيير نوع الحساب لوجود فواتير أو إيصالات مرتبطة به.
              </p>
            )}

            <div className="actions">
              <button type="submit" className="btn primary" disabled={!companyId}>
                {editingAccount ? 'حفظ التعديلات' : 'إضافة'}
              </button>
              {editingAccount && (
                <button type="button" className="btn" onClick={cancelAccountEdit}>
                  إلغاء
                </button>
              )}
            </div>
          </form>

          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>الهاتف</th>
                    <th>الحالة</th>
                    <th>إجمالي الفواتير</th>
                    <th>المدفوع</th>
                    <th>الرصيد</th>
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

                  {!loading && visibleAccounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty">
                        لا توجد حسابات بعد.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    visibleAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.kind === 'customer' ? 'عميل' : account.kind === 'supplier' ? 'مورد' : 'هالك'}</td>
                        <td className="num muted">{account.phone ?? '—'}</td>
                        <td>
                          {account.is_active ? (
                            <span className="badge ok">نشط</span>
                          ) : (
                            <span className="badge">موقوف</span>
                          )}
                        </td>
                        <td className="num">{money(account.invoiced)}</td>
                        <td className="num">{money(account.paid)}</td>
                        <td className={Number(account.balance) > 0 ? 'num strong' : 'num'}>
                          {money(account.balance)}
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="link"
                            onClick={() => startAccountEdit(account)}
                            disabled={Boolean(account.system_key)}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="link danger"
                            onClick={() => removeAccount(account)}
                            disabled={Boolean(account.system_key)}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'items' && (
        <>
          <form className="card inline-form" onSubmit={saveItem} ref={itemFormRef}>
            <div className="card-head">
              <h2>{editingItem ? 'تعديل صنف' : 'إضافة صنف'}</h2>
            </div>
            <div className="form-grid">
              <label>
                الاسم
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="اسم الصنف"
                  required
                />
              </label>

              <label>
                الوحدة
                <input
                  type="text"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                  placeholder="قطعة / كجم / علبة"
                />
              </label>

              <label>
                سعر البيع
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label>
                سعر الشراء
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              {!editingItem && (
                <>
                  <label>
                    مخزن الرصيد الافتتاحي
                    <select
                      value={itemOpeningWarehouseId}
                      onChange={(e) => setItemOpeningWarehouseId(e.target.value)}
                    >
                      <option value="">بدون رصيد افتتاحي</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    الكمية الافتتاحية
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={itemOpeningQty}
                      onChange={(e) => setItemOpeningQty(e.target.value)}
                      disabled={!itemOpeningWarehouseId}
                    />
                  </label>

                  <label>
                    تكلفة الوحدة
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={itemOpeningUnitCost}
                      onChange={(e) => setItemOpeningUnitCost(e.target.value)}
                      disabled={!itemOpeningWarehouseId}
                    />
                  </label>
                </>
              )}

              <label className="check">
                <input
                  type="checkbox"
                  checked={itemActive}
                  onChange={(e) => setItemActive(e.target.checked)}
                />
                نشط
              </label>
            </div>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={!companyId}>
                {editingItem ? 'حفظ التعديلات' : 'إضافة'}
              </button>
              {editingItem && (
                <button type="button" className="btn" onClick={cancelItemEdit}>
                  إلغاء
                </button>
              )}
            </div>
          </form>

          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الوحدة</th>
                    <th>سعر البيع</th>
                    <th>سعر الشراء</th>
                    <th>الرصيد</th>
                    <th>الحالة</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={7} className="empty">
                        جارٍ التحميل…
                      </td>
                    </tr>
                  )}

                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty">
                        لا توجد أصناف بعد.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.unit}</td>
                        <td className="num">{money(item.sale_price)}</td>
                        <td className="num">{money(item.purchase_price)}</td>
                        <td className="num strong">
                          {formatQty(item.qty)} {item.unit}
                          <div className="stock-breakdown">
                            {(stockByItem.get(item.id) ?? []).map((stock) => (
                              <span className="chip" key={stock.warehouse_id}>
                                {stock.warehouse_name}: {formatQty(stock.current_qty)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {item.is_active ? (
                            <span className="badge ok">نشط</span>
                          ) : (
                            <span className="badge">موقوف</span>
                          )}
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="link"
                            onClick={() => startItemEdit(item)}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="link danger"
                            onClick={() => removeItem(item)}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'opening' && (
        <form className="stack" onSubmit={saveOpeningBalances}>
          <div className="card">
            <div className="card-head">
              <h2>أرصدة الخزن</h2>
            </div>
            <p className="hint">أدخل رصيد كل خزنة عند بداية العمل. التعديلات اللاحقة تُسجل كتصحيح محفوظ.</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>الخزنة</th><th>الرصيد الافتتاحي</th><th>الرصيد الحالي</th></tr>
                </thead>
                <tbody>
                  {cashBoxes.map((box) => (
                    <tr key={box.id}>
                      <td>{box.name}</td>
                      <td>
                        <input className="table-input num" type="number" step="0.0001"
                          value={cashOpeningValues[box.id] ?? '0'}
                          onChange={(e) => setCashOpeningValues((current) => ({ ...current, [box.id]: e.target.value }))} />
                      </td>
                      <td className="num">{money(box.balance)}</td>
                    </tr>
                  ))}
                  {!loading && cashBoxes.length === 0 && <tr><td colSpan={3} className="empty">لا توجد خزن.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>رصيد المخزون عند البداية</h2>
            </div>
            <p className="hint">أدخل كمية كل صنف وتكلفة وحدته في كل مخزن. عند وجود حركات لاحقة، يمكن تصحيح الكمية، بينما تُقفل تكلفة البداية لحماية أرباح الفواتير السابقة.</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>المخزن</th><th>الصنف</th><th>كمية البداية</th><th>تكلفة الوحدة</th><th>المتاح الآن</th></tr>
                </thead>
                <tbody>
                  {stockOpeningRows.map((row) => {
                    const key = `${row.warehouse_id}:${row.item_id}`;
                    const value = stockOpeningValues[key] ?? { qty: '0', cost: '0' };
                    return (
                      <tr key={key}>
                        <td>{row.warehouse_name}</td>
                        <td>{row.item_name}</td>
                        <td>
                          <input className="table-input num" type="number" min="0" step="0.0001"
                            value={value.qty}
                            onChange={(e) => setStockOpeningValues((current) => ({ ...current, [key]: { ...value, qty: e.target.value } }))} />
                        </td>
                        <td>
                          <input className="table-input num" type="number" min="0" step="0.0001"
                            value={value.cost} disabled={row.cost_locked}
                            onChange={(e) => setStockOpeningValues((current) => ({ ...current, [key]: { ...value, cost: e.target.value } }))} />
                        </td>
                        <td className="num">{formatQty(row.current_qty)} {row.unit}</td>
                      </tr>
                    );
                  })}
                  {!loading && stockOpeningRows.length === 0 && <tr><td colSpan={5} className="empty">أضف الأصناف والمخازن أولًا.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="actions">
            <button type="submit" className="btn primary" disabled={loading || !companyId}>حفظ الأرصدة</button>
          </div>
        </form>
      )}

      {tab === 'warehouses' && (
        <div className="stack">
          <p className="hint">إيقاف المخزن يخفيه من الاختيارات الجديدة، مع الاحتفاظ بكمياته وحركاته السابقة. لا يمكن إيقاف مخزن ما زال به رصيد.</p>
          <section className="card">
            <form className="inline-form" onSubmit={saveWarehouse}>
              <div className="card-head">
                <h2>{editingWarehouseId ? 'تعديل مخزن' : 'إضافة مخزن'}</h2>
              </div>
              <div className="form-grid">
                <label>
                  اسم المخزن
                  <input value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} required />
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={!companyId}>
                  {editingWarehouseId ? 'حفظ التعديلات' : 'إضافة المخزن'}
                </button>
                {editingWarehouseId && (
                  <button type="button" className="btn" onClick={() => { setEditingWarehouseId(null); setWarehouseName(''); }}>
                    إلغاء
                  </button>
                )}
              </div>
            </form>

            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>المخزن</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                  {warehouseRows.map((warehouse) => (
                    <tr key={warehouse.id}>
                      <td>{warehouse.name}{warehouse.is_primary && <span className="badge"> رئيسي</span>}</td>
                      <td>{warehouse.is_active ? <span className="badge ok">نشط</span> : <span className="badge">موقوف</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="link" onClick={() => { setEditingWarehouseId(warehouse.id); setWarehouseName(warehouse.name); }}>
                          تعديل الاسم
                        </button>
                        <button type="button" className="link" onClick={() => void toggleWarehouse(warehouse)}>
                          {warehouse.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                        {!warehouse.is_primary && <button type="button" className="link danger" onClick={() => void removeWarehouse(warehouse)}>حذف</button>}
                      </td>
                    </tr>
                  ))}
                  {!loading && warehouseRows.length === 0 && <tr><td colSpan={3} className="empty">لا توجد مخازن.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'cashBoxes' && (
        <div className="stack">
          <p className="hint">إيقاف الخزنة يخفيها من الاختيارات الجديدة، مع الاحتفاظ برصيدها وحركاتها السابقة.</p>
          <section className="card">
            <form className="inline-form" onSubmit={saveCashBox}>
              <div className="card-head">
                <h2>{editingCashBoxId ? 'تعديل خزنة' : 'إضافة خزنة'}</h2>
              </div>
              <div className="form-grid">
                <label>
                  اسم الخزنة
                  <input value={cashBoxName} onChange={(event) => setCashBoxName(event.target.value)} required />
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={!companyId}>
                  {editingCashBoxId ? 'حفظ التعديلات' : 'إضافة الخزنة'}
                </button>
                {editingCashBoxId && (
                  <button type="button" className="btn" onClick={() => { setEditingCashBoxId(null); setCashBoxName(''); }}>
                    إلغاء
                  </button>
                )}
              </div>
            </form>

            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الخزنة</th><th>الرصيد الحالي</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                  {cashBoxes.map((box) => (
                    <tr key={box.id}>
                      <td>{box.name}{box.is_primary && <span className="badge"> رئيسية</span>}</td>
                      <td className="num">{money(box.balance)}</td>
                      <td>{box.is_active ? <span className="badge ok">نشط</span> : <span className="badge">موقوف</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="link" onClick={() => { setEditingCashBoxId(box.id); setCashBoxName(box.name); }}>
                          تعديل الاسم
                        </button>
                        <button type="button" className="link" onClick={() => void toggleCashBox(box)}>
                          {box.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                        {!box.is_primary && <button type="button" className="link danger" onClick={() => void removeCashBox(box)}>حذف</button>}
                      </td>
                    </tr>
                  ))}
                  {!loading && cashBoxes.length === 0 && <tr><td colSpan={4} className="empty">لا توجد خزن.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

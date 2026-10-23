import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/company';
import { money } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import type { AccountKind, AccountRow, ItemRow, WarehouseOption } from '../lib/types';

type Tab = 'customers' | 'suppliers' | 'items';
interface WarehouseRecord extends WarehouseOption { is_active: boolean; notes: string | null }
interface CashBoxRecord { id: string; name: string; is_active: boolean; is_primary: boolean; notes: string | null }
interface MasterItemRecord extends Omit<ItemRow, 'qty'> { notes: string | null }
type LocationsTab = Tab | 'warehouses' | 'cashBoxes';
type FormModal = 'account' | 'item' | 'warehouse' | 'cashBox' | null;
interface ConfirmationRequest { title: string; message: string; confirmLabel: string; resolve: (confirmed: boolean) => void }

export default function MasterData() {
  const [tab, setTab] = useState<LocationsTab>('customers');
  const [companyId, setCompanyId] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRecord[]>([]);
  const [warehouseRows, setWarehouseRows] = useState<WarehouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [formModal, setFormModal] = useState<FormModal>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const visibleAccounts = accounts.filter((account) => account.system_key === null);
  const visibleAccountsByTab = visibleAccounts.filter((account) =>
    account.kind === (tab === 'customers' ? 'customer' : 'supplier'),
  );

  function askConfirmation(message: string, confirmLabel = 'حذف'): Promise<boolean> {
    return new Promise((resolve) => setConfirmation({ title: 'تأكيد العملية', message, confirmLabel, resolve }));
  }

  function finishConfirmation(confirmed: boolean) {
    const request = confirmation;
    setConfirmation(null);
    request?.resolve(confirmed);
  }

  // حقول حساب (إضافة أو تعديل)
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [accountOpeningBalance, setAccountOpeningBalance] = useState('0');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountNotes, setAccountNotes] = useState('');
  const [accountActive, setAccountActive] = useState(true);

  // حقول صنف (إضافة أو تعديل)
  const [editingItem, setEditingItem] = useState<MasterItemRecord | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('قطعة');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [itemActive, setItemActive] = useState(true);
  const [itemNotes, setItemNotes] = useState('');
  const [itemOpeningWarehouseId, setItemOpeningWarehouseId] = useState('');
  const [itemOpeningQty, setItemOpeningQty] = useState('0');
  const [itemOpeningCost, setItemOpeningCost] = useState('0');
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseNotes, setWarehouseNotes] = useState('');
  const [editingCashBoxId, setEditingCashBoxId] = useState<string | null>(null);
  const [cashBoxName, setCashBoxName] = useState('');
  const [cashBoxNotes, setCashBoxNotes] = useState('');
  const [cashBoxOpeningBalance, setCashBoxOpeningBalance] = useState('0');

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const company = await getCompanyId();

        const [accountsRes, itemsRes, warehousesRes, boxesRes] = await Promise.all([
          supabase.from('v_account_balances').select('*').order('name'),
          supabase.from('items').select('id, name, unit, sale_price, purchase_price, is_active, notes').order('name'),
          supabase.from('warehouses').select('id, name, notes, is_active, is_primary').order('name'),
          supabase.from('cash_boxes').select('id, name, notes, is_active, is_primary').order('name'),
        ]);

        if (!alive) return;

        const firstError =
          accountsRes.error ?? itemsRes.error ?? warehousesRes.error ?? boxesRes.error;
        if (firstError) {
          setError(translateDbError(firstError.message));
          return;
        }

        setCompanyId(company);
        setAccounts((accountsRes.data ?? []) as AccountRow[]);
        setItems((itemsRes.data ?? []) as MasterItemRecord[]);
        setCashBoxes((boxesRes.data ?? []) as CashBoxRecord[]);
        const loadedWarehouseRows = (warehousesRes.data ?? []) as WarehouseRecord[];
        setWarehouseRows(loadedWarehouseRows);
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
    setAccountOpeningBalance(String(Number(account.opening_balance)));
    setAccountPhone(account.phone ?? '');
    setAccountNotes(account.notes ?? '');
    setAccountActive(account.is_active);
    setError('');
    setFormModal('account');
  }

  function startAccountAdd(kind: AccountKind) {
    setEditingAccount(null);
    setAccountName('');
    setAccountKind(kind);
    setAccountOpeningBalance('0');
    setAccountPhone('');
    setAccountNotes('');
    setAccountActive(true);
    setError('');
    setFormModal('account');
  }

  function cancelAccountEdit() {
    setEditingAccount(null);
    setAccountName('');
    setAccountKind('customer');
    setAccountOpeningBalance('0');
    setAccountPhone('');
    setAccountNotes('');
    setAccountActive(true);
    setError('');
    setFormModal(null);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!accountName.trim()) {
      setError('أدخل اسم الحساب');
      return;
    }
    if (!Number.isFinite(Number(accountOpeningBalance))) {
      setError('أدخل رصيدًا افتتاحيًا صحيحًا');
      return;
    }

    const payload = {
      name: accountName.trim(),
      kind: accountKind,
      phone: accountPhone.trim() || null,
      is_active: accountActive,
    };

    const { error: saveError } = await supabase.rpc('save_account_with_notes', {
      p_account_id: editingAccount?.id ?? null,
      p_name: payload.name,
      p_kind: payload.kind,
      p_phone: payload.phone,
      p_is_active: payload.is_active,
      p_opening_balance: editingAccount?.opening_balance ?? Number(accountOpeningBalance),
      p_notes: accountNotes.trim() || null,
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

  function startItemEdit(item: MasterItemRecord) {
    setEditingItem(item);
    setItemName(item.name);
    setItemUnit(item.unit);
    setSalePrice(String(Number(item.sale_price)));
    setPurchasePrice(String(Number(item.purchase_price)));
    setItemActive(item.is_active);
    setItemNotes(item.notes ?? '');
    setError('');
    setFormModal('item');
  }

  function startItemAdd() {
    setEditingItem(null);
    setItemName('');
    setItemUnit('قطعة');
    setSalePrice('');
    setPurchasePrice('');
    setItemActive(true);
    setItemNotes('');
    const activeWarehouses = warehouseRows.filter((warehouse) => warehouse.is_active);
    setItemOpeningWarehouseId(activeWarehouses.find((warehouse) => warehouse.is_primary)?.id ?? activeWarehouses[0]?.id ?? '');
    setItemOpeningQty('0');
    setItemOpeningCost('0');
    setError('');
    setFormModal('item');
  }

  async function removeAccount(account: AccountRow) {
    if (account.system_key) return;
    const confirmed = await askConfirmation(
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

  async function removeItem(item: MasterItemRecord) {
    const confirmed = await askConfirmation(
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
    setItemNotes('');
    setItemOpeningWarehouseId('');
    setItemOpeningQty('0');
    setItemOpeningCost('0');
    setError('');
    setFormModal(null);
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
    const openingQty = Number(itemOpeningQty || 0);
    const openingCost = Number(itemOpeningCost || 0);

    if (!(sale >= 0) || !(purchase >= 0)) {
      setError('الأسعار يجب أن تكون أرقامًا موجبة');
      return;
    }
    if (!Number.isFinite(openingQty) || openingQty < 0 || !Number.isFinite(openingCost) || openingCost < 0) {
      setError('أدخل كمية وتكلفة افتتاحية صحيحتين وغير سالبتين');
      return;
    }
    if (openingQty > 0 && !itemOpeningWarehouseId) {
      setError('اختر المخزن لإضافة كمية افتتاحية');
      return;
    }

    const payload = {
      name: itemName.trim(),
      unit: itemUnit.trim() || 'قطعة',
      sale_price: sale,
      purchase_price: purchase,
      is_active: itemActive,
      notes: itemNotes.trim() || null,
    };

    const { error: saveError } = editingItem
      ? await supabase.from('items').update(payload).eq('id', editingItem.id)
      : await supabase.rpc('create_item_with_opening_stock_and_notes', {
          p_name: payload.name,
          p_unit: payload.unit,
          p_sale_price: payload.sale_price,
          p_purchase_price: payload.purchase_price,
          p_is_active: payload.is_active,
          p_warehouse_id: itemOpeningWarehouseId || null,
          p_opening_qty: openingQty,
          p_unit_cost: openingCost,
          p_notes: payload.notes,
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

  function startWarehouseForm(warehouse?: WarehouseRecord) {
    setEditingWarehouseId(warehouse?.id ?? null);
    setWarehouseName(warehouse?.name ?? '');
    setWarehouseNotes(warehouse?.notes ?? '');
    setError('');
    setFormModal('warehouse');
  }

  function closeWarehouseForm() {
    setEditingWarehouseId(null);
    setWarehouseName('');
    setWarehouseNotes('');
    setError('');
    setFormModal(null);
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!warehouseName.trim()) return setError('أدخل اسم المخزن');
    const payload = { name: warehouseName.trim(), notes: warehouseNotes.trim() || null };
    const result = editingWarehouseId
      ? await supabase.from('warehouses').update(payload).eq('id', editingWarehouseId)
      : await supabase.from('warehouses').insert({ company_id: companyId, ...payload });
    if (result.error) return setError(translateDbError(result.error.message));
    setWarehouseName('');
    setWarehouseNotes('');
    setEditingWarehouseId(null);
    setNotice(editingWarehouseId ? 'تم تعديل المخزن' : 'تمت إضافة المخزن');
    setFormModal(null);
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
    if (!(await askConfirmation(`حذف المخزن «${warehouse.name}» نهائيًا؟ لا يمكن الحذف إذا كان مرتبطًا بفواتير أو لديه رصيد مخزون.`))) return;
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
    const openingBalance = Number(cashBoxOpeningBalance);
    if (!Number.isFinite(openingBalance)) return setError('أدخل رصيدًا افتتاحيًا صحيحًا');
    const payload = { name: cashBoxName.trim(), notes: cashBoxNotes.trim() || null };
    const result = editingCashBoxId
      ? await supabase.from('cash_boxes').update(payload).eq('id', editingCashBoxId)
      : await supabase.rpc('create_cash_box_with_opening_balance_and_notes', {
          p_name: payload.name,
          p_opening_balance: openingBalance,
          p_notes: payload.notes,
        });
    if (result.error) return setError(translateDbError(result.error.message));
    setCashBoxName('');
    setCashBoxNotes('');
    setCashBoxOpeningBalance('0');
    setEditingCashBoxId(null);
    setNotice(editingCashBoxId ? 'تم تعديل الخزنة' : 'تمت إضافة الخزنة');
    setFormModal(null);
    setVersion((current) => current + 1);
  }

  function startCashBoxForm(box?: CashBoxRecord) {
    setEditingCashBoxId(box?.id ?? null);
    setCashBoxName(box?.name ?? '');
    setCashBoxNotes(box?.notes ?? '');
    setCashBoxOpeningBalance('0');
    setError('');
    setFormModal('cashBox');
  }

  function closeCashBoxForm() {
    setEditingCashBoxId(null);
    setCashBoxName('');
    setCashBoxNotes('');
    setCashBoxOpeningBalance('0');
    setError('');
    setFormModal(null);
  }

  async function toggleCashBox(box: CashBoxRecord) {
    setError('');
    const { error: updateError } = await supabase.from('cash_boxes')
      .update({ is_active: !box.is_active }).eq('id', box.id);
    if (updateError) return setError(translateDbError(updateError.message));
    setNotice(box.is_active ? 'تم إيقاف الخزنة' : 'تم تفعيل الخزنة');
    setVersion((current) => current + 1);
  }

  async function removeCashBox(box: CashBoxRecord) {
    if (box.is_primary) return;
    if (!(await askConfirmation(`حذف الخزنة «${box.name}» نهائيًا؟ لا يمكن الحذف إذا كانت مرتبطة بإيصالات أو لديها رصيد/تسويات افتتاحية.`))) return;
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
          <p className="muted">إدارة الحسابات والأصناف والمخازن والخزن.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => {
          if (tab === 'customers') startAccountAdd('customer');
          else if (tab === 'suppliers') startAccountAdd('supplier');
          else if (tab === 'items') startItemAdd();
          else if (tab === 'warehouses') startWarehouseForm();
          else startCashBoxForm();
        }}>
          + إضافة {tab === 'customers' ? 'عميل' : tab === 'suppliers' ? 'مورد' : tab === 'items' ? 'صنف' : tab === 'warehouses' ? 'مخزن' : 'خزنة'}
        </button>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'customers' ? 'tab active' : 'tab'}
          onClick={() => setTab('customers')}
        >
          العملاء
        </button>
        <button
          type="button"
          className={tab === 'suppliers' ? 'tab active' : 'tab'}
          onClick={() => setTab('suppliers')}
        >
          الموردون
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

      {(tab === 'customers' || tab === 'suppliers') && (
        <>
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>الهاتف</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} className="empty">
                        جارٍ التحميل…
                      </td>
                    </tr>
                  )}

                  {!loading && visibleAccountsByTab.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        {tab === 'customers' ? 'لا يوجد عملاء بعد.' : 'لا يوجد موردون بعد.'}
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    visibleAccountsByTab.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.kind === 'customer' ? 'عميل' : account.kind === 'supplier' ? 'مورد' : 'هالك'}</td>
                        <td className="num muted">{account.phone ?? '—'}</td>
                        <td>{account.notes || '—'}</td>
                        <td>
                          {account.is_active ? (
                            <span className="badge ok">نشط</span>
                          ) : (
                            <span className="badge">موقوف</span>
                          )}
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
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الوحدة</th>
                    <th>سعر البيع</th>
                    <th>سعر الشراء</th>
                    <th>ملاحظات</th>
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
                        <td>{item.notes || '—'}</td>
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

      {tab === 'warehouses' && (
        <div className="stack">
          <p className="hint">إيقاف المخزن يخفيه من الاختيارات الجديدة، مع الاحتفاظ بكمياته وحركاته السابقة. لا يمكن إيقاف مخزن ما زال به رصيد.</p>
          <section className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>المخزن</th><th>ملاحظات</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                  {warehouseRows.map((warehouse) => (
                    <tr key={warehouse.id}>
                      <td>{warehouse.name}{warehouse.is_primary && <span className="badge"> رئيسي</span>}</td>
                      <td>{warehouse.notes || '—'}</td>
                      <td>{warehouse.is_active ? <span className="badge ok">نشط</span> : <span className="badge">موقوف</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="link" onClick={() => startWarehouseForm(warehouse)}>
                          تعديل الاسم
                        </button>
                        <button type="button" className="link" onClick={() => void toggleWarehouse(warehouse)}>
                          {warehouse.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                        {!warehouse.is_primary && <button type="button" className="link danger" onClick={() => void removeWarehouse(warehouse)}>حذف</button>}
                      </td>
                    </tr>
                  ))}
                  {!loading && warehouseRows.length === 0 && <tr><td colSpan={4} className="empty">لا توجد مخازن.</td></tr>}
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
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الخزنة</th><th>ملاحظات</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                  {cashBoxes.map((box) => (
                    <tr key={box.id}>
                      <td>{box.name}{box.is_primary && <span className="badge"> رئيسية</span>}</td>
                      <td>{box.notes || '—'}</td>
                      <td>{box.is_active ? <span className="badge ok">نشط</span> : <span className="badge">موقوف</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="link" onClick={() => startCashBoxForm(box)}>
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

      {formModal === 'account' && (
        <Modal title={editingAccount ? 'تعديل حساب' : accountKind === 'customer' ? 'إضافة عميل' : 'إضافة مورد'} onClose={cancelAccountEdit}>
          <form className="stack" onSubmit={saveAccount}>
            {editingAccount?.has_documents && <span className="badge">نوع الحساب مقفل لوجود مستندات</span>}
            <div className="form-grid">
              <label>الاسم<input type="text" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder={accountKind === 'customer' ? 'اسم العميل' : 'اسم المورد'} required /></label>
              {editingAccount && <label>النوع<select value={accountKind} onChange={(event) => setAccountKind(event.target.value as AccountKind)} disabled={Boolean(editingAccount.has_documents)}><option value="customer">عميل</option><option value="supplier">مورد</option></select></label>}
              {!editingAccount && <label>الرصيد الافتتاحي<input type="number" step="0.0001" value={accountOpeningBalance} onChange={(event) => setAccountOpeningBalance(event.target.value)} /></label>}
              <label>الهاتف<input type="text" value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} placeholder="اختياري" dir="ltr" /></label>
              <label>ملاحظات<textarea value={accountNotes} onChange={(event) => setAccountNotes(event.target.value)} placeholder="اختياري" rows={3} /></label>
              <label className="check"><input type="checkbox" checked={accountActive} onChange={(event) => setAccountActive(event.target.checked)} />نشط</label>
            </div>
            {!editingAccount && <p className="hint">{accountKind === 'customer' ? 'للعميل: الموجب يعني عليه، والسالب يعني له.' : 'للمورد: الموجب يعني له، والسالب يعني عليه.'} يمكنك تعديل الرصيد لاحقًا من صفحة «إدارة».</p>}
            {editingAccount?.has_documents && <p className="hint">لا يمكن تغيير نوع الحساب لوجود فواتير أو إيصالات مرتبطة به. ويظل رصيده الافتتاحي محفوظًا.</p>}
            {error && <p className="alert error">{error}</p>}
            <div className="actions"><button type="submit" className="btn primary" disabled={!companyId}>{editingAccount ? 'حفظ التعديلات' : 'إضافة الحساب'}</button><button type="button" className="btn" onClick={cancelAccountEdit}>إلغاء</button></div>
          </form>
        </Modal>
      )}

      {formModal === 'item' && (
        <Modal title={editingItem ? 'تعديل صنف' : 'إضافة صنف'} onClose={cancelItemEdit}>
          <form className="stack" onSubmit={saveItem}>
            <div className="form-grid">
              <label>الاسم<input type="text" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="اسم الصنف" required /></label>
              <label>الوحدة<input type="text" value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} placeholder="قطعة / كجم / علبة" /></label>
              <label>سعر البيع<input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0.00" /></label>
              <label>سعر الشراء<input type="number" min="0" step="0.01" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0.00" /></label>
              {!editingItem && <>
                <label>مخزن الرصيد الافتتاحي<select value={itemOpeningWarehouseId} onChange={(event) => setItemOpeningWarehouseId(event.target.value)}><option value="">بدون رصيد افتتاحي</option>{warehouseRows.filter((warehouse) => warehouse.is_active).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
                <label>كمية البداية<input type="number" min="0" step="0.0001" value={itemOpeningQty} onChange={(event) => setItemOpeningQty(event.target.value)} disabled={!itemOpeningWarehouseId} /></label>
                <label>تكلفة الوحدة<input type="number" min="0" step="0.0001" value={itemOpeningCost} onChange={(event) => setItemOpeningCost(event.target.value)} disabled={!itemOpeningWarehouseId} /></label>
              </>}
              <label>ملاحظات<textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} rows={3} placeholder="اختياري" /></label>
              <label className="check"><input type="checkbox" checked={itemActive} onChange={(event) => setItemActive(event.target.checked)} />نشط</label>
            </div>
            {!editingItem && <p className="hint">أدخل بيانات المخزون الافتتاحي إن وجدت. يمكنك تعديلها لاحقًا من صفحة «إدارة».</p>}
            {error && <p className="alert error">{error}</p>}
            <div className="actions"><button type="submit" className="btn primary" disabled={!companyId}>{editingItem ? 'حفظ التعديلات' : 'إضافة الصنف'}</button><button type="button" className="btn" onClick={cancelItemEdit}>إلغاء</button></div>
          </form>
        </Modal>
      )}

      {formModal === 'warehouse' && (
        <Modal title={editingWarehouseId ? 'تعديل مخزن' : 'إضافة مخزن'} onClose={closeWarehouseForm}>
          <form className="stack" onSubmit={saveWarehouse}>
            <div className="form-grid">
              <label>اسم المخزن<input value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} required /></label>
              <label>ملاحظات<textarea value={warehouseNotes} onChange={(event) => setWarehouseNotes(event.target.value)} rows={3} placeholder="اختياري" /></label>
            </div>
            {error && <p className="alert error">{error}</p>}
            <div className="actions"><button type="submit" className="btn primary" disabled={!companyId}>{editingWarehouseId ? 'حفظ التعديلات' : 'إضافة المخزن'}</button><button type="button" className="btn" onClick={closeWarehouseForm}>إلغاء</button></div>
          </form>
        </Modal>
      )}

      {formModal === 'cashBox' && (
        <Modal title={editingCashBoxId ? 'تعديل خزنة' : 'إضافة خزنة'} onClose={closeCashBoxForm}>
          <form className="stack" onSubmit={saveCashBox}>
            <div className="form-grid">
              <label>اسم الخزنة<input value={cashBoxName} onChange={(event) => setCashBoxName(event.target.value)} required /></label>
              {!editingCashBoxId && <label>الرصيد الافتتاحي<input type="number" step="0.0001" value={cashBoxOpeningBalance} onChange={(event) => setCashBoxOpeningBalance(event.target.value)} /></label>}
              <label>ملاحظات<textarea value={cashBoxNotes} onChange={(event) => setCashBoxNotes(event.target.value)} rows={3} placeholder="اختياري" /></label>
            </div>
            {!editingCashBoxId && <p className="hint">أدخل المبلغ الموجود في الخزنة عند بداية استخدام البرنامج. يمكنك تعديل الرصيد لاحقًا من صفحة «إدارة».</p>}
            {error && <p className="alert error">{error}</p>}
            <div className="actions"><button type="submit" className="btn primary" disabled={!companyId}>{editingCashBoxId ? 'حفظ التعديلات' : 'إضافة الخزنة'}</button><button type="button" className="btn" onClick={closeCashBoxForm}>إلغاء</button></div>
          </form>
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          danger
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </div>
  );
}

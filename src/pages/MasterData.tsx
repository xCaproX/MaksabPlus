import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/company';
import { entityNumber, money } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import { toast } from '../components/Toast';
import type { AccountKind, AccountRow, ItemRow, WarehouseOption } from '../lib/types';
import { useAccess } from '../lib/access';

type Tab = 'customers' | 'suppliers' | 'items';
interface WarehouseRecord extends WarehouseOption { is_active: boolean; notes: string | null }
interface CashBoxRecord { id: string; serial_number: number; name: string; is_active: boolean; is_primary: boolean; notes: string | null }
interface MasterItemRecord extends Omit<ItemRow, 'qty'> { notes: string | null }
type LocationsTab = Tab | 'warehouses' | 'cashBoxes';
type FormModal = 'account' | 'item' | 'warehouse' | 'cashBox' | null;
interface ConfirmationRequest { title: string; message: string; confirmLabel: string; resolve: (confirmed: boolean) => void }

type MasterSort = 'name-asc' | 'serial-desc' | 'serial-asc' | 'price-desc' | 'price-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

const VALID_DATA_TABS: LocationsTab[] = ['customers', 'suppliers', 'items', 'warehouses', 'cashBoxes'];

export default function MasterData() {
  const { can } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as LocationsTab | null;
  const initialTab = (tabParam && VALID_DATA_TABS.includes(tabParam)) ? tabParam : 'customers';
  const [tab, setTab] = useState<LocationsTab>(initialTab);

  const [companyId, setCompanyId] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRecord[]>([]);
  const [warehouseRows, setWarehouseRows] = useState<WarehouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  function setError(msg: string) {
    if (msg) toast.error(msg);
  }
  function setNotice(msg: string) {
    if (msg) toast.success(msg);
  }
  const [version, setVersion] = useState(0);
  const [formModal, setFormModal] = useState<FormModal>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<MasterSort>('name-asc');
  const [page, setPage] = useState(1);

  // العناصر المحددة للوحة الجانبية
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedItem, setSelectedItem] = useState<MasterItemRecord | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseRecord | null>(null);
  const [selectedBox, setSelectedBox] = useState<CashBoxRecord | null>(null);

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
  const [itemCode, setItemCode] = useState('');
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
    const targetTab = (tabParam && VALID_DATA_TABS.includes(tabParam)) ? tabParam : 'customers';
    if (targetTab !== tab) {
      setTab(targetTab);
      setFormModal(null);
      setSelectedAccount(null);
      setSelectedItem(null);
      setSelectedWarehouse(null);
      setSelectedBox(null);
      setSearchTerm('');
      setStatusFilter('all');
      setPage(1);
    }
  }, [tabParam]);

  function switchTab(next: LocationsTab) {
    setTab(next);
    setSearchParams({ tab: next });
    setFormModal(null);
    setSelectedAccount(null);
    setSelectedItem(null);
    setSelectedWarehouse(null);
    setSelectedBox(null);
    setSearchTerm('');
    setStatusFilter('all');
    setPage(1);
  }

  function askConfirmation(message: string, confirmLabel = 'حذف'): Promise<boolean> {
    return new Promise((resolve) => setConfirmation({ title: 'تأكيد العملية', message, confirmLabel, resolve }));
  }

  function finishConfirmation(confirmed: boolean) {
    const request = confirmation;
    setConfirmation(null);
    request?.resolve(confirmed);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const id = await getCompanyId();
        if (!alive) return;
        setCompanyId(id);

        const [accountsRes, itemsRes, cashBoxesRes, warehousesRes] = await Promise.all([
          supabase.from('accounts').select('*').order('name'),
          supabase.from('items').select('*').order('name'),
          supabase.from('cash_boxes').select('*').order('name'),
          supabase.from('warehouses').select('*').order('name'),
        ]);

        if (!alive) return;

        const firstError = accountsRes.error ?? itemsRes.error ?? cashBoxesRes.error ?? warehousesRes.error;
        if (firstError) {
          setError(translateDbError(firstError.message));
          setLoading(false);
          return;
        }

        setAccounts((accountsRes.data ?? []) as AccountRow[]);
        setItems((itemsRes.data ?? []) as MasterItemRecord[]);
        setCashBoxes((cashBoxesRes.data ?? []) as CashBoxRecord[]);
        setWarehouseRows((warehousesRes.data ?? []) as WarehouseRecord[]);
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(errorMessage(err));
        setLoading(false);
      }
    }

    void load();
    return () => { alive = false; };
  }, [version]);

  const visibleAccounts = accounts.filter((account) => account.system_key === null);
  const customers = visibleAccounts.filter((account) => account.kind === 'customer');
  const suppliers = visibleAccounts.filter((account) => account.kind === 'supplier');

  // تصفية العملاء
  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const list = customers.filter((acc) => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? acc.is_active : !acc.is_active);
      const matchQuery = !query || [acc.name, acc.phone || '', String(acc.serial_number), acc.notes || '']
        .some((val) => val.toLocaleLowerCase('ar').includes(query));
      return matchStatus && matchQuery;
    });
    return list.sort((a, b) => {
      if (sortOrder === 'serial-desc') return (b.serial_number ?? 0) - (a.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (a.serial_number ?? 0) - (b.serial_number ?? 0);
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [customers, searchTerm, statusFilter, sortOrder]);

  // تصفية الموردين
  const filteredSuppliers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const list = suppliers.filter((acc) => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? acc.is_active : !acc.is_active);
      const matchQuery = !query || [acc.name, acc.phone || '', String(acc.serial_number), acc.notes || '']
        .some((val) => val.toLocaleLowerCase('ar').includes(query));
      return matchStatus && matchQuery;
    });
    return list.sort((a, b) => {
      if (sortOrder === 'serial-desc') return (b.serial_number ?? 0) - (a.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (a.serial_number ?? 0) - (b.serial_number ?? 0);
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [suppliers, searchTerm, statusFilter, sortOrder]);

  // تصفية الأصناف
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const list = items.filter((itm) => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? itm.is_active : !itm.is_active);
      const matchQuery = !query || [itm.name, itm.code, String(itm.serial_number), itm.notes || '']
        .some((val) => val.toLocaleLowerCase('ar').includes(query));
      return matchStatus && matchQuery;
    });
    return list.sort((a, b) => {
      if (sortOrder === 'price-desc') return Number(b.sale_price) - Number(a.sale_price);
      if (sortOrder === 'price-asc') return Number(a.sale_price) - Number(b.sale_price);
      if (sortOrder === 'serial-desc') return (b.serial_number ?? 0) - (a.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (a.serial_number ?? 0) - (b.serial_number ?? 0);
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [items, searchTerm, statusFilter, sortOrder]);

  // تصفية المخازن
  const filteredWarehouses = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const list = warehouseRows.filter((wh) => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? wh.is_active : !wh.is_active);
      const matchQuery = !query || [wh.name, String(wh.serial_number), wh.notes || '']
        .some((val) => val.toLocaleLowerCase('ar').includes(query));
      return matchStatus && matchQuery;
    });
    return list.sort((a, b) => {
      if (sortOrder === 'serial-desc') return (b.serial_number ?? 0) - (a.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (a.serial_number ?? 0) - (b.serial_number ?? 0);
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [warehouseRows, searchTerm, statusFilter, sortOrder]);

  // تصفية الخزن
  const filteredCashBoxes = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ar');
    const list = cashBoxes.filter((box) => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? box.is_active : !box.is_active);
      const matchQuery = !query || [box.name, String(box.serial_number), box.notes || '']
        .some((val) => val.toLocaleLowerCase('ar').includes(query));
      return matchStatus && matchQuery;
    });
    return list.sort((a, b) => {
      if (sortOrder === 'serial-desc') return (b.serial_number ?? 0) - (a.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (a.serial_number ?? 0) - (b.serial_number ?? 0);
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [cashBoxes, searchTerm, statusFilter, sortOrder]);

  const activeTotalCount =
    tab === 'customers' ? filteredCustomers.length :
    tab === 'suppliers' ? filteredSuppliers.length :
    tab === 'items' ? filteredItems.length :
    tab === 'warehouses' ? filteredWarehouses.length : filteredCashBoxes.length;

  const pageCount = Math.max(1, Math.ceil(activeTotalCount / PAGE_SIZE));

  const pageCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageSuppliers = filteredSuppliers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageWarehouses = filteredWarehouses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, sortOrder, tab]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function startAccountAdd(kind: AccountKind) {
    setEditingAccount(null);
    setAccountName('');
    setAccountKind(kind);
    setAccountOpeningBalance('0');
    setAccountPhone('');
    setAccountNotes('');
    setAccountActive(true);
    setFormModal('account');
  }

  function startAccountEdit(account: AccountRow) {
    setEditingAccount(account);
    setAccountName(account.name);
    setAccountKind(account.kind as AccountKind);
    setAccountOpeningBalance('0');
    setAccountPhone(account.phone ?? '');
    setAccountNotes(account.notes || '');
    setAccountActive(account.is_active);
    setFormModal('account');
  }

  function cancelAccountEdit() {
    setEditingAccount(null);
    setFormModal(null);
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (editingAccount) {
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          name: accountName.trim(),
          phone: accountPhone.trim() || null,
          notes: accountNotes.trim() || null,
          is_active: accountActive,
        })
        .eq('id', editingAccount.id);

      if (updateError) return setError(translateDbError(updateError.message));
      setNotice(`تم تعديل الحساب «${accountName.trim()}»`);
    } else {
      const { error: rpcError } = await supabase.rpc('save_account_with_notes', {
        p_account_id: null,
        p_name: accountName.trim(),
        p_kind: accountKind,
        p_phone: accountPhone.trim() || null,
        p_is_active: accountActive,
        p_opening_balance: Number(accountOpeningBalance) || 0,
        p_notes: accountNotes.trim() || null,
      });

      if (rpcError) return setError(translateDbError(rpcError.message));
      setNotice(`تمت إضافة ${accountKind === 'customer' ? 'العميل' : 'المورد'} «${accountName.trim()}»`);
    }

    cancelAccountEdit();
    setSelectedAccount(null);
    setVersion((v) => v + 1);
  }

  async function removeAccount(account: AccountRow) {
    const isCustomer = account.kind === 'customer';
    if (!(await askConfirmation(`حذف ${isCustomer ? 'العميل' : 'المورد'} «${account.name}»؟ لن يُحذف إذا كانت له حركات سابقة.`))) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_account', { p_account_id: account.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    setNotice(`تم حذف ${isCustomer ? 'العميل' : 'المورد'} «${account.name}»`);
    setSelectedAccount(null);
    setVersion((v) => v + 1);
  }

  function startItemAdd() {
    setEditingItem(null);
    setItemName('');
    setItemCode('');
    setItemUnit('قطعة');
    setSalePrice('');
    setPurchasePrice('');
    setItemActive(true);
    setItemNotes('');
    setItemOpeningWarehouseId(warehouseRows[0]?.id || '');
    setItemOpeningQty('0');
    setItemOpeningCost('0');
    setFormModal('item');
  }

  function startItemEdit(item: MasterItemRecord) {
    setEditingItem(item);
    setItemName(item.name);
    setItemCode(item.code);
    setItemUnit(item.unit);
    setSalePrice(String(item.sale_price));
    setPurchasePrice(String(item.purchase_price));
    setItemActive(item.is_active);
    setItemNotes(item.notes || '');
    setFormModal('item');
  }

  function cancelItemEdit() {
    setEditingItem(null);
    setFormModal(null);
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (editingItem) {
      const { error: updateError } = await supabase
        .from('items')
        .update({
          name: itemName.trim(),
          code: itemCode.trim() || null,
          unit: itemUnit.trim() || 'قطعة',
          sale_price: Number(salePrice),
          purchase_price: Number(purchasePrice),
          is_active: itemActive,
          notes: itemNotes.trim() || null,
        })
        .eq('id', editingItem.id);

      if (updateError) return setError(translateDbError(updateError.message));
      setNotice(`تم تعديل الصنف «${itemName.trim()}»`);
    } else {
      const { error: rpcError } = await supabase.rpc('create_item_with_opening_stock_and_notes_and_code', {
        p_name: itemName.trim(),
        p_unit: itemUnit.trim() || 'قطعة',
        p_sale_price: Number(salePrice),
        p_purchase_price: Number(purchasePrice),
        p_is_active: itemActive,
        p_warehouse_id: itemOpeningWarehouseId || null,
        p_opening_qty: Number(itemOpeningQty) || 0,
        p_unit_cost: Number(itemOpeningCost) || 0,
        p_notes: itemNotes.trim() || null,
        p_code: itemCode.trim() || null,
      });

      if (rpcError) return setError(translateDbError(rpcError.message));
      setNotice(`تمت إضافة الصنف «${itemName.trim()}»`);
    }

    cancelItemEdit();
    setSelectedItem(null);
    setVersion((v) => v + 1);
  }

  async function removeItem(item: MasterItemRecord) {
    if (!(await askConfirmation(`حذف الصنف «${item.name}»؟ لن يُحذف إذا كانت له حركات أو رصيد.`))) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_item', { p_item_id: item.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    setNotice(`تم حذف الصنف «${item.name}»`);
    setSelectedItem(null);
    setVersion((v) => v + 1);
  }

  function startWarehouseForm(warehouse?: WarehouseRecord) {
    setEditingWarehouseId(warehouse?.id || null);
    setWarehouseName(warehouse?.name || '');
    setWarehouseNotes(warehouse?.notes || '');
    setFormModal('warehouse');
  }

  async function saveWarehouse(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (editingWarehouseId) {
      const { error: updateError } = await supabase
        .from('warehouses')
        .update({ name: warehouseName.trim(), notes: warehouseNotes.trim() || null })
        .eq('id', editingWarehouseId);
      if (updateError) return setError(translateDbError(updateError.message));
      setNotice(`تم تعديل اسم المخزن إلى «${warehouseName.trim()}»`);
    } else {
      const { error: insertError } = await supabase.from('warehouses').insert({
        company_id: companyId,
        name: warehouseName.trim(),
        notes: warehouseNotes.trim() || null,
      });
      if (insertError) return setError(translateDbError(insertError.message));
      setNotice(`تمت إضافة المخزن «${warehouseName.trim()}»`);
    }
    setFormModal(null);
    setSelectedWarehouse(null);
    setVersion((v) => v + 1);
  }

  async function toggleWarehouse(warehouse: WarehouseRecord) {
    setError('');
    const { error: updateError } = await supabase
      .from('warehouses')
      .update({ is_active: !warehouse.is_active })
      .eq('id', warehouse.id);
    if (updateError) return setError(translateDbError(updateError.message));
    setNotice(`تم ${warehouse.is_active ? 'إيقاف' : 'تفعيل'} المخزن «${warehouse.name}»`);
    setVersion((v) => v + 1);
  }

  async function removeWarehouse(warehouse: WarehouseRecord) {
    if (!(await askConfirmation(`حذف المخزن «${warehouse.name}»؟ لا يمكن حذفه إذا كان يحتوي على حركات سابقة.`))) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_warehouse', { p_warehouse_id: warehouse.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    setNotice(`تم حذف المخزن «${warehouse.name}»`);
    setSelectedWarehouse(null);
    setVersion((v) => v + 1);
  }

  function startCashBoxForm(box?: CashBoxRecord) {
    setEditingCashBoxId(box?.id || null);
    setCashBoxName(box?.name || '');
    setCashBoxNotes(box?.notes || '');
    setCashBoxOpeningBalance('0');
    setFormModal('cashBox');
  }

  async function saveCashBox(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (editingCashBoxId) {
      const { error: updateError } = await supabase
        .from('cash_boxes')
        .update({ name: cashBoxName.trim(), notes: cashBoxNotes.trim() || null })
        .eq('id', editingCashBoxId);
      if (updateError) return setError(translateDbError(updateError.message));
      setNotice(`تم تعديل اسم الخزنة إلى «${cashBoxName.trim()}»`);
    } else {
      const { error: rpcError } = await supabase.rpc('create_cash_box_with_opening_balance_and_notes', {
        p_name: cashBoxName.trim(),
        p_opening_balance: Number(cashBoxOpeningBalance) || 0,
        p_notes: cashBoxNotes.trim() || null,
      });
      if (rpcError) return setError(translateDbError(rpcError.message));
      setNotice(`تمت إضافة الخزنة «${cashBoxName.trim()}»`);
    }
    setFormModal(null);
    setSelectedBox(null);
    setVersion((v) => v + 1);
  }

  async function toggleCashBox(box: CashBoxRecord) {
    setError('');
    const { error: updateError } = await supabase
      .from('cash_boxes')
      .update({ is_active: !box.is_active })
      .eq('id', box.id);
    if (updateError) return setError(translateDbError(updateError.message));
    setNotice(`تم ${box.is_active ? 'إيقاف' : 'تفعيل'} الخزنة «${box.name}»`);
    setVersion((v) => v + 1);
  }

  async function removeCashBox(box: CashBoxRecord) {
    if (!(await askConfirmation(`حذف الخزنة «${box.name}»؟ لا يمكن حذفها إذا كانت تحتوي على حركات سابقة.`))) return;
    setError('');
    const { error: deleteError } = await supabase.rpc('delete_cash_box', { p_cash_box_id: box.id });
    if (deleteError) return setError(translateDbError(deleteError.message));
    setNotice(`تم حذف الخزنة «${box.name}»`);
    setSelectedBox(null);
    setVersion((v) => v + 1);
  }

  const tabTitle =
    tab === 'customers' ? 'العملاء' :
    tab === 'suppliers' ? 'الموردون' :
    tab === 'items' ? 'الأصناف' :
    tab === 'warehouses' ? 'المخازن' : 'الخزن';

  const newBtnLabel =
    tab === 'customers' ? '+ إضافة عميل' :
    tab === 'suppliers' ? '+ إضافة مورد' :
    tab === 'items' ? '+ إضافة صنف' :
    tab === 'warehouses' ? '+ إضافة مخزن' : '+ إضافة خزنة';

  const hasSelection = selectedAccount || selectedItem || selectedWarehouse || selectedBox;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{tabTitle}</h1>
          <p className="muted">إدارة الحسابات والأصناف والمخازن والخزن وتعديل بياناتها الأساسية.</p>
        </div>
        {can(`data.${tab}.create`) && (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (tab === 'customers') startAccountAdd('customer');
              else if (tab === 'suppliers') startAccountAdd('supplier');
              else if (tab === 'items') startItemAdd();
              else if (tab === 'warehouses') startWarehouseForm();
              else startCashBoxForm();
            }}
          >
            {newBtnLabel}
          </button>
        )}
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'customers' ? 'tab active' : 'tab'} onClick={() => switchTab('customers')}>العملاء</button>
        <button type="button" className={tab === 'suppliers' ? 'tab active' : 'tab'} onClick={() => switchTab('suppliers')}>الموردون</button>
        <button type="button" className={tab === 'items' ? 'tab active' : 'tab'} onClick={() => switchTab('items')}>الأصناف</button>
        <button type="button" className={tab === 'warehouses' ? 'tab active' : 'tab'} onClick={() => switchTab('warehouses')}>المخازن</button>
        <button type="button" className={tab === 'cashBoxes' ? 'tab active' : 'tab'} onClick={() => switchTab('cashBoxes')}>الخزن</button>
      </div>

      {/* الـ ERP Workspace لقسم البيانات الأساسية */}
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
                  placeholder={
                    tab === 'customers' ? 'بحث باسم العميل أو الهاتف أو الرقم…' :
                    tab === 'suppliers' ? 'بحث باسم المورد أو الهاتف أو الرقم…' :
                    tab === 'items' ? 'بحث باسم الصنف أو الكود أو الرقم…' :
                    tab === 'warehouses' ? 'بحث باسم المخزن أو الرقم…' : 'بحث باسم الخزنة أو الرقم…'
                  }
                />
              </label>

              <SearchableSelect
                ariaLabel="ترتيب النتائج"
                value={sortOrder}
                options={[
                  { value: 'name-asc', label: 'الاسم (أ – ي)' },
                  { value: 'serial-desc', label: 'الرقم التسلسلي (الأحدث)' },
                  { value: 'serial-asc', label: 'الرقم التسلسلي (الأقدم)' },
                  ...(tab === 'items'
                    ? [
                        { value: 'price-desc', label: 'الأعلى سعر بيع' },
                        { value: 'price-asc', label: 'الأقل سعر بيع' },
                      ]
                    : []),
                ]}
                onChange={(val) => setSortOrder(val as MasterSort)}
              />

              <SearchableSelect
                ariaLabel="تصفية الحالة"
                value={statusFilter}
                options={[
                  { value: 'all', label: 'كل الحالات' },
                  { value: 'active', label: 'النشطة فقط' },
                  { value: 'inactive', label: 'الموقوفة فقط' },
                ]}
                onChange={(val) => setStatusFilter(val as StatusFilter)}
              />
            </div>
          </div>

          <div className="erp-table-wrap">
            {tab === 'customers' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الاسم</th>
                    <th>الهاتف</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageCustomers.length === 0 && <tr><td colSpan={6} className="empty">لا يوجد عملاء يطابقون البحث.</td></tr>}
                  {!loading && pageCustomers.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    return (
                      <tr
                        key={account.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAccount(account); }
                        }}
                      >
                        <td className="num strong">{entityNumber('CUS', account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num muted">{account.phone ?? '—'}</td>
                        <td className="muted">{account.notes || '—'}</td>
                        <td>
                          {account.is_active ? <span className="status-badge paid">نشط</span> : <span className="status-badge unpaid">موقوف</span>}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {can('data.edit') && <button type="button" className="link" onClick={() => startAccountEdit(account)}>تعديل</button>}
                          {can('data.delete') && <button type="button" className="link danger" onClick={() => removeAccount(account)}>حذف</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'suppliers' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الاسم</th>
                    <th>الهاتف</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageSuppliers.length === 0 && <tr><td colSpan={6} className="empty">لا يوجد موردون يطابقون البحث.</td></tr>}
                  {!loading && pageSuppliers.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    return (
                      <tr
                        key={account.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedAccount(account)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAccount(account); }
                        }}
                      >
                        <td className="num strong">{entityNumber('SUP', account.serial_number)}</td>
                        <td className="strong">{account.name}</td>
                        <td className="num muted">{account.phone ?? '—'}</td>
                        <td className="muted">{account.notes || '—'}</td>
                        <td>
                          {account.is_active ? <span className="status-badge paid">نشط</span> : <span className="status-badge unpaid">موقوف</span>}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {can('data.edit') && <button type="button" className="link" onClick={() => startAccountEdit(account)}>تعديل</button>}
                          {can('data.delete') && <button type="button" className="link danger" onClick={() => removeAccount(account)}>حذف</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'items' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>الوحدة</th>
                    <th className="num">سعر البيع</th>
                    <th className="num">سعر الشراء</th>
                    <th>الحالة</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageItems.length === 0 && <tr><td colSpan={8} className="empty">لا توجد أصناف تطابق البحث.</td></tr>}
                  {!loading && pageItems.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItem(item); }
                        }}
                      >
                        <td className="num strong">{entityNumber('ITM', item.serial_number)}</td>
                        <td className="num">{item.code}</td>
                        <td className="strong">{item.name}</td>
                        <td>{item.unit}</td>
                        <td className="num strong">{money(item.sale_price)}</td>
                        <td className="num">{money(item.purchase_price)}</td>
                        <td>
                          {item.is_active ? <span className="status-badge paid">نشط</span> : <span className="status-badge unpaid">موقوف</span>}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {can('data.edit') && <button type="button" className="link" onClick={() => startItemEdit(item)}>تعديل</button>}
                          {can('data.delete') && <button type="button" className="link danger" onClick={() => removeItem(item)}>حذف</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'warehouses' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>المخزن</th>
                    <th>النوع</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageWarehouses.length === 0 && <tr><td colSpan={6} className="empty">لا توجد مخازن تطابق البحث.</td></tr>}
                  {!loading && pageWarehouses.map((warehouse) => {
                    const isSelected = selectedWarehouse?.id === warehouse.id;
                    return (
                      <tr
                        key={warehouse.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedWarehouse(warehouse)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedWarehouse(warehouse); }
                        }}
                      >
                        <td className="num strong">{entityNumber('WH', warehouse.serial_number)}</td>
                        <td className="strong">{warehouse.name}</td>
                        <td>{warehouse.is_primary ? <span className="badge">رئيسي</span> : <span className="muted">فرعي</span>}</td>
                        <td className="muted">{warehouse.notes || '—'}</td>
                        <td>
                          {warehouse.is_active ? <span className="status-badge paid">نشط</span> : <span className="status-badge unpaid">موقوف</span>}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {can('data.edit') && <button type="button" className="link" onClick={() => startWarehouseForm(warehouse)}>تعديل</button>}
                          {can('data.delete') && !warehouse.is_primary && <button type="button" className="link danger" onClick={() => void removeWarehouse(warehouse)}>حذف</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === 'cashBoxes' && (
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الخزنة</th>
                    <th>النوع</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th aria-label="الإجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="empty">جارٍ التحميل…</td></tr>}
                  {!loading && pageBoxes.length === 0 && <tr><td colSpan={6} className="empty">لا توجد خزن تطابق البحث.</td></tr>}
                  {!loading && pageBoxes.map((box) => {
                    const isSelected = selectedBox?.id === box.id;
                    return (
                      <tr
                        key={box.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedBox(box)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBox(box); }
                        }}
                      >
                        <td className="num strong">{entityNumber('CBX', box.serial_number)}</td>
                        <td className="strong">{box.name}</td>
                        <td>{box.is_primary ? <span className="badge">رئيسية</span> : <span className="muted">فرعية</span>}</td>
                        <td className="muted">{box.notes || '—'}</td>
                        <td>
                          {box.is_active ? <span className="status-badge paid">نشطة</span> : <span className="status-badge unpaid">موقوفة</span>}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {can('data.edit') && <button type="button" className="link" onClick={() => startCashBoxForm(box)}>تعديل</button>}
                          {can('data.delete') && !box.is_primary && <button type="button" className="link danger" onClick={() => void removeCashBox(box)}>حذف</button>}
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
        <aside className={hasSelection ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل السجل">
          {selectedAccount ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>{selectedAccount.kind === 'customer' ? 'بيانات عميل' : 'بيانات مورد'}</span>
                  <h2>{selectedAccount.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedAccount(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم</dt><dd className="num">{entityNumber(selectedAccount.kind === 'customer' ? 'CUS' : 'SUP', selectedAccount.serial_number)}</dd></div>
                <div><dt>الهاتف</dt><dd className="num">{selectedAccount.phone || '—'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedAccount.is_active ? 'نشط' : 'موقوف'}</dd></div>
              </dl>

              {selectedAccount.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedAccount.notes}</p>}

              <div className="erp-detail-actions">
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => startAccountEdit(selectedAccount)}>
                    تعديل البيانات
                  </button>
                )}
                {can('data.delete') && (
                  <button type="button" className="btn danger" onClick={() => removeAccount(selectedAccount)}>
                    حذف
                  </button>
                )}
              </div>
            </>
          ) : selectedItem ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الصنف</span>
                  <h2>{selectedItem.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedItem(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم</dt><dd className="num">{entityNumber('ITM', selectedItem.serial_number)}</dd></div>
                <div><dt>كود الصنف</dt><dd className="num">{selectedItem.code}</dd></div>
                <div><dt>الوحدة</dt><dd>{selectedItem.unit}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedItem.is_active ? 'نشط' : 'موقوف'}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>سعر البيع</span><strong className="num">{money(selectedItem.sale_price)}</strong>
                <span>سعر الشراء</span><strong className="num">{money(selectedItem.purchase_price)}</strong>
              </div>

              {selectedItem.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedItem.notes}</p>}

              <div className="erp-detail-actions">
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => startItemEdit(selectedItem)}>
                    تعديل الصنف
                  </button>
                )}
                {can('data.delete') && (
                  <button type="button" className="btn danger" onClick={() => removeItem(selectedItem)}>
                    حذف الصنف
                  </button>
                )}
              </div>
            </>
          ) : selectedWarehouse ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات المخزن</span>
                  <h2>{selectedWarehouse.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedWarehouse(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم</dt><dd className="num">{entityNumber('WH', selectedWarehouse.serial_number)}</dd></div>
                <div><dt>النوع</dt><dd>{selectedWarehouse.is_primary ? 'مخزن رئيسي' : 'مخزن فرعي'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedWarehouse.is_active ? 'نشط' : 'موقوف'}</dd></div>
              </dl>

              {selectedWarehouse.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedWarehouse.notes}</p>}

              <div className="erp-detail-actions">
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => startWarehouseForm(selectedWarehouse)}>
                    تعديل المخزن
                  </button>
                )}
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => void toggleWarehouse(selectedWarehouse)}>
                    {selectedWarehouse.is_active ? 'إيقاف المخزن' : 'تفعيل المخزن'}
                  </button>
                )}
                {can('data.delete') && !selectedWarehouse.is_primary && (
                  <button type="button" className="btn danger" onClick={() => void removeWarehouse(selectedWarehouse)}>
                    حذف المخزن
                  </button>
                )}
              </div>
            </>
          ) : selectedBox ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الخزنة</span>
                  <h2>{selectedBox.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedBox(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>الرقم</dt><dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd></div>
                <div><dt>النوع</dt><dd>{selectedBox.is_primary ? 'خزنة رئيسية' : 'خزنة فرعية'}</dd></div>
                <div><dt>الحالة</dt><dd>{selectedBox.is_active ? 'نشطة' : 'موقوفة'}</dd></div>
              </dl>

              {selectedBox.notes && <p className="erp-detail-notes"><span>ملاحظات</span>{selectedBox.notes}</p>}

              <div className="erp-detail-actions">
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => startCashBoxForm(selectedBox)}>
                    تعديل الخزنة
                  </button>
                )}
                {can('data.edit') && (
                  <button type="button" className="btn" onClick={() => void toggleCashBox(selectedBox)}>
                    {selectedBox.is_active ? 'إيقاف الخزنة' : 'تفعيل الخزنة'}
                  </button>
                )}
                {can('data.delete') && !selectedBox.is_primary && (
                  <button type="button" className="btn danger" onClick={() => void removeCashBox(selectedBox)}>
                    حذف الخزنة
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر عنصرًا</strong>
              <span>ستظهر تفاصيل الصنف أو الحساب أو المخزن هنا مع خيارات التعديل السريع.</span>
            </div>
          )}
        </aside>
      </div>

      {/* نوافذ الإضافة والتعديل */}
      {formModal === 'account' && (
        <Modal title={editingAccount ? 'تعديل حساب' : accountKind === 'customer' ? 'إضافة عميل' : 'إضافة مورد'} className="master-data-modal" backdropClassName="master-data-backdrop" onClose={cancelAccountEdit}>
          <form className="stack" onSubmit={saveAccount}>
            <div className="form-grid">
              <label>
                الاسم
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                />
              </label>

              <label>
                الهاتف
                <input
                  type="text"
                  value={accountPhone}
                  onChange={(e) => setAccountPhone(e.target.value)}
                  placeholder="اختياري"
                />
              </label>

              {!editingAccount && (
                <label>
                  الرصيد الافتتاحي
                  <input
                    type="number"
                    step="0.0001"
                    value={accountOpeningBalance}
                    onChange={(e) => setAccountOpeningBalance(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              )}

              <label className="span-2">
                ملاحظات
                <input
                  type="text"
                  value={accountNotes}
                  onChange={(e) => setAccountNotes(e.target.value)}
                  placeholder="اختياري"
                />
              </label>

              {editingAccount && (
                <label className="checkbox span-2">
                  <input
                    type="checkbox"
                    checked={accountActive}
                    onChange={(e) => setAccountActive(e.target.checked)}
                  />
                  حساب نشط (يمكن استخدامه في الفواتير والإيصالات)
                </label>
              )}
            </div>

            {!editingAccount && (
              <p className="hint">
                {accountKind === 'customer'
                  ? 'للعميل: المبلغ الموجب يعني رصيد مستحق عليه، والسالب يعني رصيد لصالحه.'
                  : 'للمورد: المبلغ الموجب يعني رصيد مستحق له، والسالب يعني رصيد لصالحك عنده.'}
              </p>
            )}

            <div className="actions">
              <button type="submit" className="btn primary">
                {editingAccount ? 'حفظ التعديلات' : 'إضافة'}
              </button>
              <button type="button" className="btn" onClick={cancelAccountEdit}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {formModal === 'item' && (
        <Modal title={editingItem ? 'تعديل صنف' : 'إضافة صنف'} className="master-data-modal" backdropClassName="master-data-backdrop" onClose={cancelItemEdit}>
          <form className="stack" onSubmit={saveItem}>
            <div className="form-grid">
              <label>
                اسم الصنف
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
              </label>

              <label>
                كود الصنف (الباركود)
                <input
                  type="text"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  placeholder="اختياري — يتولد تلقائيًا إذا تُرِك فارغًا"
                />
              </label>

              <label>
                الوحدة
                <input
                  type="text"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                  placeholder="قطعة، كرتونة، كجم…"
                  required
                />
              </label>

              <label>
                سعر البيع الافتراضي
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                سعر الشراء الافتراضي
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>

              <label className="span-2">
                ملاحظات الصنف
                <input
                  type="text"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="اختياري"
                />
              </label>

              {!editingItem && (
                <>
                  <label>
                    المخزن لرصيد أول المدة
                    <SearchableSelect
                      value={itemOpeningWarehouseId}
                      options={[
                        { value: '', label: 'لا يوجد رصيد أول مدة' },
                        ...warehouseRows.filter((w) => w.is_active).map((w) => ({
                          value: w.id,
                          label: w.name,
                        })),
                      ]}
                      onChange={setItemOpeningWarehouseId}
                      placeholder="اختر المخزن لرصيد أول المدة…"
                      searchPlaceholder="اكتب للبحث عن مخزن…"
                      emptyMessage="لا توجد مخازن نشطة"
                    />
                  </label>

                  {itemOpeningWarehouseId && (
                    <>
                      <label>
                        الكمية الافتتاحية
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={itemOpeningQty}
                          onChange={(e) => setItemOpeningQty(e.target.value)}
                        />
                      </label>
                      <label>
                        تكلفة الوحدة الافتتاحية
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={itemOpeningCost}
                          onChange={(e) => setItemOpeningCost(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </>
              )}

              {editingItem && (
                <label className="checkbox span-2">
                  <input
                    type="checkbox"
                    checked={itemActive}
                    onChange={(e) => setItemActive(e.target.checked)}
                  />
                  صنف نشط (يظهر في فواتير البيع والشراء)
                </label>
              )}
            </div>

            <div className="actions">
              <button type="submit" className="btn primary">
                {editingItem ? 'حفظ التعديلات' : 'إضافة'}
              </button>
              <button type="button" className="btn" onClick={cancelItemEdit}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {formModal === 'warehouse' && (
        <Modal title={editingWarehouseId ? 'تعديل مخزن' : 'إضافة مخزن'} className="master-data-modal" backdropClassName="master-data-backdrop" onClose={() => setFormModal(null)}>
          <form className="stack" onSubmit={saveWarehouse}>
            <label>
              اسم المخزن
              <input
                type="text"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                required
              />
            </label>
            <label>
              ملاحظات المخزن
              <input
                type="text"
                value={warehouseNotes}
                onChange={(e) => setWarehouseNotes(e.target.value)}
                placeholder="العنوان أو وصف المخزن"
              />
            </label>
            <div className="actions">
              <button type="submit" className="btn primary">
                {editingWarehouseId ? 'حفظ التعديلات' : 'إضافة مخزن'}
              </button>
              <button type="button" className="btn" onClick={() => setFormModal(null)}>إلغاء</button>
            </div>
          </form>
        </Modal>
      )}

      {formModal === 'cashBox' && (
        <Modal title={editingCashBoxId ? 'تعديل خزنة' : 'إضافة خزنة'} className="master-data-modal" backdropClassName="master-data-backdrop" onClose={() => setFormModal(null)}>
          <form className="stack" onSubmit={saveCashBox}>
            <label>
              اسم الخزنة
              <input
                type="text"
                value={cashBoxName}
                onChange={(e) => setCashBoxName(e.target.value)}
                required
              />
            </label>
            <label>
              ملاحظات الخزنة
              <input
                type="text"
                value={cashBoxNotes}
                onChange={(e) => setCashBoxNotes(e.target.value)}
                placeholder="وصف الخزنة ومكانها"
              />
            </label>
            {!editingCashBoxId && (
              <label>
                الرصيد الافتتاحي
                <input
                  type="number"
                  step="0.0001"
                  value={cashBoxOpeningBalance}
                  onChange={(e) => setCashBoxOpeningBalance(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            )}
            <div className="actions">
              <button type="submit" className="btn primary">
                {editingCashBoxId ? 'حفظ التعديلات' : 'إضافة خزنة'}
              </button>
              <button type="button" className="btn" onClick={() => setFormModal(null)}>إلغاء</button>
            </div>
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

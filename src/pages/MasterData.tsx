import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/company';
import { money, qty as formatQty } from '../lib/format';
import { errorMessage, translateDbError } from '../lib/errors';
import type { AccountKind, AccountRow, CashBoxRow, ItemRow } from '../lib/types';

type Tab = 'accounts' | 'items';

export default function MasterData() {
  const [tab, setTab] = useState<Tab>('accounts');
  const [companyId, setCompanyId] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [warehouseNames, setWarehouseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  // حقول حساب (إضافة أو تعديل)
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('customer');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountActive, setAccountActive] = useState(true);

  // حقول صنف (إضافة أو تعديل)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('قطعة');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [itemActive, setItemActive] = useState(true);

  const accountFormRef = useRef<HTMLFormElement>(null);
  const itemFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const company = await getCompanyId();

        const [accountsRes, itemsRes, boxesRes, warehousesRes] = await Promise.all([
          supabase.from('v_account_balances').select('*').order('name'),
          supabase.from('v_item_stock').select('*').order('name'),
          supabase.from('v_cash_box_balances').select('*').order('name'),
          supabase.from('warehouses').select('name').eq('is_active', true).order('name'),
        ]);

        if (!alive) return;

        const firstError =
          accountsRes.error ?? itemsRes.error ?? boxesRes.error ?? warehousesRes.error;
        if (firstError) {
          setError(translateDbError(firstError.message));
          return;
        }

        setCompanyId(company);
        setAccounts((accountsRes.data ?? []) as AccountRow[]);
        setItems((itemsRes.data ?? []) as ItemRow[]);
        setCashBoxes((boxesRes.data ?? []) as CashBoxRow[]);
        setWarehouseNames(((warehousesRes.data ?? []) as { name: string }[]).map((w) => w.name));
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
    setError('');
    accountFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelAccountEdit() {
    setEditingAccount(null);
    setAccountName('');
    setAccountKind('customer');
    setAccountPhone('');
    setAccountActive(true);
    setError('');
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!accountName.trim()) {
      setError('أدخل اسم الحساب');
      return;
    }

    const payload = {
      name: accountName.trim(),
      kind: accountKind,
      phone: accountPhone.trim() || null,
      is_active: accountActive,
    };

    const { error: saveError } = editingAccount
      ? await supabase.from('accounts').update(payload).eq('id', editingAccount.id)
      : await supabase.from('accounts').insert({ company_id: companyId, ...payload });

    if (saveError) {
      setError(translateDbError(saveError.message));
      return;
    }

    const wasEditing = Boolean(editingAccount);
    cancelAccountEdit();
    setNotice(wasEditing ? 'تم تعديل الحساب' : 'تمت إضافة الحساب');
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

    const { error: saveError } = editingItem
      ? await supabase.from('items').update(payload).eq('id', editingItem.id)
      : await supabase.from('items').insert({ company_id: companyId, ...payload });

    if (saveError) {
      setError(translateDbError(saveError.message));
      return;
    }

    const wasEditing = Boolean(editingItem);
    cancelItemEdit();
    setNotice(wasEditing ? 'تم تعديل الصنف' : 'تمت إضافة الصنف');
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

      <div className="chips">
        {warehouseNames.map((name) => (
          <span className="chip" key={name}>
            مخزن: {name}
          </span>
        ))}
        {cashBoxes.map((box) => (
          <span className="chip" key={box.id}>
            خزنة: {box.name} — {money(box.balance)}
          </span>
        ))}
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

              <label className="check">
                <input
                  type="checkbox"
                  checked={accountActive}
                  onChange={(e) => setAccountActive(e.target.checked)}
                />
                نشط
              </label>
            </div>

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

                  {!loading && accounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty">
                        لا توجد حسابات بعد.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    accounts.map((account) => (
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
    </div>
  );
}

import Pagination from '../../components/Pagination';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  X,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { buildPostgrestOrFilter } from '../../lib/search';
import { entityNumber, money } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import StatusBadge from '../../components/StatusBadge';
import { toast } from '../../components/Toast';
import type { ItemRow, WarehouseOption } from '../../lib/types';
import { useAccess } from '../../lib/access';
import { useConfirmDialog } from '../../lib/useConfirmDialog';
import { useMasterData } from '../../context/MasterDataContext';

interface MasterItemRecord extends Omit<ItemRow, 'qty'> {
  notes: string | null;
}

interface MasterItemsSummary {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  avgPrice: number;
}

type ItemSort =
  | 'name-asc'
  | 'name-desc'
  | 'serial-desc'
  | 'serial-asc'
  | 'price-desc'
  | 'price-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

interface ItemsTabProps {
  addTrigger: number;
}

export default function ItemsTab({ addTrigger }: ItemsTabProps) {
  const { can } = useAccess();
  const { refresh } = useMasterData();
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();

  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<ItemSort>('name-asc');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [summary, setSummary] = useState<MasterItemsSummary>({
    totalCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    avgPrice: 0,
  });

  // تأخير البحث لمنع إرسال طلبات متعددة مع كل حرف (Debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // التحديد والتفاصيل
  const [selectedItem, setSelectedItem] = useState<MasterItemRecord | null>(null);

  // المودال والإدخال
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const startAdd = useCallback(() => {
    setEditingItem(null);
    setItemName('');
    setItemCode('');
    setItemUnit('قطعة');
    setSalePrice('');
    setPurchasePrice('');
    setItemActive(true);
    setItemNotes('');
    setItemOpeningWarehouseId(warehouses.filter((w) => w.is_active)[0]?.id || '');
    setItemOpeningQty('0');
    setItemOpeningCost('0');
    setIsModalOpen(true);
  }, [warehouses]);

  // استجابة لزر الإضافة من الرأس
  useEffect(() => {
    if (addTrigger > 0) {
      startAdd();
    }
  }, [addTrigger, startAdd]);

  // جلب المخازن لمرة واحدة (لمودال إضافة الصنف الجديد برصيد أول المدة)
  useEffect(() => {
    let alive = true;
    async function loadWarehouses() {
      const { data } = await supabase.from('warehouses').select('*').order('name');
      if (alive && data) setWarehouses(data as WarehouseOption[]);
    }
    void loadWarehouses();
    return () => {
      alive = false;
    };
  }, []);

  // جلب الأصناف بالصفحات مع المؤشرات من السيرفر مباشرة
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = page * PAGE_SIZE - 1;
      const trimmed = debouncedSearch.trim();

      try {
        let query = supabase
          .from('items')
          .select('*', { count: 'exact' });

        if (statusFilter === 'active') {
          query = query.eq('is_active', true);
        } else if (statusFilter === 'inactive') {
          query = query.eq('is_active', false);
        }

        if (trimmed) {
          query = query.or(
            buildPostgrestOrFilter(['name', 'code', 'serial_number', 'notes'], trimmed),
          );
        }

        if (sortOrder === 'price-desc') {
          query = query.order('sale_price', { ascending: false });
        } else if (sortOrder === 'price-asc') {
          query = query.order('sale_price', { ascending: true });
        } else if (sortOrder === 'serial-desc') {
          query = query.order('serial_number', { ascending: false });
        } else if (sortOrder === 'serial-asc') {
          query = query.order('serial_number', { ascending: true });
        } else if (sortOrder === 'name-desc') {
          query = query.order('name', { ascending: false });
        } else {
          query = query.order('name', { ascending: true });
        }

        query = query.range(from, to);

        const [dataRes, kpiRes] = await Promise.all([
          query,
          supabase.rpc('get_master_items_kpis', {
            p_search: trimmed || null,
            p_status: statusFilter,
          }),
        ]);

        if (!alive) return;
        if (dataRes.error) throw dataRes.error;

        setItems((dataRes.data ?? []) as MasterItemRecord[]);
        setTotalCount(dataRes.count ?? 0);

        if (kpiRes.data) {
          const raw = kpiRes.data as {
            total_count?: number;
            active_count?: number;
            inactive_count?: number;
            avg_price?: number;
          };
          setSummary({
            totalCount: Number(raw.total_count ?? 0),
            activeCount: Number(raw.active_count ?? 0),
            inactiveCount: Number(raw.inactive_count ?? 0),
            avgPrice: Number(raw.avg_price ?? 0),
          });
        }
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        toast.error(errorMessage(err));
        setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [page, debouncedSearch, statusFilter, sortOrder, version]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    return [
      {
        id: 'data-items-total',
        label: 'إجمالي الأصناف',
        value: summary.totalCount,
        unit: 'صنف',
        variant: 'primary',
        icon: Boxes,
      },
      {
        id: 'data-items-active',
        label: 'الأصناف النشطة للبيع',
        value: summary.activeCount,
        unit: 'صنف',
        variant: 'success',
        icon: CheckCircle2,
      },
      {
        id: 'data-items-inactive',
        label: 'الأصناف المعطلة',
        value: summary.inactiveCount,
        unit: 'صنف',
        variant: summary.inactiveCount > 0 ? 'warning' : 'neutral',
        icon: AlertTriangle,
      },
      {
        id: 'data-items-avg-price',
        label: 'متوسط سعر البيع',
        value: money(summary.avgPrice),
        unit: 'ج.م',
        variant: 'info',
        icon: DollarSign,
      },
    ];
  }, [summary]);



  function startEdit(item: MasterItemRecord) {
    setEditingItem(item);
    setItemName(item.name);
    setItemCode(item.code);
    setItemUnit(item.unit);
    setSalePrice(String(item.sale_price));
    setPurchasePrice(String(item.purchase_price));
    setItemActive(item.is_active);
    setItemNotes(item.notes || '');
    setIsModalOpen(true);
  }

  function cancelEdit() {
    setEditingItem(null);
    setIsModalOpen(false);
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();

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

      if (updateError) {
        toast.error(translateDbError(updateError.message));
        return;
      }
      toast.success(`تم تعديل الصنف «${itemName.trim()}»`);
    } else {
      const { error: rpcError } = await supabase.rpc(
        'create_item_with_opening_stock_and_notes_and_code',
        {
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
        },
      );

      if (rpcError) {
        toast.error(translateDbError(rpcError.message));
        return;
      }
      toast.success(`تمت إضافة الصنف «${itemName.trim()}»`);
    }

    cancelEdit();
    setSelectedItem(null);
    setVersion((v) => v + 1);
    void refresh(['items', 'stock']);
  }

  async function removeItem(item: MasterItemRecord) {
    if (
      !(await askConfirmation(
        `حذف الصنف «${item.name}»؟ لن يُحذف إذا كانت له حركات أو رصيد.`,
        'حذف',
      ))
    )
      return;

    const { error: deleteError } = await supabase.rpc('delete_item', { p_item_id: item.id });
    if (deleteError) {
      toast.error(translateDbError(deleteError.message));
      return;
    }

    toast.success(`تم حذف الصنف «${item.name}»`);
    setSelectedItem(null);
    setVersion((v) => v + 1);
    void refresh(['items', 'stock']);
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات الأصناف" />

      <div className={selectedItem ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة الأصناف">
          <div className="erp-toolbar">
            <div className="erp-filters">
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

              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="بحث باسم الصنف أو الكود أو الرقم…"
                />
              </label>
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="table erp-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="الرقم"
                    field="serial"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ItemSort)}
                  />
                  <th className="col-hide-on-detail">الكود</th>
                  <SortableHeader
                    label="الاسم"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ItemSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">الوحدة</th>
                  <SortableHeader
                    label="سعر البيع"
                    field="price"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ItemSort)}
                    align="end"
                    className="num"
                  />
                  <th className="num col-hide-on-detail">سعر الشراء</th>
                  <th>الحالة</th>
                  <th aria-label="الإجراءات" />
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
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty">
                      لا توجد أصناف تطابق البحث.
                    </td>
                  </tr>
                )}
                {!loading &&
                  items.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedItem(item);
                          }
                        }}
                      >
                        <td className="num strong">{entityNumber('ITM', item.serial_number)}</td>
                        <td className="num col-hide-on-detail">{item.code}</td>
                        <td className="strong">{item.name}</td>
                        <td className="col-hide-on-detail">{item.unit}</td>
                        <td className="num strong">{money(item.sale_price)}</td>
                        <td className="num col-hide-on-detail">{money(item.purchase_price)}</td>
                        <td>
                          <StatusBadge variant={item.is_active ? 'paid' : 'unpaid'}>
                            {item.is_active ? 'نشط' : 'موقوف'}
                          </StatusBadge>
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={can('data.items.edit') ? () => startEdit(item) : undefined}
                            onDelete={can('data.items.delete') ? () => void removeItem(item) : undefined}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            loading={loading}
          />
        </section>

        {/* لوحة التفاصيل الجانبية */}
        <aside className={selectedItem ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل السجل">
          {selectedItem ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الصنف</span>
                  <h2>{selectedItem.name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedItem(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>الرقم</dt>
                  <dd className="num">{entityNumber('ITM', selectedItem.serial_number)}</dd>
                </div>
                <div>
                  <dt>كود الصنف</dt>
                  <dd className="num">{selectedItem.code}</dd>
                </div>
                <div>
                  <dt>الوحدة</dt>
                  <dd>{selectedItem.unit}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedItem.is_active ? 'نشط' : 'موقوف'}</dd>
                </div>
              </dl>

              <div className="erp-detail-totals">
                <span>سعر البيع</span>
                <strong className="num">{money(selectedItem.sale_price)}</strong>
                <span>سعر الشراء</span>
                <strong className="num">{money(selectedItem.purchase_price)}</strong>
              </div>

              {selectedItem.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedItem.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                {can('data.items.edit') && (
                  <button type="button" className="btn" onClick={() => startEdit(selectedItem)}>
                    تعديل الصنف
                  </button>
                )}
                {can('data.items.delete') && (
                  <button type="button" className="btn danger" onClick={() => void removeItem(selectedItem)}>
                    حذف الصنف
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر صنفًا</strong>
              <span>ستظهر تفاصيل الصنف هنا مع خيارات التعديل السريع.</span>
            </div>
          )}
        </aside>
      </div>

      {/* مودال الإضافة والتعديل */}
      {isModalOpen && (
        <Modal
          title={editingItem ? 'تعديل صنف' : 'إضافة صنف'}
          className="master-data-modal"
          backdropClassName="master-data-backdrop"
          onClose={cancelEdit}
        >
          <form className="stack" onSubmit={saveItem}>
            <div className="account-header-card">
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
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    dir="ltr"
                    className="num no-spinner"
                    value={salePrice}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>

                <label>
                  سعر الشراء الافتراضي
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    dir="ltr"
                    className="num no-spinner"
                    value={purchasePrice}
                    onFocus={(e) => e.target.select()}
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
                          ...warehouses
                            .filter((w) => w.is_active)
                            .map((w) => ({
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
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            dir="ltr"
                            className="num no-spinner"
                            value={itemOpeningQty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setItemOpeningQty(e.target.value)}
                          />
                        </label>
                        <label>
                          تكلفة الوحدة الافتتاحية
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            dir="ltr"
                            className="num no-spinner"
                            value={itemOpeningCost}
                            onFocus={(e) => e.target.select()}
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
            </div>

            <div className="form-modal-actions">
              <button type="submit" className="btn primary">
                {editingItem ? 'حفظ التعديلات' : 'إضافة صنف'}
              </button>
              <button type="button" className="btn" onClick={cancelEdit}>
                إلغاء
              </button>
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
    </>
  );
}

import { loadAllWarehouses } from '../../lib/masterDataQueries';
import ColumnFilterRow from '../../components/ColumnFilterRow';
import { useColumnFilters } from '../../lib/useColumnFilters';
import { matchesColumnFilters } from '../../lib/columnFilters';
import Pagination from '../../components/Pagination';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Warehouse, CheckCircle2 } from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchableSelect from '../../components/SearchableSelect';
import EmptyState from '../../components/EmptyState';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import StatusBadge from '../../components/StatusBadge';
import { toast } from '../../components/Toast';
import type { WarehouseOption } from '../../lib/types';
import { useAccess } from '../../lib/access';
import { useConfirmDialog } from '../../lib/useConfirmDialog';
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';

interface WarehouseRecord extends WarehouseOption {
  is_active: boolean;
  notes: string | null;
}

type WarehouseSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

export default function WarehousesTab() {
  const { can } = useAccess();
  const { refresh } = useMasterData();
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();

  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<WarehouseSort>('name-asc');
  const [page, setPage] = useState(1);
  const columns = useColumnFilters("warehouses", () => {
    setSearchTerm(''); setStatusFilter('all'); setPage(1);
  });

  // التحديد والتفاصيل
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseRecord | null>(null);

  // المودال والإدخال
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseNotes, setWarehouseNotes] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  // استجابة لفتح نموذج الإضافة عبر الرابط ?action=new
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      startAdd();
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // جلب المخازن
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const rows = await loadAllWarehouses<WarehouseRecord>();
        if (!alive) return;
        setWarehouses(rows);
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
  }, [version]);

  // تصفية وترتيب المخازن
  const filteredWarehouses = useMemo(() => {
    const list = warehouses.filter((warehouse) => {
      const matchStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? warehouse.is_active : !warehouse.is_active);
      const matchQuery = matchesSearchQuery(
        [warehouse.name, warehouse.serial_number, warehouse.notes],
        searchTerm,
      );
      return matchStatus && matchQuery && matchesColumnFilters(warehouse, 'warehouses', columns.filters);
    });

    return list.sort((firstWarehouse, secondWarehouse) => {
      if (sortOrder === 'serial-desc') return (secondWarehouse.serial_number ?? 0) - (firstWarehouse.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstWarehouse.serial_number ?? 0) - (secondWarehouse.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondWarehouse.name.localeCompare(firstWarehouse.name, 'ar');
      return firstWarehouse.name.localeCompare(secondWarehouse.name, 'ar');
    });
  }, [columns.filters, warehouses, searchTerm, statusFilter, sortOrder]);

  const totalCount = filteredWarehouses.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedWarehouses = filteredWarehouses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [columns.filters, searchTerm, statusFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const activeCount = filteredWarehouses.filter((w) => w.is_active).length;
    return [
      {
        id: 'data-wh-total',
        label: 'إجمالي المخازن',
        value: filteredWarehouses.length,
        unit: 'مخزن',
        variant: 'primary',
        icon: Warehouse,
      },
      {
        id: 'data-wh-active',
        label: 'المخازن النشطة',
        value: activeCount,
        unit: 'مخزن',
        variant: 'success',
        icon: CheckCircle2,
      },
    ];
  }, [filteredWarehouses]);

  function startAdd() {
    setEditingWarehouseId(null);
    setWarehouseName('');
    setWarehouseNotes('');
    setIsModalOpen(true);
  }

  function startEdit(warehouse: WarehouseRecord) {
    setEditingWarehouseId(warehouse.id);
    setWarehouseName(warehouse.name);
    setWarehouseNotes(warehouse.notes || '');
    setIsModalOpen(true);
  }

  function cancelEdit() {
    setEditingWarehouseId(null);
    setIsModalOpen(false);
  }

  async function saveWarehouse(event: FormEvent) {
    event.preventDefault();

    if (editingWarehouseId) {
      const { error: updateError } = await supabase.rpc('update_warehouse', {
        p_warehouse_id: editingWarehouseId,
        p_name: warehouseName.trim(),
        p_notes: warehouseNotes.trim() || null,
      });
      if (updateError) {
        toast.error(translateDbError(updateError.message));
        return;
      }
      toast.success(`تم تعديل اسم المخزن إلى «${warehouseName.trim()}»`);
    } else {
      const { error: insertError } = await supabase.rpc('create_warehouse', {
        p_name: warehouseName.trim(),
        p_notes: warehouseNotes.trim() || null,
      });
      if (insertError) {
        toast.error(translateDbError(insertError.message));
        return;
      }
      toast.success(`تمت إضافة المخزن «${warehouseName.trim()}»`);
    }

    cancelEdit();
    setSelectedWarehouse(null);
    setVersion((v) => v + 1);
    void refresh(['warehouses', 'stock']);
  }

  async function toggleWarehouse(warehouse: WarehouseRecord) {
    const { error: updateError } = await supabase.rpc('toggle_warehouse_active', {
      p_warehouse_id: warehouse.id,
    });
    if (updateError) {
      toast.error(translateDbError(updateError.message));
      return;
    }
    toast.success(`تم ${warehouse.is_active ? 'إيقاف' : 'تفعيل'} المخزن «${warehouse.name}»`);
    setVersion((v) => v + 1);
    void refresh(['warehouses', 'stock']);
  }

  async function removeWarehouse(warehouse: WarehouseRecord) {
    if (
      !(await askConfirmation(
        `حذف المخزن «${warehouse.name}»؟ لا يمكن حذفه إذا كان يحتوي على حركات سابقة.`,
        'حذف',
        { danger: true },
      ))
    )
      return;

    const { error: deleteError } = await supabase.rpc('delete_warehouse', {
      p_warehouse_id: warehouse.id,
    });
    if (deleteError) {
      toast.error(translateDbError(deleteError.message));
      return;
    }

    toast.success(`تم حذف المخزن «${warehouse.name}»`);
    setSelectedWarehouse(null);
    setVersion((v) => v + 1);
    void refresh(['warehouses', 'stock']);
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات المخازن" />

      <div className={selectedWarehouse ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة المخازن">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <SearchableSelect
                label="الحالة"
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
                <span className="filter-label">بحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="بحث باسم المخزن أو الرقم…"
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
                    onSort={(s) => setSortOrder(s as WarehouseSort)}
                  />
                  <SortableHeader
                    label="المخزن"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as WarehouseSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">النوع</th>
                  <th className="col-hide-on-detail col-notes">ملاحظات</th>
                  <th>الحالة</th>
                  <th aria-label="الإجراءات" />
                </tr>
                <ColumnFilterRow scope="warehouses" values={columns.values} onChange={columns.setField} onReset={columns.reset} />
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="empty">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && pagedWarehouses.length === 0 && (
                  <EmptyState
                    colSpan={6}
                    compact
                    title="لا توجد مخازن تطابق البحث أو الفلاتر"
                    description="جرّب تعديل كلمات البحث."
                  />
                )}
                {!loading &&
                  pagedWarehouses.map((warehouse) => {
                    const isSelected = selectedWarehouse?.id === warehouse.id;
                    return (
                      <tr
                        key={warehouse.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedWarehouse(warehouse)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedWarehouse(warehouse);
                          }
                        }}
                      >
                        <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber('WH', warehouse.serial_number)}</bdi></td>
                        <td className="strong">{warehouse.name}</td>
                        <td className="col-hide-on-detail">
                          {warehouse.is_primary ? (
                            <span className="badge">رئيسي</span>
                          ) : (
                            <span className="muted">فرعي</span>
                          )}
                        </td>
                        <td className="muted col-hide-on-detail col-notes">{warehouse.notes || '—'}</td>
                        <td>
                          <StatusBadge variant={warehouse.is_active ? 'paid' : 'unpaid'}>
                            {warehouse.is_active ? 'نشط' : 'موقوف'}
                          </StatusBadge>
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={can('data.warehouses.edit') ? () => startEdit(warehouse) : undefined}
                            onDelete={
                              can('data.warehouses.delete') && !warehouse.is_primary
                                ? () => void removeWarehouse(warehouse)
                                : undefined
                            }
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
        <aside
          className={selectedWarehouse ? 'erp-detail-panel open' : 'erp-detail-panel'}
          aria-label="تفاصيل السجل"
        >
          {selectedWarehouse ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات المخزن</span>
                  <h2>{selectedWarehouse.name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedWarehouse(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>الرقم</dt>
                  <dd className="num">{entityNumber('WH', selectedWarehouse.serial_number)}</dd>
                </div>
                <div>
                  <dt>النوع</dt>
                  <dd>{selectedWarehouse.is_primary ? 'مخزن رئيسي' : 'مخزن فرعي'}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedWarehouse.is_active ? 'نشط' : 'موقوف'}</dd>
                </div>
              </dl>

              {selectedWarehouse.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedWarehouse.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                {can('data.warehouses.edit') && (
                  <button type="button" className="btn" onClick={() => startEdit(selectedWarehouse)}>
                    تعديل المخزن
                  </button>
                )}
                {can('data.warehouses.edit') && (
                  <button type="button" className="btn" onClick={() => void toggleWarehouse(selectedWarehouse)}>
                    {selectedWarehouse.is_active ? 'إيقاف المخزن' : 'تفعيل المخزن'}
                  </button>
                )}
                {can('data.warehouses.delete') && !selectedWarehouse.is_primary && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => void removeWarehouse(selectedWarehouse)}
                  >
                    حذف المخزن
                  </button>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              icon={Warehouse}
              title="اختر مخزنًا"
              description="ستظهر تفاصيل المخزن هنا مع خيارات التعديل السريع."
            />
          )}
        </aside>
      </div>

      {/* مودال الإضافة والتعديل */}
      {isModalOpen && (
        <Modal
          title={editingWarehouseId ? 'تعديل مخزن' : 'إضافة مخزن'}
          className="master-data-modal"
          backdropClassName="master-data-backdrop"
          onClose={cancelEdit}
        >
          <form className="stack" onSubmit={saveWarehouse}>
            <div className="account-header-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            </div>
            <div className="form-modal-actions">
              <button type="submit" className="btn primary">
                {editingWarehouseId ? 'حفظ التعديلات' : 'إضافة مخزن'}
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
          danger={confirmation.danger === true}
          onConfirm={() => finishConfirmation(true)}
          onCancel={() => finishConfirmation(false)}
        />
      )}
    </>
  );
}

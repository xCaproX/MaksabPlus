import Pagination from '../../components/Pagination';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X, Save, Landmark, CheckCircle2, Wallet } from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import { supabase } from '../../lib/supabase';
import { entityNumber } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchableSelect from '../../components/SearchableSelect';
import SortableHeader from '../../components/SortableHeader';
import RowActions from '../../components/RowActions';
import StatusBadge from '../../components/StatusBadge';
import { toast } from '../../components/Toast';
import { useAccess } from '../../lib/access';
import { useConfirmDialog } from '../../lib/useConfirmDialog';
import { matchesSearchQuery } from '../../lib/search';
import { useMasterData } from '../../context/MasterDataContext';

interface CashBoxRecord {
  id: string;
  serial_number: number;
  name: string;
  is_active: boolean;
  is_primary: boolean;
  notes: string | null;
}

type CashBoxSort = 'name-asc' | 'name-desc' | 'serial-desc' | 'serial-asc';
type StatusFilter = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 20;

interface CashBoxesTabProps {
  addTrigger: number;
}

export default function CashBoxesTab({ addTrigger }: CashBoxesTabProps) {
  const { can } = useAccess();
  const { refresh } = useMasterData();
  const { confirmation, askConfirmation, finishConfirmation } = useConfirmDialog();

  const [cashBoxes, setCashBoxes] = useState<CashBoxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<CashBoxSort>('name-asc');
  const [page, setPage] = useState(1);

  // التحديد والتفاصيل
  const [selectedBox, setSelectedBox] = useState<CashBoxRecord | null>(null);

  // المودال والإدخال
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCashBoxId, setEditingCashBoxId] = useState<string | null>(null);
  const [cashBoxName, setCashBoxName] = useState('');
  const [cashBoxNotes, setCashBoxNotes] = useState('');
  const [cashBoxOpeningBalance, setCashBoxOpeningBalance] = useState('0');

  const editingCashBox = editingCashBoxId
    ? cashBoxes.find((c) => c.id === editingCashBoxId)
    : null;

  const isFormDirty = editingCashBox
    ? cashBoxName.trim() !== editingCashBox.name ||
      cashBoxNotes.trim() !== (editingCashBox.notes ?? '')
    : cashBoxName.trim() !== '' ||
      cashBoxNotes.trim() !== '' ||
      (cashBoxOpeningBalance !== '' && cashBoxOpeningBalance !== '0');

  // استجابة لزر الإضافة من الرأس
  useEffect(() => {
    if (addTrigger > 0) {
      startAdd();
    }
  }, [addTrigger]);

  // جلب الخزن
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('cash_boxes').select('*').order('name');
        if (!alive) return;
        if (error) {
          toast.error(translateDbError(error.message));
          setLoading(false);
          return;
        }

        setCashBoxes((data ?? []) as CashBoxRecord[]);
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

  // تصفية وترتيب الخزن
  const filteredCashBoxes = useMemo(() => {
    const list = cashBoxes.filter((box) => {
      const matchStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? box.is_active : !box.is_active);
      const matchQuery = matchesSearchQuery(
        [box.name, box.serial_number, box.notes],
        searchTerm,
      );
      return matchStatus && matchQuery;
    });

    return list.sort((firstBox, secondBox) => {
      if (sortOrder === 'serial-desc') return (secondBox.serial_number ?? 0) - (firstBox.serial_number ?? 0);
      if (sortOrder === 'serial-asc') return (firstBox.serial_number ?? 0) - (secondBox.serial_number ?? 0);
      if (sortOrder === 'name-desc') return secondBox.name.localeCompare(firstBox.name, 'ar');
      return firstBox.name.localeCompare(secondBox.name, 'ar');
    });
  }, [cashBoxes, searchTerm, statusFilter, sortOrder]);

  const totalCount = filteredCashBoxes.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // شريط المؤشرات
  const kpiItems = useMemo<KpiItem[]>(() => {
    const activeCount = filteredCashBoxes.filter((b) => b.is_active).length;
    const primaryBox = filteredCashBoxes.find((b) => b.is_primary);

    const itemsList: KpiItem[] = [
      {
        id: 'data-box-total',
        label: 'إجمالي الخزن',
        value: filteredCashBoxes.length,
        unit: 'خزينة',
        variant: 'primary',
        icon: Landmark,
      },
      {
        id: 'data-box-active',
        label: 'الخزن النشطة',
        value: activeCount,
        unit: 'خزينة',
        variant: 'success',
        icon: CheckCircle2,
      },
    ];

    if (primaryBox) {
      itemsList.push({
        id: 'data-box-primary',
        label: 'الخزينة الرئيسية المعتمدة',
        value: primaryBox.name,
        unit: '',
        variant: 'info',
        icon: Wallet,
      });
    }

    return itemsList;
  }, [filteredCashBoxes]);

  function startAdd() {
    setEditingCashBoxId(null);
    setCashBoxName('');
    setCashBoxNotes('');
    setCashBoxOpeningBalance('0');
    setIsModalOpen(true);
  }

  function startEdit(box: CashBoxRecord) {
    setEditingCashBoxId(box.id);
    setCashBoxName(box.name);
    setCashBoxNotes(box.notes || '');
    setCashBoxOpeningBalance('0');
    setIsModalOpen(true);
  }

  function cancelEdit() {
    setEditingCashBoxId(null);
    setIsModalOpen(false);
  }

  async function saveCashBox(event: FormEvent) {
    event.preventDefault();

    if (editingCashBoxId) {
      const { error: updateError } = await supabase.rpc('update_cash_box', {
        p_cash_box_id: editingCashBoxId,
        p_name: cashBoxName.trim(),
        p_notes: cashBoxNotes.trim() || null,
      });
      if (updateError) {
        toast.error(translateDbError(updateError.message));
        return;
      }
      toast.success(`تم تعديل اسم الخزنة إلى «${cashBoxName.trim()}»`);
    } else {
      const { error: rpcError } = await supabase.rpc(
        'create_cash_box_with_opening_balance_and_notes',
        {
          p_name: cashBoxName.trim(),
          p_opening_balance: Number(cashBoxOpeningBalance) || 0,
          p_notes: cashBoxNotes.trim() || null,
        },
      );
      if (rpcError) {
        toast.error(translateDbError(rpcError.message));
        return;
      }
      toast.success(`تمت إضافة الخزنة «${cashBoxName.trim()}»`);
    }

    cancelEdit();
    setSelectedBox(null);
    setVersion((v) => v + 1);
    void refresh(['cashBoxes']);
  }

  async function toggleCashBox(box: CashBoxRecord) {
    const { error: updateError } = await supabase.rpc('toggle_cash_box_active', {
      p_cash_box_id: box.id,
    });
    if (updateError) {
      toast.error(translateDbError(updateError.message));
      return;
    }
    toast.success(`تم ${box.is_active ? 'إيقاف' : 'تفعيل'} الخزنة «${box.name}»`);
    setVersion((v) => v + 1);
    void refresh(['cashBoxes']);
  }

  async function removeCashBox(box: CashBoxRecord) {
    if (
      !(await askConfirmation(
        `حذف الخزنة «${box.name}»؟ لا يمكن حذفها إذا كانت تحتوي على حركات سابقة.`,
        'حذف',
      ))
    )
      return;

    const { error: deleteError } = await supabase.rpc('delete_cash_box', {
      p_cash_box_id: box.id,
    });
    if (deleteError) {
      toast.error(translateDbError(deleteError.message));
      return;
    }

    toast.success(`تم حذف الخزنة «${box.name}»`);
    setSelectedBox(null);
    setVersion((v) => v + 1);
    void refresh(['cashBoxes']);
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات الخزن" />

      <div className={selectedBox ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة الخزن">
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
                  placeholder="بحث باسم الخزنة أو الرقم…"
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
                    onSort={(s) => setSortOrder(s as CashBoxSort)}
                  />
                  <SortableHeader
                    label="الخزنة"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as CashBoxSort)}
                    defaultDirection="asc"
                  />
                  <th className="col-hide-on-detail">النوع</th>
                  <th className="col-hide-on-detail">ملاحظات</th>
                  <th>الحالة</th>
                  <th aria-label="الإجراءات" />
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
                {!loading && pagedBoxes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      لا توجد خزن تطابق البحث.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pagedBoxes.map((box) => {
                    const isSelected = selectedBox?.id === box.id;
                    return (
                      <tr
                        key={box.id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedBox(box)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedBox(box);
                          }
                        }}
                      >
                        <td className="num strong">{entityNumber('CBX', box.serial_number)}</td>
                        <td className="strong">{box.name}</td>
                        <td className="col-hide-on-detail">
                          {box.is_primary ? (
                            <span className="badge">رئيسية</span>
                          ) : (
                            <span className="muted">فرعية</span>
                          )}
                        </td>
                        <td className="muted col-hide-on-detail">{box.notes || '—'}</td>
                        <td>
                          <StatusBadge variant={box.is_active ? 'paid' : 'unpaid'}>
                            {box.is_active ? 'نشطة' : 'موقوفة'}
                          </StatusBadge>
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={can('data.cashBoxes.edit') ? () => startEdit(box) : undefined}
                            onDelete={
                              can('data.cashBoxes.delete') && !box.is_primary
                                ? () => void removeCashBox(box)
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
        <aside className={selectedBox ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل السجل">
          {selectedBox ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>بيانات الخزنة</span>
                  <h2>{selectedBox.name}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="إغلاق التفاصيل"
                  onClick={() => setSelectedBox(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div>
                  <dt>الرقم</dt>
                  <dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd>
                </div>
                <div>
                  <dt>النوع</dt>
                  <dd>{selectedBox.is_primary ? 'خزنة رئيسية' : 'خزنة فرعية'}</dd>
                </div>
                <div>
                  <dt>الحالة</dt>
                  <dd>{selectedBox.is_active ? 'نشطة' : 'موقوفة'}</dd>
                </div>
              </dl>

              {selectedBox.notes && (
                <p className="erp-detail-notes">
                  <span>ملاحظات</span>
                  {selectedBox.notes}
                </p>
              )}

              <div className="erp-detail-actions">
                {can('data.cashBoxes.edit') && (
                  <button type="button" className="btn" onClick={() => startEdit(selectedBox)}>
                    تعديل الخزنة
                  </button>
                )}
                {can('data.cashBoxes.edit') && (
                  <button type="button" className="btn" onClick={() => void toggleCashBox(selectedBox)}>
                    {selectedBox.is_active ? 'إيقاف الخزنة' : 'تفعيل الخزنة'}
                  </button>
                )}
                {can('data.cashBoxes.delete') && !selectedBox.is_primary && (
                  <button type="button" className="btn danger" onClick={() => void removeCashBox(selectedBox)}>
                    حذف الخزنة
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر خزنة</strong>
              <span>ستظهر تفاصيل الخزنة هنا مع خيارات التعديل السريع.</span>
            </div>
          )}
        </aside>
      </div>

      {/* مودال الإضافة والتعديل */}
      {isModalOpen && (
        <Modal
          title={editingCashBoxId ? 'تعديل خزنة' : 'إضافة خزنة'}
          className="form-modal-md"
          backdropClassName="master-data-backdrop"
          onClose={cancelEdit}
          isDirty={isFormDirty}
          confirmOnDismiss={true}
        >
          <form className="stack" onSubmit={saveCashBox}>
            <div className="erp-form-grid">
              <label className={!editingCashBoxId ? 'erp-col-6' : 'erp-col-12'}>
                <span>اسم الخزنة *</span>
                <input
                  type="text"
                  value={cashBoxName}
                  onChange={(e) => setCashBoxName(e.target.value)}
                  placeholder="اسم الخزنة…"
                  autoFocus
                  required
                />
              </label>

              {!editingCashBoxId && (
                <label className="erp-col-6">
                  <span>الرصيد الافتتاحي</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    dir="ltr"
                    className="num no-spinner"
                    value={cashBoxOpeningBalance}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setCashBoxOpeningBalance(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              )}

              <label className="erp-col-12">
                <span>ملاحظات الخزنة</span>
                <textarea
                  value={cashBoxNotes}
                  onChange={(e) => setCashBoxNotes(e.target.value)}
                  placeholder="وصف الخزنة ومكانها…"
                  rows={3}
                />
              </label>
            </div>
            <div className="form-modal-actions">
              <button type="submit" className="btn primary">
                <Save size={15} />
                <span>{editingCashBoxId ? 'حفظ التعديلات' : 'إضافة خزنة'}</span>
              </button>
              <button type="button" className="btn" onClick={cancelEdit}>
                <X size={15} />
                <span>إلغاء</span>
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

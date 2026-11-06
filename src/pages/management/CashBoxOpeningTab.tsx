import { useEffect, useMemo, useRef, useState } from 'react';
import { Wallet, Landmark, X } from 'lucide-react';
import KpiBar, { type KpiItem } from '../../components/KpiBar';
import Pagination from '../../components/Pagination';
import SortableHeader from '../../components/SortableHeader';
import { supabase } from '../../lib/supabase';
import { entityNumber, money } from '../../lib/format';
import { errorMessage, translateDbError } from '../../lib/errors';
import { matchesSearchQuery } from '../../lib/search';
import { toast } from '../../components/Toast';
import type { CashBoxRow } from '../../lib/types';
import type { ManagementSort } from './AccountOpeningTab';

const PAGE_SIZE = 20;

interface CashBoxOpeningTabProps {
  cashBoxes: CashBoxRow[];
  canEditOpening: boolean;
  onRefresh: () => Promise<void>;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  saveTrigger?: number;
}

export default function CashBoxOpeningTab({
  cashBoxes,
  canEditOpening,
  onRefresh,
  saving,
  setSaving,
  saveTrigger,
}: CashBoxOpeningTabProps) {
  const [cashValues, setCashValues] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<ManagementSort>('name-asc');
  const [page, setPage] = useState(1);
  const [selectedBox, setSelectedBox] = useState<CashBoxRow | null>(null);

  useEffect(() => {
    setCashValues(
      Object.fromEntries(
        cashBoxes.map((box) => [box.id, String(Number(box.opening_balance))])
      )
    );
  }, [cashBoxes]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger && saveTrigger > 0) {
      void handleSaveRef.current();
    }
  }, [saveTrigger]);

  const filteredCashBoxes = useMemo(() => {
    const list = cashBoxes.filter((box) =>
      matchesSearchQuery([box.name, box.serial_number, box.notes], searchTerm)
    );
    return list.sort((firstBox, secondBox) => {
      if (sortOrder === 'serial-desc') return secondBox.serial_number - firstBox.serial_number;
      if (sortOrder === 'serial-asc') return firstBox.serial_number - secondBox.serial_number;
      if (sortOrder === 'name-desc') return secondBox.name.localeCompare(firstBox.name, 'ar');
      return firstBox.name.localeCompare(secondBox.name, 'ar');
    });
  }, [cashBoxes, searchTerm, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(filteredCashBoxes.length / PAGE_SIZE));
  const pageBoxes = filteredCashBoxes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const kpiItems = useMemo<KpiItem[]>(() => {
    const totalOpening = filteredCashBoxes.reduce(
      (sum, box) => sum + Number(cashValues[box.id] ?? box.opening_balance ?? 0),
      0
    );
    return [
      {
        id: 'mgmt-box-total',
        label: 'إجمالي رصيد الخزن الافتتاحي',
        value: money(totalOpening),
        unit: 'ج.م',
        variant: 'success',
        icon: Wallet,
      },
      {
        id: 'mgmt-box-count',
        label: 'عدد الخزن المتاحة',
        value: filteredCashBoxes.length,
        unit: 'خزينة',
        variant: 'neutral',
        icon: Landmark,
      },
    ];
  }, [filteredCashBoxes, cashValues]);

  async function handleSave() {
    const cash = cashBoxes.map((box) => ({
      cash_box_id: box.id,
      opening_balance: Number(cashValues[box.id] ?? 0),
    }));

    if (cash.some((line) => !Number.isFinite(line.opening_balance))) {
      toast.error('راجع أرصدة الخزن. القيم يجب أن تكون صحيحة.');
      return;
    }

    setSaving(true);
    try {
      const { error: saveError } = await supabase.rpc('save_opening_balances', {
        p_cash_boxes: cash,
        p_stock: [],
      });
      if (saveError) {
        toast.error(translateDbError(saveError.message));
      } else {
        toast.success('تم حفظ أرصدة الخزن الافتتاحية بنجاح.');
        await onRefresh();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <KpiBar items={kpiItems} ariaLabel="مؤشرات افتتاحيات الخزن" />

      <div className={selectedBox ? 'erp-sales-workspace detail-open' : 'erp-sales-workspace'}>
        <section className="erp-list-panel" aria-label="قائمة افتتاحيات الخزن">
          <div className="erp-toolbar">
            <div className="erp-filters">
              <label className="erp-search">
                <span className="sr-only">البحث</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="بحث باسم الخزنة…"
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
                    onSort={(s) => setSortOrder(s as ManagementSort)}
                  />
                  <SortableHeader
                    label="الخزينة"
                    field="name"
                    currentSort={sortOrder}
                    onSort={(s) => setSortOrder(s as ManagementSort)}
                    defaultDirection="asc"
                  />
                  <th className="num" style={{ width: '160px' }}>الرصيد الافتتاحي</th>
                  <th className="num" style={{ width: '160px' }}>الرصيد الفعلي</th>
                </tr>
              </thead>
              <tbody>
                {pageBoxes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      لا توجد خزن تطابق البحث.
                    </td>
                  </tr>
                )}
                {pageBoxes.map((box) => {
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
                      <td className="num strong"><bdi dir="ltr" className="tabular-nums">{entityNumber('CBX', box.serial_number)}</bdi></td>
                      <td className="strong">{box.name}</td>
                      <td className="mobile-field-cell" onClick={(e) => e.stopPropagation()} style={{ width: '160px' }}>
                        <input
                          className="table-input num no-spinner"
                          style={{ width: '100%', maxWidth: '140px' }}
                          type="number"
                          inputMode="decimal"
                          dir="ltr"
                          step="0.0001"
                          disabled={!canEditOpening || saving}
                          value={cashValues[box.id] ?? '0'}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) =>
                            setCashValues((values) => ({ ...values, [box.id]: event.target.value }))
                          }
                        />
                      </td>
                      <td className="num strong remaining" style={{ width: '160px' }}>{money(box.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={filteredCashBoxes.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>

        <aside className={selectedBox ? 'erp-detail-panel open' : 'erp-detail-panel'} aria-label="تفاصيل الخزينة">
          {selectedBox ? (
            <>
              <div className="erp-detail-head">
                <div>
                  <span>افتتاحي الخزنة</span>
                  <h2>{selectedBox.name}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="إغلاق التفاصيل" onClick={() => setSelectedBox(null)}>
                  <X size={18} />
                </button>
              </div>

              <dl className="erp-detail-summary">
                <div><dt>رقم الخزنة</dt><dd className="num">{entityNumber('CBX', selectedBox.serial_number)}</dd></div>
                <div><dt>النوع</dt><dd>{selectedBox.is_primary ? 'الخزنة الرئيسية' : 'خزنة فرعية'}</dd></div>
                <div><dt>الرصيد الفعلي الحالي</dt><dd className="num strong">{money(selectedBox.balance)}</dd></div>
              </dl>

              <div className="erp-detail-totals">
                <span>الرصيد الافتتاحي</span>
                <strong className="num remaining">{money(Number(cashValues[selectedBox.id] ?? selectedBox.opening_balance))}</strong>
              </div>
            </>
          ) : (
            <div className="erp-detail-empty">
              <strong>اختر بندًا</strong>
              <span>اضغط على أي سطر لمراجعة رصيده الافتتاحي والفعلي.</span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

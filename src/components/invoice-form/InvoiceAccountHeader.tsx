import { formatDate, money } from '../../lib/format';
import SearchableSelect from '../SearchableSelect';
import type { AccountKind, AccountRow, WarehouseOption } from '../../lib/types';

interface InvoiceAccountHeaderProps {
  isReadOnly: boolean;
  isWaste: boolean;
  date: string;
  warehouseId: string;
  selectableWarehouses: WarehouseOption[];
  selectedWarehouse?: WarehouseOption;
  onWarehouseChange: (id: string) => void;
  accountKind: AccountKind;
  onAccountKindChange: (kind: AccountKind) => void;
  accountId: string;
  selectableAccounts: AccountRow[];
  selectedAccount?: AccountRow;
  onAccountChange: (id: string) => void;
  accountNotesDisplay: string;
  balanceBefore: number;
  netInvoiceDebt: number;
  balanceAfter: number;
  statusBefore: { text: string; type: 'settled' | 'debit' | 'credit' };
  statusAfter: { text: string; type: 'settled' | 'debit' | 'credit' };
}

export default function InvoiceAccountHeader({
  isReadOnly,
  isWaste,
  date,
  warehouseId,
  selectableWarehouses,
  selectedWarehouse,
  onWarehouseChange,
  accountKind,
  onAccountKindChange,
  accountId,
  selectableAccounts,
  selectedAccount,
  onAccountChange,
  accountNotesDisplay,
  balanceBefore,
  netInvoiceDebt,
  balanceAfter,
  statusBefore,
  statusAfter,
}: InvoiceAccountHeaderProps) {
  return (
    <div className="right-card account-header-card">
      {/* الصف الأول: التاريخ - المخزن - نوع الحساب - الحساب */}
      <div className="account-header-row1">
        <label className="field-date">
          <span>التاريخ</span>
          <div className="readonly-val-box num" dir="ltr">
            {formatDate(date)}
          </div>
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
              onChange={onWarehouseChange}
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
                onChange={(val) => onAccountKindChange(val as AccountKind)}
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
                onChange={onAccountChange}
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
              <span className={`stat-pill-tag tag-${statusBefore.type}`}>{statusBefore.text}</span>
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
              <span className={`stat-pill-tag tag-${statusAfter.type}`}>{statusAfter.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

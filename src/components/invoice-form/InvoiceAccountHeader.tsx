import AccountBalancePills from '../AccountBalancePills';
import DateDisplay from '../DateDisplay';
import DateInput from '../DateInput';
import SearchableSelect from '../SearchableSelect';
import { searchAccountsAsync } from '../../lib/masterDataQueries';
import type { AccountKind, AccountRow, WarehouseOption } from '../../lib/types';

interface InvoiceAccountHeaderProps {
  isReadOnly: boolean;
  isWaste: boolean;
  date: string;
  onDateChange?: (date: string) => void;
  warehouseId: string;
  selectableWarehouses: WarehouseOption[];
  selectedWarehouse?: WarehouseOption;
  onWarehouseChange: (id: string) => void;
  accountKind: AccountKind;
  onAccountKindChange: (kind: AccountKind) => void;
  accountId: string;
  selectableAccounts: AccountRow[];
  selectedAccount?: AccountRow;
  accountNameFallback?: string;
  onAccountChange: (id: string) => void;
  accountNotesDisplay: string;
  balanceBefore: number;
  netInvoiceDebt: number;
  balanceAfter: number;
}

export default function InvoiceAccountHeader({
  isReadOnly,
  isWaste,
  date,
  onDateChange,
  warehouseId,
  selectableWarehouses,
  selectedWarehouse,
  onWarehouseChange,
  accountKind,
  onAccountKindChange,
  accountId,
  selectableAccounts,
  selectedAccount,
  accountNameFallback,
  onAccountChange,
  accountNotesDisplay,
  balanceBefore,
  netInvoiceDebt,
  balanceAfter,
}: InvoiceAccountHeaderProps) {
  return (
    <div className="right-card account-header-card">
      {/* الصف الأول: التاريخ - المخزن - نوع الحساب - الحساب */}
      <div className="account-header-row1">
        <label className="field-date">
          <span>التاريخ</span>
          {isReadOnly ? (
            <div className="readonly-val-box num">
              <DateDisplay value={date} />
            </div>
          ) : (
            <DateInput
              value={date}
              onChange={onDateChange ?? (() => {})}
              ariaLabel="تاريخ الفاتورة"
              required
            />
          )}
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
              <div className="readonly-val-box strong">{selectedAccount?.name ?? accountNameFallback ?? '—'}</div>
            ) : (
              <SearchableSelect
                value={accountId}
                selectedLabel={selectedAccount?.name ?? accountNameFallback}
                options={
                  selectableAccounts.length <= 50
                    ? selectableAccounts.map((account) => ({
                        value: account.id,
                        label: account.phone ? `${account.name} — ${account.phone}` : account.name,
                      }))
                    : undefined
                }
                loadOptions={
                  selectableAccounts.length > 50
                    ? async (q) => searchAccountsAsync(accountKind, q)
                    : undefined
                }
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
          <AccountBalancePills
            accountKind={accountKind}
            balanceBefore={balanceBefore}
            delta={netInvoiceDebt}
            balanceAfter={balanceAfter}
            titleBefore="المديونية قبل:"
            deltaLabel="صافي الفاتورة:"
            titleAfter="المديونية بعد:"
          />
        )}
      </div>
    </div>
  );
}

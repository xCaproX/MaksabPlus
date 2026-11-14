import { useMemo } from 'react';
import AccountBalancePills from '../AccountBalancePills';
import DateDisplay from '../DateDisplay';
import DateInput from '../DateInput';
import SearchableSelect, { type SearchOption } from '../SearchableSelect';
import { findPinnedCashAccount, sortAccountsWithCashFirst } from '../../lib/defaults';
import { normalizeDigits } from '../../lib/format';
import { formatAccountOptionLabel, searchAccountsAsync } from '../../lib/masterDataQueries';
import type { AccountKind, AccountRow, WarehouseOption } from '../../lib/types';

function toAccountOption(account: AccountRow): SearchOption {
  return {
    value: account.id,
    label: formatAccountOptionLabel(account.name, account.phone),
  };
}

function matchesAccountQuery(account: AccountRow, rawQuery: string): boolean {
  const trimmed = normalizeDigits(rawQuery).trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLocaleLowerCase();
  const digits = trimmed.replace(/^#/, '');
  return (
    normalizeDigits(account.name).toLocaleLowerCase().includes(lowered) ||
    Boolean(account.phone && normalizeDigits(account.phone).toLocaleLowerCase().includes(lowered)) ||
    Boolean(account.serial_number && /^\d+$/.test(digits) && String(account.serial_number) === digits)
  );
}

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
  const pinnedCashAccount = useMemo(
    () => findPinnedCashAccount(selectableAccounts, accountKind),
    [selectableAccounts, accountKind],
  );
  const pinnedAccountOptions = useMemo(
    () => (pinnedCashAccount ? [toAccountOption(pinnedCashAccount)] : undefined),
    [pinnedCashAccount],
  );
  const orderedAccountOptions = useMemo(
    () =>
      selectableAccounts.length <= 50
        ? sortAccountsWithCashFirst(selectableAccounts, accountKind).map(toAccountOption)
        : undefined,
    [selectableAccounts, accountKind],
  );

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
                key={accountKind}
                value={accountId}
                selectedLabel={selectedAccount?.name ?? accountNameFallback}
                pinnedOptions={pinnedAccountOptions}
                options={orderedAccountOptions}
                loadOptions={
                  selectableAccounts.length > 50
                    ? async (q) => {
                        const results = await searchAccountsAsync(accountKind, q, 25, {
                          includeCashAccount: true,
                        });
                        if (
                          pinnedCashAccount &&
                          pinnedAccountOptions?.[0] &&
                          matchesAccountQuery(pinnedCashAccount, q) &&
                          !results.some((opt) => opt.value === pinnedCashAccount.id)
                        ) {
                          return [pinnedAccountOptions[0], ...results];
                        }
                        return results;
                      }
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

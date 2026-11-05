# Management & Configuration Tabs

## Overview
Administrative tabs managing company opening balances (customers, suppliers, stock items, cash boxes), system-wide reconciliation audit logs, and manual reconciliation execution.

## Interface
- `AccountOpeningTab`: Editable grid establishing initial opening balances and balance types (debit/credit) for customer and supplier accounts.
- `CashBoxOpeningTab`: Grid establishing starting cash balances for registered company cash boxes.
- `StockOpeningTab`: Grid establishing opening inventory quantities and purchase costs across warehouses.
- `ReconciliationLogTab`: Audit log displaying historical balance discrepancy checks, run timestamps, and variance details.
- `RunReconciliationModal`: Modal dialog allowing company owners to execute real-time reconciliation checks.

## Invariants
- Opening balances can only be edited by users holding `management.<entity>.edit` permissions.
- Reconciliation audit logs and execution are restricted strictly to users with the `owner` role.
- All opening values map to dedicated opening entry records in the database.

## Side Effects
- Mutates opening balance entries in Supabase.
- Triggers `run_reconciliation` RPC to check for and resolve ledger drift.

## Verification
- Run: `npx vitest run src/test/components/RunReconciliationModal.test.tsx`

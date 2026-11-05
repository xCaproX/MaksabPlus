# Shared Components & Forms

## Overview
Core presentation components, shared form controls, accessible modal dialogs, and unified transaction forms powering the MaksabPlus user interface.

## Interface
- `AccountBalancePills`: Balance preview chips indicating before/change/after states.
- `CashBoxTransferForm`: Unified transaction form for cash transfers between treasuries/cash boxes.
- `ChangePasswordModal`: Modal dialog allowing authenticated users or administrators to change user credentials.
- `ConfirmDialog`: Action confirmation modal naming record identifiers for destructive or irreversible operations.
- `DateInput`: Localized date input component formatted strictly as `dd/mm/yyyy`.
- `InvoiceForm`: Unified transaction form for sales, purchases, customer/supplier returns, and stock waste.
- `KpiBar`: Reactive top-level metrics bar displaying contextual totals and counts.
- `Layout`: Top-level app layout featuring persistent dark sidebar, nested accordion subnav, and user session footer.
- `Modal`: Dialog container with background overlay, escape key handling, and responsive sizing.
- `MoneyDisplay`: Formatted currency presenter with `dir="ltr"` isolation and `tabular-nums` alignment.
- `Pagination`: Page navigation bar with record count badges and page change callbacks.
- `ReceiptForm`: Unified transaction form for cash in (inward) and cash out (outward) receipts.
- `RowActions`: Action dropdown menu for table records (view, edit, delete, restore).
- `SearchableSelect`: Filterable select dropdown supporting local options and asynchronous search queries.
- `SortableHeader`: Interactive table column header toggling sort direction (`asc`/`desc`).
- `StatusBadge`: Semantic badge reflecting payment, activity, and document states.
- `Toast`, `toast`, `ToastContainer`: Toast notification system for transient success, error, and info notices.
- `UserPermissions`: Fine-grained hierarchical permission assignment matrix for company users.
- `WarehouseTransferForm`: Unified transaction form for stock movements between inventory warehouses.
- Subdirectories:
  - [invoice-form](./invoice-form/README.md): Decomposed header, items table, and summary sidebar for `InvoiceForm`.

## Invariants
- All monetary and numeric figures must render in LTR context (`dir="ltr"`) with tabular figures (`tabular-nums`).
- Transaction forms (`InvoiceForm`, `ReceiptForm`, `WarehouseTransferForm`, `CashBoxTransferForm`) strictly share one unified layout across `create`, `edit`, and `view` (via `readOnly` mode).
- All destructive actions require explicit confirmation via `ConfirmDialog` or `useConfirmDialog`.

## Side Effects
- Mutates remote database state via Supabase RPCs on transaction submission.
- Manages authentication sessions via `supabase.auth`.
- Persists user sidebar expanded states to browser `localStorage`.

## Verification
- Run: `npx vitest run src/test/components/`

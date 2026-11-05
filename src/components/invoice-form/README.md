# Invoice Form Components

## Overview
Decomposed sub-components powering `InvoiceForm`. Separates party and warehouse metadata headers, item entry and line grid, and financial summary/actions sidebar while maintaining a unified create/edit/view layout.

## Interface
- `InvoiceAccountHeader`: Renders invoice date, warehouse selection, account type/party selection, and live balance preview pills.
- `InvoiceItemsTable`: Interactive grid for barcode lookup, item selection, quantity/price inputs, stock-level warnings, and line item management.
- `InvoiceSummarySidebar`: Side panel displaying subtotal/total, paid amount, remaining balance, treasury/cash-box selection, notes, and document action buttons.
- `EditingInvoice`: Interface encapsulating an `InvoiceRow` alongside its `LineDraft[]` items.

## Invariants
- When `isReadOnly` is `true`, all input controls render as accessible static values or disabled representations without mutation capabilities.
- When `isWaste` is `true`, financial calculations, payment fields, cash box selectors, and customer/supplier balances are omitted or neutralized.
- Line insertions enforce `entryItemId` selection and `quantity > 0` before triggering `onInsertLine`.

## Side Effects
- Emits user mutations strictly through callback props (`onUpdateLine`, `onRemoveLine`, `onInsertLine`, `onWarehouseChange`, `onAccountChange`, `onPaidChange`, etc.) back to `InvoiceForm`.
- Executes async searches against Supabase for items and accounts via `searchWarehouseItemsAsync` and `searchAccountsAsync`.

## Verification
- Run: `npx vitest run src/test/components/InvoiceForm.test.tsx`

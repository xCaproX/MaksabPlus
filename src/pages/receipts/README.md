# Receipts & Cash Movements Tables

## Overview
Presentation components and calculation utilities for liquid cash receipts (inflows and outflows) and inter-treasury cash transfers.

## Interface
- `ReceiptTable`: Tabular view of cash receipts with sorting, party links, linked invoice references, and row actions.
- `CashBoxTransferTable`: Tabular view of cash movements between source and destination cash boxes.
- `calculateReceiptKpis`: KPI aggregator calculating total receipts count, total financial amount, and average transaction size.
- `calculateCashBoxTransferKpis`: KPI aggregator for cash transfers count and total volume transferred.

## Invariants
- Linked receipts (generated automatically by invoices) link directly back to their originating invoice and disallow direct editing.
- Free receipts (`is_free: true`) allow direct editing and deletion by authorized users.

## Side Effects
- Emits row actions (`onView`, `onEdit`, `onDelete`, `onRestore`) to `Receipts.tsx`.

## Verification
- Run: `npx vitest run src/test/receiptKpis.test.ts`

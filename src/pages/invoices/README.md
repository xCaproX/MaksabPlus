# Invoices & Stock Movement Tables

## Overview
Presentation components and calculation utilities for transaction tables across sales invoices, purchase invoices, customer/supplier returns, stock waste, and warehouse transfers.

## Interface
- `InvoiceTable`: Tabular list of commercial invoices with sorting, status badges, profit visibility toggle, and row action triggers.
- `WarehouseTransferTable`: Tabular list of warehouse stock transfer transactions.
- `calculateInvoiceKpis`: Aggregator calculating total invoices count, financial total, paid amount, and remaining debt.
- `calculateWarehouseTransferKpis`: Aggregator calculating total transfer count and units moved.

## Invariants
- Cost and profit columns render only when `canViewProfit` evaluates to `true`.
- Soft-deleted records are visually flagged and offer restore actions instead of standard edits.

## Side Effects
- Emits action events (`onView`, `onEdit`, `onDelete`, `onRestore`) to parent page orchestrator (`Invoices.tsx`).

## Verification
- Run: `npx vitest run src/test/invoiceValidation.test.ts`

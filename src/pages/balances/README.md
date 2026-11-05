# Balances & Statements Tabs

## Overview
Presentation components providing financial and stock ledger views, account statements with date filters, inventory levels across warehouses, and treasury balances.

## Interface
- `AccountBalancesTab`: Ledger view for customer and supplier balances, including detailed statement modal with date filtering and printing.
- `ItemBalancesTab`: Stock valuation and inventory balances per warehouse for all catalog items.
- `CashBoxBalancesTab`: Treasury balances and cash movement statements across all company cash boxes.

## Invariants
- Account statement ledgers maintain running balance continuity (`debit - credit`).
- Tab views preserve search and sorting state independently per tab type.
- Financial numbers are rendered with LTR and tabular numeral formatting.

## Side Effects
- Queries database ledger views (`v_account_balances`, `v_item_stock`, `v_cash_box_balances`, `v_account_statement`).
- Triggers window printing for account statements.

## Verification
- Run: `npx vitest run`

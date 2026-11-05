# Application Pages & View Orchestrators

## Overview
Routed screen controllers and page orchestrators managing URL state, user access permissions, tab switching, data fetching, filter criteria, and modal transaction dialogs.

## Interface
- `Home`: Executive dashboard rendering financial summary cards, quick actions, and stock alerts.
- `Invoices`: Commercial document orchestrator for sales, purchases, customer/supplier returns, stock waste, and warehouse transfers.
- `Receipts`: Liquid cash orchestrator for cash-in vouchers, cash-out vouchers, and treasury transfers.
- `Balances`: Financial and inventory ledger orchestrator managing statement views for parties, products, and treasuries.
- `MasterData`: Master record orchestrator managing catalogs of accounts, items, warehouses, and cash boxes.
- `Management`: Administrative orchestrator managing opening balances, system reconciliations, and user access matrix.
- `Login`: Authentication form handling email/password sign-in.
- `SetPassword`: User onboarding form for configuring account passwords from invitation links.
- Subdirectories:
  - [balances](./balances/README.md): Tab views for ledger balances and account statements.
  - [home](./home/README.md): Financial pulse and sales metrics dashboard widgets.
  - [invoices](./invoices/README.md): Document tables and KPI summaries for invoices and transfers.
  - [management](./management/README.md): Opening balance editors and reconciliation logs.
  - [master-data](./master-data/README.md): Catalogs for business entities with slide-over detail panels.
  - [receipts](./receipts/README.md): Document tables and KPI summaries for cash receipts and transfers.

## Invariants
- Each page enforces role-based permission gates (`useAccess` / `can`) and redirects unauthorized users to `/access-denied`.
- Active tabs synchronize with browser URL parameters (`?tab=<tab_name>`) to preserve state across page reloads.
- Single modal instance manages document creation, editing, and view details to avoid conflicting overlay states.

## Side Effects
- Reads and updates URL search parameters via `useSearchParams`.
- Dispatches transactions to Supabase RPCs and tables.
- Emits toast alerts upon successful mutations or database errors.

## Verification
- Run: `npx vitest run`

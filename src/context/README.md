# Master Data Context

## Overview
Centralized React context provider caching company master records (accounts, stock items, warehouses, cash boxes, and opening stock) across application views to prevent redundant network requests.

## Interface
- `MasterDataProvider`: React context provider wrapping authenticated application routes.
- `useMasterData()`: React hook providing direct access to cached master records and selective refresh dispatchers.
- `MasterDataContextType`: Interface describing cached arrays, loading indicators, error state, and the `refresh` function.
- `MasterDataResource`: Type union (`'accounts' | 'items' | 'warehouses' | 'cashBoxes' | 'stock'`) defining selectable refresh targets.

## Invariants
- `useMasterData()` must be consumed within a `<MasterDataProvider>` subtree; throws an error otherwise.
- Selective resource refreshes (`refresh(['accounts'])`) only execute queries for requested keys, preserving unmodified collections in state.

## Side Effects
- Asynchronously reads Supabase views and tables (`v_account_balances`, `v_item_stock`, `warehouses`, `cash_boxes`, `v_stock_opening_list`) scoped by tenant RLS.

## Verification
- Run: `npx vitest run`

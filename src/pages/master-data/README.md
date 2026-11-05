# Master Data Management Tabs

## Overview
Catalog management tabs for primary business entities: accounts (customers and suppliers), items (products/inventory), warehouses, and cash boxes. Features dual view: table list and slide-over details drawer (`erp-detail-panel`).

## Interface
- `AccountsTab`: Customer and supplier directory with search, active/inactive filters, side detail panel, and add/edit modal.
- `ItemsTab`: Product catalog managing barcodes, units, purchase/sale prices, and stock summaries.
- `WarehousesTab`: Physical storage location manager with primary warehouse designation.
- `CashBoxesTab`: Financial treasury and safe deposit box manager with primary cash box assignment.

## Invariants
- Strict separation of inspection and mutation: Slide-over details drawers (`erp-detail-panel`) are strictly read-only for rapid row browsing. All entity mutations (create/edit) take place inside standardized modals using `.erp-form-grid`.
- Clicking a table row activates the side detail panel (`erp-detail-panel.open`) without unmounting the table view.
- Deleting an entity delegates to safe server-side validation ensuring no linked transactions exist.
- System accounts (e.g. cash customer, waste) cannot be deleted or deactivated.

## Side Effects
- Mutates database records via direct PostgREST calls or RPC deletion procedures (`delete_account`, `delete_item`).
- Triggers global `refresh` on `MasterDataContext`.

## Verification
- Run: `npx vitest run`

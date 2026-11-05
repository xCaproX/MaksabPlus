# MaksabPlus Unified Form Grid & Modal System

* **Author:** Abdulrahman Eid
* **Date:** 2026-11-05

## Overview

A system-wide user experience and visual layout alignment across MaksabPlus. Standardizes all data entry forms and transaction dialogs around the refined spatial rhythm and 36px control height of the sales invoice form (`InvoiceForm`). Retains proven transactional flows while eliminating unbalanced form layouts, oversized single-input rows, and ad-hoc CSS overrides.

The system enforces a clean separation of concerns:
1. **Document Cockpits (Transactions):** Dedicated large modals with two-part layouts (flexible item grid + 340px summary sidebar) for sales invoices, purchase invoices, returns, waste vouchers, and stock transfers.
2. **Entity Modals (Master Data & Financial Vouchers):** Standardized responsive modals using a 2-to-3 column grid with 36px inputs and full-width free-text areas for customer/supplier cards, catalog items, warehouses, cash boxes, and vouchers.
3. **Inspection Drawers (Master Data Tables):** Slide-over side panels (`erp-detail-panel`) restricted exclusively to read-only record inspection upon table row selection.

## Analysis

### Contrarian & Complexity Review (YAGNI)
* **Avoid Universal Form Over-Abstraction:** Creating a single generic `UniversalFormEngine` component across all domain entities would introduce excessive abstraction, complex schemas, and fragile conditional logic. Master-detail transactions (with live barcode scanning and stock calculation) have fundamentally different state invariants than simple master data forms. Instead, standardization is achieved through shared CSS grid primitives (`.erp-form-grid`), design tokens, and shared UI components (`DateInput`, `SearchableSelect`, `MoneyDisplay`).
* **Preserve Complexity Budget:** This initiative introduces zero new screens, tabs, menu items, or accounting terms. It improves the existing everyday workflow without increasing cognitive load.

### Cost, Quota & Performance
* **Reduction of CSS Bloat:** Extracting repeated form styles and ad-hoc overrides from `invoice-form.css` (1,632 lines / 34.8 KB) and page-specific stylesheets into shared tokens and `forms.css` reduces stylesheet size by an estimated 40% and eliminates specificity wars.
* **Low-Spec Hardware Reflows:** Standardizing on lightweight CSS Grid layouts with fixed 36px control heights minimizes DOM layout recalculations and browser reflow times on low-powered point-of-sale hardware (e.g. Celeron/Atom terminals, 4GB RAM, 1366x768 screens).
* **Database Quota Isolation:** Restricting side drawers to cached client-side inspection preserves Supabase query budgets by eliminating redundant RPC calls on row clicks.

### UX & Cashier Ergonomics
* **Keystroke Velocity & Touch Targets:** All numeric and text inputs adopt a uniform 36px control height with 7px border radius, 13px typography, and 6px touch margins. Number inputs automatically select their contents on focus (`onFocus={(e) => e.target.select()}`), enabling rapid keyboard-only data entry.
* **Accidental Dismissal Protection (Dirty State Guard):** Existing modals close immediately on pressing `Escape` or clicking the backdrop overlay. In complex entry scenarios (e.g. an invoice with multiple items or an entity form with typed notes), unsaved state can be lost. Modals must implement a dirty check that intercepts dismissal when unsaved modifications exist, prompting for explicit user confirmation.
* **Full-Width Free Text:** Free-text inputs (notes, statement, description) span the full width (`grid-column: 1 / -1`), preventing cramped multiline entry cells.

### Migration & Sibling Parity
* **Sibling Document Consistency:** Aligns sibling transaction documents (`WarehouseTransferForm`, `ReceiptForm`, `CashBoxTransferForm`) to match `InvoiceForm` in input dimensions, focus sequences, and action button positioning.
* **Unified Document Lifecycle Parity:** Preserves the existing `readOnly` state architecture, allowing a single component to power create, edit, and view modes identically without separate visual layouts.
* **URL State & Deep Linking:** Retains search parameter synchronization (`?tab=...&action=new`) and programmatic trigger props (`addTrigger`) across page controllers.

### Observability & Error Handling
* **Double-Submission Prevention:** All modal submit actions must lock and display a busy state (`disabled={busy}`, "جارٍ الحفظ…") upon submission to prevent duplicate financial or entity records.
* **Standardized Error Translation:** Database and RPC errors surfaced during form submissions must funnel through `translateDbError` before triggering `toast.error()`.
* **Focus Management:** Modals automatically autofocus the first interactive input on mount, and restore focus to the triggering element upon closure.

## Goals vs. Non-Goals

### In-Scope Goals
* **Standardized Control Height:** Unify all text inputs, selects, `SearchableSelect`, and `DateInput` instances to `var(--erp-control-height, 36px)`.
* **Standard Grid Primitive (`.erp-form-grid`):** Introduce a clean 12-column responsive layout utility providing balanced 2-column (`.erp-col-6`) and 3-column (`.erp-col-4`) configurations, reserving full width (`.erp-col-12`) exclusively for notes and descriptions.
* **Standardized Modal Form Actions:** Standardize the action button bar across all dialogs with a primary save button on the right (RTL), outline cancel button on the left, and danger actions isolated behind confirmation prompts.
* **Restricted Side Drawer Role:** Cleanse `erp-detail-panel` of in-drawer form editing, converting the "Edit" trigger to open the standardized modal dialog instead.
* **Modal Dirty State Guard:** Prevent loss of in-progress entries from accidental `Escape` key presses or background backdrop clicks.

### Out-of-Scope Non-Goals
* **No Accounting or Backend Logic Alterations:** Zero changes to Postgres functions, migrations, double-entry ledger calculations, balances, or Supabase RPC signatures.
* **No Redesign of the Invoice Line Engine:** The barcode scanner input, live line calculation, and items table structure in `InvoiceItemsTable.tsx` remain functionally identical.
* **No Route or Navigation Overhaul:** Retains existing URL structures, tabs, and sidebar layout.
* **No External UI Library Adoption:** Retains pure Vanilla CSS design tokens; no installation of Tailwind, Bootstrap, or component UI kits.

## Alternatives Weighed

* **Universal Form Engine Component:**
  * *Description:* Building a single dynamic form builder driven by JSON schemas for every entity in the app.
  * *Reason for Rejection:* Rejected by author. Violates the complexity budget and architectural boundaries. Dynamic form generators introduce runtime opacity, make custom keyboard navigation and barcode refs brittle, and unnecessarily couple simple cards with complex master-detail transactions.
* **In-Drawer Form Editing for Master Data:**
  * *Description:* Embedding editable input fields directly inside the 520px slide-over side drawer (`erp-detail-panel`).
  * *Reason for Rejection:* Rejected by author. 520px is too cramped for multi-field entry forms and causes vertical stretching, visual claustrophobia, and inconsistent field widths compared to transactions.
* **Replacing Side Drawers Entirely with Modals for Record Details:**
  * *Description:* Opening a modal dialog whenever a table row is clicked in Master Data, removing `erp-detail-panel`.
  * *Reason for Rejection:* Rejected by author. Impairs fast record inspection. Browsing through customers or inventory items requires glanceable side-by-side inspection while keeping table context visible.

## Key Decisions & Staging for Next Steps

### Key Decisions
1. **The 36px Spatial Standard:** All inputs, dropdowns, and date pickers standardize at 36px height with 7px border radii across all modal dialogs and workspace toolbars.
2. **Two Complementary Modal Layouts:**
   - *Cockpit Modal:* Two-part layout for multi-line transactions (Invoices, Transfers, Receipts).
   - *Entity Modal:* 2-to-3 column grid for entity records (Accounts, Items, Warehouses, Cash Boxes).
3. **Pure Read-Only Inspection Drawer:** The side drawer is strictly dedicated to quick record inspection.
4. **Safety Against Data Loss:** Modals with modified state require explicit confirmation before closing via `Escape` or backdrop clicks.

### Staging for Next Steps
1. **Phase 1 (Tokens & Shared Grid):** Update `tokens.css`, `forms.css`, and `buttons.css` with `--erp-control-height: 36px` and `.erp-form-grid` utility classes.
2. **Phase 2 (Master Data Entity Modals):** Migrate customer, supplier, item, warehouse, and cash box create/edit forms to the unified modal grid.
3. **Phase 3 (Side Drawer Purification):** Cleanse `erp-detail-panel` of form inputs across all tabs in `src/pages/master-data/`.
4. **Phase 4 (Sibling Document Alignment):** Align `ReceiptForm.tsx`, `WarehouseTransferForm.tsx`, and `CashBoxTransferForm.tsx` with the 36px standard, unified action bar, and dirty state safety guard.

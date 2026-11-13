# MaksabPlus — Final UX/UI & Security Implementation Roadmap

> **Document Status**: Authoritative consolidated execution blueprint (documentation-only; zero source files modified).
> **Supersedes**: Initial audit/roadmap artifacts (`ux-audit-report.md`, `ui-audit-report.md`, `ux-ui-roadmap.md`, `ux-ui-feasibility-review.md`).
> **Verification Basis**: Every finding, line citation, dependency, and security status below was verified directly against the live `src/` and `supabase/` codebase.

---

## 1. Executive Summary

This roadmap consolidates the UX Audit, UI Audit, Initial Roadmap, and Technical Feasibility & Risk Review into a single, execution-ready plan tailored to **MaksabPlus** (a high-frequency Arabic RTL retail/wholesale ERP built with React + TypeScript + Vite + Supabase Postgres/RLS).

Key architectural outcomes incorporated from technical feasibility and database verification:

1. **Security Separated & Elevated (`SEC-01`, `SEC-02`)**: Independent inspection of `supabase/migrations/` proved that while tenant isolation (`company_id`), mutation RPCs, and list RPCs (`get_document_page`) already enforce exact permissions, **direct PostgREST `SELECT` RLS policies** on `invoices`, `receipts`, `warehouse_transfers`, and `cash_box_transfers` have confirmed same-company over-broadening via `has_permission('balances.view')` / `'management.view'` / `'goods.view'` / `'money.view'`. These database hardening tasks are separated into an immediate **Phase 0 Security Track**, distinct from ordinary UX/UI tasks (`T-09b` deep-link RPC & statement links).
2. **Data-Loss & Cashier-Safety Priority (`P0`)**: Fixes immediate defects in mobile statement headers (`T-01`), silent submit drops in **both** Invoices and Warehouse Transfers (`T-04`), static-flow multi-page printing (`T-05`), and modal dirty-guard/stacking (`T-03a`, fixing a live double-`Escape` bug on zero-price confirmation dialogs).
3. **Zero-Latency POS Barcode & Small-Catalog Performance (`T-06`)**: Eliminates an unintended 250ms async search delay on `<= 50` item catalogs, fixes async barcode-vs-debounce races at **0ms added scan latency**, prevents edit-mode stock lockouts, and stabilizes `loadOptions` closures.
4. **Architectural Accuracy**: Splits `T-02` (`T-02a..d`) to prevent a sidebar dark-surface contrast regression; splits `T-03` (`T-03a` dirty/stack vs `T-03b` focus-trap) to isolate risk; protects `Management` and `UserPermissions` without crashing `<BrowserRouter>` via `useBlocker()`; defines explicit `<DecimalInput>` normalization rules for `٠-٩` / `۰-۹` / `٫`; and drops/replaces disproven `T-21`.

---

## 2. Confirmed Findings

Every finding below is directly verified in the current repository source files:

### Critical Defects (Blocking / Silent Failure / Contrast Breakage)
- **`modals.css:259-264` — Invisible mobile modal title**: On viewports `<= 760px`, `.account-statement-modal .modal-head` overrides `.modal-head` background to `var(--card)` (`#ffffff`) while `.modal-title` inherits white ink (`#fff`).
- **`InvoiceForm.tsx:455` & `WarehouseTransferForm.tsx:280` — Silent submission abort**: Pending entry quantities clamped to available stock call `if (adjusted) return;` with **no alert, toast, or row highlight**, leaving cashiers wondering why Save did nothing.
- **`Modal.tsx:14-21` & `InvoiceForm.tsx:626-638` — Nested modal `Escape` double-close**: Opening `confirmZeroPriceOpen` (`ConfirmDialog` inside `DocumentListPage`'s `<Modal>`) registers two competing `document` `keydown` listeners without stack arbitration; pressing `Escape` dismisses both dialogs, risking lost draft context. (`DocumentListPage.tsx:211-230` manually avoids this only for delete confirmations.)
- **`account-statement.css:148-169` & `modals.css:22-25` — Broken non-statement printing & Chromium clipping**: Statement print rules use `body * { visibility: hidden !important; }` + `position: absolute`, reserving blank pages for long lists behind modals, while `.modal { overflow: hidden }` / `position: fixed` clips multi-page documents and hides `.modal-head` without providing a printed title header for Invoices, Receipts, or Transfers.
- **`base.css:85-87` — Incomplete `prefers-reduced-motion`**: Disables `transition-duration` and `scroll-behavior`, but leaves CSS `@keyframes` animations (`modalPopIn`, `skeletonShimmer`, fade animations) running continuously.

### High-Impact Interaction & Performance Findings
- **`InvoiceItemsTable.tsx:105`, `WarehouseTransferForm.tsx:402`, `ReceiptForm.tsx:278` + `SearchableSelect.tsx:63,170`**: Small stores (`<= 50` items) pass both `options` and unconditional inline `loadOptions` callbacks. Because `SearchableSelect` checks `Boolean(loadOptions)`, every search hits a 250ms `setTimeout` + re-fetches on every parent render due to `loadOptions` in `useEffect` deps.
- **`SearchableSelect.tsx:199-209` — Barcode vs Async Debounce Race & Disabled Arrows**: In `> 50` item mode, a fast hardware barcode scan (`code` + `Enter` in `< 20ms`) can execute `handleKeyDown` before the effect sets `loadingAsync = true`, selecting stale `filteredOptions[0]` instead of calling `onBarcodeScan`. Also `ArrowDown`/`ArrowUp` can land on disabled items, and naive `isOut` stock disabling (`masterDataQueries.ts:103-106`) locks out currently held `editingLines` quantities in Edit mode.
- **`InvoiceForm.tsx:124-130,169-177` & `CashBoxTransferForm.tsx:322`**: Switching away from a cash customer or changing accounts can mishandle `paid` defaults in credit/edit flows, and `CashBoxTransferForm` omits `isDestOverdraft` from `saveDisabled`.
- **`PickerInput.tsx:62,124` & `18 <input type="number">` controls**: `PickerInput` strips non-ASCII digits before parsing (breaking `٠-٩` keyboard entry), and `.date-picker-trigger` has `tabIndex={-1}`. Furthermore, 18 `<input type="number">` elements across 10 files reject Eastern Arabic numerals (`٠-٩`) in the browser before React `onChange` even executes.
- **`SortableHeader.tsx` & `DocumentTable.tsx`**: `SortableHeader` uses clickable `<th>` without native `<button type="button">`; `DocumentTable` rows use `tr[tabIndex={0}]` rather than link/button record-number semantics; `InvoiceTable` carries unused `_partyHeader`.
- **`UserPermissions.tsx:849`, `tokens.css:2`, `tables.css:219-231,460-466`, `invoice-form.css:1265-1276`, `permissions.css:234-247`**: Multiple controls fail WCAG 2.2 AA (`24×24`) or become invisible on touch (`opacity: 0` `.erp-row-actions`, `20px` `"الكل"` inline button, `22px` `.date-picker-trigger` locked inside `--table-date-width: 100px`).
- **`layout.css:151-181` vs Light Surfaces**: `#94a3b8` fails AA on white backgrounds (`invoice-form.css:534`, etc.), whereas sidebar `.nav-icon`/`.nav-chevron` sit on dark `--primary: #2e425c` (where switching to `var(--muted)` `#64748b` would collapse contrast to ~2.1:1).
- **`useCompleteStatement.ts:20`**: `load()` immediately calls `reset()`, wiping visible rows on date changes or failed refreshes.
- **`Management.tsx` & `UserPermissions.tsx` vs `App.tsx:70`**: Neither full-page editor has dirty-navigation guards; `App.tsx` renders `<BrowserRouter>`, making React Router's `useBlocker()` crash if invoked.
- **`QuickActions.tsx:16-19`**: Shows quick-create cards without strictly requiring `.create` permission (showing to `.view`-only users).
- **`AccountOpeningTab` (`accountOpeningBalance.ts:12`), `StockOpeningTab.tsx:53`, `ItemBalancesTab`, `WarehouseTransferForm.tsx:424`**: Technical accounting terms (`"مدين"`/`"دائن"`) instead of plain `"لنا عنده"`/`"له عندنا"`, naive `0`-balance sign toggle dirtying, inconsistent `warehouses[0]` fallback instead of `resolveDefaultWarehouse`, missing `entryAsyncOption` in transfers, and single-line `<input>` notes in `CashBoxTransferForm.tsx:307`.
- **Previously Suspected Defect — Disproven**: Original `T-21` claimed async `> 50` item dropdowns lacked warehouse stock quantities. Verified in `src/lib/masterDataQueries.ts:78-115` that `searchWarehouseItemsAsync` already queries `v_warehouse_items` (`current_qty`) and renders `— متاح: X وحدة` identically to small catalogs.

---

## 3. Security Findings and Their Verification Status

Strict separation between **already verified database protections**, **confirmed exploitable RLS over-broadening**, and **deep-link authorization gaps**.

| ID / Area | Target / Evidence | Verification Status | Exact Technical Behavior Verified | Remediation Assignment |
|---|---|---|---|---|
| **Tenant Isolation & `anon`** | `0001_schema.sql:311-324`, `0004_receipts.sql:19-35`, `0022:68-72`, `0058`, `0080` | **Protected (Verified)** | All business tables enforce `company_id = public.current_company_id()` with `anon` revoked; all `v_*` views use `with (security_invoker = true)`. Cross-company access via `?doc=` is impossible. | Keep covered by regression SQL tests |
| **Document Write RPCs** | `0057_document_action_permissions.sql:3-77` | **Protected (Verified)** | Direct `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on `invoices`, `invoice_items`, `receipts`, `warehouse_transfers`, `warehouse_transfer_items`, `cash_box_transfers` are revoked from `authenticated`. All write RPCs verify `require_permission('<domain>.<kind>.<action>')`. | No gap found |
| **Document List, KPI & Filter RPCs** | `0063:112-145,316-319`, `0066:78-164`, `0067` | **Protected (Verified)** | `get_document_page`, `get_invoice_page`, `get_invoice_kpis`, `filter_invoice_rows`, `filter_receipt_rows` are `SECURITY DEFINER` and call `require_permission('goods.' \|\| p_kind \|\| '.view')` / `'money.' \|\| p_kind \|\| '.view'`. | No gap found |
| **Cost / Profit / Item Cost Masking** | `0058:85-126`, `0080`, `0081` | **Protected (Verified)** | `can_view_profit()` and `can_view_purchase_price()` mask `cost_total`, `profit_total`, `unit_cost`, and `items.purchase_price` in views & RPCs. | No gap found |
| **SEC-F1: Invoice & Receipt RLS Wildcard Broadening** | `0057:80-96` + `0080:46-49` + `GRANT SELECT` on `v_invoice_list`, `v_invoice_items`, `v_receipt_list` | **CONFIRMED EXPLOITABLE (Same-Company Privilege Escalation)** | `has_permission('balances.view')` matches **any** `balances.%.view` permission (e.g., `balances.customers.view` only) under `0080:46-49`. Because `invoices_permissions` (`0057:85`) and `receipts_permissions` (`0057:96`) include `or has_permission('balances.view') or has_permission('management.view')`, an employee with **only `balances.customers.view`** can run a direct PostgREST `SELECT` on `v_invoice_list`, `v_invoice_items` (seeing **supplier `purchase` invoice `unit_price`**, returns, waste), and `v_receipt_list` (`out` supplier/expense receipts), bypassing `get_document_page` denial. | **`SEC-01` (Phase 0 — Immediate P0 Security)** |
| **SEC-F2: Transfer Table RLS Lacks Granular Kind Specificity** | `0035:133-136` + `0080:46-49` | **CONFIRMED EXPLOITABLE (Same-Company Privilege Escalation)** | `warehouse_transfers` / `warehouse_transfer_items` policies check `has_permission('goods.view')` and `cash_box_transfers` checks `has_permission('money.view')` (never updated in `0057`). Under `0080:46-49`, a cashier with **only `goods.sale.view`** satisfies `goods.view` and can directly `SELECT` `warehouse_transfers` / `v_warehouse_transfer_list`; a cashier with **only `money.in.view`** satisfies `money.view` and can directly `SELECT` `cash_box_transfers` / `v_cash_box_transfer_list`. | **`SEC-02` (Phase 0 — Immediate P0 Security)** |
| **SEC-F3: Single-Doc Deep Link & Linked Receipt Policy** | `Invoices.tsx:556`, `Receipts.tsx:364`, `0057:94-95`, `0080:1316-1430,1708-1760` | **Design & Policy Verification Item** | 1) Direct single-doc fetches (`Invoices.tsx:556`, `Receipts.tsx:364`) hit `v_invoice_list` / `v_receipt_list` directly (inheriting `SEC-F1`). Re-routing `?doc=<id>` resolution through a `SECURITY DEFINER` `get_document_detail` RPC avoids relying on direct view queries and enforces `.view` + clean `deleted_at` semantics. 2) `receipts_permissions:94-95` explicitly allows reading any receipt whose `invoice_id` points to a readable invoice (e.g. a salesperson viewing a sale's payment receipt). **Owner decision needed** on whether linked invoice receipts stay visible without `money.*.view`. 3) Statement RPCs (`get_account_statement`, `get_item_movement_statement`) currently omit `doc_id` UUID & `doc_kind`, blocking safe cross-document routing on returns/مقاصة without `T-09b`. | **`T-09b` (Phase 4 Feature + DB RPC, gated on `SEC-01`/`SEC-02`)** |

---

## 4. Final Task Register

Tasks are split cleanly into **Security (`SEC-*`)** and **UX/UI (`T-*`)** tracks. Sizes: **S** (<= 0.5 day), **M** (0.5–1.5 days), **L** (2–3 days).

### Track A — Database Security Hardening (Immediate Phase 0)

| Task ID | Finding Refs | Scope Summary | Affected Files | Dependencies | Priority | Size | Risk |
|---|---|---|---|---|---|---|---|
| **SEC-01** | SEC-F1 | New timestamped SQL migration tightening `invoices_permissions` and `receipts_permissions`: replace overly broad `has_permission('balances.view')` / `'management.view'` fallback after verifying all balance/statement RPCs are `SECURITY DEFINER` (they run as definer, not invoker); clarify/retain linked-receipt clause (`0057:94-95`) per owner sign-off; add pg/SQL isolation + employee denial tests (`balances.customers.view` cannot `SELECT` purchase `v_invoice_list` / `v_invoice_items` / `out` `v_receipt_list`). | `supabase/migrations/<ts>_tighten_document_view_rls.sql`, `supabase/tests/<num>_document_rls_strict_permissions.sql` | None | **P0 (Security)** | S | Low-Med |
| **SEC-02** | SEC-F2 | In the same or paired Phase 0 migration: tighten `warehouse_transfers_permissions`, `warehouse_transfer_items_permissions` to `goods.warehouse_transfer.*`, and `cash_box_transfers_permissions` to `money.cash_box_transfer.*` (removing wildcard `goods.view`, `money.view`, `balances.view` read fallbacks). Add SQL tests verifying `goods.sale.view` cannot read `warehouse_transfers` and `money.in.view` cannot read `cash_box_transfers`, plus company B & `anon` tests. | Same Phase 0 migration & SQL test file | None | **P0 (Security)** | S | Low |

### Track B — UX/UI Roadmap (`T-*`)

| Task ID | Scope Summary | Main Affected Files | Dependencies | Priority | Size | Risk |
|---|---|---|---|---|---|---|
| **T-01** | Mobile `AccountStatementModal` header contrast fix (remove `background: var(--card)` on `.account-statement-modal .modal-head` so `#fff` title remains legible on `--primary`). | `src/styles/components/modals.css` | None | **P0** | S | Low |
| **T-04** | Inline clamp notice (using existing `.alert.warning`) + highlight/scroll adjusted row keyed by `item_id` when pending line auto-adjusts on submit in **both** `InvoiceForm` (`L455`) and `WarehouseTransferForm` (`L280`). | `src/components/InvoiceForm.tsx`, `src/components/WarehouseTransferForm.tsx`, `src/components/invoice-form/InvoiceItemsTable.tsx`, `src/components/invoice-form/InvoiceSummarySidebar.tsx` | None | **P0** | S | Low |
| **T-03a** | Centralized `Modal` dirty guard (`isDirty` normalized snapshot comparison / pure predicate — zero `cash_customer` or default cashbox false positives) + `createPortal(..., document.body)` sibling rendering + module-level `modalStack` so only the topmost modal handles `Escape` & backdrop clicks (fixes live `confirmZeroPriceOpen` double-`Escape` bug). Removes ad-hoc nesting conflicts in callers. | `src/components/Modal.tsx`, `src/components/ConfirmDialog.tsx`, `src/components/DocumentListPage.tsx`, `src/components/InvoiceForm.tsx`, `src/components/ReceiptForm.tsx`, `src/components/WarehouseTransferForm.tsx`, `src/components/CashBoxTransferForm.tsx`, MasterData modals | None | **P0** | M | Med |
| **T-05** | Static-flow `@media print` architecture (`src/styles/print.css`): replace `visibility: hidden` + `position: absolute` with `display: none` chrome hiding and static block flow; reset `overflow: hidden`/`max-height`; per-document print layouts (keep light `.modal-head` on Invoices/Receipts/Transfers, keep hidden on Statements; stack `.invoice-two-parts-layout`; hide `المتاح بالمصدر` in read-only Warehouse Transfer printouts); unstick `thead` (`table-header-group`) + `break-inside: avoid`. | `src/styles/print.css` (new), `src/index.css`, `src/styles/pages/account-statement.css`, `src/components/WarehouseTransferForm.tsx`, `src/components/Modal.tsx` (print modal marker class if needed) | None | **P0** | M | Med |
| **T-02a** | Complete `prefers-reduced-motion` rule to disable `@keyframes` `animation-duration` & `animation-iteration-count` cleanly. | `src/styles/base.css` | None | **P1** | S | Low |
| **T-02b** | Global `:focus-visible` ring normalization (`base.css`), verified against `.modal-head .icon-btn:focus-visible`, buttons, inputs, and RTL focus outlines. | `src/styles/base.css`, `src/styles/components/modals.css` | None | **P1** | S | Med |
| **T-06** | `SearchableSelect` reliability & speed overhaul: assign `loadOptionsRef.current = loadOptions` and drop `loadOptions` from `useEffect` deps; pass `loadOptions={items.length > 50 ? ... : undefined}` in all 3 callers (restores `0ms` sync search for `<= 50`); add `requestIdRef` for out-of-order responses; track `resolvedQuery` synchronously so barcode `Enter` calls `onBarcodeScan` in **`0ms` latency** without picking stale options; skip disabled options on arrow keys; add back `editingLines` qty before marking Edit-mode options `disabled`. | `src/components/SearchableSelect.tsx`, `src/styles/components/forms.css`, `src/components/invoice-form/InvoiceItemsTable.tsx`, `src/components/WarehouseTransferForm.tsx`, `src/components/ReceiptForm.tsx` | None | **P1** | M | Med |
| **T-07** | Keyboard-accessible `SortableHeader` (`<button type="button">` inside `<th>`) and focusable `PickerInput` calendar trigger (remove `tabIndex={-1}`, preserve click-to-open). | `src/components/SortableHeader.tsx`, `src/components/PickerInput.tsx`, `src/styles/components/tables.css` | `T-02b` | **P1** | S | Low |
| **T-08** | Touch visibility & coarse hit areas: show `.erp-row-actions` under `@media (hover: none)` and expand `.row-actions-trigger-btn` (`36×36px` visual + transparent `44×44px` `::after` hit target under `pointer: coarse` without inflating table rows). | `src/styles/components/tables.css` | None | **P1** | S | Low |
| **T-03b** | Accessible `Modal` Tab focus trap (aware of nested top-stack `ConfirmDialog` + `document.body`-portaled `.searchable-select-options` popovers), `aria-labelledby` wiring, and safe `previousFocus.isConnected` return focus on close. | `src/components/Modal.tsx`, `src/styles/components/modals.css` | `T-03a` | **P1** | M | Med |
| **T-09a** | Frontend cross-document deep-linking: read `?doc=` / `?search=` on `/invoices` and `/receipts` with explicit `kind` normalization, `deleted_at` handling (warning/unavailable toast + URL param strip, respecting `.delete` restore permission), and make `InvoiceSummarySidebar` `.linked-receipt-badge` interactive linking to the paired Receipt + preserve Receipt -> Invoice link parity (`ReceiptTable` / `ReceiptForm`). | `src/pages/Invoices.tsx`, `src/pages/Receipts.tsx`, `src/components/invoice-form/InvoiceSummarySidebar.tsx`, `src/components/ReceiptForm.tsx`, `src/pages/receipts/ReceiptTable.tsx` | None (or UI works cleanly; deep single-doc RLS fetch completed in `T-09b`) | **P1** | M | Med |
| **T-10** | Auto-load statements when modal opens or valid date range updates; fix `useCompleteStatement.ts:20` so `load()` preserves visible rows while fetching (`preserveRows`) instead of calling `reset()` immediately, resetting only on entity switch or close. | `src/lib/useCompleteStatement.ts`, `src/components/AccountStatementModal.tsx`, `src/pages/balances/AccountBalancesTab.tsx`, `src/pages/balances/ItemBalancesTab.tsx`, `src/pages/balances/CashBoxBalancesTab.tsx` | `T-01` (legible mobile statement header before widening auto-loads) | **P1** | M | Low |
| **T-11** | Full-page `Management` opening balance UX + dirty-navigation protection: replace `"مدين"`/`"دائن"` with `"لنا عنده"`/`"له عندنا"` in `AccountOpeningTab` (direction normalized via signed numeric equivalence in `accountOpeningBalance.ts` so toggling `0.00` rows never triggers false dirty state); add sticky save bar; protect tab switches & sidebar navigation via `beforeunload` + `ConfirmDialog` + `NavigationGuardContext` in `Layout.tsx` (NO `useBlocker()`). | `src/pages/Management.tsx`, `src/pages/management/AccountOpeningTab.tsx`, `src/pages/management/StockOpeningTab.tsx`, `src/pages/management/CashBoxOpeningTab.tsx`, `src/lib/accountOpeningBalance.ts`, `src/components/NavigationGuardContext.tsx` (or lightweight hook/context), `src/components/Layout.tsx` | `T-03a` (shared `ConfirmDialog` portal behavior) | **P1** | L | Med |
| **T-12** | MasterData operational consistency: propagate `saving` lock / `<fieldset disabled={saving}>`, add deactivation `ConfirmDialog` naming the entity, and normalize active status toggle parity across Items, Warehouses, CashBoxes, Accounts. | `src/pages/master-data/AccountsTab.tsx`, `src/pages/master-data/ItemsTab.tsx`, `src/pages/master-data/WarehousesTab.tsx`, `src/pages/master-data/CashBoxesTab.tsx` | `T-03a` | **P1** | M | Low |
| **T-13** | Cash-to-credit payment guard + transfer overdraft lock: track `paidSourceRef: 'auto_cash' \| 'manual' \| 'saved'` in `InvoiceForm` so switching auto-cash to credit resets `paid` to `0.00` while preserving manual/saved partial payments in Edit mode; include `isDestOverdraft` in `CashBoxTransferForm.tsx:322` `saveDisabled`. | `src/components/InvoiceForm.tsx`, `src/components/CashBoxTransferForm.tsx` | None | **P1** | S | Low |
| **T-09b** | Permission-guarded `get_document_detail(p_scope, p_doc_id)` RPC (`SECURITY DEFINER`, enforcing `current_company_id()` and exact `goods.<kind>.view` / `money.<direction>.view` / transfer view perm, checking `deleted_at` + `.delete` permission); extend statement RPCs (`get_account_statement`, `get_item_movement_statement`, `get_cash_box_statement`) to emit `doc_id` UUID & `doc_kind` text so clicking any statement row (including returns/مقاصة) routes accurately; add SQL & UI tests. | `supabase/migrations/<ts>_document_detail_and_statement_links.sql`, `supabase/tests/<num>_document_detail_and_statement_links.sql`, `src/lib/types.ts`, `src/pages/Invoices.tsx`, `src/pages/Receipts.tsx`, `src/components/AccountStatementModal.tsx` | `SEC-01`, `SEC-02`, `T-09a` | **P2** | L | Med |
| **T-02c** | Additive semantic tokens (`--danger-ink`, `--success-ink`, `--warning-ink`, `--info*`, `--input-border`, `--sidebar-muted: #cbd5e1`) + surface-aware `#94a3b8` contrast fix (`var(--muted)` on light surfaces, `--sidebar-muted` on dark sidebar `.nav-icon` / `.nav-chevron` in `layout.css`). | `src/styles/tokens.css`, `src/styles/layout.css`, `src/styles/pages/invoice-form.css`, `src/styles/components/cards.css`, `src/styles/pages/permissions.css` | None | **P2** | S | Low |
| **T-14** | Enforce strict `.create` permission check on `QuickActions.tsx:16-19` cards so `.view`-only users do not see broken Create shortcuts. | `src/pages/home/QuickActions.tsx` | None | **P2** | S | Low |
| **T-15** | Default selection & transfer metadata parity: use `resolveDefaultWarehouse` in `ItemBalancesTab` and `StockOpeningTab` (`L53`); add `entryAsyncOption` metadata parity to `WarehouseTransferForm.tsx:424`. | `src/pages/balances/ItemBalancesTab.tsx`, `src/pages/management/StockOpeningTab.tsx`, `src/components/WarehouseTransferForm.tsx` | `T-06` | **P2** | S | Low |
| **T-16** | Loading, empty state & active filter parity: reduced-motion-safe skeleton shimmer + `<SkeletonRows>` / `<EmptyState>` / `<StatusBadge>` across 6 Balance & Management tabs + removable active-filter badge on `DocumentListToolbar`. | `src/styles/components/loading-skeleton.css`, `src/components/DocumentListToolbar.tsx`, `src/pages/balances/*`, `src/pages/management/*` | `T-02a`, `T-02c` | **P2** | M | Low |
| **T-17** | Permission workspace polish, target sizing & date column width: replace inline `minHeight: '20px'` (`UserPermissions.tsx:849`) with `.btn.sm`; add unsaved-changes banner & user-switch/navigation guard (`NavigationGuardContext`); bump `--table-date-width: 112px` alongside `.date-picker-trigger` (`26px` + `32px` hit area) so `dd/mm/yyyy` does not clip; bump `.btn-paid-quick` & `.preset-chip-btn` (`30px` / `36px` coarse). | `src/components/UserPermissions.tsx`, `src/styles/tokens.css`, `src/styles/components/tables.css`, `src/styles/pages/invoice-form.css`, `src/styles/pages/permissions.css`, `src/components/Layout.tsx` | `T-02c`, `T-11` (shares `NavigationGuardContext` if built first) | **P2** | S | Low |
| **T-18** | Input ergonomics & numeral normalization: `normalizeDigits()` (`٠-٩`/`۰-۹` -> `0-9`, `٫` -> `.`), applied in `PickerInput.tsx:62`, `InvoiceForm.tsx:582` (`paid`), `search.ts:14`, `SearchableSelect` query/barcode; `<PasswordInput>` toggle on Auth; `<textarea>` notes on `CashBoxTransferForm.tsx:307`; plus **`<DecimalInput>` migration across the 18 `<input type="number">` fields pending owner approval** (Section 8.5 & Unresolved Decisions). | `src/lib/format.ts`, `src/lib/search.ts`, `src/components/PickerInput.tsx`, `src/components/SearchableSelect.tsx`, `src/components/InvoiceForm.tsx`, `src/components/CashBoxTransferForm.tsx`, `src/components/PasswordInput.tsx` (new), Auth pages, + 10 decimal-input files if `<DecimalInput>` approved | None | **P2** | M (L if 18 `<DecimalInput>` migrated) | Low-Med |
| **T-19** | **[Owner Approval Needed]** Sidebar multi-open section persistence (`Layout.tsx`) replacing single-open accordion, persisted per-user in `localStorage`. | `src/components/Layout.tsx` | None | **P2** | S | Low |
| **T-20** | Table `<button>` record-number focus semantics in `DocumentTable.tsx` + dead CSS/prop cleanup (formerly `T-02d` duplicate `.line-delete-btn` in `invoice-form.css`, unused `_partyHeader` in `InvoiceTable.tsx`). | `src/components/DocumentTable.tsx`, `src/pages/invoices/InvoiceTable.tsx`, `src/styles/pages/invoice-form.css` | `T-03b` | **P3** | S | Med |
| **T-21b** | **[Optional Visual Polish]** Move `SearchableSelect` availability suffix (`— متاح: X وحدة`) into `SearchOption.sublabel` consistently for both `<= 50` and `> 50` item lists. | `src/components/SearchableSelect.tsx`, `src/lib/masterDataQueries.ts`, `src/components/invoice-form/InvoiceItemsTable.tsx`, `src/components/WarehouseTransferForm.tsx` | `T-06` | **P3** | S | Low |

---

## 5. Final Priorities

Priority assignment weighs: **(1) Tenant/role authorization integrity, (2) Monetary/stock correctness & silent failure prevention, (3) Cashier daily POS throughput, (4) WCAG/mobile operability, (5) Regression isolation.**

- **P0 Security (`SEC-01`, `SEC-02`)**: Highest urgency in the security track because authenticated same-company employees with narrow permissions (e.g. `balances.customers.view` or `goods.sale.view`) can currently read broader document tables/views via direct PostgREST queries. Zero UI impact; requires migration + SQL boundary tests + production apply.
- **P0 UX/UI (`T-01`, `T-04`, `T-03a`, `T-05`)**:
  - `T-01`: Fixes literally invisible statement modal titles on mobile viewports (1-line CSS fix).
  - `T-04`: Eliminates silent save failures during stock clamping in both Sales Invoices and Warehouse Transfers.
  - `T-03a`: Eliminates accidental closing of dirty forms AND fixes the live `Escape` double-close defect on `confirmZeroPriceOpen`.
  - `T-05`: Restores clean A4 multi-page printing for invoices, receipts, transfers, and statements.
- **P1 (`T-02a`, `T-02b`, `T-06`, `T-07`, `T-08`, `T-03b`, `T-09a`, `T-10`, `T-11`, `T-12`, `T-13`)**: Critical usability, keyboard accessibility, touch visibility, POS speed (`<=50` sync + `0ms` barcode), auto-loading statements, plain-Arabic opening balances with route guards, MasterData save locks, and cash-to-credit/overdraft money safeguards.
- **P2 (`T-09b`, `T-02c`, `T-14`, `T-15`, `T-16`, `T-17`, `T-18`, `T-19`*)**: Deep-link backend RPC & statement IDs (elevated from UI guess to hardened DB RPC, safe behind `SEC-01`/`SEC-02`!), semantic/dark-sidebar contrast tokens, permissions & date-width polish, `<DecimalInput>` / Arabic digit normalization, and sidebar multi-open persistence (`T-19` gated on owner approval).
- **P3 (`T-20`, `T-21b`*)**: Clean table semantics refactor, dead CSS removal (`T-02d`), and optional sublabel visual styling.

---

## 6. Dependency Map

Recalculated strictly from real code and schema dependencies (removing false links such as `T-04 -> T-02` and `T-10 -> T-01` technical blocks, while retaining `T-01` ordering hygiene ahead of `T-10`):

```
[Phase 0 — DB Security Track]
  SEC-01 (Tighten invoices & receipts RLS) ──┐
  SEC-02 (Tighten transfers RLS)           ──┼──> T-09b (Deep-link detail RPC + statement doc_id/doc_kind)
                                             ▲
[Phase 1–3 — Frontend Tracks]                │
  Independent Fast Track: T-01, T-04, T-05, T-02a, T-02b, T-08, T-13, T-14, T-02c
    │
    ├── T-01 ──> T-10 (Statement auto-load + preserveRows; visually depends on legible mobile header)
    ├── T-02a + T-02c ──> T-16 (Reduced-motion skeletons + 6 tabs + filter pill)
    ├── T-02b ──> T-07 (Keyboard SortableHeader button + PickerInput focus trigger)
    │
    ├── T-03a (Modal Dirty Guard + Portal + modalStack)
    │     ├──> T-03b (Tab Focus Trap + aria-labelledby + Return Focus) ──> T-20 (Table button semantics + T-02d)
    │     ├──> T-11 (Management plain opening labels + signed dirty + NavigationGuardContext)
    │     │      └──> T-17 (UserPermissions guard + .btn.sm + --table-date-width: 112px; also needs T-02c)
    │     └──> T-12 (MasterData saving locks + deactivation ConfirmDialog)
    │
    ├── T-06 (SearchableSelect <=50 sync + 0ms barcode + requestIdRef + edit stock)
    │     ├──> T-15 (Default warehouse parity + WarehouseTransferForm entryAsyncOption)
    │     └──> T-21b (Optional sublabel stock display)
    │
    ├── T-09a (Frontend ?doc= / ?search= + Invoice <-> Receipt links) ──────┘ (feeds T-09b)
    ├── T-18 (Numeral normalization + PasswordInput + CashTransfer textarea + [?DecimalInput])
    └── T-19* (Sidebar multi-open persistence — Owner Choice)
```

---

## 7. Implementation Phases

Each phase ships independently verifiable, reversible commits with full verification gates before advancing.

1. **Phase 0 — Immediate Database Security Hardening (`SEC-01`, `SEC-02`)**
   - Single timestamped SQL migration tightening RLS policies on `invoices`, `receipts`, `warehouse_transfers`, `warehouse_transfer_items`, and `cash_box_transfers`, accompanied by SQL isolation/role-denial tests (`supabase/tests/`).
   - Must pass `node supabase/tests/run-local.mjs` and owner approval before production migration push.
2. **Phase 1 — Zero-DB Critical Safety, Print & A11y Foundations (`T-01`, `T-04`, `T-05`, `T-02a`, `T-02b`)**
   - Low-dependency, high-impact frontend fixes: mobile statement contrast (`T-01`), invoice + transfer clamp feedback (`T-04`), static-flow `@media print` (`T-05`), reduced-motion `@keyframes` (`T-02a`), and `:focus-visible` (`T-02b`).
3. **Phase 2 — Shared Interaction & Input Primitives (`T-03a`, `T-03b`, `T-06`, `T-07`, `T-08`, `T-18`)**
   - Deploy `T-03a` (dirty guard + portal `modalStack`) and `T-03b` (Tab trap + return focus) as **two separate PRs** so focus-trap edge cases never block urgent data-loss protection.
   - Ship `SearchableSelect` (`T-06`), keyboard sorting/date triggers (`T-07`), coarse touch hit boxes (`T-08`), and numeral normalization / password toggle / transfer textarea (`T-18`, plus `<DecimalInput>` if approved).
4. **Phase 3 — Operational & MasterData Workflows (`T-09a`, `T-10`, `T-11`, `T-12`, `T-13`, `T-14`, `T-15`)**
   - Ship cash-to-credit/overdraft protections (`T-13`), frontend cross-links (`T-09a`), auto-loading statements without wiping rows (`T-10`), plain-Arabic opening balances + `Management` route dirty guard (`T-11`), MasterData save/deactivate consistency (`T-12`), strict QuickActions `.create` visibility (`T-14`), and default warehouse/metadata parity (`T-15`).
5. **Phase 4 — Deep-Link RPC & Visual System Parity (`T-09b`, `T-02c`, `T-16`, `T-17`)**
   - New SQL migration for `get_document_detail` + statement `doc_id`/`doc_kind` (`T-09b`) with full SQL & frontend tests; semantic + dark-sidebar contrast tokens (`T-02c`); skeleton/empty-state parity & filter chips (`T-16`); `UserPermissions` guard & `--table-date-width: 112px` fix (`T-17`).
6. **Phase 5 — Owner-Gated Polish & Cleanup (`T-19`*, `T-20`, `T-21b`*)**
   - Sidebar persistence (`T-19` once approved), `DocumentTable` semantic `<button>` cleanup + dead CSS removal (`T-20`, absorbing `T-02d`), and optional stock sublabel styling (`T-21b`).

---

## 8. Technical Specifications

### 8.1 Modal Stacking, Portals, Focus Management & Dirty Guard (`T-03a`, `T-03b`)
- **Portal & Sibling Stacking (`createPortal`)**:
  - Render `<Modal>` via `createPortal(..., document.body)` instead of inline inside `.modal-body` / `<form>`.
  - Nested `<ConfirmDialog>` instances (e.g., `InvoiceForm` `confirmZeroPriceOpen`, MasterData deactivation confirms, dirty-close prompt) become direct **DOM siblings** on `document.body`, escaping `.modal { overflow: hidden }` clipping and `.modalPopIn` `transform` stacking contexts.
- **Module-Level `modalStack` Arbitration**:
  - Maintain `const modalStack: symbol[] = []` in `Modal.tsx` (`onOpen` pushes token at mount; cleanup removes it on unmount).
  - Helper `isTopModal(id)` controls **all** global listeners: ONLY the topmost modal responds to `Escape` keydown and `.modal-backdrop` mouse/pointer down. Closing the top `ConfirmDialog` removes its token, seamlessly returning `Escape` ownership to the parent modal without closing both.
- **Centralized Dirty Guard (`T-03a` — No Duplication Across 11 Callers)**:
  - Add optional `isDirty?: boolean` and `dirtyConfirmMessage?: string` props to `<Modal>` (centralizing the discard `ConfirmDialog` once inside `Modal.tsx`, rather than duplicating confirmation hooks in 11 callers).
  - When `onClose` is triggered via Escape, backdrop click, or the `×` header button while `isDirty === true`, `<Modal>` renders its internal discard `<ConfirmDialog>` (pushed above it on `modalStack`) and blocks dismissal unless confirmed. Explicit **Save** / **Cancel-reset** programmatic closes call parent handlers directly after clearing dirty state.
  - **Eliminating False Positives on Auto-Fill**: New document forms trigger initial defaults via `useEffect` (`InvoiceForm` `cash_customer` auto `paid = total`; `ReceiptForm` `resolveDefaultCashBox`). Initialize/compute `isDirty` only *after* `MasterDataGate` finishes loading and via normalized value predicates (e.g. for new Invoice: `lines.length > 0 || Boolean(entryItemId) || notes.trim() !== '' || date !== initialDate || warehouseId !== initialWarehouseId || accountId !== initialAccountId || (!isCashCustomer && paidNumber > 0)`), and reset baseline on `handleResetNew`.
- **Tab Focus Trap, `aria-labelledby`, and Return Focus (`T-03b`)**:
  - Auto-generate `useId()` for `.modal-title` (`id={titleId}`) and set `aria-labelledby={titleId}` on `role="dialog" aria-modal="true"`.
  - Capture `previousFocus = document.activeElement as HTMLElement | null` on open; on close, restore `if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })`, falling back gracefully if the trigger row was deleted/paginated.
  - Only the topmost modal intercepts `Tab` / `Shift+Tab`. Wait for **external portaled popovers**: allow focus to remain inside `.searchable-select-options` (rendered at `document.body`) if the active element belongs to an open dropdown triggered from within the top modal, cycling cleanly within the top modal's focusable elements (`a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])`) plus its active portaled menu.

### 8.2 Full-Page Dirty Navigation Protection (`Management.tsx` & `UserPermissions.tsx`)
- **Router Constraint**: `src/App.tsx:70` uses `<BrowserRouter>`, **not** `createBrowserRouter`. Calling React Router's `useBlocker()` throws a runtime exception and is prohibited here.
- **3-Layer Safe Architecture**:
  1. `beforeunload` listener registered only when `dirtyCount > 0` (Management) or `hasUnsavedChanges` (UserPermissions).
  2. Internal view switches (switching tabs inside `Management.tsx` or switching employees inside `UserPermissions.tsx`) intercept changes with `<ConfirmDialog>` before mutating active tab/user state.
  3. Lightweight `NavigationGuardContext` (`registerGuard(id, () => boolean)` / `confirmNavigationIfDirty(): Promise<boolean>`) consumed by `Layout.tsx` sidebar/header `<NavLink>` click handlers, blocking intra-app route changes until the user confirms discard.

### 8.3 `SearchableSelect`, `<= 50` Synchronous Speed & `0ms` Barcode Scan (`T-06`)
- **`<= 50` Synchronous Preservation**:
  - `InvoiceItemsTable.tsx:105`, `WarehouseTransferForm.tsx:402`, and `ReceiptForm.tsx:278` MUST pass `loadOptions={items.length > 50 ? loadItemOptions : undefined}` so `SearchableSelect`'s `isAsync = Boolean(loadOptions)` stays `false` for small stores (0ms local filtering, zero RPC delay, zero unneeded network traffic).
- **Stable Closures & Race Prevention (`> 50` Async Mode)**:
  - Store latest callback in `loadOptionsRef.current = loadOptions` synchronously on render; remove `loadOptions` from the `useEffect` dependency array (`[isAsync, open, query]`).
  - Maintain `requestIdRef.current += 1` per issued async request and ignore stale resolutions alongside cleanup `active = false`.
- **Synchronous `resolvedQuery` for Zero-Added-Latency Barcode Scan**:
  - Maintain `resolvedQuery` state updated when `loadOptions(activeQuery)` finishes.
  - Because React updates `query` immediately inside input `onChange`, `query !== resolvedQuery` is **synchronously `true`** on the subsequent `Enter` keydown (no effect-timing gap!).
  - **`Enter` Resolution Algorithm (0ms barcode latency)**:
    1. If `open && activeIndex >= 0` and `!filteredOptions[activeIndex]?.disabled` -> select `filteredOptions[activeIndex]`.
    2. Else if `isAsync && query !== resolvedQuery`: **NEVER auto-select stale `filteredOptions[0]`**. If `onBarcodeScan && currentQuery`: cancel pending 250ms debounce timer and invoke `onBarcodeScan(currentQuery)` **immediately (0ms)**.
    3. Else (`!isAsync` or `query === resolvedQuery` finished cleanly): pick first enabled `filteredOptions[0]` if any; else invoke `onBarcodeScan(currentQuery)` immediately.
- **Disabled Option Navigation & Edit-Mode Held Stock**:
  - `ArrowDown` / `ArrowUp` skip options where `option.disabled === true`.
  - When computing stock availability for dropdown disabling (`InvoiceItemsTable`, `WarehouseTransferForm`), **add back quantities already held on `editingLines` for the same `item_id` & `warehouse_id`** before setting `disabled: true`, preventing false lockouts when editing an invoice whose item stock subsequently dropped to `0`.

### 8.4 Print Architecture & Per-Document Layouts (`T-05`)
- **Core Rule (`src/styles/print.css`)**: Abandon `visibility: hidden` + `position: absolute`. Use `display: none !important` on UI chrome and reset document containers to `display: block !important; position: static !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; box-shadow: none !important;`.
- **Chrome Hidden Globally on Print**:
  - `.app > .topbar`, `.sidebar`, `.page-head`, `.tabs`, `.erp-kpi-bar`, `.document-list-toolbar`, `.erp-sales-workspace`, `.erp-list-panel`, `.erp-workspace > :not(.modal-backdrop)`, `.toast-container`, `.modal-head .icon-btn`, `.entry-line-row`, `.line-remove`, `th.w-action`, `.paid-quick-actions`, `.left-actions-group`, `.row-actions-group`, `.form-modal-actions`, `.overdraft-warning-badge`, `.cashbox-balance-hint`, `.linked-receipt-box .link-ext-icon`, `.print-hidden`.
- **Multi-Page Table Integrity**:
  - Override sticky headers (`tables.css:428`) with `.table thead { position: static !important; display: table-header-group; }`.
  - Apply `break-inside: avoid` to `tr`, `.totals-box`, `.account-statement-totals`, `.account-header-card`.
- **Document-Specific Adaptation**:
  1. **Statements (`AccountStatementModal`)**: Keep `.account-statement-modal .modal-head { display: none !important; }` because `.account-statement-heading` provides the print title, party/period metadata, and printable summary.
  2. **Invoices & Warehouse Transfers (`InvoiceForm`, `WarehouseTransferForm`)**: Keep `.modal-head` **visible**, converting `--primary` background / `#fff` text to white background, `#0f172a` ink, and bottom border so every printed slip retains its document title and number. Switch `.invoice-two-parts-layout` from side-by-side grid to **1-column stacked flow** so item lines get full A4 width above payment/totals. Mark the `المتاح بالمصدر` column header & cells with `.print-hidden` on read-only Warehouse Transfers so internal stock balances do not leak onto transfer slips.
  3. **Receipts & Cash Transfers (`ReceiptForm`, `CashBoxTransferForm`)**: Render `.modal-head` in light print ink + compact party/cashbox card, amount (`dir="ltr"`), tafqeet, and notes on a clean single A4 page.

### 8.5 `<DecimalInput>` Scope & Arabic Numeral Normalization (`T-18`)
- **Verified Browser Constraint**: Simply adding `normalizeDigits()` to React `onChange` handlers **does NOT enable `٠-٩` typing** in the **18 `<input type="number">` fields across 10 files**, because browsers reject non-ASCII keystrokes inside `type="number"` natively before `onChange` fires.
- **Layer 1 (Always Included in `T-18`) — Shared Normalization Utilities + Existing Text Fields**:
  - Add pure `normalizeDigits(raw: string): string` in `src/lib/format.ts`: maps Unicode Arabic-Indic `[٠-٩]` (`U+0660–U+0669`) and Extended `[۰-۹]` (`U+06F0–U+06F9`) to ASCII `0-9`, and Arabic decimal separator `٫` (`U+066B`) to `.`. Stored/submitted numeric payloads and formatted UI outputs remain ASCII `en-US`.
  - Apply `normalizeDigits` BEFORE stripping/parsing in: `PickerInput.tsx:62` (`dd/mm/yyyy` date strings), `InvoiceForm.tsx:582` (`paid` is already `type="text" inputMode="decimal"`), `search.ts:14` (`matchesSearchQuery`), and `SearchableSelect.tsx` (query filtering / barcode lookup without altering non-numeric SKUs).
- **Layer 2 (Recommended `<DecimalInput>` Migration — Pending Owner Scope Choice)**:
  - Replace the 18 numeric inputs (`qty`, `unit_price`, `opening_balance`, `amount`, `selling_price`, etc.) with a shared `<DecimalInput>` (`type="text" inputMode="decimal"`):
    - **Allowed character filter**: after `normalizeDigits()`, allow optional leading `-` *only* if `allowNegative === true`, digits `0-9`, and at most **one** `.` with at most `maxDecimals` fractional digits (default `4`, matching Postgres `numeric(18,4)`). Reject letters/other symbols cleanly without mutating cursor unnecessarily.
    - **Interaction parity**: auto-select on focus (preserving existing `AGENTS.md` rule), accept `paste` containing `١٬٢٥٠٫٥٠` (normalize `٫` -> `.`, strip thousands comma `,`/`٬` on paste or controlled value), enforce optional `min`/`max` validation feedback consistently via shared `<FormField>` error rules, and keep `dir="ltr"` + `tabular-nums`.

### 8.6 Statement & Deep-Link Backend Architecture (`SEC-01`, `SEC-02`, `T-09b`)
- **`SEC-01` & `SEC-02` Policy Contract**:
  - `invoices_permissions` & `receipts_permissions`: drop `or public.has_permission('balances.view') or public.has_permission('management.view')`. Keep explicit per-kind permissions (`goods.' || kind || '.view/create/edit/delete'` and `'money.' || direction || '.view/create/edit/delete'`) — and clarify with owner whether linked invoice receipt reads (`0057:94-95`) stay enabled.
  - `warehouse_transfers_permissions` & `warehouse_transfer_items_permissions`: require `goods.warehouse_transfer.*`.
  - `cash_box_transfers_permissions`: require `money.cash_box_transfer.*`.
- **`T-09b` Deep-Link & Statement RPC Contract**:
  - `get_document_detail(p_scope text, p_id uuid)` (`SECURITY DEFINER`, explicit `set search_path = public`): resolves company via `current_company_id()`, loads document row, checks `require_permission` matching exact scope & `kind`/`direction`, respects `can_view_profit()`/`can_view_purchase_price()`, and handles `deleted_at IS NOT NULL` explicitly (returning structured status or raising `permission_denied` when caller lacks `.delete` permission).
  - Statement RPCs (`get_account_statement`, `get_item_movement_statement`, `get_cash_box_statement`): add nullable `doc_id uuid` and `doc_kind text` (`sale`, `purchase`, `sale_return`, `purchase_return`, `waste`, `warehouse_transfer`, `in`, `out`, `cash_box_transfer`) alongside existing text numbers so deep links work accurately even for returns/مقاصة without string heuristics.

---

## 9. Required Automated Tests

### Database & RLS SQL Tests (`supabase/tests/` via `node supabase/tests/run-local.mjs`)
1. **`SEC-01` & `SEC-02` Strict Permission + Tenant + `anon` Suite**:
   - Prove `anon` role cannot execute any document query/view/RPC.
   - Prove authenticated Company B user gets zero rows / denial on Company A invoices, receipts, and transfers.
   - Prove Company A employee with **only** `balances.customers.view` receives **0 rows** from direct `SELECT` on `v_invoice_list`, `v_invoice_items`, `v_receipt_list`, `v_warehouse_transfer_list`, `v_cash_box_transfer_list`.
   - Prove Company A employee with **only** `goods.sale.view` receives `sale` invoices via RLS/RPC, **0 rows** for `purchase`/`waste`, and **0 rows** from `warehouse_transfers` / `v_warehouse_transfer_list`.
   - Prove Company A employee with **only** `money.in.view` receives **0 rows** from `cash_box_transfers` / `v_cash_box_transfer_list`.
   - Confirm owner and legitimate `balances.view` / `management.view` **RPCs** (`get_account_statement`, `get_customer_balances`, etc.) still execute cleanly under `SECURITY DEFINER` with zero regression.
2. **`T-09b` Deep-Link & Statement RPC SQL Suite**:
   - Prove `get_document_detail` denies cross-tenant, `anon`, and wrong-tab employee (`goods.sale.view` requesting a `purchase` UUID); masks costs when `can_view_profit()` is false; denies deleted doc to employee without `.delete` permission; allows `.delete`-authorized user to inspect deleted doc.
   - Verify `doc_id` & `doc_kind` populated for every transaction row returned by `get_account_statement`, `get_item_movement_statement`, and `get_cash_box_statement` (null for opening balance row).

### Frontend Component & Workflow Tests (`npx vitest run`)
3. **`Modal.test.tsx` (`T-03a`, `T-03b`)**:
   - Dirty `Modal` intercepts `Escape`, backdrop click, and `×` button with discard confirmation; dismissing confirmation keeps draft open; confirming closes modal.
   - Nested `ConfirmDialog` renders as DOM sibling via `createPortal`; `Escape` dismisses **only** the top dialog (`modalStack`), leaving underlying dirty parent open.
   - Opening a fresh `InvoiceForm` (with `cash_customer` auto-fill) or `ReceiptForm` (with `resolveDefaultCashBox`) and immediately pressing `Escape` closes **without** false dirty prompt.
   - `Tab` / `Shift+Tab` stays trapped within top modal while allowing focus inside portaled `.searchable-select-options`; closing restores focus to trigger if `isConnected`.
4. **`SearchableSelect.test.tsx` (`T-06`)**:
   - `<= 50` options executes sync filtering without `setTimeout`.
   - Updating `loadOptions` identity on re-render does NOT re-trigger async fetches (`loadOptionsRef`).
   - Out-of-order `loadOptions` resolutions respect latest `requestIdRef` only.
   - Typing barcode + immediate `Enter` before async resolution fires `onBarcodeScan(code)` at **0ms** without selecting stale `asyncOptions[0]`.
   - Arrow navigation skips `.disabled` items; in Edit mode, item held on `editingLines` stays enabled even when warehouse remaining qty = `0`.
5. **`InvoiceForm.test.tsx` & `WarehouseTransferForm.test.tsx` (`T-04`, `T-13`, `T-18`)**:
   - Submitting clamped pending qty renders `.alert.warning` banner and marks/highlights matching line by `item_id` (both forms!).
   - Switching auto-cash -> credit resets `paid` to `0.00`; switching a saved partial-payment invoice preserves manual `paid`.
   - `CashBoxTransferForm` disables save when `isDestOverdraft` is true.
   - Typing `١٢٥٫٥٠` in `paid` / `PickerInput` / `<DecimalInput>` (if approved) normalizes cleanly to `125.50`.
6. **`ManagementOpening.test.tsx` (`T-11`) & `UserPermissions.test.tsx` (`T-17`)**:
   - Flipping `"لنا عنده"` <-> `"له عندنا"` on a `0.00` account row keeps `dirtyCount === 0`; negative supplier/customer balances render positive magnitude + correct direction label.
   - Switching tabs / users / nav links with unsaved edits prompts via `ConfirmDialog` + `NavigationGuardContext` without `useBlocker()`.
7. **`AccountStatementModal.test.tsx` (`T-10`) & `DocumentDeepLinks.test.tsx` (`T-09a`, `T-09b`) & `Layout.test.tsx` (`T-14`, `T-19`*)**:
   - Statement auto-loads on modal open & valid date range change, preserving visible rows while reloading (`preserveRows`).
   - `?doc=` / `?search=` resolves exact `tab` (including `sale_return`), warns and strips URL on deleted/missing/unauthorized doc.
   - `QuickActions` hides creation cards when user only holds `.view` permission (`T-14`).

---

## 10. Manual Validation Matrix

| Workflow / Screen | Steps to Verify Manually | Expected Outcome | Tasks Verified |
|---|---|---|---|
| **Mobile Statement Header** | Open Account Statement modal at `375px` viewport width. | Dark `--primary` header with bright readable white title & close button; sticky safely. | `T-01` |
| **Invoice / Transfer Stock Clamp Submit** | Add/edit pending entry qty exceeding available stock; press Save directly. | Save pauses, warning alert explains auto-clamp, target row highlights clearly (works in both Invoices & Warehouse Transfers). | `T-04` |
| **Print Flow (All 4 Doc Types)** | Print multi-page Account Statement (from list with 50+ rows behind modal), a Sales Invoice, a Warehouse Transfer (view mode), and a Cash Receipt. | Zero trailing blank pages; Invoices/Receipts/Transfers keep dark-free clean `.modal-head`; Invoice stacks table full-width above sidebar; Warehouse Transfer hides `المتاح بالمصدر`; Receipts fit 1 compact page; `thead` repeats cleanly across pages. | `T-05` |
| **Modal Dirty & Zero-Price Escape** | Open new Invoice -> close immediately via `Esc`; then add item with `0` price -> press Save to open zero-price Confirm -> press `Esc` once. | Untouched invoice closes immediately without prompt; zero-price `Esc` closes **only** confirmation dialog, preserving dirty invoice draft. | `T-03a` |
| **POS Barcode & Small Catalog** | In a `< 50` item warehouse, type item query (instant); in a `> 50` warehouse, scan barcode + `Enter` rapidly. | Instant filtering on `<= 50`; `0ms` barcode match on `> 50` without selecting wrong first row; Edit mode lets user keep item whose current stock became `0`. | `T-06`, `T-15` |
| **Cash-to-Credit & Overdraft Guard** | On new cash Invoice change to credit account; on saved Invoice with manual partial payment change to credit account; edit CashBoxTransfer reducing dest balance below current balance. | Untouched cash `paid` resets to `0.00`; saved partial `paid` stays intact; overdraft dest transfer disables save button. | `T-13` |
| **Keyboard & Touch Navigation** | Navigate table `SortableHeader`, `PickerInput` calendar icon, `Modal` with `Tab`/`Shift+Tab`; inspect row actions & `"الكل"` / quick-paid pills on tablet/phone touch emulation (`pointer: coarse`). | Focus ring always visible; Tab stays inside top dialog + dropdown; touch shows `.erp-row-actions` visibly; filter dates `dd/mm/yyyy` never truncate. | `T-02b`, `T-07`, `T-08`, `T-03b`, `T-17` |
| **Deep Links & Permissions** | Click linked Receipt badge on Invoice; click linked Invoice chip on Receipt; click `sale_return` row in Customer Statement (`T-09b`); test as employee lacking `goods.purchase.view`. | Navigates directly to correct tab & opens read-only modal; unauthorized/deleted doc shows friendly Arabic error and clears URL query. | `SEC-01`, `SEC-02`, `T-09a`, `T-09b` |
| **Management Opening & Arabic Digits** | Open Management -> flip `"لنا عنده"`/`"له عندنا"` on `0.00` row; edit another row and click Sidebar link; type `١٢٥٫٥٠` in date, paid, and numeric inputs (if `<DecimalInput>` enabled). | `0.00` flip stays clean; leaving with edits triggers Arabic confirmation modal; numerals convert to clean `125.50` / `dd/mm/yyyy`. | `T-11`, `T-18` |
| **Sidebar Contrast & Multi-Open** | Inspect sidebar icons (`--primary` background) and light form hints (`#fff`); toggle sidebar sections and reload page (`T-19` if approved). | High legibility on both dark sidebar (`#cbd5e1`) and light forms (`--muted`); section state matches approved behavior. | `T-02c`, `T-19` |

---

## 11. Risks and Mitigations

| Risk | Probability / Impact | Mitigation Strategy |
|---|---|---|
| **Tightening `SEC-01`/`SEC-02` breaks an unexpected client query relying on `balances.view` table RLS** | Low / High | Grep all `supabase.from(...)` calls across `src/` before writing migration; confirm all balance/statement/KPI paths invoke `SECURITY DEFINER` RPCs; run full SQL + Vitest suites locally before prod migration. |
| **Tab focus trap (`T-03b`) breaks portaled `SearchableSelect` dropdown keyboard/click interaction** | Medium / High | Isolate `T-03b` in a separate PR after `T-03a`; explicitly include active `.searchable-select-options` element in focus-trap boundary checks and verify with Vitest. |
| **18 `<input type="number">` fields fail Arabic numeral tests if left on `type="number"`** | High / Medium | Do not apply regex workarounds inside `type="number"` — either migrate cleanly to shared `<DecimalInput type="text" inputMode="decimal">` (`T-18` Layer 2) or document narrow text-only scope upfront with owner sign-off. |
| **Blind `#94a3b8` -> `var(--muted)` replacement makes dark sidebar icons invisible** | High (if overlooked) / Medium | Split surface tokens cleanly (`T-02c`): `var(--muted)` strictly for light backgrounds, `--sidebar-muted: #cbd5e1` strictly for `--primary` dark sidebar (`layout.css:152,179`). |
| **`useBlocker()` runtime crash on `<BrowserRouter>`** | Guaranteed if used / High | Explicitly prohibit `useBlocker()` unless `App.tsx` is migrated; use `beforeunload` + `ConfirmDialog` + `NavigationGuardContext` in `Layout.tsx`. |
| **Filter date input truncation after enlarging trigger icon** | High (if overlooked) / Medium | Pair `.date-picker-trigger` (`26px`) with `--table-date-width: 112px` in the exact same commit (`T-17`). |
| **`DecimalInput` migration subtly changes caret position / decimal validation UX** | Medium / Medium | Write dedicated `DecimalInput.test.tsx` covering decimal length (`4`), negative allowance flag, paste (`١٬٢٥٠٫٥٠`), empty blur, and `Enter` submit before replacing inputs. |

---

## 12. Definition of Done

Per repository `AGENTS.md` and product quality standards, **each implementation batch / task is done only when ALL applicable gates pass**:

1. `npx tsc --noEmit` — passes with 0 errors.
2. `npx eslint src` — 0 errors and zero new warnings relative to baseline.
3. `npx vitest run` — all tests pass, including new unit/integration tests covering the shipped tasks.
4. `node supabase/tests/run-local.mjs` — **required** for `SEC-01`, `SEC-02`, `T-09b` (and any SQL migration), verifying tenant isolation, `anon` denial, and exact employee permission boundaries.
5. `npx vite build` — clean production bundle with zero warnings/artifacts inside `public/`.
6. **Manual Verification** — executed against every row in Section 10 matching the shipped phase (including Arabic RTL check, desktop + `375px` mobile + touch emulation, and real browser Print Preview for `T-05`).
7. **Owner Approvals & Migration Protocol** — any production migration is listed explicitly and approved before running against production Postgres, followed by git commit & push.

---

## 13. Explicitly Rejected Recommendations

| Original Proposal | Rejection Decision & Technical Evidence |
|---|---|
| **Original `T-21`: Update async search RPC to include warehouse item stock quantities** | **Rejected as framed**. `searchWarehouseItemsAsync` (`src/lib/masterDataQueries.ts:78-115`) already queries `v_warehouse_items` directly (`current_qty`) and renders `— متاح: X وحدة` identically to `<= 50` catalogs. Replaced solely by optional P3 visual polish (`T-21b` splitting text into `sublabel`). |
| **Use React Router `useBlocker()` for `Management` / `UserPermissions` dirty guard** | **Rejected**. `src/App.tsx:70` renders `<BrowserRouter>`, under which `useBlocker()` throws an uncaught runtime error. Replaced by `beforeunload` + `ConfirmDialog` + `NavigationGuardContext` checked in `Layout.tsx`. |
| **Gate POS barcode `Enter` behind the 250ms async search debounce** | **Rejected**. Degrades cashier POS checkout throughput. Replaced by synchronous `query !== resolvedQuery` guard (`T-06`) that cancels pending timers and fires `onBarcodeScan` at **0ms**. |
| **Replace all `#94a3b8` occurrences globally with `var(--muted)` (`#64748b`)** | **Rejected**. Sidebar `.nav-icon` and `.nav-chevron` (`layout.css:151-181`) sit on `--primary` (`#2e425c`); `#64748b` drops contrast to ~2.1:1. Replaced by surface-aware `--sidebar-muted: #cbd5e1` (`T-02c`). |
| **Use `body * { visibility: hidden }` + `position: absolute` inside global `print.css`** | **Rejected**. Causes blank page reservations after long document tables and Chromium clipping under `overflow: hidden`. Replaced by `display: none` chrome + static block print flow (`T-05`). |
| **Duplicate `useConfirmDialog` / dirty prompts inside every `<Modal>` parent screen** | **Rejected (DRY)**. Centralize dirty interception once in `Modal.tsx` (`T-03a`) so all 11 callers opt in via a single `isDirty` prop. |

# MaksabPlus Unified Form Grid & Modal System

* **Author:** Abdulrahman Eid
* **Status:** Approved
* **Date:** 2026-11-05

--------------------------------------------------------------------------------

## Overview

MaksabPlus is a multi-tenant SaaS ERP designed for small business owners and retail cashiers in Arabic (Egyptian, RTL). This design establishes standardized control dimensions, form grid layouts, and dialog interaction patterns across the application.

Anchoring on the established spatial layout of the sales invoice form (`InvoiceForm`), this initiative standardizes input controls to a uniform 36px height, introduces a shared responsive form grid (`.erp-form-grid`), standardizes all Create and Edit workflows inside focused modal dialogs, and reinforces that slide-over side panels (`erp-detail-panel`) remain strictly for read-only record inspection.

--------------------------------------------------------------------------------

## Problem Statement

1. **Spatial & Visual Inconsistency**: While `InvoiceForm` features balanced grouping and clear visual hierarchy, secondary transaction forms (e.g., `CashBoxTransferForm`) and entity entry forms (e.g., adding customers or suppliers) display spatial imbalance. Single fields such as transaction dates often span entire rows, wasting vertical space and producing an inconsistent visual structure.
2. **Modal vs. Side Drawer Boundary Clarity**: Inspection drawers in Master Data tables are designed for rapid record review, whereas data mutations belong in focused dialogs. Standardizing all create and edit workflows into dedicated modal dialogs preserves clear separation between browsing and editing.
3. **Accidental Dismissal & Data Loss**: Existing modal dialogs (`Modal.tsx`) close immediately upon pressing the `Escape` key or clicking the dark backdrop. In high-speed retail environments, accidental dismissal causes loss of uncommitted line items and typed customer details.
4. **CSS Duplication & Fragmentation**: Page-specific stylesheets contain duplicated definitions for inputs, labels, and action buttons. Centralizing form grid rules and reusing shared tokens reduces maintenance overhead and CSS specificity conflicts.

--------------------------------------------------------------------------------

## Goals & Non-Goals

### Goals
* **Standardized 36px Control Height**: All interactive single-line inputs (`<input>`, `<select>`, `SearchableSelect`, `DateInput`) adopt a uniform 36px height matching the tokens defined for `InvoiceForm` across all dialogs and workspace toolbars.
* **Shared Responsive Form Grid (`.erp-form-grid`)**: Implement a reusable layout primitive supporting balanced 2-column (`.erp-col-6`) and 3-column (`.erp-col-4`) field groupings, reserving full width (`.erp-col-12`) for notes, descriptions, and full-width checkboxes.
* **Unified Entity Modals**: Migrate all create and edit workflows in Master Data (Customers, Suppliers, Items, Warehouses, Cash Boxes) into standardized modals with unified action button placement (Primary Save on `inline-start` / right in RTL, Outline Cancel on `inline-end` / left in RTL).
* **Read-Only Inspection Drawers**: Ensure slide-over side panels (`erp-detail-panel`) remain strictly read-only for fast row inspection on table click, delegating edit actions cleanly to entity modals.
* **Modal Dirty State Guard**: Implement an uncommitted change guard in `Modal.tsx` that intercepts accidental dismissal via `Escape` key, backdrop clicks, and the header close button (`X`) whenever form fields contain unsaved modifications.
* **Sibling Document Parity**: Align `ReceiptForm`, `WarehouseTransferForm`, and `CashBoxTransferForm` to the 36px standard and action button sequence without altering accounting logic.

### Non-Goals
* **No Backend or Database Alterations**: Zero changes to PostgreSQL tables, RLS policies, migrations, Supabase RPC signatures, or double-entry ledger calculations.
* **No Redesign of the Invoice Line Engine**: The barcode scanning mechanism, real-time stock computation, and item table grid in `InvoiceItemsTable.tsx` remain functionally identical.
* **No Workflow Complexity Expansion**: Zero new screens, tabs, menu items, or accounting jargon introduced into the cashier's daily path.
* **No External UI Library Dependencies**: Retain vanilla CSS design tokens; no installation of Tailwind CSS, Bootstrap, or third-party UI component libraries.

--------------------------------------------------------------------------------

## Critical User Journeys (CUJs)

### CUJ 1: Creating a Customer or Supplier from Master Data
* **Given**: An authenticated user with `data.customers.create` permission is viewing the Customers tab.
* **When**: The user clicks the "+ إضافة عميل" action button.
* **Then**: A standardized entity modal opens with automatic focus on the "الاسم" field. Inputs (Name, Phone, Opening Balance, Balance Type) render in a balanced 2-column grid, with Notes and Active Status spanning full width. Action buttons appear at the bottom with Save on the right (`inline-start`) and Cancel on the left (`inline-end`).

### CUJ 2: Quick Record Inspection in Master Data Table
* **Given**: A merchant is browsing a list of inventory items or customer accounts in the workspace table.
* **When**: The user clicks any row in the table.
* **Then**: The slide-over inspection drawer (`erp-detail-panel`) opens on the left/end side displaying read-only summary badges and balances, without covering the table or rendering editable input controls. If the user has edit permissions, clicking "تعديل البيانات" opens the dedicated modal.

### CUJ 3: Accidental Dismissal Protection During Data Entry
* **Given**: A cashier is entering a transaction or filling in customer contact details inside a modal.
* **When**: The cashier inadvertently presses `Escape`, clicks the backdrop overlay, or clicks the header `X` button while uncommitted changes exist.
* **Then**: The modal intercepts the dismissal, remains open, and presents an inline confirmation prompt asking whether to discard changes or resume editing.

--------------------------------------------------------------------------------

## Proposed Architecture

### 1. Component & Interaction Architecture

The target architecture establishes a clean separation between **Data Inspection** and **Data Mutation**:

```mermaid
flowchart TD
    subgraph TableWorkspace ["Workspace & Table View"]
        Table[("Data Table Records")]
        TopToolbar["Toolbar Actions (+ New Button)"]
    end

    subgraph InspectionLayer ["Inspection Layer (Read-Only)"]
        Drawer["Slide-Over Inspection Drawer\n(erp-detail-panel)\n- Read-only KPI Badges\n- Record Balances & Notes\n- 'تعديل البيانات' Button (Permission Guarded)"]
    end

    subgraph MutationLayer ["Mutation Layer (Modals)"]
        Modal["Standardized Form Modal\n(Modal.tsx)\n- DirtyStateGuard (ESC / Backdrop / X)\n- .erp-form-grid (2-3 Cols)\n- 36px Input Height\n- Unified Action Bar"]
    end

    Table -->|Click Table Row| Drawer
    Drawer -->|Click Edit Button (if permitted)| Modal
    TopToolbar -->|Click + New Button| Modal
    Modal -->|Save Successful| Table
```

### 2. Design Token & Grid Foundation Layer

#### Token Normalization (`src/styles/tokens.css`)
Reuse and align with the existing tokens:
```css
:root {
  /* Control Dimensions (Existing in tokens.css line 68) */
  --erp-control-height: 36px;
  --erp-control-height-compact: 32px;
  --radius-sm: 8px;
  --erp-control-font-size: 13px;

  /* Spacing Grid */
  --erp-grid-gap-row: 12px;
  --erp-grid-gap-col: 14px;
}
```

#### Shared CSS Grid Primitive (`src/styles/components/forms.css`)
Introduce a responsive layout container that prevents single fields from monopolizing full rows:
```css
.erp-form-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--erp-grid-gap-row, 12px) var(--erp-grid-gap-col, 14px);
  width: 100%;
}

.erp-col-4 { grid-column: span 4; } /* 3-column items */
.erp-col-6 { grid-column: span 6; } /* 2-column items */
.erp-col-12,
.erp-col-full { grid-column: span 12; } /* Full-width items (notes, multiline) */

@media (max-width: 768px) {
  .erp-col-4,
  .erp-col-6 {
    grid-column: span 12; /* Automatic single-column collapse on small mobile screens */
  }
}
```

Single-line control height normalization in `src/styles/components/forms.css`:
```css
input:not([type="checkbox"]):not([type="radio"]),
select {
  height: var(--erp-control-height, 36px);
  min-height: var(--erp-control-height, 36px);
  font-size: 13px;
}

/* Ensure multiline textareas remain expandable */
textarea {
  min-height: 72px;
  font-size: 13px;
}

/* Synchronize shared DateInput wrapper */
.date-input-wrap {
  height: var(--erp-control-height, 36px);
  min-height: var(--erp-control-height, 36px);
}
```

### 3. Modal Architecture & Accidental Dismissal Guard (`src/components/Modal.tsx`)

Enhance `Modal.tsx` with dirty-state interception without introducing circular dependencies with `ConfirmDialog`:
* **Interface**:
  ```typescript
  interface ModalProps {
    title: ReactNode;
    children: ReactNode;
    onClose: () => void;
    isDirty?: boolean;           // Indicates uncommitted user input
    confirmOnDismiss?: boolean;  // Intercepts ESC, backdrop, and header X when dirty
    className?: string;
    backdropClassName?: string;
  }
  ```
* **Internal Dismissal Prompt State**:
  `Modal.tsx` maintains internal state `const [showDiscardPrompt, setShowDiscardPrompt] = useState(false)`.
  When `isDirty && confirmOnDismiss` is true:
  1. Triggering dismissal (via `Escape`, backdrop click, or header `X`) sets `showDiscardPrompt(true)`.
  2. While prompt is visible, keyboard events inside `Modal` are trapped to the prompt.
  3. Prompt displays inline:
     - Title: "تأكيد الإغلاق"
     - Text: "توجد تعديلات غير محفوظة، هل أنت متأكد من رغبتك في الإغلاق وتجاهل التعديلات؟"
     - Primary button: "متابعة التعديل" (focus defaults here, closes prompt).
     - Discard button: "إغلاق وتجاهل" (calls `onClose()`).
  4. If `!isDirty || !confirmOnDismiss`, dismissal calls `onClose()` immediately.

### 4. Action Button Bar Standardization (`.form-modal-actions`)

Unify action button ordering across all forms using logical CSS properties:
* **Primary Action (Save / Submit)**: Positioned on `inline-start` (right in RTL), styled with `.btn.primary`, holding `<Save size={15} />`. Disabled with `disabled={busy}` and label "جارٍ الحفظ…" during network RPC calls.
* **Secondary Action (Cancel / Close)**: Positioned on `inline-end` (left in RTL), styled with `.btn.outline`, holding `<X size={15} />`.
* **Destructive Actions (Delete / Permanent Erase)**: Removed completely from create/edit forms. Destructive operations are triggered strictly from table row action menus or read-only detail panels, and always require explicit `ConfirmDialog` confirmation naming the record.

### 5. Sibling Transaction Forms Alignment

Apply the 36px standard and `.erp-form-grid` to sibling documents:
* **`CashBoxTransferForm.tsx`**:
  - Row 1 (3-column): Source Cash Box (`.erp-col-4`), Destination Cash Box (`.erp-col-4`), Transfer Date (`.erp-col-4`).
  - Row 2 (2-column): Transfer Amount with "كامل الرصيد" button (`.erp-col-6`), Arabic Currency Tafqeet (`.erp-col-6`).
  - Row 3: Overdraft warning badge and balance comparison chips (`.erp-col-12`).
  - Row 4 (Full-width): Statement / Notes (`.erp-col-12`).
  - Row 5: Unified `.form-modal-actions` bar.
* **`ReceiptForm.tsx`**:
  - Row 1 (4-column on desktop / 2-column compact): Account Type (`.erp-col-3`), Account (`.erp-col-3`), Cash Box (`.erp-col-3`), Date (`.erp-col-3`).
  - Row 2: Account balance chips & currency indicators (`.erp-col-12`).
  - Row 3: Amount (`.erp-col-6`), Arabic Currency Tafqeet (`.erp-col-6`).
  - Row 4: Statement / Notes (`.erp-col-12`).
  - Row 5: Unified `.form-modal-actions` bar.
* **`WarehouseTransferForm.tsx`**:
  - Add interactive `DateInput` (with `date` and `setDate` state) alongside warehouse selectors.
  - Row 1 (3-column): Source Warehouse (`.erp-col-4`), Destination Warehouse (`.erp-col-4`), Transfer Date (`.erp-col-4`).
  - Row 2: Transfer summary indicators (`.erp-col-12`).
  - Row 3: Transfer items table & notes.
  - Row 4: Unified `.form-modal-actions` bar.

### 6. Master Data Entity Forms

Align all Master Data entity creation and editing into standardized modals:
* **`AccountsTab.tsx` (Customer / Supplier Modal)**:
  - Create Mode (`!editingAccount`): Name (`.erp-col-6`), Phone (`.erp-col-6`), Opening Balance (`.erp-col-6`), Balance Type (`.erp-col-6`), Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12`).
  - Edit Mode (`editingAccount`): Name (`.erp-col-6`), Phone (`.erp-col-6`), Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12`).
* **`ItemsTab.tsx` (Inventory Item Modal)**:
  - Row 1: Item Name (`.erp-col-6`), Barcode (`.erp-col-6`).
  - Row 2: Unit (`.erp-col-4`), Sale Price (`.erp-col-4`), Purchase Price (`.erp-col-4`).
  - Row 3 (when `!editingItem`): Opening Stock Warehouse (`.erp-col-6`), Opening Quantity (`.erp-col-3`), Opening Unit Cost (`.erp-col-3`).
  - Row 4: Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12` when `editingItem`).
* **`WarehousesTab.tsx` (Warehouse Modal)**:
  - Name (`.erp-col-12`), Notes (`.erp-col-12`).
* **`CashBoxesTab.tsx` (Cash Box Modal)**:
  - Create Mode (`!editingCashBoxId`): Name (`.erp-col-6`), Opening Balance (`.erp-col-6`), Notes (`.erp-col-12`).
  - Edit Mode (`editingCashBoxId`): Name (`.erp-col-12`), Notes (`.erp-col-12`).

--------------------------------------------------------------------------------

## Alternatives Considered

### Alternative A: Universal Form Engine Component
* **Description**: Building a centralized dynamic form generator component driven by declarative JSON field configurations for all forms across the product.
* **Pros**: Single point of code definition; DRY field declaration.
* **Cons**: Introduces heavy runtime abstraction; makes custom keyboard navigation, barcode scanner autofocus refs, and live stock calculation brittle; tightly couples simple entity cards with complex master-detail transactions.
* **Reason for Rejection**: Exceeds the complexity budget and architectural boundaries defined in `AGENTS.md`. Shared CSS grid primitives (`.erp-form-grid`) and shared UI primitives (`SearchableSelect`, `DateInput`) achieve visual and structural uniformity without runtime coupling.

### Alternative B: In-Drawer Form Editing for Master Data
* **Description**: Embedding editable form fields directly inside the 520px slide-over inspection drawer (`erp-detail-panel`) instead of opening a modal.
* **Pros**: Keeps user interaction within a single viewport element without layering dialogs.
* **Cons**: 520px drawer width causes severe vertical field stretching and visual crowding; inconsistent with transaction forms; creates cramped layout for multi-field entities.
* **Reason for Rejection**: Negative user ergonomics when editing multiple fields in a narrow vertical drawer.

### Alternative C: Replacing Side Drawers Completely with Modals
* **Description**: Removing `erp-detail-panel` entirely and opening a modal dialog on every table row click.
* **Pros**: One single interaction pattern (Modal) across every screen in the system.
* **Cons**: Increases interaction overhead during sequential row browsing by requiring repeated modal open and close actions; inspecting records requires glanceable side-by-side verification without covering the table.
* **Reason for Rejection**: Degrades rapid inspection ergonomics for merchants browsing customer ledgers and inventory catalogs.

--------------------------------------------------------------------------------

## Risks & Mitigations

1. **Risk: Dirty-State Desynchronization (False Positives & Negatives)**
   * *Description*: False-positive discard prompts on benign interactions (e.g. clicking a field without typing) could slow down fast cashiers, while false negatives could discard real inputs.
   * *Mitigation*: Track dirty state via initial value comparison or explicit change flags on user input. Only set `isDirty={true}` when current state strictly diverges from baseline. Default `confirmOnDismiss={false}` on simple read-only or single-action confirmation dialogs.
2. **Risk: Circular Dependency & Keydown Collisions in Stacked Modals**
   * *Description*: If `Modal.tsx` imported `ConfirmDialog.tsx` while `ConfirmDialog.tsx` is built on `Modal.tsx`, a circular import hazard and nested keydown collision occurs.
   * *Mitigation*: `Modal.tsx` implements its own lightweight internal prompt overlay using local state and plain JSX, completely independent of `ConfirmDialog.tsx`. When the prompt is active, it captures `Escape` and focus without re-triggering parent dismissals.
3. **Risk: Viewport Media Queries in Narrow Modal Containers**
   * *Description*: Viewport `@media (max-width: 768px)` queries do not trigger on desktop displays, which could cause 3-column rows to cramp if placed inside a narrow modal.
   * *Mitigation*: 3-column fields (`.erp-col-4`) are reserved only for wide containers and modals with `max-width: 720px` or wider. Modals narrower than 600px use 2-column (`.erp-col-6`) and full-width (`.erp-col-12`) layouts exclusively.
4. **Risk: Unauthorized Edit Triggers in Inspection Drawers**
   * *Description*: Users with read-only view permissions could see an active "تعديل البيانات" button in the inspection drawer.
   * *Mitigation*: The edit button in `erp-detail-panel` is conditionally rendered based on explicit permission checks (`has_permission('data.customers.update')`, `has_permission('data.items.update')`), preserving security boundaries.

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Performance & Latency
* **No Additional Network Requests on Open**: Modals consume existing data from parent tables and `MasterDataContext` where available, avoiding redundant RPC roundtrips upon opening.
* **Minimal Browser Reflow**: Explicit CSS grid column and row definitions remove the need for runtime JavaScript dimension calculations.

### Accessibility & Keyboard Ergonomics
* **Strict Tab Sequencing**: Form fields follow natural RTL tab ordering (top-to-bottom, right-to-left).
* **Autofocus on Mount**: Every modal automatically autofocuses the primary input on mount (`autoFocus`).
* **Input Content Auto-Select**: Numeric and quantity inputs select all content on focus (`onFocus={(e) => e.target.select()}`), eliminating manual backspacing.
* **RTL & Number Isolation**: All currency, numeric, and date values reside inside `<bdi>` or `dir="ltr"` wrappers with `tabular-nums`.

### Rollout Safety
* **Zero Database Migration Dependency**: Client-side UI changes only; zero database migrations or schema adjustments required.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The implementation is structured into four sequential phases to minimize regression risk and verify sibling parity at each step:

### Phase 1: Tokens, Grid Utilities & Modal Safety Guard

#### 1. `src/styles/tokens.css` (Modify)
* **Scope**: Core CSS design tokens.
* **Changes**: Confirm normalized control height token `--erp-control-height: 36px`, ensure compact height `32px`, radius `--radius-sm: 8px`, and grid gap tokens (`12px` row gap, `14px` column gap) are available.
* **Rationale**: Anchors all downstream layout calculations to a single source of truth.

#### 2. `src/styles/components/forms.css` (Modify)
* **Scope**: Component form styles.
* **Changes**:
  - Implement `.erp-form-grid`, `.erp-col-4`, `.erp-col-6`, and `.erp-col-12` utility classes.
  - Set default single-line control height to 36px: `input:not([type="checkbox"]):not([type="radio"]), select { height: var(--erp-control-height); min-height: var(--erp-control-height); font-size: 13px; }`.
  - Set `min-height: 72px` for `textarea`.
  - Set `.date-input-wrap { height: var(--erp-control-height); min-height: var(--erp-control-height); }` to prevent 4px height mismatch with adjacent inputs.
  - Reuse shared `.form-modal-actions` utility class.
* **Rationale**: Replaces ad-hoc inline styles with a reusable responsive grid system and eliminates control height discrepancies.

#### 3. `src/styles/components/modals.css` (Modify)
* **Scope**: Modal presentation layer.
* **Changes**: Standardize modal sizing: `.modal-container` max-widths set to 640px for entity forms and 800px for multi-column documents; set body padding to `18px 20px`.
* **Rationale**: Provides consistent visual framing for all modal dialogs.

#### 4. `src/components/Modal.tsx` (Modify)
* **Scope**: Core modal dialog component.
* **Changes**: Add `isDirty?: boolean` and `confirmOnDismiss?: boolean` prop interfaces. When `isDirty && confirmOnDismiss` is true, intercept `Escape` key events, backdrop clicks, and header `X` button clicks with an internal discard confirmation prompt.
* **Rationale**: Prevents accidental data loss when cashiers or merchants mistakenly press `Escape` or click outside an in-progress form.

#### 5. `src/test/components/Modal.test.tsx` (Create)
* **Scope**: Unit test suite for modal dismissal guard.
* **Changes**: Add automated tests verifying:
  - Clean dismissal when `isDirty=false`.
  - Interception and display of discard prompt when `isDirty=true` on `Escape`, backdrop click, and `X` click.
  - Dismissal execution when user clicks discard in the prompt.
  - Resumed editing when user clicks cancel in the prompt.

### Phase 2: Master Data Entity Modals Grid Alignment

#### 6. `src/pages/master-data/AccountsTab.tsx` (Modify)
* **Scope**: Customer and supplier accounts management tab.
* **Changes**: Refactor the modal form from `.stack` into `.erp-form-grid`:
  - Create Mode (`!editingAccount`): Name (`.erp-col-6`), Phone (`.erp-col-6`), Opening Balance (`.erp-col-6`), Balance Type (`.erp-col-6`), Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12`).
  - Edit Mode (`editingAccount`): Name (`.erp-col-6`), Phone (`.erp-col-6`), Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12`).
  - Pass `isDirty` and `confirmOnDismiss={true}` to `Modal`.
* **Rationale**: Establishes balanced 2-column entity creation and protects uncommitted account entries.

#### 7. `src/pages/master-data/ItemsTab.tsx` (Modify)
* **Scope**: Product catalog management tab.
* **Changes**: Refactor Item modal into `.erp-form-grid`:
  - Row 1: Name (`.erp-col-6`), Barcode (`.erp-col-6`).
  - Row 2: Unit (`.erp-col-4`), Sale Price (`.erp-col-4`), Purchase Price (`.erp-col-4`).
  - Row 3 (when `!editingItem`): Warehouse (`.erp-col-6`), Opening Qty (`.erp-col-3`), Opening Cost (`.erp-col-3`).
  - Row 4: Notes (`.erp-col-12`), Active Checkbox (`.erp-col-12` when `editingItem`).
  - Pass `isDirty` and `confirmOnDismiss={true}` to `Modal`.
* **Rationale**: Standardizes product form layout while preserving all inventory opening stock creation capabilities.

#### 8. `src/pages/master-data/WarehousesTab.tsx` (Modify)
* **Scope**: Warehouse management tab.
* **Changes**: Refactor Warehouse modal into `.erp-form-grid` (Name: `.erp-col-12`, Notes: `.erp-col-12`). Pass `isDirty` and `confirmOnDismiss={true}` to `Modal`.
* **Rationale**: Aligns warehouse management dialogs with the global entity modal standard without negative horizontal space voids.

#### 9. `src/pages/master-data/CashBoxesTab.tsx` (Modify)
* **Scope**: Cash box management tab.
* **Changes**: Refactor Cash Box modal into `.erp-form-grid`:
  - Create Mode (`!editingCashBoxId`): Name (`.erp-col-6`), Opening Balance (`.erp-col-6`), Notes (`.erp-col-12`).
  - Edit Mode (`editingCashBoxId`): Name (`.erp-col-12`), Notes (`.erp-col-12`).
  - Pass `isDirty` and `confirmOnDismiss={true}` to `Modal`.
* **Rationale**: Preserves cash box initial balance setup while unifying layout.

### Phase 3: Sibling Transaction Forms Parity

#### 10. `src/components/CashBoxTransferForm.tsx` (Modify)
* **Scope**: Cash treasury transfer document form.
* **Changes**: Restructure into `.erp-form-grid`:
  - Row 1: Source Cash Box (`.erp-col-4`), Destination Cash Box (`.erp-col-4`), Transfer Date (`.erp-col-4`).
  - Row 2: Transfer Amount with "كامل الرصيد" button (`.erp-col-6`), Arabic Currency Tafqeet (`.erp-col-6`).
  - Row 3: Overdraft warning badge and balance comparison chips (`.erp-col-12`).
  - Row 4: Notes (`.erp-col-12`).
  - Row 5: Unified `.form-modal-actions` bar.
* **Rationale**: Resolves single-field row occupancy for the transfer date and aligns action buttons.

#### 11. `src/components/ReceiptForm.tsx` (Modify)
* **Scope**: Cash receipt voucher form (inflow/outflow).
* **Changes**: Refactor inputs into `.erp-form-grid`:
  - Row 1: Account Type (`.erp-col-3`), Account (`.erp-col-3`), Cash Box (`.erp-col-3`), Date (`.erp-col-3`).
  - Row 2: Account balance chips & currency indicators (`.erp-col-12`).
  - Row 3: Amount (`.erp-col-6`), Arabic Currency Tafqeet (`.erp-col-6`).
  - Row 4: Notes (`.erp-col-12`).
  - Row 5: Unified `.form-modal-actions` bar.
* **Rationale**: Achieves sibling parity with `InvoiceForm` and `CashBoxTransferForm`.

#### 12. `src/components/WarehouseTransferForm.tsx` (Modify)
* **Scope**: Warehouse stock transfer form.
* **Changes**:
  - Add interactive `DateInput` bound to `date` and `setDate` state.
  - Row 1: Source Warehouse (`.erp-col-4`), Destination Warehouse (`.erp-col-4`), Date (`.erp-col-4`).
  - Row 2: Transfer item count and quantity summary chips (`.erp-col-12`).
  - Row 3: Items table & Notes.
  - Row 4: Unified `.form-modal-actions` bar.
* **Rationale**: Achieves sibling parity with `InvoiceForm` and completes the document date input interface.

### Phase 4: Contract Documentation Updates

#### 13. `src/components/README.md` (Modify)
* **Scope**: Shared components contract documentation.
* **Changes**: Document `isDirty` and `confirmOnDismiss` props on `Modal.tsx`, as well as the `.erp-form-grid` standard.
* **Rationale**: Keeps component contracts accurately aligned with codebase capabilities.

#### 14. `src/pages/master-data/README.md` (Modify)
* **Scope**: Master data catalog contract documentation.
* **Changes**: Document the strict separation between read-only drawer inspection and modal mutation.
* **Rationale**: Maintains architectural documentation integrity.

--------------------------------------------------------------------------------

## Verification Plan

### Automated Verification Gates
Every gate must pass cleanly without suppression or regressions:
1. `npx tsc --noEmit`: 0 TypeScript compilation errors.
2. `npx eslint src`: 0 lint errors, 0 new warnings.
3. `npx vitest run`: All test suites (including newly created `Modal.test.tsx`) pass 100%.
4. `npx vite build`: Production bundle compiles cleanly without asset or chunk resolution issues.

### Manual Visual & Ergonomic Verification
* **RTL Layout Symmetry**: Inspect all modified modals in Arabic RTL at 1280px and 1920px viewports. Confirm primary save actions sit on the right (`inline-start`) and cancel buttons sit on the left (`inline-end`).
* **Accidental Dismissal Test**: Open each modified modal, type arbitrary characters, and press `Escape`, click the backdrop, or click the header `X`. Verify the modal does NOT close and instead presents the confirmation prompt.
* **Tab Order & Autofocus**: Confirm that opening any modal immediately focuses the first input field, and pressing `Tab` navigates through fields in natural RTL logical order.
* **Screenshots Requirement**: Capture RTL screenshots of each modified screen at 1280px and 1920px and save them under `docs/screenshots/`.

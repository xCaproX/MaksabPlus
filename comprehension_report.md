# Stage 6: Comprehension Test Report

### What this proposes
This document proposes standardizing UI control heights to 36px and introducing a reusable 12-column responsive CSS grid (`.erp-form-grid`) across all transaction forms and master data dialogs in the application. It establishes a strict architectural boundary by restricting side panels (`erp-detail-panel`) exclusively to read-only record inspection while moving all create and edit workflows into focused modal dialogs. Additionally, it introduces an uncommitted dirty-state guard in the shared `Modal` component to prevent accidental dismissal via Escape or backdrop clicks, aligning sibling transaction forms to these layout standards without modifying backend schemas or accounting logic.

### How the existing system works, per this document
Currently, the application suffers from visual and spatial inconsistency, with secondary transaction forms and entity entry forms stretching single inputs across entire rows. The system mixes interaction paradigms by combining in-drawer editing with layered modal triggers in master data tables, resulting in visual crowding and cramped vertical layouts. Furthermore, existing modals dismiss immediately upon pressing the Escape key or clicking the backdrop overlay, risking data loss in fast-paced retail workflows. Finally, form styles are fragmented and duplicated across large, page-specific stylesheets such as `invoice-form.css`.

---

### Findings

#### 1. Severity: Major
* **Affected Scope**: Section 3: `Modal Architecture & Accidental Dismissal Guard` (lines 131–148) and Phase 1 (lines 239–243).
* **Discrepancy Description & Rationale**:
  * **Ambiguous Dismissal Logic**: Step 2 of the dismissal flow (line 146) states that when dirty, *"the modal triggers an internal confirmation dialog or prompts the parent handler rather than executing onClose() immediately."* Specifying "triggers an internal confirmation dialog OR prompts the parent handler" leaves the core behavioral architecture undefined.
  * **Incomplete Interface**: If the modal prompts the parent handler, the proposed `ModalProps` interface (lines 134–142) contains no callback prop (such as `onAttemptDismiss` or `onConfirmDismiss`) to notify the parent.
  * **Undefined Prop Interaction**: The interface introduces both `isDirty?: boolean` and `confirmOnDismiss?: boolean`. The document never specifies the default value for `confirmOnDismiss`, nor what behavior occurs if `isDirty` is true while `confirmOnDismiss` is false or omitted.

#### 2. Severity: Major
* **Affected Scope**: Section 3 (lines 131–148), Phase 2 (lines 244–265), Phase 3 (lines 271–291), and Verification Plan (line 317).
* **Discrepancy Description & Rationale**:
  * **Unstated Dirty State Tracking Responsibility**: `Modal.tsx` relies on an incoming `isDirty?: boolean` prop. However, none of the refactored forms in Phase 2 (`AccountsTab`, `ItemsTab`, `WarehousesTab`, `CashBoxesTab`) or Phase 3 (`CashBoxTransferForm`, `ReceiptForm`, `WarehouseTransferForm`) specify how form dirty state is tracked, calculated, or passed to `Modal`.
  * **Verification Gap**: The Manual Verification Gate (line 317) mandates: *"Open each modified modal, type arbitrary characters, and press Escape or click the backdrop. Verify the modal does NOT close..."* Without assigning dirty-state tracking to each form implementation, modals will never supply `isDirty={true}`, causing the dismissal guard to never trigger in practice.

#### 3. Severity: Major
* **Affected Scope**: Overview & CUJs (lines 57, 154), Section 6 (line 171), and Non-Functional Requirements (line 204).
* **Discrepancy Description & Rationale**:
  * **Undefined & Unlinked Components/Contexts**:
    * `ConfirmDialog` (lines 57, 154): Referenced as the component used to confirm discarding uncommitted changes and destructive operations, but it is neither defined inline, linked to an existing component file, nor listed in the implementation plan.
    * `MasterDataContext` (line 204): Referenced as the mechanism that provides cached local state to avoid network roundtrips on modal open, but is undefined and unlinked with no explanation of where it lives or how modals consume it.
    * `AccountBalancePills` (line 171): Referenced as a UI element rendered inside the inspection drawer, but is undefined and unlinked.

#### 4. Severity: Nit
* **Affected Scope**: Section 5 (lines 161, 277) and Phase 3 (line 284): `CashBoxTransferForm.tsx` & `ReceiptForm.tsx` ("Arabic Currency Tafqeet").
* **Discrepancy Description & Rationale**:
  * Lines 161 and 277 place *"Arabic Currency Tafqeet (`.erp-col-6`)"* in the form grid alongside the transfer amount. To an engineer unfamiliar with Arabic accounting conventions or this codebase, it is undefined whether "Tafqeet" refers to an input field, a read-only typography label, a custom badge component, or a helper function output.

#### 5. Severity: Nit
* **Affected Scope**: Section 6 (lines 174–175) and Phase 2 (lines 258, 263): `WarehousesTab.tsx` and `CashBoxesTab.tsx`.
* **Discrepancy Description & Rationale**:
  * The grid specification for Warehouse and Cash Box modals defines `Name: .erp-col-6` and `Notes: .erp-col-12`. In a 12-column grid, an isolated 6-column element leaves half of the first row blank. The document does not clarify if a second field was omitted, if this negative space is intentional, or if `Name` should be full width (`.erp-col-12`).

#### 6. Severity: Nit
* **Affected Scope**: Section 4 (lines 152–153): `Action Button Bar Standardization`.
* **Discrepancy Description & Rationale**:
  * The design references `<Save size={15} />` and `<X size={15} />` without identifying the icon package from which they originate (e.g., `lucide-react`).

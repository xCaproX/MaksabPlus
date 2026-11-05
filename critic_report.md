# Stage 7: Critic Review Report

**Audited Document**: `docs/designs/unified_form_grid_and_modal_system.md`  
**Audited Scope**: `FeatureRange` (Lines 1–217)  
**Standard**: `Feature Specification Standard` (`feature-spec-standard.md`)  
**Reviewers**: Design Critic (`egm-design`), Structural Validator (`egm-structural`), Style Editor (`egm-style`)

---

## Executive Summary

The Critic Review identified **1 Blocker**, **8 Majors**, and **9 Nits** across architecture, structure, and editorial style. 

The primary blocker is the complete absence of the mandatory **Risks & Mitigations** section required by the Feature Specification Standard. Major findings include maintainer attribution violations in Alternatives Considered, uncalibrated media queries in CSS grid within constrained modal containers, lack of event isolation and contracts for modal dirty state, unguarded edit triggers in inspection drawers, canonical header naming deviations, and hyperbolic/defensive prose.

---

## Findings Matrix

| ID | Reviewer | Severity | Scope | Core Issue |
|---|---|---|---|---|
| `critic-1` | Design / Structural | 🔴 Blocker | Lines 198–201 | Missing mandatory `## Risks & Mitigations` section. |
| `critic-2` | Design / Structural | 🟡 Major | Lines 185, 191, 197 | Rejection rationales violate standard by attributing rejections to the maintainer (`"Rejected by author"`). |
| `critic-3` | Design | 🟡 Major | Lines 106–127 | Viewport `@media (max-width: 768px)` does not trigger inside 520px–600px desktop modals, causing column cramping. |
| `critic-4` | Design | 🟡 Major | Lines 129–148 | Underspecified dirty state contract and event collision between `Modal` and abandonment `ConfirmDialog`. |
| `critic-5` | Design | 🟡 Major | Lines 75, 83, 171 | Missing permission checks on inspection drawer edit triggers (`data.customers.update`, etc.). |
| `critic-6` | Structural | 🟡 Major | Lines 15, 22, 31, 61 | Non-canonical section headings (`The Problem`, split `Goals`/`Non-Goals`, `Technical Plan (Architecture)`). |
| `critic-7` | Style | 🟡 Major | Lines 13, 17, 19, 196 | Hyperbolic crisis vocabulary (`catastrophic loss`, `destroys ergonomics`) and defensive framing. |
| `critic-8` | Style | 🟡 Major | Lines 205, 214 | Uncalibrated engine claim (CALIBRATE single layout pass) and speculative database-locking caveat (DROP). |
| `critic-9` | Style | 🟢 Nit | Lines 11, 27, 65, 91 | Design buzzwords and metaphors (`spatial rhythm`, `Purified Drawers`, `golden standard`). |
| `critic-10` | Style | 🟢 Nit | Lines 152, 165 | Imprecise CSS terminology (use `inline-start` instead of "right in RTL"; use "Standardize" instead of "Harmonize"). |
| `critic-11` | Style | 🟢 Nit | Line 204 | Uncalibrated capability claim (`Zero Additional Network Latency` -> CALIBRATE to "No Additional Network Requests on Open"). |
| `critic-12` | Style | 🟢 Nit | Lines 36, 52, 183 | Filler modifiers (`smoothly`, `pure`, `high theoretical DRY metrics`). |
| `critic-13` | Design | 🟢 Nit | Lines 38–40 | Unresolved POS touch target ergonomics (Open Question 1). |
| `critic-14` | Design | 🟢 Nit | Lines 23–30 | Lack of quantifiable success criteria in Goals. |
| `critic-15` | Structural | 🟢 Nit | Lines 63–167 | Asymmetric heading metadata across architecture subsections. |
| `critic-16` | Structural | 🟢 Nit | Lines 20, 185 | Unlinked repository references (`invoice-form.css`, `AGENTS.md`). |

---

## Detailed Findings & Actionable Remediations

### 🔴 Blockers

#### `critic-1`: Missing Mandatory Header: `## Risks & Mitigations`
* **Reviewers**: `egm-design`, `egm-structural`
* **Affected Scope**: Between `Alternatives Considered` (line 198) and `Non-Functional Requirements` (line 201)
* **Rationale**: The Feature Specification Standard explicitly mandates: *"The specification must explicitly call out its own constraints. It must identify potential failure modes, security implications, scalability limits, and how they will be mitigated."* Omitting this section causes an automatic standard failure.
* **Remediation**: Insert a dedicated `## Risks & Mitigations` section addressing:
  1. *Dirty-State Desynchronization*: False-positive discard prompts on benign interactions vs false negatives causing data loss.
  2. *Nested Dialog Event Collisions*: Keydown and backdrop event bubbling when `ConfirmDialog` is mounted over `Modal`.
  3. *Constrained Modal Responsive Breakdowns*: Multi-column grid behavior inside narrow dialogs.
  4. *Permission Gating*: Read-only users accessing edit flows.

---

### 🟡 Majors

#### `critic-2`: Maintainer Attribution in Rejection Rationales
* **Reviewers**: `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope**: Lines 185, 191, 197
* **Rationale**: In Alternatives A, B, and C, each rejection begins with `"Reason for Rejection: Rejected by author."` The standard strictly prohibits maintainer/author attribution without linking public PR/issues, requiring rejection reasons to be grounded strictly in objective technical and ergonomic trade-offs.
* **Remediation**: Remove `"Rejected by author"` across all alternatives. Frame rejection rationales around architectural scope, complexity budgets in `AGENTS.md`, and usability constraints.

#### `critic-3`: Viewport Media Queries vs Constrained Modal Widths
* **Reviewers**: `egm-design`
* **Affected Scope**: Lines 106–127, 173–176
* **Rationale**: `.erp-form-grid` uses `@media (max-width: 768px)` to collapse columns. However, viewport queries evaluate the browser window, not the modal container. On a 1080p desktop, standard 520px–600px modals do not trigger the query, forcing 3-column rows (`.erp-col-4`) into ~150px inputs and clipping compound currency/unit fields.
* **Remediation**: Use CSS Container Queries (`container-type: inline-size` on modal or grid containers with `@container (max-width: 540px) { ... }`) or restrict 3-column layouts to wider forms.

#### `critic-4`: Underspecified Dirty State Tracking & Nested Dialog Event Collision
* **Reviewers**: `egm-design`
* **Affected Scope**: Lines 129–148
* **Rationale**: The spec adds `isDirty?: boolean` and `confirmOnDismiss?: boolean` on `ModalProps`, but omits how child forms compute dirty state without duplicated boilerplate, and fails to isolate keydown listeners when an abandonment `ConfirmDialog` mounts over `Modal`.
* **Remediation**: Define the dirty tracking mechanism (e.g., initial-state snapshot comparison) and specify keydown/backdrop event suspension in `Modal.tsx` while a child confirmation dialog is open.

#### `critic-5`: Missing Permission Guarding on Inspection Drawer Edit Triggers
* **Reviewers**: `egm-design`
* **Affected Scope**: Lines 75, 83, 171
* **Rationale**: The inspection drawer renders a "تعديل البيانات" button triggering the entity edit modal. In multi-tenant ERP operations, read-only staff (e.g. cashiers checking balances) have view permissions but lack mutation permissions (`data.customers.update`).
* **Remediation**: Explicitly document conditional rendering of the edit trigger based on user permissions, paired with defense in depth within the modal.

#### `critic-6`: Canonical Section Header Deviations
* **Reviewers**: `egm-structural`
* **Affected Scope**: Lines 15, 22, 31, 61
* **Rationale**: The document deviates from the blueprint:
  - `## The Problem` -> should be `## Problem Statement`
  - `## Goals` and `## Non-Goals` -> should be combined under canonical `## Goals & Non-Goals`
  - `## Technical Plan (Architecture)` -> should be `## Proposed Architecture`
* **Remediation**: Align section headings with canonical standard names.

#### `critic-7`: Emotive Language and Defensive Framing
* **Reviewers**: `egm-style`
* **Affected Scope**: Lines 13, 17, 19, 196
* **Rationale**: Uses hyperbolic vocabulary (`"catastrophic loss"`, `"Severely degrades"`, `"Destroys fast inspection ergonomics"`) and defensive rhetoric (`"Rather than executing an arbitrary aesthetic redesign..."`).
* **Remediation**: Rephrase factually and neutrally (e.g., `"causes loss of uncommitted data"`, `"Increases interaction overhead during sequential row browsing"`).

#### `critic-8`: Uncalibrated Engine & Safety Claims
* **Reviewers**: `egm-style`
* **Affected Scope**: Lines 205, 214
* **Rationale**: 
  - Line 205 asserts CSS Grid *"ensures browser layout engines calculate geometry in a single layout pass"*, which is an unverified rendering engine claim.
  - Line 214 includes a speculative database-locking disclaimer for a purely client-side task.
* **Remediation**: 
  - CALIBRATE Line 205: *"Explicit CSS grid column and row definitions remove the need for runtime JavaScript dimension calculations."*
  - DROP speculative backend database disclaimer in Line 214: *"Client-side UI changes only; zero database migrations or schema adjustments required."*

---

### 🟢 Nits

* **`critic-9` (Jargon & Metaphors)**: Replace `"Purified Inspection Drawers"` with `"Read-Only Inspection Drawers"`; replace `"golden standard"` with `"tokens defined for InvoiceForm"`.
* **`critic-10` (Logical CSS Terminology)**: Use `inline-start` instead of `"right in RTL"`; use `"Standardize"` instead of `"Harmonize"`.
* **`critic-11` (Capability Claim Calibration)**: Change `"Zero Additional Network Latency"` to `"No Additional Network Requests on Open: Modals consume existing data from MasterDataContext where available"`.
* **`critic-12` (Filler Words)**: Remove `"smoothly"`, `"pure"`, and `"high theoretical DRY metrics"`.
* **`critic-13` (POS Touch Ergonomics)**: Resolve Open Question 1 using `@media (pointer: coarse)` touch padding expansion.
* **`critic-14` (Measurable Success Criteria)**: Add quantifiable targets to Goals.
* **`critic-15` (Asymmetric Heading Annotations)**: Standardize file annotations across architecture subsections.
* **`critic-16` (Clickable Markdown Links)**: Format repository file references as markdown links.

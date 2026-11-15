# UI rules

Read this in full before any change to a screen, component, form, table, modal, or text the user sees. Reuse shared components (DateInput, MoneyDisplay, StatusBadge, RowActions) and fix problems in the shared component, never per screen.

Opening phrase for this file: "كابروو انا في الفرونت.. "
Once you have opened this file in the current session, begin every reply with exactly this phrase (see AGENTS.md, "Owner and reply style"). Never use it if you did not open this file in this session.

## Think about what the user will see
1. Context first: before designing a change, inspect neighboring elements in the same scope and equivalent patterns across the system. Never introduce a standalone convention (marker, label, behavior) on one item that contradicts or misleads about its siblings.
2. Requested rule vs unrequested additions: implement the requested rule with the system's existing visual and behavioral language. Do not invent extra badges, cues, or warnings unless they were requested or are already an established pattern.
3. Trace shared components: never treat a shared component or helper as a black box. Verify what it renders in every state (default/closed, open, read-only, error) before building around it.
4. Simulate the rendered result: before coding and before finishing, write out the literal text, values, and states the user will see side by side, so duplication, crowding, or contradiction stands out. Check the surrounding row, screen, and modes together, not only the new piece.
5. Surface friction: if a requested layout collides with or duplicates data already inside an adjacent control or workflow, stop BEFORE editing and present options to the owner instead of layering both together.

## RTL and numbers
- In RTL interfaces, isolate each displayed numeric value, amount, or currency fragment with `dir="ltr"` (or `<bdi>`) and apply `font-variant-numeric: tabular-nums` so its digits and separators render predictably. Apply direction and numeric styling to the numeric fragment, not indiscriminately to an entire label or container that merely contains a number; use shared formatters/components where available.
- Never put status text in parentheses next to an amount (for example "0.00 (خالص)"). Use a separate badge.
- Use logical CSS properties only (margin-inline-start, padding-inline-end, text-align: start). Never left/right.
- Dates are displayed and entered as dd/mm/yyyy, never mm/dd/yyyy. Use one shared date input component.

## Inputs
- Item units (قطعة, كجم, etc.) appear next to the item name in order (code, name, unit) and never inside or next to numeric input, quantity, or stock fields. Do not add currency suffixes (ج.م) next to price or amount input fields, since the currency is fixed across the project.
- Number inputs hide native spinners, use inputmode="decimal", and select all on focus.
- Quantity inputs accept decimals for units that support fractional quantities (such as weights and lengths). Validate that quantity is greater than zero; do not hard-code `min=1` when valid fractional quantities are possible. Respect the item's unit and precision rules.
- Free-text fields (notes, description, reason) are full width, never in a narrow cell.
- Placeholders are never truncated. If one does not fit, the field is too narrow.
- Every row in a repeating list uses the same column order, widths, and alignment, including empty rows.

## Forms and modals
- Group related fields together. Do not spread one logical group across the row.
- Computed values never look like inputs. Clickable means it looks like a button. Info only means badge or plain text.
- Empty rows are dimmed and ignored on save. A line item needs an item selected and quantity > 0. A zero price requires explicit confirmation.
- Validate live (for example quantity above available stock), not only on submit.
- Every user-editable business field shown in the details view must be available through the appropriate create or edit workflow, unless the omission is intentional and explained. System-generated, derived, audit, identifier, posting-status, and post-creation fields may appear in details without being inputs in the create form.

## Document screens (invoices, transfers, receipts, returns)
- Use one shared document form/component for create, edit, and view; view is a `readOnly` state. Keep the semantic field order and line-item column structure aligned across modes so the same document is easy to recognize. In read-only mode, values may render as plain text, badges, or links rather than disabled-looking inputs; hide editing affordances and actions that do not apply. Do not force system-generated or post-creation fields into the create form.

## Hierarchy and actions
- The most important information gets the largest size and weight (for example balance after invoice).
- One primary filled action per screen. Secondary actions (view deleted, export) use ghost or outline style.
- Never show bare red delete text in table rows. Use a row actions menu and a confirmation dialog that names the record number.
- Never use one color for two meanings. Payment status and link type use different color families.
- Links to related records look and behave like links: clickable and large enough to hit.

## Permissions
- Sensitive columns (profit, cost, margin) show only with the matching permission. If no permission system exists, report it. Do not invent one silently. The permission must also be enforced in the database (see docs/agent/database.md).

## Layout
- When the detail panel is open, hide lower-priority columns first. Always keep number, customer, total, and remaining visible.
- Sidebar sections can be open together, and open state persists per user.
- Sidebar footer shows user name, company name, and logout together.

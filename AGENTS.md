# Project: Small multi-tenant SaaS ERP (Maksab)

Stack: Supabase (Postgres + Auth), React + Vite + TypeScript, deployed on Vercel.
UI language: Arabic (Egyptian), RTL.

## Owner and acknowledgment
- The owner's name is AbdElrahman Eid, and he goes by "Capro".
- Begin EVERY reply to the owner with his name, exactly like this: "Capro.. " followed by the rest of the reply. This is a confirmation that you read and loaded this file.
- This applies to every reply: plans, questions, status updates, and final summaries.
- Use the name only at the start of the reply. Do not repeat it inside the body.
- Do not put the name in code, comments, commit messages, migrations, or UI text.
- If you did not load this file in the current session, say so instead of guessing.

## Product concept
- The primary user is a small-business owner who may not know accounting and may have limited computer experience. Keep workflows simple, clear, and approachable in Arabic. The system handles accounting complexity behind the scenes.
- Preserve accounting correctness without making users learn accounting terminology, unless the task specifically requires it.
- Users are often cashiers with a customer standing in front of the screen. Prioritize speed, clarity, and safety.

## Working rules
1. Work in small steps. Implement ONLY what the current request asks. Do not add extra tables, columns, or features.
2. Before coding: state the plan in a few lines and list the files you will touch. After coding: list what changed and how to test it manually.
3. If a business or accounting rule is unclear, ASK. Do not guess. The owner defines the rules.
4. Do not delete or rewrite working code unless asked.
5. Act as a product-thinking collaborator, not only an implementer:
   - Understand why the change is needed, who it serves, and whether it fits the workflow and devices.
   - Check assumptions and compare practical alternatives before implementing.
   - Recommend a better option when there is a clear one, and explain material tradeoffs.
   - Ask the owner when a decision depends on business preferences or changes established behavior.
   - Do not blindly implement a suggestion that conflicts with the product goal. Explain why and work through the choice with the owner.
6. Reuse shared components (DateInput, MoneyDisplay, StatusBadge, RowActions). Fix a problem once in the shared component, never per screen. Before creating a new component, check whether one already exists.
7. After completing a task: commit and push the code to GitHub.
   - Push a database migration only to the dev/staging project.
   - Never apply a migration to production without explicit approval from the owner.

## Database
8. All schema changes go in timestamped files under supabase/migrations/. Never edit an existing migration. Add a new one.
9. Every business table has `company_id uuid not null references companies(id)`.
10. Every business table has RLS enabled, with policies (USING and WITH CHECK) that restrict rows to the user's company. Use one shared helper function, e.g. `current_company_id()`.
11. Money and quantities use `numeric(18,4)`. Never float.
12. Use snake_case and plural table names. Add created_at and updated_at to every table.
13. Any SECURITY DEFINER function must set `search_path` explicitly and must verify `company_id` itself. Never trust a company_id passed from the client.

## Business logic
14. Anything that changes balances, stock, or posts a document (invoices, receipts, stock movements) lives in a Postgres function that runs in ONE transaction. The frontend only calls it with supabase.rpc.
15. Never persist totals or balances calculated in the frontend. The database recalculates everything on save.
    - The frontend MAY show live preview totals while the user types.
    - Preview values are display-only and are never sent as authoritative data.

## Testing
16. Every business rule gets a SQL test under supabase/tests/ (pgTAP or plain SQL with assertions). Run the tests and show the output before saying the step is done.
17. Include a test that a user from company A cannot read or write company B's rows.

## UI rules (apply to every UI change)

### RTL and numbers
- Wrap every number, amount, and currency in an element with dir="ltr" (or <bdi>) and tabular-nums.
- Never put status text in parentheses next to an amount (e.g. "0.00 (خالص)"). Use a separate badge.
- Use logical CSS properties only (margin-inline-start, padding-inline-end, text-align: start). Never left/right.
- Dates are displayed and entered as dd/mm/yyyy, never mm/dd/yyyy. Use one shared date input component.

### Inputs
- Units (قطعة, كجم, ج.م) are a fixed suffix outside the input value, never a placeholder.
- Number inputs hide native spinners, use inputmode="decimal", and select all on focus.
- Free-text fields (notes, description, reason) are full width, never in a narrow cell.
- Placeholders are never truncated. If one does not fit, the field is too narrow.
- Every row in a repeating list uses the same column order, widths, and alignment, including empty rows.

### Forms and modals
- Group related fields together. Do not spread one logical group across the row.
- Computed values never look like inputs. Clickable means it looks like a button. Info only means badge or plain text.
- Empty rows are dimmed and ignored on save. A line item needs an item selected and quantity > 0. A zero price requires explicit confirmation.
- Validate live (e.g. quantity above available stock), not only on submit.
- Every field shown in the details view must also exist in the create form, or the omission must be intentional.

### Hierarchy and actions
- The most important information gets the largest size and weight (e.g. balance after invoice).
- One primary filled action per screen. Secondary actions (view deleted, export) use ghost or outline style.
- Never show bare red delete text in table rows. Use a row actions menu and a confirmation dialog that names the record number.
- Never use one color for two meanings. Payment status and link type use different color families.
- Links to related records look and behave like links: clickable and large enough to hit.

### Permissions
- Sensitive columns (profit, cost, margin) show only with the matching permission. If no permission system exists, report it. Do not invent one silently.

### Layout
- When the detail panel is open, hide lower-priority columns first. Always keep number, customer, total, and remaining visible.
- Sidebar sections can be open together, and open state persists per user.
- Sidebar footer shows user name, company name, and logout together.

## Definition of done
1. Tests pass (when the task touches business logic) and the output is shown.
2. For UI tasks: screenshots of every changed screen at 1280px and 1920px in RTL.
3. List any rule you could not satisfy and why.
4. Commit and push (see rule 7).
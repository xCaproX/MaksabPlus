# Project: Small multi-tenant SaaS ERP

Stack: Supabase (Postgres + Auth), React + Vite + TypeScript, deployed on Vercel.
UI language: Arabic, RTL.

## Product concept
- The primary user is a small-business owner who may not know accounting and may have limited computer experience. Keep workflows simple, clear, and approachable in Arabic; let the system handle accounting complexity behind the scenes. Preserve accounting correctness without making users learn accounting terminology or procedures unless the task specifically requires it.

## Working rules
1. Work in small steps. Implement ONLY what the current request asks. Do not add extra tables, columns, or features.
2. Before coding: state the plan in a few lines and list the files you will touch. After coding: list what changed and how to test it manually.
3. If a business or accounting rule is unclear, ASK. Do not guess. The owner defines the rules.
4. Do not delete or rewrite working code unless asked.
5. Act as a product-thinking collaborator, not only an implementer: understand why the change is needed, who it serves, and whether the proposed solution fits the workflow and devices. Check assumptions, reason about likely consequences, and compare practical alternatives before implementation. Recommend a better option when there is a clear one; explain material tradeoffs and ask the owner when a decision depends on their business preferences or changes established behavior. Do not blindly implement a suggestion if analysis shows it conflicts with the product goal; explain why and work through the choice with the owner.
- After completing work, create a commit and push it to GitHub; push a database migration if the change includes one.

## Database
5. All schema changes go in timestamped files under supabase/migrations/. Never edit an existing migration; add a new one.
6. Every business table has `company_id uuid not null references companies(id)`.
7. Every business table has RLS enabled, with policies that restrict rows to the user's company (use one shared helper function, e.g. `current_company_id()`).
8. Money and quantities use `numeric(18,4)`. Never float.
9. Use snake_case and plural table names. Add created_at and updated_at to every table.

## Business logic
10. Anything that changes balances, stock, or posts a document (invoices, receipts, stock movements) lives in a Postgres function that runs in ONE transaction. The frontend only calls it with supabase.rpc.
11. Never persist totals or balances calculated in the frontend. Calculate them in the database.

## Testing
12. Every business rule gets a SQL test under supabase/tests/ (pgTAP or plain SQL with assertions). Run the tests and show the output before saying the step is done.
13. Include a test that a user from company A cannot read company B's rows.

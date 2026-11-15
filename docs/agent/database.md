# Database, security, business logic, and tests

Read this in full before any change to the database, an RPC, a view, a policy, a migration, or anything under supabase/.

Opening phrase for this file: "كابروو انا في الباك.. "
Once you have opened this file in the current session, begin every reply with exactly this phrase (see AGENTS.md, "Owner and reply style"). Never use it if you did not open this file in this session.

## Schema
1. All schema changes go in timestamped files under supabase/migrations/. Never edit an existing migration. Add a new one.
2. Every tenant-owned business table has `company_id uuid not null references companies(id)`, has RLS enabled, and has policies (`USING` and `WITH CHECK`) that restrict rows to the authenticated user's company. Use the shared tenant-context helper, e.g. `current_company_id()`.
   - Platform-global tables (such as the companies table) and intentionally shared reference/catalog tables may omit `company_id` only when their global scope is explicit in the schema/design and their access rules are documented. Never assume a table is global merely to avoid tenant isolation.
3. Money and quantities use `numeric(18,4)`. Never use floating-point types for stored monetary or quantity values.
4. Use snake_case and plural table names. Add `created_at` and `updated_at` to mutable application tables. Omit timestamps only when they are not meaningful (for example, immutable or database-managed structures), and document the reason for the exception.

## Business logic
5. Anything that changes balances, stock, or posts a document (invoices, receipts, stock movements) lives in a Postgres function that runs in ONE transaction. The frontend only calls it with supabase.rpc.
6. Never persist totals or balances calculated in the frontend. The database recalculates everything on save. The frontend MAY show live preview totals while the user types; preview values are display-only and are never sent as authoritative data.

## Security checklist
Run this checklist for EVERY new or changed function, view, table, or policy, and write the result in the final report.
- Every `SECURITY DEFINER` function must set an explicit safe `search_path` and use least-privilege grants. Revoke execution from `PUBLIC` and `anon`; revoke from `authenticated` too unless client-side invocation is explicitly required.
- For tenant-scoped `SECURITY DEFINER` functions, derive the company from trusted server-side/authenticated context inside the function (normally `current_company_id()`). Never trust a `company_id` supplied by the client; constrain every tenant-data query to the derived company. Platform-admin, system, and trigger functions may use a different context only when that authorization path is explicit, checked, and documented. Do not force a tenant context onto a genuinely global operation.
- Functions used only by triggers or other database functions must not be executable by clients. Keep internal helpers revoked from client roles. If trigger execution needs elevated privileges, make only the trusted trigger entrypoint `SECURITY DEFINER`, with an explicit `search_path` and narrowly scoped behavior; do not expose an internal helper to clients just to make the trigger work.
- A `SECURITY DEFINER` function that returns tenant or sensitive data must enforce the matching permission (for example `has_permission(...)`) and tenant boundary inside the function because it bypasses ordinary RLS evaluation.
- Tenant-facing views use `security_invoker = true`. Any exception needs a documented reason and explicit permission and tenant-isolation tests.
- Sensitive data (profit, cost, margin) is protected in the database (permission check in the view or RPC), not only hidden in the UI. If no database permission exists for it, report this to the owner. Do not invent a permission silently.
- Search and filter strings that come from the user and are placed into a PostgREST filter (for example in `.or(...)`) must be escaped or replaced by an RPC. A comma or parenthesis in the text must not break or change the query.

## Tests
- Every database-enforced business rule gets a SQL test under `supabase/tests/` (pgTAP or plain SQL with assertions). Test frontend-only validation and interaction rules in the frontend test suite; test cross-layer workflows with the appropriate integration test where the project has coverage. Do not force a UI-only rule into SQL.
- Add access-boundary tests appropriate to each changed object:
  - Tenant-owned table: prove a user from company B cannot read or write company A's rows, and `anon` cannot read or write tenant data unless a deliberately public access path has been approved.
  - Tenant-facing view: prove company B and `anon` cannot read company A's protected data.
  - Tenant-facing RPC: prove company B cannot read or mutate company A's data, and `anon` cannot execute it unless the function is intentionally public and its public contract is tested.
  - Internal/trigger-only function: prove client roles cannot execute it directly; test the authorized trigger or calling-function path separately.
  - Platform-global/admin object: test the intended platform role, permission, and tenant boundaries. Do not invent a company A/B scenario for an object that is genuinely global, but document why that test does not apply.
- Run the database suite with `npm run test:db` (see the commands in `AGENTS.md`) and include a short result in the report. Run concurrency tests too when the changed behavior can race under concurrent requests.
- When you fix a bug, add a regression test at the layer where the bug occurs. If the bug crosses layers, add the necessary integration coverage as well; the test must fail before the fix and pass after it.

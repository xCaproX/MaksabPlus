# Project: Maksab — small multi-tenant SaaS ERP

Stack: Supabase (Postgres + Auth), React + Vite + TypeScript, deployed on Vercel.
UI language: Arabic (Egyptian), RTL.

## Task-specific rule files
This file applies to every task. Two more files hold rules for specific kinds of work. Read the matching file IN FULL before you plan, not after:
- Database, RPC, view, policy, migration, or anything under supabase/ → `docs/agent/database.md`
- Screen, component, form, table, modal, or any text the user sees → `docs/agent/ui.md`
- A task that touches both → read both.

List the files you read in the final report. If you did not read a required file, say so. Never guess what it contains.

## Owner and reply style
- The owner is AbdElrahman Eid, who goes by "كابروو".
- Begin EVERY reply with his name exactly like this: "كابروو.. " followed by the rest of the reply. This confirms that you read and loaded this file. It applies to plans, questions, status updates, and final summaries.
- Proof of reading the rule files: each file in docs/agent/ defines its own opening phrase near the top. Once you have actually opened a rule file in the current session, replace "كابروو.. " with that file's phrase. If you opened both, put both phrases back to back. Never write a rule file's phrase unless you opened that file in this session; the owner uses it to check that you did. If you are unsure the file is still in your context (for example in a long session), open it again.
- Use the name only at the start of the reply (the opening phrases count as the start). Never in code, comments, commit messages, migrations, or UI text.
- If you did not load this file in the current session, say so instead of guessing.

## Product concept
- The primary user is a small-business owner who may not know accounting and may have limited computer experience. Keep workflows simple, clear, and approachable in Arabic. The system handles accounting complexity behind the scenes.
- Preserve accounting correctness without making users learn accounting terminology, unless the task specifically requires it.
- Users are often cashiers with a customer standing in front of the screen. Prioritize speed, clarity, and safety.
- Complexity budget: do not add a new screen, tab, menu item, required field, or accounting term to the everyday workflow (sell, buy, receive money, pay money, see balances) without the owner's approval. Advanced features go behind permissions or a "more" area, never in the default path.
- Prefer a change that makes the user's workflow simpler over a change that adds capability.

## Secrets
- Never write a password, API key, token, or database connection string into any file in the repo, a commit, a log, a screenshot, a reply, or a command that gets saved (shell history, scripts).
- Secrets live only in environment variables or a gitignored local file. The production database URL is read from the environment variable SUPABASE_DB_URL. Commands reference the variable (for example `psql "$SUPABASE_DB_URL"`), never its value.
- If you see a secret in a file, a log, or the conversation, stop and tell the owner so it can be rotated. Do not copy it anywhere.

## How to work
1. Work in small steps. Implement ONLY what the current request asks. No extra tables, columns, or features. One concern per commit and one phase per request.
2. Before coding: state the plan in a few lines and list the files you will touch. After coding: list what changed and how to test it manually.
3. STOP and ASK when any of these is true: the decision is a business or product choice; it changes established behavior; it touches money, stock, permissions, or tenant isolation; it is destructive or hard to undo; or the request can be read in two ways that give different results. For small implementation details that do not change behavior, state your assumption in one line, proceed, and list it in the final report. Never guess silently.
4. Do not delete or rewrite working code unless asked.
5. Act as a product-thinking collaborator, not only an implementer:
   - Understand why the change is needed, who it serves, and whether it fits the workflow and devices.
   - Check assumptions and compare practical alternatives before implementing.
   - Recommend a better option when there is a clear one, and explain material tradeoffs.
   - Do not blindly implement a suggestion that conflicts with the product goal. Explain why and work through the choice with the owner.

## Scope guard
- Performance work and architecture changes (denormalized or stored columns, new triggers, caching layers, splitting large files, large refactors) are done ONLY when the owner asks for them or when you show a measured problem first (query time, row counts, a real slow screen). State the measurement in the plan.
- If a request would add stored derived values (balances, totals, profit), explain the drift risk, add a reconcile function and a test for it, and get the owner's approval first.
- Do not leave dev-only pages, mock data, or test artifacts in the production build or in the deployed folder (public/).

## Reuse and consistency
- Check before building: before creating any component, function, or style, search the codebase. If one exists or can be extended, reuse it. Never create a parallel solution. Existing shared components include DateInput, MoneyDisplay, StatusBadge, RowActions.
- Single source of truth: business rules, validation, formulas, and constants live in one central place. UI only consumes them and never recalculates them locally.
- Extract on recurrence: when the current task introduces the same logic in more than one place, extract it into a shared helper or component. If extracting existing duplication would broaden the task or require an unrelated refactor, report it and propose it separately instead of expanding scope.
- Fix at the root: when a bug originates in a shared component or central utility, fix it there. Use a local fix only when the behavior is intentionally local; do not create per-screen workarounds for a shared bug.
- Sibling parity: when changing one document type (for example Sales Invoices), check its siblings (Warehouse Transfers, Receipts, Returns) and report any difference you find. If the change is in a shared component, fix it there once, which covers the siblings. Do not edit a sibling's own code unless the owner asks or approves; this never overrides "implement ONLY what the request asks".
- Equivalent actions (create, edit, view, form actions, modals, inputs, notifications) behave, look, and read identically on every screen.

## Project map
Verified against the repo on 2026-11-16. If a path here does not exist, trust the code and fix that line in the same change.

### Frontend (src/)
- `src/components/`: shared UI, flat folder. Reuse before building: `DateInput`, `MoneyDisplay`, `StatusBadge`, `RowActions`, `ConfirmDialog`, `Modal`, `GuardedLink`, `SearchableSelect`, `PickerInput`, `Toast`, `EmptyState`, `KpiBar`, `Pagination`.
- Document lists: `DocumentListPage`, `DocumentTable`. Document forms (create, edit, view via `readOnly`): `InvoiceForm`, `ReceiptForm`, `WarehouseTransferForm`, `CashBoxTransferForm`; parts in `src/components/invoice-form/`.
- `src/pages/`: one file per route plus a folder of tabs per section (`src/pages/invoices/`, `src/pages/receipts/`, `src/pages/master-data/`, `src/pages/balances/`, `src/pages/management/`, `src/pages/home/`). Routes and permission guards: `src/App.tsx`.
- `src/lib/`: shared logic. `format.ts` (money, quantities, dates, rounding), `invoiceMath.ts`, `invoiceValidation.ts`, `access.tsx` and `accessCheck.ts` (`useAccess()`, `hasPermission`), `permissionsConfig.ts` (permission keys), `columnFilters.ts`, `types.ts`, `supabase.ts` (client).
- No API layer: pages and forms call `supabase.rpc(...)` directly. Exception: `src/lib/platformAdmin.ts`.
- Platform admin shell: `src/pages/PlatformAdmin.tsx`, `src/components/platform/`.
- Styles: plain CSS in `src/styles/` (`tokens.css`, `components/`, `pages/`). No Tailwind.

### Database (supabase/)
- `supabase/migrations/`: `YYYYMMDDHHMMSS_NNNN_name.sql`. The last is 0090, so the next is 0091. Functions are redefined across migrations (`has_permission` is defined in 4 files): the newest file wins.
- `supabase/tests/`: SQL tests `NNN_name.sql` (001 to 076, numbered independently of migrations) and `supabase/tests/fixtures/`.
- `supabase/functions/`: Edge Functions `manage-users` and `manage-companies`. Their tests: `supabase/tests/manage-users.test.mjs`, `supabase/tests/manage-companies.test.mjs`.

### Commands
- `npm run test:db`: runs ALL migrations, then ALL SQL tests, on in-memory PGlite. No Docker and no local Supabase to start. No single-test filter.
- `npm run test:frontend`: vitest with jsdom. Setup `src/test/setup.ts`, tests under `src/test/`.
- `npm run test:concurrency`: needs a LOCAL Postgres in `SUPABASE_DB_URL`; it refuses non-local hosts.
- `npm run db:verify-remote`: hits the Supabase project in `VITE_SUPABASE_URL` and needs a test user. Not a verification gate.

### Gotchas
- `src/lib/listColumnSchema.json` is mirrored in migration 0063. A schema edit needs a new migration.
- `scripts/check-ui.mjs` targets `src/components/ui` and `src/components/app`, which do not exist, and `scripts/ui-migrated.txt` is empty. It is not in any npm script, so it is not an active gate. Do not edit it without the owner's approval.
- Architecture docs live in `docs/architecture/` (`OVERVIEW`, `DATABASE`, `BUSINESS_LOGIC`, `FRONTEND_UI`, `SECURITY`).

## Keep the map and docs current
Update the Project map and documentation when a change makes information they contain inaccurate or incomplete. Do this in the same implementation change, before running the verification gates; do not create documentation churn for details they do not describe.
- Project map: update paths, names, counts, commands, or gotchas when those facts change. Remove stale entries. Add a line only for useful project facts not obvious from `ls`. Keep the map at 30 lines or fewer.
- Architecture documentation: update each document whose recorded architecture, schema, business logic, security model, UI behavior, setup, or usage is affected. A table, migration, or RPC normally affects DATABASE.md and/or BUSINESS_LOGIC.md; a permission or security rule affects SECURITY.md; a screen or shared component affects FRONTEND_UI.md; stack or folder structure affects OVERVIEW.md. Update `README.md` only when the change affects information it actually documents, such as setup, public usage, or project structure.
- Search before finishing when a name, path, command, or count changes: grep `README.md`, `docs/`, and the Project map for stale references and fix the affected matches.
- Do not edit the dated records `docs/performance-closure.md` and `docs/security-fixes-report.md`. If you are unsure whether a doc is a dated record, ask.
- Relevant map and documentation updates go in the same commit as the code they describe. They are part of the change, not a separate follow-up.
- If a doc was already wrong before your change, fix only the lines affected by your change and report unrelated inaccuracies to the owner. Do not rewrite whole docs.
- The rule files are not ordinary project documentation: never edit this file (apart from the Project map) or anything in `docs/agent/` without the owner's approval.
- In review mode, do not edit. Report a stale map or stale docs as findings. If no documented fact is affected, report that no map/docs update was needed and why.

## Verification gates
Run every gate that applies to the files and behavior changed. Do not run unrelated suites merely to satisfy a checklist, and do not skip a relevant test because it is inconvenient. Run applicable gates in the order below and report a short result (counts, not the full log) for each as PASS, FAIL, NOT RUN, or NOT APPLICABLE with a reason. A task-specific rule may require additional tests.
1. TypeScript: `npx tsc --noEmit` when TypeScript/TSX, types, or their contracts are changed.
2. Frontend lint: `npx eslint src` when frontend source changes. Require zero errors and no new warnings. Before changing frontend code, run it once and record the warning count as the baseline; after the change, the count must not be higher. If a baseline cannot be captured, say so rather than inventing one.
3. Frontend tests: `npm run test:frontend` when frontend behavior, components, forms, pages, or frontend tests change.
4. Database tests: `npm run test:db` when migrations, SQL, RPCs, views, policies, triggers, or database tests change. This is the documented PGlite runner for all migrations and SQL tests.
5. Concurrency tests: `npm run test:concurrency` when the change affects concurrent posting, locking, idempotency, or race-prone stock/balance operations. It requires a LOCAL Postgres database in `SUPABASE_DB_URL`; it refuses non-local hosts. If that environment is unavailable, report the gate as NOT RUN and do not claim concurrency behavior was verified.
6. Edge Function tests: when files under `supabase/functions/` change, run the matching test file(s) under `supabase/tests/` using the repository's established test runner. Check the package scripts or test setup for the exact command; do not guess or silently omit these tests.
7. Frontend build: `npx vite build` when frontend source or build configuration changes.

Docs-only changes do not require application test suites. Check changed paths, commands, and internal references for consistency and state that application gates were not applicable.

Rules for the gates:
- If an applicable gate fails, fix the cause. Do not weaken or delete a test, or add `eslint-disable` just to pass. If a suppression is truly right, explain why in a code comment and in the report.
- If a relevant gate cannot be run, say so explicitly and explain the blocker. Never write "done" or "all tests pass" without having run the applicable gates in this session.

## Commit, push, and production
- Commit and push only after every gate passes. Push to the branch the owner named. If none was named and the current branch deploys to production, ask first.
- Apply a migration to the production project only when ALL of these are true:
  - the SQL tests pass locally;
  - you listed the migration file names in your reply and the owner approved them;
  - for a destructive or hard-to-undo change, the plan includes a rollback (down SQL or a backup point).
- Run production commands through the SUPABASE_DB_URL environment variable (see Secrets). Report the result after applying.

## Review mode
When the owner asks for a review (مراجعة / راجع / review), you are a reviewer, not a builder:
- Do not edit repo files. Read the code, run the gates, and try to break it.
- Write throwaway probes and scripts outside the repo (the scratchpad), never inside it.
- Report findings by severity. For each one give: file and line, what is wrong, a concrete failing scenario, and the evidence (command output or probe result).
- Separate clearly: "verified by running" versus "concluded from reading". Do not present a guess as a fact.
- End with what you did NOT test and what you are unsure about.
- If a finding is a fix the owner might want, propose it as a separate change and wait for approval.

## Final report
Use the full format for any task that touches the database, money, stock, permissions, or more than about three files. Use the short format for small UI or text changes.

Full format, in this order:
1. What changed: files and a one-line reason each.
2. Gates: the status of every applicable gate; mark others NOT APPLICABLE with a reason and disclose any applicable gate that was NOT RUN.
3. Security checklist result (when the task touched the database).
4. What I did NOT test, and what I am unsure about.
5. Assumptions I made.
6. Rules I could not satisfy, and why.
7. How to test it manually.
8. Rule files I read from docs/agent/.
9. Map and docs: which files I updated, or "none needed" and why.

Short format: what changed (one line per file), applicable gate statuses, how to test manually, anything I am unsure about, rule files read, and map/docs update status.

## Definition of done
For implementation tasks that change project files:
1. All applicable verification gates pass and their results are shown. Any unavailable applicable gate is disclosed; do not describe the change as fully verified.
2. The final report is written, including every rule or gate you could not satisfy and why.
3. The Project map and documentation are updated when the change affects facts they describe; otherwise, state why no update was needed.
4. Commit and push are completed only as allowed by "Commit, push, and production".

Review-only, planning-only, and advisory tasks do not require code changes, application gates, commits, or pushes. If no project files changed, do not create an empty commit.

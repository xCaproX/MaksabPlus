# MaksabPlus Source Blueprint (`src`)

## System Overview
Frontend application source for MaksabPlus, a small multi-tenant SaaS ERP engineered in React, TypeScript, and Vite. The architecture emphasizes simple, fast, and fail-safe workflows for small business owners and retail cashiers in Arabic (Egyptian, RTL), completely abstracting underlying double-entry accounting and multi-location inventory complexities.

## Local Interface & Invariants
- `App.tsx`: Root React component orchestrating authentication state listeners (`supabase.auth.onAuthStateChange`), route level code-splitting (`React.lazy` / `Suspense`), tenant access wrapper (`AccessProvider`), and master data caching wrapper (`MasterDataProvider`).
- `main.tsx`: Application bootstrap file initializing the React DOM root (`createRoot`) and importing Cairo typeface assets.
- `index.css`: Stylesheet manifest aggregating design tokens, base normalization, layout definitions, component styles, and page layouts.
- Invariants:
  - Direct routes require an active user session; unauthenticated traffic redirects to `/login`.
  - Global UI direction is strictly RTL (`dir="rtl"`), while numbers and currencies enforce LTR (`dir="ltr"`).

## Subdirectories & System Boundaries
- [components](./components/README.md): Shared presentation controls, accessible dialog modals, and unified domain transaction forms (`InvoiceForm`, `ReceiptForm`, `WarehouseTransferForm`, `CashBoxTransferForm`).
- [context](./context/README.md): Centralized React context (`MasterDataContext`) providing cached entity records and targeted cache invalidation.
- [lib](./lib/README.md): Pure domain logic, financial arithmetic (`round2`), permission matrices, PostgREST query sanitizers, Arabic currency tafqeet, and Supabase client bindings.
- [pages](./pages/README.md): Routed screen controllers and workflow views (`Home`, `Invoices`, `Receipts`, `Balances`, `MasterData`, `Management`, `Login`, `SetPassword`).

## Global Invariants
- **Unified Document Layout**: Every document entity (sales invoices, purchases, returns, waste, receipts, warehouse transfers) uses a single shared form component across `create`, `edit`, and `view` modes (via `readOnly` state) to preserve mental model parity.
- **Strict Monetary Correctness**: Floating-point persistence is forbidden; numbers and currency quantities enforce `numeric(18,4)` backend semantics and two-decimal rounding on the frontend (`round2`).
- **Accounting Abstraction**: Users interact exclusively with business actions (sell, buy, receive cash, pay cash); debit/credit double-entry ledger postings are generated atomically by database transactions.
- **RTL & Number Isolation**: All numeric, monetary, and serial displays are wrapped in explicit LTR elements (`<bdi>` or `dir="ltr"`) with tabular figure alignment (`tabular-nums`).

## Global Side Effects
- Communicates with PostgreSQL database backend hosted on Supabase via secure RPC procedures and tenant-isolated PostgREST queries.
- Manages authenticated sessions and JWT tokens via Supabase Auth.
- Persists user preferences (e.g. sidebar collapsed/expanded groups) in browser `localStorage`.

## System Verification
- Type Check: `npx tsc --noEmit`
- Linter: `npx eslint src`
- Unit & Component Tests: `npx vitest run`
- Production Build: `npx vite build`

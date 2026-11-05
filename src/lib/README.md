# Core Utilities, Domain Logic & Types

## Overview
Foundation libraries implementing domain arithmetic, validation rules, error translation, permission evaluation, number/date formatting, and Supabase client configuration.

## Interface
- `access.tsx`: `AccessProvider`, `AccessRoute`, and `useAccess` providing React route protection and permission checks.
- `accessCheck.ts`: Pure functional helpers (`hasPermission`, `canAccessRoute`, `filterAllowedTabs`) for RBAC verification.
- `company.ts`: `getCurrentUserIdentity` resolving current tenant user identity and company name.
- `errors.ts`: `translateDbError` (translates PostgreSQL/PostgREST error codes to localized Arabic messages) and `errorMessage`.
- `format.ts`: Visual formatters (`money`, `qty`, `formatDate`, `entityNumber`, `today`, `round2`, `getBalanceStatus`).
- `invoiceMath.ts`: Transaction calculations (`calculateInvoiceSubtotal`, `calculateRemaining`, `calculateBalancePreview`).
- `invoiceValidation.ts`: Pre-submission validations (`validateInvoiceLines`, `calculateAvailableStock`).
- `masterDataQueries.ts`: Asynchronous lookup utilities (`searchAccountsAsync`, `searchWarehouseItemsAsync`, `lookupBarcodeItem`).
- `permissionsConfig.ts`: Hierarchical permission taxonomy, role presets (`PRESETS`), and permission key extractors.
- `search.ts`: PostgREST query sanitization (`buildPostgrestOrFilter`) and in-memory search matchers (`matchesSearchQuery`).
- `supabase.ts`: Instantiated Supabase client (`supabase`) and configuration check flag (`isSupabaseConfigured`).
- `tafqeet.ts`: Egyptian Pound text currency converter (`tafqeet`) for receipts and invoices.
- `types.ts`: Shared TypeScript interfaces and domain models.
- `useConfirmDialog.ts`: React hook managing confirmation dialog lifecycle and user confirmation promises.

## Invariants
- Mathematical and financial operations enforce two-decimal precision (`round2`) to eliminate floating-point drift.
- Search filters processed through `buildPostgrestOrFilter` sanitize punctuation (commas, parentheses) to prevent PostgREST query syntax injection.
- Date representations are strictly formatted as `dd/mm/yyyy` across all formatting utilities.

## Side Effects
- Initializes the global Supabase client communicating with backend endpoints.
- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from runtime environment variables.

## Verification
- Run: `npx vitest run src/test/`

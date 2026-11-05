# Home Dashboard Widgets

## Overview
Modular dashboard widgets rendering financial KPIs, daily sales metrics, top accounts/products, inventory replenishment alerts, and quick action shortcuts.

## Interface
- `FinancialPulseCards`: Displays real-time cash balances, receivables (due from customers), and payables (due to suppliers).
- `SalesMetricCards`: Summarizes sales performance across today, current week, and current month.
- `QuickActions`: Role-gated action buttons allowing rapid creation of sales invoices and receipts.
- `LowStockCard`: Alert list highlighting items below minimum stock threshold.
- `TopRankedList`: Leaderboard listing top customers by revenue and top items by quantity sold.

## Invariants
- Cards render conditionally based on user permissions (`permissions.can_view_sales`, `can_view_cash`, etc.).
- Amounts and quantities strictly enforce LTR alignment and tabular numerals.

## Side Effects
- Consumes pre-aggregated data returned by the `get_home_dashboard_summary` RPC.
- Navigates to target forms on quick action click.

## Verification
- Run: `npx vitest run src/test/components/HomeDashboard.test.tsx`

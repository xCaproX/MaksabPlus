-- Stock may only change inside validated, atomic document/opening RPCs.
revoke insert, update, delete, truncate on public.item_stock from public, anon, authenticated;
revoke all on function public.apply_stock_movement(uuid, uuid, uuid, numeric, numeric)
  from public, anon, authenticated;

-- These entry points already derive and validate the caller's company. They
-- must execute the locked stock helper with the database owner's privileges.
alter function public.create_invoice(text, uuid, uuid, date, numeric, text, jsonb) security definer;
alter function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) security definer;
alter function public.delete_invoice(uuid) security definer;
alter function public.restore_invoice(uuid) security definer;
alter function public.delete_item(uuid) security definer;

-- This helper is internal to invoice RPCs; clients must not change stored totals.
revoke all on function public.recalc_invoice_totals(uuid) from public, anon, authenticated;

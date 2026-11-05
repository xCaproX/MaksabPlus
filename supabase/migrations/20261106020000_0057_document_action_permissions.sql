-- Document writes belong to RPCs: table grants must not let callers bypass
-- document validation, accounting, stock, or the exact action permission.
revoke insert, update, delete, truncate on
  public.invoices, public.invoice_items, public.receipts,
  public.warehouse_transfers, public.warehouse_transfer_items, public.cash_box_transfers
  from public, anon, authenticated;

-- These helpers are called only from validated document RPCs.
revoke all on function public.sync_invoice_receipt(uuid) from public, anon, authenticated;
revoke all on function public.set_linked_receipt_deleted(uuid, boolean) from public, anon, authenticated;

-- Exact permissions are enforced at RPC entry, rather than on each internal
-- insert/update/delete (creating a document also updates stock and totals).
do $$
declare
  v_function record;
  v_definition text;
  v_body integer;
  v_begin integer;
  v_check text;
  v_action text;
  v_table text;
begin
  for v_function in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'create_invoice','create_invoice_with_cash_box','update_invoice','update_invoice_with_cash_box',
      'delete_invoice','restore_invoice',
      'create_free_receipt','update_free_receipt','delete_free_receipt','restore_receipt',
      'create_warehouse_transfer','update_warehouse_transfer','delete_warehouse_transfer','restore_warehouse_transfer',
      'create_cash_box_transfer','update_cash_box_transfer','delete_cash_box_transfer','restore_cash_box_transfer'])
  loop
    v_action := case
      when v_function.proname like 'create_%' then 'create'
      when v_function.proname like 'update_%' then 'edit'
      else 'delete' end;
    if v_function.proname like '%warehouse_transfer' then
      v_check := format('perform public.require_permission(%L);', 'goods.warehouse_transfer.' || v_action);
    elsif v_function.proname like '%cash_box_transfer' then
      v_check := format('perform public.require_permission(%L);', 'money.cash_box_transfer.' || v_action);
    elsif v_function.proname in ('create_invoice','create_invoice_with_cash_box') then
      v_check := format('perform public.require_permission(''goods.'' || p_kind || %L);', '.' || v_action);
    elsif v_function.proname = 'create_free_receipt' then
      v_check := format('perform public.require_permission(''money.'' || p_direction || %L);', '.' || v_action);
    elsif v_function.proname like '%invoice%' then
      v_check := format($check$
        perform public.require_permission('goods.' || (
          select kind from public.invoices
          where id = p_invoice_id and company_id = public.current_company_id()
        ) || %L);
      $check$, '.' || v_action);
    else
      v_check := format($check$
        perform public.require_permission('money.' || (
          select direction from public.receipts
          where id = p_receipt_id and company_id = public.current_company_id()
            and invoice_id is null
        ) || %L);
      $check$, '.' || v_action);
    end if;
    v_definition := v_function.definition;
    v_body := strpos(v_definition, '$function$');
    v_begin := strpos(lower(substr(v_definition, v_body)), 'begin');
    if v_body = 0 or v_begin = 0 then
      raise exception 'cannot locate document RPC body: %', v_function.proname;
    end if;
    execute overlay(v_definition placing E'\n  ' || v_check || E'\n' from v_body + v_begin + 4 for 0);
    execute format('alter function %s security definer', v_function.oid::regprocedure);
    execute format('revoke all on function %s from public, anon', v_function.oid::regprocedure);
  end loop;

  foreach v_table in array array['invoices','invoice_items','receipts','warehouse_transfers',
      'warehouse_transfer_items','cash_box_transfers','item_stock'] loop
    execute format('drop trigger %I on public.%I', v_table || '_permission_guard', v_table);
  end loop;
end $$;

-- A permission for one document tab must not reveal another tab's rows.
alter policy invoices_permissions on public.invoices
  using (public.has_permission('goods.' || kind || '.view')
    or public.has_permission('goods.' || kind || '.create')
    or public.has_permission('goods.' || kind || '.edit')
    or public.has_permission('goods.' || kind || '.delete')
    or public.has_permission('balances.view') or public.has_permission('management.view'));
alter policy invoice_items_permissions on public.invoice_items
  using (exists (select 1 from public.invoices i
    where i.id = invoice_id and i.company_id = public.current_company_id()));
alter policy receipts_permissions on public.receipts
  using (public.has_permission('money.' || direction || '.view')
    or public.has_permission('money.' || direction || '.create')
    or public.has_permission('money.' || direction || '.edit')
    or public.has_permission('money.' || direction || '.delete')
    or (invoice_id is not null and exists (select 1 from public.invoices i
      where i.id = invoice_id and i.company_id = public.current_company_id()))
    or public.has_permission('balances.view') or public.has_permission('management.view'));

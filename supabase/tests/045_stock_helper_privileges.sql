begin;
do $$
declare v_role text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role,'public.item_stock','INSERT')
       or has_table_privilege(v_role,'public.item_stock','UPDATE')
       or has_table_privilege(v_role,'public.item_stock','DELETE')
       or has_table_privilege(v_role,'public.item_stock','TRUNCATE') then
      raise exception 'Stock DML must not be available to %', v_role;
    end if;
    if has_function_privilege(v_role,'public.apply_stock_movement(uuid,uuid,uuid,numeric,numeric)','EXECUTE')
       or has_function_privilege(v_role,'public.recalc_invoice_totals(uuid)','EXECUTE') then
      raise exception 'Internal stock and total helpers must not be available to %', v_role;
    end if;
  end loop;
end $$;
rollback;

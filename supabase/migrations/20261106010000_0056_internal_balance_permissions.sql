-- Internal balance updates are nested trigger writes and may only change the
-- derived columns. A client-set configuration flag is deliberately insufficient.
do $$
declare
  v_definition text := pg_get_functiondef('public.guard_permission_write()'::regprocedure);
  v_marker text := '  v_action:=case';
  v_insert text := $code$
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and new.company_id = public.current_company_id() then
    if tg_table_name = 'accounts' then
      if (to_jsonb(new) - array['current_balance','effective_opening_balance',
            'invoiced_total','paid_total','has_documents','updated_at'])
         = (to_jsonb(old) - array['current_balance','effective_opening_balance',
            'invoiced_total','paid_total','has_documents','updated_at']) then
        return new;
      end if;
    elsif tg_table_name = 'cash_boxes' then
      if (to_jsonb(new) - array['current_balance','effective_opening_balance','updated_at'])
         = (to_jsonb(old) - array['current_balance','effective_opening_balance','updated_at']) then
        return new;
      end if;
    end if;
  end if;
$code$;
begin
  if strpos(v_definition, v_marker) = 0 then
    raise exception 'guard_permission_write definition did not match';
  end if;
  execute replace(v_definition, v_marker, v_insert || v_marker);
end $$;

revoke all on function public.guard_permission_write() from public, anon, authenticated;

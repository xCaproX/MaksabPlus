-- Match creator-name searches in the list and its server-side summaries.
-- Preserve the current permission checks, tenant filters and cost protection.
do $$
declare
  v_function regprocedure;
  v_definition text;
  v_extended text;
  v_alias text;
  v_marker text := '      v_search = ' || quote_literal('');
  v_search_declaration text := '  v_search text := trim(coalesce(p_search, ''''));';
begin
  foreach v_function in array array[
    'public.get_invoice_kpis(text,text,text,text,text,boolean)'::regprocedure,
    'public.get_receipt_kpis(text,uuid,text,text,text,boolean)'::regprocedure,
    'public.get_warehouse_transfer_kpis(text,text,text,boolean)'::regprocedure,
    'public.get_cash_box_transfer_kpis(uuid,text,text,text,boolean)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_alias := case when v_function::text like '%get_cash_box_transfer_kpis%' then 'cbt' else 'v' end;
    if strpos(v_definition, 'v_pattern text') = 0 then
      v_definition := replace(v_definition, v_search_declaration, v_search_declaration || E'\n' ||
        '  v_pattern text := ''%'' || replace(replace(replace(v_search, chr(92), chr(92)||chr(92)), ''%'', chr(92)||''%''), ''_'', chr(92)||''_'') || ''%'';');
      if strpos(v_definition, 'v_pattern text') = 0 then raise exception 'search_declaration_did_not_match'; end if;
      v_definition := replace(v_definition, 'ilike ''%'' || v_search || ''%''', 'ilike v_pattern');
    end if;
    v_extended := replace(v_definition, v_marker,
      v_marker || E'\n      or ' || v_alias || '.created_by_name ilike v_pattern');
    if v_extended = v_definition then raise exception 'document_search_definition_did_not_match'; end if;
    execute v_extended;
    execute format('revoke all on function %s from public, anon',v_function);
    execute format('grant execute on function %s to authenticated',v_function);
  end loop;
end $$;

-- Compile the existing invoice column schema to predicates over individual
-- view columns. Values remain bound parameters; identifiers come from the
-- validated server-owned schema, never from SQL supplied by the client.
-- Parameter contract: $1 company, $2 kind, $3 columns, $4 global search.
create function public.invoice_list_predicate(p_columns jsonb, p_search text default null)
returns text language plpgsql stable set search_path = public as $$
declare
  v_schema jsonb := public.list_column_schema('invoice');
  v_key text; v_wanted text; v_column jsonb; v_field text;
  v_actual text; v_parameter text; v_condition text;
  v_conditions text[] := array[]::text[];
  v_fields text[];
begin
  perform public.validate_list_columns('invoice', p_columns);
  for v_key, v_wanted in select key, btrim(coalesce(value, '')) from jsonb_each_text(p_columns) loop
    if v_wanted = '' then continue; end if;
    select c into v_column from jsonb_array_elements(v_schema->'columns') c where c->>'key' = v_key;
    v_actual := format('v.%I', coalesce(v_column->>'source', v_key));
    v_parameter := format('btrim($3->>%L)', v_key);
    if v_key = 'created_by_name' then
      v_actual := 'coalesce(nullif(v.created_by_name, ''''), ''غير مسجل'')';
    elsif v_column->>'format' = 'payment_status' then
      v_actual := 'case when v.remaining <= 0 then ''paid'' when v.paid > 0 then ''partial'' else ''unpaid'' end';
    elsif v_column->>'format' = 'time' then
      v_actual := format('to_char(%s at time zone ''Africa/Cairo'', ''HH24:MI'')', v_actual);
    end if;

    case v_column->>'type'
    when 'text' then
      v_fields := array[]::text[];
      if v_column ? 'fields' then
        for v_field in select jsonb_array_elements_text(v_column->'fields') loop
          v_fields := array_append(v_fields, format(
            'strpos(lower(coalesce(v.%I::text, '''')), lower(%s)) > 0', v_field, v_parameter));
        end loop;
      else
        v_fields := array[format('strpos(lower(coalesce(%s::text, '''')), lower(%s)) > 0', v_actual, v_parameter)];
      end if;
      v_condition := '(' || array_to_string(v_fields, ' or ') || ')';
    when 'number' then
      v_condition := format('%s = (%s)::numeric', v_actual, v_parameter);
    when 'date' then
      v_condition := format('%s = (%s)::date', v_actual, v_parameter);
    when 'time' then
      v_condition := format('%s = %s', v_actual, v_parameter);
    when 'select' then
      if v_key = 'warehouse_id' then
        -- The old exact string comparison rejected noncanonical UUID strings
        -- without a cast error. Keep that behavior while allowing index use.
        v_condition := case when v_wanted ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then format('%s = (%s)::uuid', v_actual, v_parameter) else 'false' end;
      else
        v_condition := format('(%s)::text = %s', v_actual, v_parameter);
      end if;
    else
      raise exception 'invalid_filter_column' using errcode = '22023';
    end case;
    v_conditions := array_append(v_conditions, v_condition);
  end loop;

  if btrim(coalesce(p_search, '')) <> '' then
    v_fields := array[]::text[];
    for v_field in select jsonb_array_elements_text(v_schema->'globalFields') loop
      v_actual := case when v_field = 'created_by_name'
        then 'coalesce(nullif(v.created_by_name, ''''), ''غير مسجل'')' else format('v.%I', v_field) end;
      v_fields := array_append(v_fields, format(
        'strpos(lower(coalesce(%s::text, '''')), lower(btrim($4))) > 0', v_actual));
    end loop;
    v_conditions := array_append(v_conditions, '(' || array_to_string(v_fields, ' or ') || ')');
  end if;
  return coalesce(nullif(array_to_string(v_conditions, ' and '), ''), 'true');
end $$;
revoke all on function public.invoice_list_predicate(jsonb,text) from public, anon, authenticated;

-- Legacy callers and the page endpoint share the same literal/exact matching
-- rules. This endpoint still returns all matches, as its existing contract does.
create or replace function public.filter_invoice_rows(p_columns jsonb, p_search text default null, p_kind text default 'sale')
returns setof public.v_invoice_list language plpgsql stable security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_where text;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind is null or p_kind not in ('sale','purchase','sale_return','purchase_return','waste') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  perform public.require_permission('goods.' || p_kind || '.view');
  v_where := public.invoice_list_predicate(p_columns, p_search);
  return query execute 'select v.* from public.v_invoice_list v
    where v.company_id = $1 and v.kind = $2 and (' || v_where || ')'
    using v_company, p_kind, p_columns, p_search;
end $$;
revoke all on function public.filter_invoice_rows(jsonb,text,text) from public, anon;
grant execute on function public.filter_invoice_rows(jsonb,text,text) to authenticated;

create function public.get_invoice_page(
  p_columns jsonb default '{}'::jsonb,
  p_kind text default 'sale',
  p_search text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_show_deleted boolean default false,
  p_sort_order text default 'date-desc',
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_where text; v_order text; v_field text; v_direction text;
  v_supported boolean; v_count bigint; v_rows jsonb;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind is null or p_kind not in ('sale','purchase','sale_return','purchase_return','waste') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  perform public.require_permission('goods.' || p_kind || '.view');
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_page_range' using errcode = '22023';
  end if;
  v_where := 'v.company_id = $1 and v.kind = $2 and (' || public.invoice_list_predicate(p_columns, p_search) || ')';
  v_where := v_where || case when p_show_deleted is true then ' and v.deleted_at is not null' else ' and v.deleted_at is null' end;
  if p_date_from is not null then v_where := v_where || ' and v.invoice_date >= $5'; end if;
  if p_date_to is not null then v_where := v_where || ' and v.invoice_date <= $6'; end if;

  v_field := split_part(coalesce(p_sort_order, ''), '-', 1);
  v_supported := v_field in ('date','number','account','total','remaining');
  v_direction := case when v_supported and split_part(p_sort_order, '-', 2) = 'asc' then ' asc' else ' desc' end;
  v_order := case v_field when 'number' then 'v.number' when 'account' then 'v.account_name'
    when 'total' then 'v.total' when 'remaining' then 'v.remaining' else 'v.invoice_date' end || v_direction;
  if v_field <> 'number' then v_order := v_order || ', v.number' || v_direction; end if;

  -- Counting references only the columns needed by the predicates. In
  -- particular it must never evaluate cost/profit projections for every row.
  execute 'select count(*) from public.v_invoice_list v where ' || v_where
    into v_count using v_company, p_kind, p_columns, p_search, p_date_from, p_date_to;

  -- The materialized page contains only IDs and positions. Protected cost
  -- readers and JSON serialization run after LIMIT/OFFSET, for this page only.
  execute 'with page as materialized (
      select v.id, row_number() over (order by ' || v_order || ') as position
      from public.v_invoice_list v where ' || v_where || '
      order by ' || v_order || ' limit $8 offset $7
    )
    select coalesce(jsonb_agg(to_jsonb(v) order by p.position), ''[]''::jsonb)
    from page p join public.v_invoice_list v on v.id = p.id and v.company_id = $1'
    into v_rows using v_company, p_kind, p_columns, p_search, p_date_from, p_date_to, p_offset, p_limit;
  return jsonb_build_object('rows', v_rows, 'total_count', v_count);
end $$;
revoke all on function public.get_invoice_page(jsonb,text,text,date,date,boolean,text,integer,integer) from public, anon;
grant execute on function public.get_invoice_page(jsonb,text,text,date,date,boolean,text,integer,integer) to authenticated;

notify pgrst, 'reload schema';

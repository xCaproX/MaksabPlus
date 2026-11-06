-- Shared column-filter experiment. The schema below is generated from
-- src/lib/listColumnSchema.json; future schema edits require a new migration.
-- Legacy KPI entry points delegate to the same filtered implementation.
create function public.list_column_schema(p_scope text)
returns jsonb language plpgsql immutable set search_path=public as $schema$
declare v_schema jsonb := $json${"invoice":{"globalFields":["number","account_name","account_phone","warehouse_name","notes","created_by_name"],"columns":[{"key":"number","label":"الرقم","type":"text","className":"col-number"},{"key":"invoice_date","label":"التاريخ","type":"date","className":"col-date"},{"key":"created_time","label":"الوقت","type":"time","source":"created_at","format":"time","className":"col-time"},{"key":"warehouse_id","label":"المخزن","type":"select","options":"warehouses"},{"key":"account_kind","label":"نوع الحساب","type":"select","options":[{"value":"customer","label":"عميل"},{"value":"supplier","label":"مورد"}]},{"key":"account","label":"الحساب","type":"text","fields":["account_name","account_phone"],"className":"col-account"},{"key":"total","label":"الإجمالي","type":"number","className":"col-money"},{"key":"paid","label":"المسدد","type":"number","className":"col-money","excludeKinds":["waste"]},{"key":"remaining","label":"الآجل","type":"number","className":"col-money","excludeKinds":["waste"]},{"key":"payment_status","label":"الحالة","type":"select","options":[{"value":"paid","label":"مسددة"},{"value":"partial","label":"جزئية"},{"value":"unpaid","label":"غير مسددة"}],"format":"payment_status","excludeKinds":["waste"]},{"key":"notes","label":"ملاحظات","type":"text","className":"col-notes"},{"key":"created_by_name","label":"بواسطة","type":"select","options":"creators","className":"col-creator"},{"key":"","label":"","type":"none"}]},"receipt":{"globalFields":["number","account_name","account_phone","cash_box_name","statement","notes","created_by_name"],"columns":[{"key":"number","label":"الرقم","type":"text","className":"col-number"},{"key":"receipt_date","label":"التاريخ","type":"date"},{"key":"created_time","label":"الوقت","type":"time","source":"created_at","format":"time","className":"col-time"},{"key":"cash_box_id","label":"الخزنة","type":"select","options":"cashBoxes"},{"key":"account_kind","label":"نوع الحساب","type":"select","options":[{"value":"customer","label":"عميل"},{"value":"supplier","label":"مورد"}]},{"key":"account","label":"الحساب","type":"text","fields":["account_name","account_phone"]},{"key":"amount","label":"المبلغ","type":"number","className":"col-money"},{"key":"receipt_type","label":"نوع الإيصال","type":"select","options":[{"value":"free","label":"إيصال حر"},{"value":"linked","label":"مرتبط بمستند"}],"format":"receipt_type"},{"key":"statement","label":"البيان","type":"text"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-notes"},{"key":"created_by_name","label":"بواسطة","type":"select","options":"creators","className":"col-creator"},{"key":"","label":"","type":"none"}]},"warehouse_transfer":{"globalFields":["number","source_warehouse_name","destination_warehouse_name","notes","created_by_name"],"columns":[{"key":"number","label":"الرقم","type":"text","className":"col-number"},{"key":"transfer_date","label":"التاريخ","type":"date"},{"key":"created_time","label":"الوقت","type":"time","source":"created_at","format":"time","className":"col-time"},{"key":"source_warehouse_id","label":"من مخزن","type":"select","options":"warehouses"},{"key":"destination_warehouse_id","label":"إلى مخزن","type":"select","options":"warehouses"},{"key":"line_count","label":"عدد الأصناف","type":"number"},{"key":"total_qty","label":"إجمالي الكميات","type":"number"},{"key":"total_value","label":"قيمة التكلفة","type":"number","className":"col-money","ownerOnly":true},{"key":"notes","label":"ملاحظات","type":"text","className":"col-notes"},{"key":"created_by_name","label":"بواسطة","type":"select","options":"creators","className":"col-creator"},{"key":"","label":"","type":"none"}]},"cash_transfer":{"globalFields":["number","source_cash_box_name","destination_cash_box_name","notes","created_by_name"],"columns":[{"key":"number","label":"الرقم","type":"text","className":"col-number"},{"key":"transfer_date","label":"التاريخ","type":"date"},{"key":"created_time","label":"الوقت","type":"time","source":"created_at","format":"time","className":"col-time"},{"key":"source_cash_box_id","label":"من خزنة","type":"select","options":"cashBoxes"},{"key":"destination_cash_box_id","label":"إلى خزنة","type":"select","options":"cashBoxes"},{"key":"amount","label":"المبلغ","type":"number","className":"col-money"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-notes"},{"key":"created_by_name","label":"بواسطة","type":"select","options":"creators","className":"col-creator"},{"key":"","label":"","type":"none"}]},"master_accounts":{"globalFields":["name","phone","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CUS","prefixByKind":{"customer":"CUS","supplier":"SUP"}},{"key":"name","label":"الحساب","type":"text"},{"key":"phone","label":"الهاتف","type":"text","className":"col-hide-on-detail"},{"key":"is_active","label":"الحالة","type":"select","options":[{"value":"true","label":"نشط"},{"value":"false","label":"موقوف"}],"className":"col-hide-on-detail"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-hide-on-detail"},{"key":"","label":"","type":"none"}]},"master_items":{"globalFields":["name","code","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"ITM"},{"key":"code","label":"الكود","type":"text","className":"col-hide-on-detail"},{"key":"name","label":"الصنف","type":"text"},{"key":"unit","label":"الوحدة","type":"text","className":"col-hide-on-detail"},{"key":"sale_price","label":"سعر البيع","type":"number"},{"key":"purchase_price","label":"سعر الشراء","type":"number","className":"col-hide-on-detail"},{"key":"is_active","label":"الحالة","type":"select","options":[{"value":"true","label":"نشط"},{"value":"false","label":"موقوف"}]},{"key":"","label":"","type":"none"}]},"warehouses":{"globalFields":["name","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"WH"},{"key":"name","label":"المخزن","type":"text"},{"key":"is_primary","label":"النوع","type":"select","options":[{"value":"true","label":"رئيسي"},{"value":"false","label":"فرعي"}],"className":"col-hide-on-detail"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-hide-on-detail"},{"key":"is_active","label":"الحالة","type":"select","options":[{"value":"true","label":"نشط"},{"value":"false","label":"موقوف"}]},{"key":"","label":"","type":"none"}]},"cash_boxes":{"globalFields":["name","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CBX"},{"key":"name","label":"الخزنة","type":"text"},{"key":"is_primary","label":"النوع","type":"select","options":[{"value":"true","label":"رئيسية"},{"value":"false","label":"فرعية"}],"className":"col-hide-on-detail"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-hide-on-detail"},{"key":"is_active","label":"الحالة","type":"select","options":[{"value":"true","label":"نشط"},{"value":"false","label":"موقوف"}]},{"key":"","label":"","type":"none"}]},"account_balances":{"globalFields":["name","phone","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CUS","prefixByKind":{"customer":"CUS","supplier":"SUP"}},{"key":"name","label":"الحساب","type":"text"},{"key":"phone","label":"الهاتف","type":"text","className":"col-hide-on-detail"},{"key":"balance","label":"الرصيد","type":"number","className":"col-money","format":"abs","source":"balance","fallbackSource":"current_balance"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-hide-on-detail"},{"key":"","label":"","type":"none"}]},"warehouse_items":{"globalFields":["item_name","item_code","item_number","number_label","item_notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"item_number","prefix":"ITM"},{"key":"item_code","label":"الكود","type":"text","className":"col-hide-on-detail"},{"key":"item_name","label":"الصنف","type":"text"},{"key":"current_qty","label":"الكمية الحالية","type":"number"},{"key":"item_notes","label":"الملاحظات","type":"text","className":"col-hide-on-detail col-notes"},{"key":"","label":"","type":"none"}]},"opening_accounts":{"globalFields":["name","phone","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CUS","prefixByKind":{"customer":"CUS","supplier":"SUP"}},{"key":"name","label":"الحساب","type":"text"},{"key":"kind","label":"النوع","type":"select","options":[{"value":"customer","label":"عميل"},{"value":"supplier","label":"مورد"}],"className":"col-hide-on-detail"},{"key":"opening_balance","label":"الرصيد الافتتاحي","type":"number"},{"key":"balance","label":"الرصيد الحالي","type":"number","format":"abs"}]},"opening_items":{"globalFields":["item_name","item_code","item_number","number_label","item_notes","warehouse_name","warehouse_notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"item_number","prefix":"ITM"},{"key":"item_code","label":"الكود","type":"text","className":"col-hide-on-detail"},{"key":"item_name","label":"الصنف","type":"text"},{"key":"opening_qty","label":"كمية البداية","type":"number"},{"key":"unit_cost","label":"تكلفة الوحدة","type":"number","ownerOnly":true},{"key":"current_qty","label":"الرصيد الفعلي","type":"number"}]},"opening_cash":{"globalFields":["name","serial_number","number_label","notes"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CBX"},{"key":"name","label":"الخزنة","type":"text"},{"key":"opening_balance","label":"الرصيد الافتتاحي","type":"number"},{"key":"balance","label":"الرصيد الفعلي","type":"number"}]},"reconciliations":{"globalFields":["notes","performed_by_name"],"columns":[{"key":"created_date","label":"التاريخ والوقت","type":"datetime","source":"created_at","secondaryKey":"created_time"},{"key":"performed_by_name","label":"القائم بالفحص","type":"text"},{"key":"mode","label":"نوع العملية","type":"select","options":[{"value":"reconcile","label":"تصحيح فعلي"},{"value":"simulation","label":"استكشافي"}]},{"key":"scope_summary","label":"نطاق الفحص","type":"text","format":"scope_summary","className":"col-hide-on-detail"},{"key":"result_status","label":"نتيجة الفحص","type":"select","options":[{"value":"clean","label":"متطابقة"},{"value":"issues","label":"بها فروقات"}],"format":"result_status"},{"key":"notes","label":"ملاحظات","type":"text","className":"col-notes"}]},"users":{"globalFields":["full_name","email"],"columns":[{"key":"full_name","label":"الاسم","type":"text"},{"key":"email","label":"البريد الإلكتروني","type":"text"},{"key":"access_role","label":"نوع المستخدم","type":"select","options":[{"value":"owner","label":"مدير"},{"value":"employee","label":"موظف"}]},{"key":"is_active","label":"الحالة","type":"select","options":[{"value":"true","label":"نشط"},{"value":"false","label":"موقوف"}]}]},"cash_balances":{"globalFields":["name","serial_number","notes","number_label"],"columns":[{"key":"number_label","label":"الرقم","type":"text","format":"serial","source":"serial_number","prefix":"CBX"},{"key":"name","label":"الخزنة","type":"text"},{"key":"balance","label":"الرصيد الحالي","type":"number","className":"col-money"},{"key":"notes","label":"الملاحظات","type":"text","className":"col-hide-on-detail col-notes"},{"key":"","label":"","type":"none"}]}}$json$::jsonb;
begin
 if not v_schema ? p_scope then raise exception 'invalid_list_scope' using errcode='22023'; end if;
 return v_schema->p_scope;
end $schema$;
revoke all on function public.list_column_schema(text) from public,anon,authenticated;

create function public.list_column_value(p_row jsonb, p_column jsonb, p_secondary boolean default false)
returns text language plpgsql stable set search_path = public as $$
declare
 v_source text := coalesce(p_column->>'source',p_column->>'key');
 v_value text := coalesce(p_row->>v_source,p_row->>(p_column->>'fallbackSource'));
 v_prefix text;
begin
 if p_column->>'key'='created_by_name' then return coalesce(nullif(v_value,''),'غير مسجل'); end if;
 case coalesce(p_column->>'format','')
 when 'serial' then
  v_prefix := coalesce(p_column->'prefixByKind'->>(p_row->>'kind'),p_column->>'prefix','');
  v_value := coalesce(v_value,'0');
  return v_prefix||'-'||case when length(v_value)>=5 then v_value else lpad(v_value,5,'0') end;
 when 'abs' then return abs(v_value::numeric)::text;
 when 'payment_status' then return case when (p_row->>'remaining')::numeric<=0 then 'paid'
  when (p_row->>'paid')::numeric>0 then 'partial' else 'unpaid' end;
 when 'receipt_type' then return case when (p_row->>'is_free')::boolean then 'free' else 'linked' end;
 when 'result_status' then return case when p_row->>'status'='clean' or (p_row->>'discrepancies_count')::int=0 then 'clean' else 'issues' end;
 when 'scope_summary' then return (p_row->>'accounts_count')||' حساب • '||(p_row->>'cash_boxes_count')||' خزنة • '||(p_row->>'items_count')||' صنف';
 when 'time' then return to_char(v_value::timestamptz at time zone 'Africa/Cairo','HH24:MI');
 else
  if p_column->>'type'='datetime' then
   return to_char(v_value::timestamptz at time zone 'Africa/Cairo',case when p_secondary then 'HH24:MI' else 'YYYY-MM-DD' end);
  end if;
  return v_value;
 end case;
end $$;

create function public.validate_list_columns(p_scope text,p_columns jsonb)
returns void language plpgsql stable set search_path = public as $$
declare v_schema jsonb := public.list_column_schema(p_scope); v_key text; v_value jsonb; v_column jsonb; v_type text; v_text text;
begin
 if jsonb_typeof(p_columns) is distinct from 'object' then raise exception 'invalid_column_filters' using errcode='22023'; end if;
 for v_key,v_value in select * from jsonb_each(p_columns) loop
  select c into v_column from jsonb_array_elements(v_schema->'columns') c where c->>'key'=v_key or c->>'secondaryKey'=v_key;
  if v_column is null or coalesce(v_column->>'type','none')='none' then raise exception 'invalid_filter_column' using errcode='22023'; end if;
  if coalesce((v_column->>'ownerOnly')::boolean,false) and not public.can_view_profit() then raise exception 'permission_denied' using errcode='42501'; end if;
  if jsonb_typeof(v_value) not in ('string','number','boolean','null') then raise exception 'invalid_filter_value' using errcode='22023'; end if;
  v_text := btrim(coalesce(v_value#>>'{}',''));
  if v_text='' then continue; end if;
  v_type := case when v_column->>'type'='datetime' then case when v_key=v_column->>'secondaryKey' then 'time' else 'date' end else v_column->>'type' end;
  if v_type='number' then
   if v_text !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then raise exception 'invalid_filter_number' using errcode='22023'; end if;
   perform v_text::numeric;
  elsif v_type='date' then
   if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_filter_date' using errcode='22023'; end if;
   perform v_text::date;
  elsif v_type='time' and v_text !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception 'invalid_filter_time' using errcode='22023';
  end if;
 end loop;
end $$;

create function public.matches_list_columns(p_scope text,p_row jsonb,p_columns jsonb)
returns boolean language plpgsql stable set search_path = public as $$
declare v_schema jsonb := public.list_column_schema(p_scope); v_key text; v_wanted text; v_column jsonb; v_actual text; v_type text; v_field text; v_match boolean;
begin
 for v_key,v_wanted in select key,btrim(coalesce(value,'')) from jsonb_each_text(p_columns) loop
  if v_wanted='' then continue; end if;
  select c into v_column from jsonb_array_elements(v_schema->'columns') c where c->>'key'=v_key or c->>'secondaryKey'=v_key;
  if v_column is null then return false; end if;
  v_type := case when v_column->>'type'='datetime' then case when v_key=v_column->>'secondaryKey' then 'time' else 'date' end else v_column->>'type' end;
  v_actual := public.list_column_value(p_row,v_column,v_key=coalesce(v_column->>'secondaryKey',''));
  if v_type='text' then
   v_match := false;
   if v_column ? 'fields' then
    for v_field in select jsonb_array_elements_text(v_column->'fields') loop
     v_match := v_match or strpos(lower(coalesce(p_row->>v_field,'')),lower(v_wanted))>0;
    end loop;
   else v_match := strpos(lower(coalesce(v_actual,'')),lower(v_wanted))>0; end if;
   if not v_match then return false; end if;
  elsif v_actual is null then return false;
  elsif v_type='number' then if v_actual::numeric<>v_wanted::numeric then return false; end if;
  elsif v_actual<>v_wanted then return false;
  end if;
 end loop;
 return true;
end $$;

create function public.matches_list_search(p_scope text,p_row jsonb,p_search text)
returns boolean language plpgsql stable set search_path = public as $$
declare v_schema jsonb := public.list_column_schema(p_scope); v_field text; v_value text; v_column jsonb; v_search text:=btrim(coalesce(p_search,''));
begin
 if v_search='' then return true; end if;
 for v_field in select jsonb_array_elements_text(v_schema->'globalFields') loop
  select c into v_column from jsonb_array_elements(v_schema->'columns') c where c->>'key'=v_field;
  v_value := case when v_column is not null then public.list_column_value(p_row,v_column) else p_row->>v_field end;
  if strpos(lower(coalesce(v_value,'')),lower(v_search))>0 then return true; end if;
 end loop;
 return false;
end $$;

-- The JSON comparators read no tables and are callable only inside the guarded
-- definer entry points below. Clients cannot use them as an authorization path.
revoke all on function public.list_column_value(jsonb,jsonb,boolean),
 public.validate_list_columns(text,jsonb),public.matches_list_columns(text,jsonb,jsonb),
 public.matches_list_search(text,jsonb,text) from public,anon,authenticated;


create function public.filter_invoice_rows(p_columns jsonb,p_search text default null,p_kind text default 'sale')
returns setof public.v_invoice_list language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_kind is null or p_kind not in ('sale','purchase','sale_return','purchase_return','waste') then raise exception 'invalid_kind' using errcode='22023'; end if;
 perform public.require_permission('goods.'||p_kind||'.view');
 perform public.validate_list_columns('invoice',p_columns);
 return query select v.* from public.v_invoice_list v where v.company_id=v_company
 and v.kind=p_kind

 and public.matches_list_columns('invoice',to_jsonb(v),p_columns)
 and public.matches_list_search('invoice',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_invoice_rows(jsonb,text,text) from public,anon;
grant execute on function public.filter_invoice_rows(jsonb,text,text) to authenticated;

create function public.filter_receipt_rows(p_columns jsonb,p_search text default null,p_kind text default 'in')
returns setof public.v_receipt_list language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_kind is null or p_kind not in ('in','out') then raise exception 'invalid_kind' using errcode='22023'; end if;
 perform public.require_permission('money.'||p_kind||'.view');
 perform public.validate_list_columns('receipt',p_columns);
 return query select v.* from public.v_receipt_list v where v.company_id=v_company
 and v.direction=p_kind

 and public.matches_list_columns('receipt',to_jsonb(v),p_columns)
 and public.matches_list_search('receipt',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_receipt_rows(jsonb,text,text) from public,anon;
grant execute on function public.filter_receipt_rows(jsonb,text,text) to authenticated;

create function public.filter_warehouse_transfer_rows(p_columns jsonb,p_search text default null)
returns setof public.v_warehouse_transfer_list language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;

 perform public.require_permission('goods.warehouse_transfer.view');
 perform public.validate_list_columns('warehouse_transfer',p_columns);
 return query select v.* from public.v_warehouse_transfer_list v where v.company_id=v_company


 and public.matches_list_columns('warehouse_transfer',to_jsonb(v),p_columns)
 and public.matches_list_search('warehouse_transfer',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_warehouse_transfer_rows(jsonb,text) from public,anon;
grant execute on function public.filter_warehouse_transfer_rows(jsonb,text) to authenticated;

create function public.filter_cash_transfer_rows(p_columns jsonb,p_search text default null)
returns setof public.v_cash_box_transfer_list language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;

 perform public.require_permission('money.cash_box_transfer.view');
 perform public.validate_list_columns('cash_transfer',p_columns);
 return query select v.* from public.v_cash_box_transfer_list v where v.company_id=v_company


 and public.matches_list_columns('cash_transfer',to_jsonb(v),p_columns)
 and public.matches_list_search('cash_transfer',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_cash_transfer_rows(jsonb,text) from public,anon;
grant execute on function public.filter_cash_transfer_rows(jsonb,text) to authenticated;

create function public.filter_master_account_rows(p_columns jsonb,p_search text default null,p_kind text default 'customer')
returns setof public.accounts language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_kind is null or p_kind not in ('customer','supplier') then raise exception 'invalid_kind' using errcode='22023'; end if;
 perform public.require_permission('data.'||p_kind||'s.view');
 perform public.validate_list_columns('master_accounts',p_columns);
 return query select v.* from public.accounts v where v.company_id=v_company
 and v.kind=p_kind
 and v.system_key is null
 and public.matches_list_columns('master_accounts',to_jsonb(v),p_columns)
 and public.matches_list_search('master_accounts',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_master_account_rows(jsonb,text,text) from public,anon;
grant execute on function public.filter_master_account_rows(jsonb,text,text) to authenticated;

create function public.filter_master_item_rows(p_columns jsonb,p_search text default null)
returns setof public.items language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;

 perform public.require_permission('data.items.view');
 perform public.validate_list_columns('master_items',p_columns);
 return query select v.* from public.items v where v.company_id=v_company


 and public.matches_list_columns('master_items',to_jsonb(v),p_columns)
 and public.matches_list_search('master_items',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_master_item_rows(jsonb,text) from public,anon;
grant execute on function public.filter_master_item_rows(jsonb,text) to authenticated;

create function public.filter_account_balance_rows(p_columns jsonb,p_search text default null,p_kind text default 'customer')
returns setof public.v_account_balances language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_kind is null or p_kind not in ('customer','supplier') then raise exception 'invalid_kind' using errcode='22023'; end if;
 perform public.require_permission('balances.'||p_kind||'s.view');
 perform public.validate_list_columns('account_balances',p_columns);
 return query select v.* from public.v_account_balances v where v.company_id=v_company
 and v.kind=p_kind
 and v.system_key is null
 and public.matches_list_columns('account_balances',to_jsonb(v),p_columns)
 and public.matches_list_search('account_balances',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_account_balance_rows(jsonb,text,text) from public,anon;
grant execute on function public.filter_account_balance_rows(jsonb,text,text) to authenticated;

create function public.filter_warehouse_item_rows(p_columns jsonb,p_search text default null)
returns setof public.v_warehouse_items language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;

 perform public.require_permission('balances.items.view');
 perform public.validate_list_columns('warehouse_items',p_columns);
 return query select v.* from public.v_warehouse_items v where v.company_id=v_company


 and public.matches_list_columns('warehouse_items',to_jsonb(v),p_columns)
 and public.matches_list_search('warehouse_items',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_warehouse_item_rows(jsonb,text) from public,anon;
grant execute on function public.filter_warehouse_item_rows(jsonb,text) to authenticated;

create function public.filter_reconciliation_rows(p_columns jsonb,p_search text default null)
returns setof public.balance_reconciliation_logs language plpgsql stable security definer set search_path=public as $rows$
declare v_company uuid:=public.current_company_id();
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;

 if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
 perform public.validate_list_columns('reconciliations',p_columns);
 return query select v.* from public.balance_reconciliation_logs v where v.company_id=v_company


 and public.matches_list_columns('reconciliations',to_jsonb(v),p_columns)
 and public.matches_list_search('reconciliations',to_jsonb(v),p_search);
end $rows$;
revoke all on function public.filter_reconciliation_rows(jsonb,text) from public,anon;
grant execute on function public.filter_reconciliation_rows(jsonb,text) to authenticated;

-- Extend each existing aggregate, retaining its arithmetic and permission gate.
-- The old signature remains compatible and delegates with an empty filter set.
do $$
declare
 item record; definition text; extended text; wrapper text; argument_names text; marker integer; finish integer; call_args text;
begin
 for item in select * from (values
  ('get_invoice_kpis','text,text,text,text,text,boolean','invoice','v'),
  ('get_receipt_kpis','text,uuid,text,text,text,boolean','receipt','v'),
  ('get_warehouse_transfer_kpis','text,text,text,boolean','warehouse_transfer','v'),
  ('get_cash_box_transfer_kpis','uuid,text,text,text,boolean','cash_transfer','cbt'),
  ('get_master_accounts_kpis','text,text,text','master_accounts','a'),
  ('get_master_items_kpis','text,text','master_items','i'),
  ('get_account_balances_kpis','text,text','account_balances','a'),
  ('get_warehouse_stock_kpis','uuid,text','warehouse_items','v')
 ) as functions(name,signature,scope,row_alias) loop
  select pg_get_functiondef(p.oid),array_to_string(p.proargnames,', ') into definition,argument_names
   from pg_proc p where p.oid=('public.'||item.name||'('||item.signature||')')::regprocedure;
  extended := replace(definition,'FUNCTION public.'||item.name||'(', 'FUNCTION public.'||item.name||'_columns(p_columns jsonb, ');
  marker := strpos(extended,E'    and (\n      v_search =');
  if marker=0 then raise exception 'list_search_definition_did_not_match: %',item.name; end if;
  finish := strpos(substr(extended,marker),E'\n    );');
  if finish=0 then raise exception 'list_search_end_did_not_match'; end if;
  extended := substr(extended,1,marker-1)||format('    and public.matches_list_columns(%L,to_jsonb(%I),p_columns)
    and public.matches_list_search(%L,to_jsonb(%I),p_search)',item.scope,item.row_alias,item.scope,item.row_alias)
    ||substr(extended,marker+finish+5);
  extended := replace(extended,E'begin\n',E'begin\n  perform public.validate_list_columns('||quote_literal(item.scope)||E',p_columns);\n');
  execute extended;
  execute format('revoke all on function public.%I(jsonb,%s) from public,anon',item.name||'_columns',item.signature);
  execute format('grant execute on function public.%I(jsonb,%s) to authenticated',item.name||'_columns',item.signature);
  marker := strpos(definition,'  select jsonb_build_object(');
  if marker=0 then raise exception 'list_aggregate_definition_did_not_match'; end if;
  -- Keep the original authentication/permission prefix. Only the aggregate body
  -- delegates; all callers now use one set of sums and matching rules.
  finish := strpos(substr(definition,marker),'end;');
  if finish=0 then raise exception 'list_aggregate_end_did_not_match'; end if;
  call_args := '''{}''::jsonb, '||argument_names;
  wrapper := substr(definition,1,marker-1)||format('  return public.%I(%s);
',item.name||'_columns',call_args)||substr(definition,marker+finish-1);
  execute wrapper;
 end loop;
end $$;

create function public.list_creator_filter_options(p_scope text,p_kind text default null,p_query text default '')
returns table(value text,label text) language plpgsql stable security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_view text; v_condition text:=''; v_permission text;
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 case p_scope
 when 'invoice' then
  if p_kind not in ('sale','purchase','sale_return','purchase_return','waste') or p_kind is null then raise exception 'invalid_kind' using errcode='22023'; end if;
  v_view:='v_invoice_list';v_condition:=' and d.kind=$3';v_permission:='goods.'||p_kind||'.view';
 when 'receipt' then
  if p_kind not in ('in','out') or p_kind is null then raise exception 'invalid_direction' using errcode='22023'; end if;
  v_view:='v_receipt_list';v_condition:=' and d.direction=$3';v_permission:='money.'||p_kind||'.view';
 when 'warehouse_transfer' then v_view:='v_warehouse_transfer_list';v_permission:='goods.warehouse_transfer.view';
 when 'cash_transfer' then v_view:='v_cash_box_transfer_list';v_permission:='money.cash_box_transfer.view';
 else raise exception 'invalid_list_scope' using errcode='22023';
 end case;
 perform public.require_permission(v_permission);
 return query execute format('select name,name from (
  select coalesce(nullif(btrim(p.full_name),''''),nullif(split_part(u.email,''@'',1),''''),''المستخدم'') as name
   from public.profiles p left join auth.users u on u.id=p.id where p.company_id=$1
  union select coalesce(nullif(d.created_by_name,''''),''غير مسجل'') from public.%I d where d.company_id=$1 %s
 ) names where name is not null and strpos(lower(name),lower(coalesce($2,'''')))>0 order by name limit 100',v_view,v_condition)
 using v_company,p_query,p_kind;
end $$;
revoke all on function public.list_creator_filter_options(text,text,text) from public,anon;
grant execute on function public.list_creator_filter_options(text,text,text) to authenticated;

create function public.get_reconciliation_log_kpis_columns(p_columns jsonb,p_search text default null,
 p_mode text default 'all',p_date_from text default null,p_date_to text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_result jsonb;
begin
 if v_company is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if not public.is_company_owner() then raise exception 'permission_denied' using errcode='42501'; end if;
 perform public.validate_list_columns('reconciliations',p_columns);
 select jsonb_build_object('count',count(*),'total_discrepancies',coalesce(sum(l.discrepancies_count),0),
  'latest_created_at',max(l.created_at),'latest_status',(array_agg(l.status order by l.created_at desc))[1]) into v_result
 from public.balance_reconciliation_logs l where l.company_id=v_company
  and (p_mode='all' or l.mode=p_mode)
  and (p_date_from is null or p_date_from='' or l.created_at>=p_date_from::date::timestamp at time zone 'Africa/Cairo')
  and (p_date_to is null or p_date_to='' or l.created_at<(p_date_to::date+1)::timestamp at time zone 'Africa/Cairo')
  and public.matches_list_columns('reconciliations',to_jsonb(l),p_columns)
  and public.matches_list_search('reconciliations',to_jsonb(l),p_search);
 return v_result;
end $$;
revoke all on function public.get_reconciliation_log_kpis_columns(jsonb,text,text,text,text) from public,anon;
grant execute on function public.get_reconciliation_log_kpis_columns(jsonb,text,text,text,text) to authenticated;

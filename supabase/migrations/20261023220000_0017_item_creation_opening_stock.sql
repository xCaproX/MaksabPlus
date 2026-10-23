-- إنشاء الصنف ورصيده الافتتاحي كوحدة واحدة داخل معاملة قاعدة البيانات.
create or replace function public.create_item_with_opening_stock(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item uuid;
  v_qty numeric(18,4) := round(coalesce(p_opening_qty, 0), 4);
  v_cost numeric(18,4) := round(coalesce(p_unit_cost, 0), 4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'item_name_required' using errcode = '22023'; end if;
  if coalesce(p_sale_price, 0) < 0 or coalesce(p_purchase_price, 0) < 0 then
    raise exception 'invalid_line_price' using errcode = '22023';
  end if;
  if v_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
  if v_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
  if v_qty > 0 and p_warehouse_id is null then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  if p_warehouse_id is not null then
    perform 1 from public.warehouses
    where id = p_warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  end if;

  insert into public.items(company_id, name, unit, sale_price, purchase_price, is_active)
  values (v_company, btrim(p_name), coalesce(nullif(btrim(p_unit), ''), 'قطعة'),
    coalesce(p_sale_price, 0), coalesce(p_purchase_price, 0), coalesce(p_is_active, true))
  returning id into v_item;

  if p_warehouse_id is not null then
    if v_qty > 0 then
      perform public.apply_stock_movement(v_company, p_warehouse_id, v_item, v_qty, v_cost);
    else
      insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
      values (v_company, p_warehouse_id, v_item, 0, v_cost);
    end if;
    insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
    values (v_company, p_warehouse_id, v_item, v_qty, v_cost);
  end if;
  return v_item;
end;
$$;

revoke all on function public.create_item_with_opening_stock(text, text, numeric, numeric, boolean, uuid, numeric, numeric) from public, anon;
grant execute on function public.create_item_with_opening_stock(text, text, numeric, numeric, boolean, uuid, numeric, numeric) to authenticated;

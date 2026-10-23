-- إصلاح مخزون قديم لا يطابق صافي الفواتير، وتجنب النقص المؤقت عند تعديل فاتورة شراء.

with invoice_stock as (
  select
    inv.company_id,
    inv.warehouse_id,
    ii.item_id,
    sum((case when inv.kind in ('purchase', 'sale_return') then 1 else -1 end) * ii.qty)::numeric(18,4) as net_qty,
    sum((case when inv.kind in ('purchase', 'sale_return') then 1 else -1 end) * ii.qty * ii.unit_cost)::numeric(18,4) as net_value
  from public.invoices inv
  join public.invoice_items ii on ii.invoice_id = inv.id
  where inv.deleted_at is null
  group by inv.company_id, inv.warehouse_id, ii.item_id
)
update public.item_stock s
   set qty = invoice_stock.net_qty,
       avg_cost = case
         when invoice_stock.net_qty > 0 and invoice_stock.net_value >= 0
           then round(invoice_stock.net_value / invoice_stock.net_qty, 4)
         else i.purchase_price
       end
  from invoice_stock
  join public.stock_opening_balances o
    on o.company_id = invoice_stock.company_id
   and o.warehouse_id = invoice_stock.warehouse_id
   and o.item_id = invoice_stock.item_id
  join public.items i
    on i.company_id = invoice_stock.company_id and i.id = invoice_stock.item_id
 where s.company_id = invoice_stock.company_id
   and s.warehouse_id = invoice_stock.warehouse_id
   and s.item_id = invoice_stock.item_id
   and s.qty = 0
   and o.opening_qty = 0
   and invoice_stock.net_qty > 0
   and not exists (
     select 1 from public.stock_opening_adjustments a
     where a.company_id = s.company_id and a.warehouse_id = s.warehouse_id and a.item_id = s.item_id
   );

create or replace function public.update_invoice(
  p_invoice_id uuid,
  p_account_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_paid numeric,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_inv public.invoices%rowtype;
  v_total numeric(18,4) := 0;
  v_paid numeric(18,4) := coalesce(p_paid, 0);
  v_date date := coalesce(p_invoice_date, current_date);
  v_line record;
  v_change record;
  v_sign integer;
  v_system_key text;
  v_unit_cost numeric(18,4);
  v_net_purchase_edit boolean := false;
  v_purchase_prices_unchanged boolean := false;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company;
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  if v_inv.deleted_at is not null then raise exception 'invoice_deleted' using errcode = '22023'; end if;
  v_sign := case when v_inv.kind in ('sale', 'purchase_return', 'waste') then -1 else 1 end;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_has_no_lines' using errcode = '22023';
  end if;
  select system_key into v_system_key from public.accounts
  where id = p_account_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_account' using errcode = '22023'; end if;
  if (v_inv.kind = 'waste' and v_system_key <> 'waste')
     or (v_inv.kind <> 'waste' and v_system_key = 'waste') then
    raise exception 'invalid_account' using errcode = '22023';
  end if;
  perform 1 from public.warehouses where id = p_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_line.item_id is null then raise exception 'line_missing_item' using errcode = '22023'; end if;
    if v_line.qty is null or v_line.qty <= 0 then raise exception 'invalid_line_qty' using errcode = '22023'; end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then raise exception 'invalid_line_price' using errcode = '22023'; end if;
    if v_inv.kind = 'waste' and v_line.unit_price <> 0 then raise exception 'waste_price_must_be_zero' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    v_total := v_total + round(v_line.qty * v_line.unit_price, 2);
  end loop;
  if v_inv.kind = 'waste' and v_paid <> 0 then raise exception 'waste_cannot_be_paid' using errcode = '22023'; end if;
  if v_paid < 0 then raise exception 'invalid_paid' using errcode = '22023'; end if;
  if v_paid > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  -- عند تعديل شراء في نفس المخزن وبنفس تكلفة الوحدة، نطبق فرق الكمية فقط.
  -- هذا يسمح بالتعديل إذا كان جزء من الشراء قد بيع بالفعل، بشرط ألا يصبح الرصيد النهائي سالبًا.
  if v_inv.kind = 'purchase' and p_warehouse_id = v_inv.warehouse_id then
    select not exists (
      select 1
      from (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from public.invoice_items where invoice_id = p_invoice_id group by item_id
      ) old_lines
      join (
        select item_id, min(unit_price) as min_price, max(unit_price) as max_price
        from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        group by item_id
      ) new_lines using (item_id)
      where old_lines.min_price <> new_lines.min_price
         or old_lines.max_price <> new_lines.max_price
    ) into v_purchase_prices_unchanged;

    if v_purchase_prices_unchanged then
      v_net_purchase_edit := true;
      for v_change in
        select item_id,
          sum(new_qty - old_qty)::numeric(18,4) as qty_delta,
          case when sum(new_qty) > 0 then sum(new_value) / sum(new_qty) else null end::numeric(18,4) as added_unit_cost
        from (
          select item_id, qty as old_qty, 0::numeric as new_qty, 0::numeric as new_value
          from public.invoice_items where invoice_id = p_invoice_id
          union all
          select item_id, 0::numeric, qty, qty * unit_price
          from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
        ) lines
        group by item_id
      loop
        if v_change.qty_delta <> 0 then
          v_unit_cost := public.apply_stock_movement(
            v_company, p_warehouse_id, v_change.item_id, v_change.qty_delta,
            case when v_change.qty_delta > 0 then v_change.added_unit_cost else null end
          );
        end if;
      end loop;
    end if;
  end if;

  if not v_net_purchase_edit then
    for v_line in select item_id, qty, unit_cost from public.invoice_items where invoice_id = p_invoice_id
    loop
      perform public.apply_stock_movement(v_company, v_inv.warehouse_id, v_line.item_id,
        -v_sign * v_line.qty, v_line.unit_cost);
    end loop;
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  update public.invoices set account_id = p_account_id, warehouse_id = p_warehouse_id,
    invoice_date = v_date, subtotal = v_total, total = v_total, paid = v_paid, notes = p_notes
  where id = p_invoice_id;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric, unit_price numeric)
  loop
    if v_net_purchase_edit then
      v_unit_cost := v_line.unit_price;
    else
      v_unit_cost := public.apply_stock_movement(v_company, p_warehouse_id, v_line.item_id,
        v_sign * v_line.qty, case when v_inv.kind = 'purchase' then v_line.unit_price else null end);
    end if;
    insert into public.invoice_items (company_id, invoice_id, item_id, qty, unit_price, unit_cost)
    values (v_company, p_invoice_id, v_line.item_id, v_line.qty, v_line.unit_price, v_unit_cost);
  end loop;

  if v_inv.kind <> 'waste' then perform public.sync_invoice_receipt(p_invoice_id); end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, numeric, text, jsonb) to authenticated;

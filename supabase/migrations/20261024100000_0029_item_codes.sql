alter table public.items add column code text;

update public.items
set code = 'ITM-' || lpad(serial_number::text, 5, '0')
where code is null or btrim(code) = '';

alter table public.items alter column code set not null;
create unique index items_company_code_ci_idx on public.items(company_id, lower(code));

create or replace function public.set_item_code_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'ITM-' || lpad(new.serial_number::text, 5, '0');
  else
    new.code := btrim(new.code);
  end if;
  return new;
end;
$$;

create trigger items_set_code_on_insert before insert on public.items
  for each row execute function public.set_item_code_default();
create trigger items_set_code_on_update before update of code on public.items
  for each row execute function public.set_item_code_default();

create or replace view public.v_item_stock
with (security_invoker = true) as
select
  i.id,
  i.company_id,
  i.name,
  i.unit,
  i.sale_price,
  i.purchase_price,
  i.is_active,
  coalesce(sum(s.qty), 0)::numeric(18,4) as qty,
  i.code
from public.items i
left join public.item_stock s on s.item_id = i.id
group by i.id;

create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id, i.id as item_id, i.name as item_name, i.unit,
  w.id as warehouse_id, w.name as warehouse_name,
  coalesce(o.opening_qty, 0)::numeric(18,4) as opening_qty,
  coalesce(o.unit_cost, i.purchase_price)::numeric(18,4) as unit_cost,
  coalesce(s.qty, 0)::numeric(18,4) as current_qty,
  case when o.item_id is null then false else
    exists (
      select 1 from public.invoices inv join public.invoice_items ii on ii.invoice_id = inv.id
      where inv.company_id = i.company_id and inv.warehouse_id = w.id and ii.item_id = i.id
        and inv.created_at >= o.created_at
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = i.company_id and a.warehouse_id = w.id and a.item_id = i.id
    ) end as cost_locked,
  w.notes as warehouse_notes, i.notes as item_notes,
  i.serial_number as item_number, w.serial_number as warehouse_number,
  i.code as item_code
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;

create or replace function public.create_item_with_opening_stock_and_notes_and_code(
  p_name text,
  p_unit text,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_is_active boolean,
  p_warehouse_id uuid,
  p_opening_qty numeric,
  p_unit_cost numeric,
  p_notes text,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_item_id uuid;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_item_id := public.create_item_with_opening_stock_and_notes(
    p_name, p_unit, p_sale_price, p_purchase_price, p_is_active,
    p_warehouse_id, p_opening_qty, p_unit_cost, p_notes
  );
  update public.items
  set code = nullif(btrim(p_code), '')
  where id = v_item_id and company_id = v_company;
  if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
  return v_item_id;
end;
$$;

revoke all on function public.create_item_with_opening_stock_and_notes_and_code(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_item_with_opening_stock_and_notes_and_code(text, text, numeric, numeric, boolean, uuid, numeric, numeric, text, text) to authenticated;

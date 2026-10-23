-- Mark one non-removable primary warehouse and cash box per existing company.
alter table public.warehouses
  add column is_primary boolean not null default false;
alter table public.cash_boxes
  add column is_primary boolean not null default false;

with oldest as (
  select distinct on (company_id) id
  from public.warehouses
  order by company_id, created_at, id
)
update public.warehouses set is_primary = true
where id in (select id from oldest);

with oldest as (
  select distinct on (company_id) id
  from public.cash_boxes
  order by company_id, created_at, id
)
update public.cash_boxes set is_primary = true
where id in (select id from oldest);

create unique index warehouses_one_primary_per_company
  on public.warehouses(company_id) where is_primary;
create unique index cash_boxes_one_primary_per_company
  on public.cash_boxes(company_id) where is_primary;

create or replace function public.prevent_primary_location_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_primary is distinct from new.is_primary then
    raise exception 'primary_location_protected' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger warehouses_primary_immutable
before update of is_primary on public.warehouses
for each row execute function public.prevent_primary_location_change();
create trigger cash_boxes_primary_immutable
before update of is_primary on public.cash_boxes
for each row execute function public.prevent_primary_location_change();

create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(sum(case when r.direction = 'in' then r.amount else -r.amount end), 0))::numeric(18,4) as balance,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance,
  cb.is_primary
from public.cash_boxes cb
left join public.receipts r on r.cash_box_id = cb.id and r.deleted_at is null
left join (
  select cash_box_id, sum(amount_delta) as amount
  from public.opening_balance_adjustments where cash_box_id is not null group by cash_box_id
) adj on adj.cash_box_id = cb.id
group by cb.id, adj.amount;
grant select on public.v_cash_box_balances to authenticated;

create or replace function public.delete_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_warehouse public.warehouses%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_warehouse from public.warehouses
  where id = p_warehouse_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_not_found' using errcode = '22023'; end if;
  if v_warehouse.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.invoices where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_documents' using errcode = '23514';
  end if;
  if exists (select 1 from public.item_stock where company_id = v_company and warehouse_id = p_warehouse_id and qty <> 0)
     or exists (select 1 from public.stock_opening_adjustments where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_stock_for_delete' using errcode = '23514';
  end if;
  delete from public.warehouses where id = p_warehouse_id and company_id = v_company;
end;
$$;

create or replace function public.delete_cash_box(p_cash_box_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash_box public.cash_boxes%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_cash_box from public.cash_boxes
  where id = p_cash_box_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_not_found' using errcode = '22023'; end if;
  if v_cash_box.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.receipts where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_documents' using errcode = '23514';
  end if;
  if coalesce(v_cash_box.opening_balance, 0) <> 0
     or exists (select 1 from public.opening_balance_adjustments where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_balance' using errcode = '23514';
  end if;
  delete from public.cash_boxes where id = p_cash_box_id and company_id = v_company;
end;
$$;

revoke all on public.warehouses, public.cash_boxes from authenticated;
grant select, insert, update on public.warehouses, public.cash_boxes to authenticated;
revoke all on function public.delete_warehouse(uuid) from public, anon;
revoke all on function public.delete_cash_box(uuid) from public, anon;
grant execute on function public.delete_warehouse(uuid) to authenticated;
grant execute on function public.delete_cash_box(uuid) to authenticated;

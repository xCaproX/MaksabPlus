-- Stable company-scoped numbers for master data. Existing records are numbered
-- by creation time; the sequence table prevents numbers from being reused.
create table public.entity_number_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('accounts', 'items', 'warehouses', 'cash_boxes')),
  last_number integer not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, entity_type)
);

alter table public.entity_number_sequences enable row level security;
create policy entity_number_sequences_company_isolation on public.entity_number_sequences
  for select to authenticated using (company_id = public.current_company_id());
grant select on public.entity_number_sequences to authenticated;
revoke insert, update, delete on public.entity_number_sequences from anon, authenticated;
create trigger entity_number_sequences_set_updated_at before update on public.entity_number_sequences
  for each row execute function public.set_updated_at();

alter table public.accounts add column serial_number integer;
alter table public.items add column serial_number integer;
alter table public.warehouses add column serial_number integer;
alter table public.cash_boxes add column serial_number integer;

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id)::integer as number
  from public.accounts where system_key is null
)
update public.accounts a set serial_number = numbered.number
from numbered where numbered.id = a.id;

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id)::integer as number
  from public.items
)
update public.items i set serial_number = numbered.number
from numbered where numbered.id = i.id;

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id)::integer as number
  from public.warehouses
)
update public.warehouses w set serial_number = numbered.number
from numbered where numbered.id = w.id;

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id)::integer as number
  from public.cash_boxes
)
update public.cash_boxes cb set serial_number = numbered.number
from numbered where numbered.id = cb.id;

insert into public.entity_number_sequences(company_id, entity_type, last_number)
select company_id, 'accounts', max(serial_number) from public.accounts
where serial_number is not null group by company_id
union all
select company_id, 'items', max(serial_number) from public.items
where serial_number is not null group by company_id
union all
select company_id, 'warehouses', max(serial_number) from public.warehouses
where serial_number is not null group by company_id
union all
select company_id, 'cash_boxes', max(serial_number) from public.cash_boxes
where serial_number is not null group by company_id;

create unique index accounts_company_serial_number_idx on public.accounts(company_id, serial_number)
  where serial_number is not null;
create unique index items_company_serial_number_idx on public.items(company_id, serial_number);
create unique index warehouses_company_serial_number_idx on public.warehouses(company_id, serial_number);
create unique index cash_boxes_company_serial_number_idx on public.cash_boxes(company_id, serial_number);

create or replace function public.next_entity_serial_number(p_company_id uuid, p_entity_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if p_company_id is null or p_entity_type not in ('accounts', 'items', 'warehouses', 'cash_boxes') then
    raise exception 'invalid_entity_number_type' using errcode = '22023';
  end if;
  insert into public.entity_number_sequences(company_id, entity_type, last_number)
  values (p_company_id, p_entity_type, 1)
  on conflict (company_id, entity_type) do update
    set last_number = public.entity_number_sequences.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;
revoke all on function public.next_entity_serial_number(uuid, text) from public, anon, authenticated;

create or replace function public.assign_entity_serial_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := tg_argv[0];
begin
  if tg_table_name = 'accounts' then
    if new.system_key is not null then
      new.serial_number := null;
    else
      new.serial_number := public.next_entity_serial_number(new.company_id, v_entity_type);
    end if;
  else
    new.serial_number := public.next_entity_serial_number(new.company_id, v_entity_type);
  end if;
  return new;
end;
$$;

create or replace function public.prevent_entity_serial_number_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.serial_number is distinct from new.serial_number then
    raise exception 'entity_number_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger accounts_assign_serial_number before insert on public.accounts
  for each row execute function public.assign_entity_serial_number('accounts');
create trigger items_assign_serial_number before insert on public.items
  for each row execute function public.assign_entity_serial_number('items');
create trigger warehouses_assign_serial_number before insert on public.warehouses
  for each row execute function public.assign_entity_serial_number('warehouses');
create trigger cash_boxes_assign_serial_number before insert on public.cash_boxes
  for each row execute function public.assign_entity_serial_number('cash_boxes');

create trigger accounts_serial_number_immutable before update of serial_number on public.accounts
  for each row execute function public.prevent_entity_serial_number_change();
create trigger items_serial_number_immutable before update of serial_number on public.items
  for each row execute function public.prevent_entity_serial_number_change();
create trigger warehouses_serial_number_immutable before update of serial_number on public.warehouses
  for each row execute function public.prevent_entity_serial_number_change();
create trigger cash_boxes_serial_number_immutable before update of serial_number on public.cash_boxes
  for each row execute function public.prevent_entity_serial_number_change();

create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id, a.company_id, a.name, a.kind, a.phone, a.is_active,
  coalesce(inv.total, 0)::numeric(18,4) as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4) as paid,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(inv.total, 0) - coalesce(rec.balance_effect, 0))::numeric(18,4) as balance,
  ((coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0 or a.opening_balance <> 0 or coalesce(adj.cnt, 0) > 0) as has_documents,
  a.system_key,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance,
  a.notes,
  a.serial_number
from public.accounts a
left join (
  select account_id,
    sum(case when kind in ('sale', 'purchase') then total else -total end) filter (where deleted_at is null) as total,
    count(*) as cnt
  from public.invoices group by account_id
) inv on inv.account_id = a.id
left join (
  select r.account_id,
    sum(case when r.invoice_id is null then r.amount
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null) as amount,
    sum(case when r.invoice_id is null then
        case when (a.kind = 'customer' and r.direction = 'in')
                   or (a.kind = 'supplier' and r.direction = 'out')
          then r.amount else -r.amount end
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null) as balance_effect,
    count(*) as cnt
  from public.receipts r
  join public.accounts a on a.id = r.account_id
  left join public.invoices i on i.id = r.invoice_id
  group by r.account_id
) rec on rec.account_id = a.id
left join (
  select account_id, sum(amount_delta) as amount, count(*) as cnt
  from public.opening_balance_adjustments where account_id is not null group by account_id
) adj on adj.account_id = a.id;
grant select on public.v_account_balances to authenticated;

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
  i.serial_number as item_number, w.serial_number as warehouse_number
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;
grant select on public.v_stock_opening_balances to authenticated;

create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select cb.id, cb.company_id, cb.name, cb.is_active,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(rec.amount, 0) + coalesce(tr.amount, 0))::numeric(18,4) as balance,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance,
  cb.is_primary, cb.notes, cb.serial_number
from public.cash_boxes cb
left join (
  select cash_box_id, sum(case when direction = 'in' then amount else -amount end) as amount
  from public.receipts where deleted_at is null group by cash_box_id
) rec on rec.cash_box_id = cb.id
left join (
  select cash_box_id, sum(amount_delta) as amount from public.opening_balance_adjustments
  where cash_box_id is not null group by cash_box_id
) adj on adj.cash_box_id = cb.id
left join (
  select cash_box_id, sum(amount_delta) as amount from (
    select destination_cash_box_id as cash_box_id, amount as amount_delta
    from public.cash_box_transfers where deleted_at is null
    union all
    select source_cash_box_id, -amount from public.cash_box_transfers where deleted_at is null
  ) movements group by cash_box_id
) tr on tr.cash_box_id = cb.id;
grant select on public.v_cash_box_balances to authenticated;

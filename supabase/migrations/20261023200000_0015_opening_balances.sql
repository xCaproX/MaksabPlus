-- أرصدة بداية قابلة للتتبع للحسابات والخزن والمخزون.

alter table public.accounts
  add column opening_balance numeric(18,4) not null default 0;
alter table public.cash_boxes
  add column opening_balance numeric(18,4) not null default 0;

create table public.opening_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_id uuid,
  cash_box_id uuid,
  amount_delta numeric(18,4) not null check (amount_delta <> 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_id is null) <> (cash_box_id is null)),
  foreign key (company_id, account_id) references public.accounts(company_id, id) on delete cascade,
  foreign key (company_id, cash_box_id) references public.cash_boxes(company_id, id) on delete cascade
);
create index opening_balance_adjustments_account_idx on public.opening_balance_adjustments(account_id);
create index opening_balance_adjustments_cash_box_idx on public.opening_balance_adjustments(cash_box_id);

create table public.stock_opening_balances (
  company_id uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null,
  item_id uuid not null,
  opening_qty numeric(18,4) not null default 0 check (opening_qty >= 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, item_id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id) on delete cascade,
  foreign key (company_id, item_id) references public.items(company_id, id) on delete cascade
);

create table public.stock_opening_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null,
  item_id uuid not null,
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id) on delete cascade,
  foreign key (company_id, item_id) references public.items(company_id, id) on delete cascade
);
create index stock_opening_adjustments_item_idx on public.stock_opening_adjustments(warehouse_id, item_id);

-- المخزون الحالي وقت الترقية يصبح نقطة البداية؛ لا نعيد احتساب فواتير قديمة.
insert into public.stock_opening_balances (company_id, warehouse_id, item_id, opening_qty, unit_cost)
select company_id, warehouse_id, item_id, qty, avg_cost
from public.item_stock
on conflict (warehouse_id, item_id) do nothing;

create trigger opening_balance_adjustments_set_updated_at before update on public.opening_balance_adjustments
  for each row execute function public.set_updated_at();
create trigger stock_opening_balances_set_updated_at before update on public.stock_opening_balances
  for each row execute function public.set_updated_at();
create trigger stock_opening_adjustments_set_updated_at before update on public.stock_opening_adjustments
  for each row execute function public.set_updated_at();

alter table public.opening_balance_adjustments enable row level security;
alter table public.stock_opening_balances enable row level security;
alter table public.stock_opening_adjustments enable row level security;

create policy opening_balance_adjustments_company_isolation on public.opening_balance_adjustments
  for select to authenticated using (company_id = public.current_company_id());
create policy stock_opening_balances_company_isolation on public.stock_opening_balances
  for select to authenticated using (company_id = public.current_company_id());
create policy stock_opening_adjustments_company_isolation on public.stock_opening_adjustments
  for select to authenticated using (company_id = public.current_company_id());

grant select on public.opening_balance_adjustments, public.stock_opening_balances, public.stock_opening_adjustments to authenticated;
revoke insert, update, delete on public.opening_balance_adjustments, public.stock_opening_balances, public.stock_opening_adjustments from anon, authenticated;

create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  coalesce(inv.total, 0)::numeric(18,4) as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4) as paid,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(inv.total, 0) - coalesce(rec.amount, 0))::numeric(18,4) as balance,
  ((coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0 or a.opening_balance <> 0 or coalesce(adj.cnt, 0) > 0) as has_documents,
  a.system_key,
  (coalesce(a.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance
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
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end) filter (where r.deleted_at is null) as amount,
    count(*) as cnt
  from public.receipts r left join public.invoices i on i.id = r.invoice_id group by r.account_id
) rec on rec.account_id = a.id
left join (
  select account_id, sum(amount_delta) as amount, count(*) as cnt
  from public.opening_balance_adjustments where account_id is not null group by account_id
) adj on adj.account_id = a.id;
grant select on public.v_account_balances to authenticated;

create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(sum(case when r.direction = 'in' then r.amount else -r.amount end), 0))::numeric(18,4) as balance,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance
from public.cash_boxes cb
left join public.receipts r on r.cash_box_id = cb.id and r.deleted_at is null
left join (
  select cash_box_id, sum(amount_delta) as amount
  from public.opening_balance_adjustments where cash_box_id is not null group by cash_box_id
) adj on adj.cash_box_id = cb.id
group by cb.id, adj.amount;
grant select on public.v_cash_box_balances to authenticated;

create or replace view public.v_stock_opening_balances
with (security_invoker = true) as
select
  i.company_id,
  i.id as item_id,
  i.name as item_name,
  i.unit,
  w.id as warehouse_id,
  w.name as warehouse_name,
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
    ) end as cost_locked
from public.items i
join public.warehouses w on w.company_id = i.company_id and w.is_active
left join public.stock_opening_balances o on o.company_id = i.company_id and o.item_id = i.id and o.warehouse_id = w.id
left join public.item_stock s on s.company_id = i.company_id and s.item_id = i.id and s.warehouse_id = w.id
where i.is_active;
grant select on public.v_stock_opening_balances to authenticated;

create or replace function public.accounts_guard_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind then
    if exists (select 1 from public.invoices where account_id = old.id)
       or exists (select 1 from public.receipts where account_id = old.id)
       or old.opening_balance <> 0
       or exists (select 1 from public.opening_balance_adjustments where account_id = old.id) then
      raise exception 'account_has_documents' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.accounts_guard_system()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.system_key is not null then
    if tg_op = 'DELETE' then raise exception 'system_account_protected' using errcode = '22023'; end if;
    if new.name is distinct from old.name or new.kind is distinct from old.kind
       or new.company_id is distinct from old.company_id or new.phone is distinct from old.phone
       or new.created_at is distinct from old.created_at or new.system_key is distinct from old.system_key
       or new.is_active is distinct from old.is_active or new.opening_balance is distinct from old.opening_balance then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;
  elsif new.system_key is not null then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.save_account(
  p_account_id uuid,
  p_name text,
  p_kind text,
  p_phone text,
  p_is_active boolean,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_account public.accounts%rowtype;
  v_id uuid;
  v_effective_opening numeric(18,4);
  v_target numeric(18,4) := round(coalesce(p_opening_balance, 0), 4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'account_name_required' using errcode = '22023'; end if;
  if p_kind not in ('customer', 'supplier') then raise exception 'invalid_account_kind' using errcode = '22023'; end if;

  if p_account_id is null then
    insert into public.accounts(company_id, name, kind, phone, is_active, opening_balance)
    values (v_company, btrim(p_name), p_kind, nullif(btrim(p_phone), ''), coalesce(p_is_active, true), v_target)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_account from public.accounts where id = p_account_id and company_id = v_company for update;
  if not found then raise exception 'account_not_found' using errcode = '22023'; end if;
  if v_account.system_key is not null then raise exception 'system_account_protected' using errcode = '22023'; end if;

  update public.accounts set name = btrim(p_name), kind = p_kind,
    phone = nullif(btrim(p_phone), ''), is_active = coalesce(p_is_active, true)
  where id = p_account_id and company_id = v_company;

  select v_account.opening_balance + coalesce(sum(amount_delta), 0)
    into v_effective_opening from public.opening_balance_adjustments where account_id = p_account_id;
  if v_target <> v_effective_opening then
    if not exists (select 1 from public.invoices where account_id = p_account_id)
       and not exists (select 1 from public.receipts where account_id = p_account_id)
       and not exists (select 1 from public.opening_balance_adjustments where account_id = p_account_id) then
      update public.accounts set opening_balance = v_target where id = p_account_id and company_id = v_company;
    else
      insert into public.opening_balance_adjustments(company_id, account_id, amount_delta, note)
      values (v_company, p_account_id, v_target - v_effective_opening, 'تصحيح رصيد افتتاحي');
    end if;
  end if;
  return p_account_id;
end;
$$;

create or replace function public.save_opening_balances(p_cash_boxes jsonb, p_stock jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_cash record;
  v_stock record;
  v_box public.cash_boxes%rowtype;
  v_open public.stock_opening_balances%rowtype;
  v_effective numeric(18,4);
  v_delta numeric(18,4);
  v_has_activity boolean;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_cash_boxes) <> 'array' or jsonb_typeof(p_stock) <> 'array' then
    raise exception 'invalid_opening_balances' using errcode = '22023';
  end if;

  for v_cash in select * from jsonb_to_recordset(p_cash_boxes) as x(cash_box_id uuid, opening_balance numeric)
  loop
    if v_cash.opening_balance is null then raise exception 'invalid_opening_balance' using errcode = '22023'; end if;
    select * into v_box from public.cash_boxes where id = v_cash.cash_box_id and company_id = v_company for update;
    if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
    select v_box.opening_balance + coalesce(sum(amount_delta), 0) into v_effective
      from public.opening_balance_adjustments where cash_box_id = v_box.id;
    if round(v_cash.opening_balance, 4) <> v_effective then
      if not exists (select 1 from public.receipts where cash_box_id = v_box.id)
         and not exists (select 1 from public.opening_balance_adjustments where cash_box_id = v_box.id) then
        update public.cash_boxes set opening_balance = round(v_cash.opening_balance, 4) where id = v_box.id;
      else
        insert into public.opening_balance_adjustments(company_id, cash_box_id, amount_delta, note)
        values (v_company, v_box.id, round(v_cash.opening_balance, 4) - v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    end if;
  end loop;

  for v_stock in select * from jsonb_to_recordset(p_stock) as x(warehouse_id uuid, item_id uuid, opening_qty numeric, unit_cost numeric)
  loop
    if v_stock.opening_qty is null or v_stock.opening_qty < 0 then raise exception 'invalid_opening_qty' using errcode = '22023'; end if;
    if v_stock.unit_cost is null or v_stock.unit_cost < 0 then raise exception 'invalid_line_cost' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_stock.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = v_stock.warehouse_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;

    select * into v_open from public.stock_opening_balances
      where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id for update;
    if not found then
      if v_stock.opening_qty > 0 then
        perform public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_stock.opening_qty, v_stock.unit_cost);
      else
        insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, 0, v_stock.unit_cost)
        on conflict (warehouse_id, item_id) do nothing;
      end if;
      insert into public.stock_opening_balances(company_id, warehouse_id, item_id, opening_qty, unit_cost)
      values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4));
      continue;
    end if;

    v_delta := round(v_stock.opening_qty, 4) - v_open.opening_qty;
    select exists (
      select 1 from public.invoices inv join public.invoice_items ii on ii.invoice_id = inv.id
      where inv.company_id = v_company and inv.warehouse_id = v_stock.warehouse_id
        and ii.item_id = v_stock.item_id and inv.created_at >= v_open.created_at
    ) or exists (
      select 1 from public.stock_opening_adjustments a
      where a.company_id = v_company and a.warehouse_id = v_stock.warehouse_id and a.item_id = v_stock.item_id
    ) into v_has_activity;

    if v_has_activity then
      if round(v_stock.unit_cost, 4) <> v_open.unit_cost then
        raise exception 'opening_stock_cost_locked' using errcode = '22023';
      end if;
      if v_delta <> 0 then
        select public.apply_stock_movement(v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, null) into v_effective;
        update public.stock_opening_balances set opening_qty = round(v_stock.opening_qty, 4)
          where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
        insert into public.stock_opening_adjustments(company_id, warehouse_id, item_id, quantity_delta, unit_cost, note)
        values (v_company, v_stock.warehouse_id, v_stock.item_id, v_delta, v_effective, 'تصحيح رصيد افتتاحي');
      end if;
    else
      insert into public.item_stock(company_id, warehouse_id, item_id, qty, avg_cost)
      values (v_company, v_stock.warehouse_id, v_stock.item_id, round(v_stock.opening_qty, 4), round(v_stock.unit_cost, 4))
      on conflict (warehouse_id, item_id) do update set qty = excluded.qty, avg_cost = excluded.avg_cost;
      update public.stock_opening_balances set opening_qty = round(v_stock.opening_qty, 4), unit_cost = round(v_stock.unit_cost, 4)
        where company_id = v_company and warehouse_id = v_stock.warehouse_id and item_id = v_stock.item_id;
    end if;
  end loop;
end;
$$;

create or replace function public.delete_account(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_company uuid := public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.accounts where id = p_account_id and company_id = v_company and system_key is not null) then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id and company_id = v_company) then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where account_id = p_account_id)
     or exists (select 1 from public.receipts where account_id = p_account_id)
     or exists (select 1 from public.opening_balance_adjustments where account_id = p_account_id)
     or exists (select 1 from public.accounts where id = p_account_id and opening_balance <> 0) then
    update public.accounts set is_active = false where id = p_account_id and company_id = v_company;
    return false;
  end if;
  delete from public.accounts where id = p_account_id and company_id = v_company;
  return true;
end;
$$;

create or replace function public.delete_item(p_item_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_company uuid := public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.items where id = p_item_id and company_id = v_company) then
    raise exception 'item_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoice_items where item_id = p_item_id)
     or exists (select 1 from public.stock_opening_adjustments where item_id = p_item_id)
     or exists (select 1 from public.stock_opening_balances where item_id = p_item_id and opening_qty <> 0)
     or exists (select 1 from public.item_stock where item_id = p_item_id and qty <> 0) then
    update public.items set is_active = false where id = p_item_id and company_id = v_company;
    return false;
  end if;
  delete from public.item_stock where item_id = p_item_id;
  delete from public.items where id = p_item_id and company_id = v_company;
  return true;
end;
$$;

revoke all on function public.accounts_guard_kind() from public, anon, authenticated;
revoke all on function public.accounts_guard_system() from public, anon, authenticated;
revoke all on function public.save_account(uuid, text, text, text, boolean, numeric) from public, anon;
revoke all on function public.save_opening_balances(jsonb, jsonb) from public, anon;
revoke all on function public.delete_account(uuid) from public, anon;
revoke all on function public.delete_item(uuid) from public, anon;
grant execute on function public.save_account(uuid, text, text, text, boolean, numeric) to authenticated;
grant execute on function public.save_opening_balances(jsonb, jsonb) to authenticated;
grant execute on function public.delete_account(uuid) to authenticated;
grant execute on function public.delete_item(uuid) to authenticated;

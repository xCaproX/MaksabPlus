-- التحويلات الداخلية لها مستندات منفصلة ولا تغيّر أرصدة العملاء أو الموردين.

create table public.warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  transfer_date date not null default current_date,
  source_warehouse_id uuid not null,
  destination_warehouse_id uuid not null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  check (source_warehouse_id <> destination_warehouse_id),
  foreign key (company_id, source_warehouse_id) references public.warehouses(company_id, id),
  foreign key (company_id, destination_warehouse_id) references public.warehouses(company_id, id)
);

create table public.warehouse_transfer_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null,
  item_id uuid not null,
  qty numeric(18,4) not null check (qty > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, transfer_id, item_id),
  foreign key (company_id, transfer_id) references public.warehouse_transfers(company_id, id) on delete cascade,
  foreign key (company_id, item_id) references public.items(company_id, id)
);
create index warehouse_transfers_company_date_idx on public.warehouse_transfers(company_id, transfer_date desc);
create index warehouse_transfer_items_item_idx on public.warehouse_transfer_items(company_id, item_id);

create table public.cash_box_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  transfer_date date not null default current_date,
  source_cash_box_id uuid not null,
  destination_cash_box_id uuid not null,
  amount numeric(18,4) not null check (amount > 0),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  check (source_cash_box_id <> destination_cash_box_id),
  foreign key (company_id, source_cash_box_id) references public.cash_boxes(company_id, id),
  foreign key (company_id, destination_cash_box_id) references public.cash_boxes(company_id, id)
);
create index cash_box_transfers_company_date_idx on public.cash_box_transfers(company_id, transfer_date desc);

create trigger warehouse_transfers_set_updated_at before update on public.warehouse_transfers
for each row execute function public.set_updated_at();
create trigger warehouse_transfer_items_set_updated_at before update on public.warehouse_transfer_items
for each row execute function public.set_updated_at();
create trigger cash_box_transfers_set_updated_at before update on public.cash_box_transfers
for each row execute function public.set_updated_at();

alter table public.warehouse_transfers enable row level security;
alter table public.warehouse_transfer_items enable row level security;
alter table public.cash_box_transfers enable row level security;

create policy warehouse_transfers_company_read on public.warehouse_transfers
  for select to authenticated using (company_id = public.current_company_id());
create policy warehouse_transfer_items_company_read on public.warehouse_transfer_items
  for select to authenticated using (company_id = public.current_company_id());
create policy cash_box_transfers_company_read on public.cash_box_transfers
  for select to authenticated using (company_id = public.current_company_id());
revoke all on public.warehouse_transfers, public.warehouse_transfer_items, public.cash_box_transfers from anon, authenticated;
grant select on public.warehouse_transfers, public.warehouse_transfer_items, public.cash_box_transfers to authenticated;

create or replace function public.next_document_number(p_company_id uuid, p_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare v_last integer; v_prefix text;
begin
  if auth.uid() is not null and p_company_id <> public.current_company_id() then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;
  insert into public.document_sequences(company_id, doc_type, last_number)
  values (p_company_id, p_doc_type, 0) on conflict (company_id, doc_type) do nothing;
  update public.document_sequences set last_number = last_number + 1
  where company_id = p_company_id and doc_type = p_doc_type returning last_number into v_last;
  v_prefix := case p_doc_type
    when 'sale' then 'SAL' when 'purchase' then 'PUR'
    when 'sale_return' then 'SRT' when 'purchase_return' then 'PRT'
    when 'receipt_in' then 'RCP' when 'receipt_out' then 'PAY'
    when 'receipt' then 'RCP' when 'warehouse_transfer' then 'WTR'
    when 'cash_box_transfer' then 'CBT'
    else upper(left(p_doc_type, 3)) end;
  return v_prefix || '-' || lpad(v_last::text, 6, '0');
end;
$$;

create or replace view public.v_warehouse_transfer_list
with (security_invoker = true) as
select t.id, t.company_id, t.number, t.transfer_date, t.source_warehouse_id,
  sw.name as source_warehouse_name, t.destination_warehouse_id,
  dw.name as destination_warehouse_name, t.notes, t.deleted_at, t.created_at, t.updated_at,
  coalesce(lines.line_count, 0)::integer as line_count,
  coalesce(lines.total_qty, 0)::numeric(18,4) as total_qty,
  coalesce(lines.total_value, 0)::numeric(18,4) as total_value,
  coalesce(lines.items_summary, '') as items_summary
from public.warehouse_transfers t
join public.warehouses sw on sw.id = t.source_warehouse_id
join public.warehouses dw on dw.id = t.destination_warehouse_id
left join lateral (
  select count(*) as line_count, sum(ti.qty) as total_qty,
    sum(ti.qty * ti.unit_cost) as total_value,
    string_agg(i.name || ' × ' || ti.qty::text, '، ' order by i.name) as items_summary
  from public.warehouse_transfer_items ti
  join public.items i on i.id = ti.item_id
  where ti.transfer_id = t.id
) lines on true;
grant select on public.v_warehouse_transfer_list to authenticated;

create or replace view public.v_cash_box_transfer_list
with (security_invoker = true) as
select t.id, t.company_id, t.number, t.transfer_date, t.source_cash_box_id,
  sb.name as source_cash_box_name, t.destination_cash_box_id,
  db.name as destination_cash_box_name, t.amount, t.notes, t.deleted_at,
  t.created_at, t.updated_at
from public.cash_box_transfers t
join public.cash_boxes sb on sb.id = t.source_cash_box_id
join public.cash_boxes db on db.id = t.destination_cash_box_id;
grant select on public.v_cash_box_transfer_list to authenticated;

-- Recalculate displayed cash-box balances from independent receipt and transfer summaries.
create or replace view public.v_cash_box_balances
with (security_invoker = true) as
select cb.id, cb.company_id, cb.name, cb.is_active,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0) + coalesce(rec.amount, 0) + coalesce(tr.amount, 0))::numeric(18,4) as balance,
  (coalesce(cb.opening_balance, 0) + coalesce(adj.amount, 0))::numeric(18,4) as opening_balance,
  cb.is_primary
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

create or replace function public.warehouse_transfer_has_later_movement(p_transfer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.warehouse_transfers t
    join public.warehouse_transfer_items ti on ti.transfer_id = t.id
    join public.invoices inv on inv.company_id = t.company_id
      and inv.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
      and inv.created_at > t.created_at and inv.deleted_at is null
    join public.invoice_items ii on ii.invoice_id = inv.id and ii.item_id = ti.item_id
    where t.id = p_transfer_id and t.company_id = public.current_company_id()
  ) or exists (
    select 1 from public.warehouse_transfers t
    join public.warehouse_transfer_items ti on ti.transfer_id = t.id
    join public.stock_opening_adjustments a on a.company_id = t.company_id
      and a.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
      and a.item_id = ti.item_id and a.created_at > t.created_at
    where t.id = p_transfer_id and t.company_id = public.current_company_id()
  ) or exists (
    select 1 from public.warehouse_transfers t
    join public.warehouse_transfer_items ti on ti.transfer_id = t.id
    join public.warehouse_transfers later on later.company_id = t.company_id
      and later.id <> t.id and later.deleted_at is null and later.created_at > t.created_at
      and (later.source_warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
        or later.destination_warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id))
    join public.warehouse_transfer_items lti on lti.transfer_id = later.id
      and lti.item_id = ti.item_id
    where t.id = p_transfer_id and t.company_id = public.current_company_id()
  );
$$;
revoke all on function public.warehouse_transfer_has_later_movement(uuid) from public, anon, authenticated;

create or replace function public.create_warehouse_transfer(
  p_source_warehouse_id uuid, p_destination_warehouse_id uuid, p_transfer_date date,
  p_notes text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id(); v_id uuid; v_line record;
  v_source_qty numeric(18,4); v_source_cost numeric(18,4); v_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_source_warehouse_id is null or p_destination_warehouse_id is null
     or p_source_warehouse_id = p_destination_warehouse_id then
    raise exception 'invalid_transfer_warehouses' using errcode = '22023';
  end if;
  perform 1 from public.warehouses where id = p_source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_has_no_lines' using errcode = '22023';
  end if;
  insert into public.warehouse_transfers(company_id, number, transfer_date, source_warehouse_id, destination_warehouse_id, notes)
  values (v_company, public.next_document_number(v_company, 'warehouse_transfer'), coalesce(p_transfer_date, current_date), p_source_warehouse_id, p_destination_warehouse_id, p_notes)
  returning id into v_id;
  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty
    from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id
  loop
    if v_line.item_id is null or v_line.qty is null or v_line.qty <= 0 then
      raise exception 'invalid_transfer_line' using errcode = '22023';
    end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id for update;
    if not found or v_source_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    v_cost := public.apply_stock_movement(v_company, p_source_warehouse_id, v_line.item_id, -v_line.qty, v_source_cost);
    perform public.apply_stock_movement(v_company, p_destination_warehouse_id, v_line.item_id, v_line.qty, v_cost);
    insert into public.warehouse_transfer_items(company_id, transfer_id, item_id, qty, unit_cost)
    values (v_company, v_id, v_line.item_id, v_line.qty, v_cost);
  end loop;
  return v_id;
end;
$$;

create or replace function public.update_warehouse_transfer(
  p_transfer_id uuid, p_source_warehouse_id uuid, p_destination_warehouse_id uuid,
  p_transfer_date date, p_notes text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id(); v_transfer public.warehouse_transfers%rowtype;
  v_line record; v_source_qty numeric(18,4); v_source_cost numeric(18,4); v_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;
  if p_source_warehouse_id = p_destination_warehouse_id then raise exception 'invalid_transfer_warehouses' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = p_destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'transfer_has_no_lines' using errcode = '22023'; end if;
  for v_line in select * from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id loop
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
  end loop;
  delete from public.warehouse_transfer_items where company_id = v_company and transfer_id = p_transfer_id;
  update public.warehouse_transfers set source_warehouse_id = p_source_warehouse_id,
    destination_warehouse_id = p_destination_warehouse_id, transfer_date = coalesce(p_transfer_date, current_date), notes = p_notes
  where id = p_transfer_id and company_id = v_company;
  for v_line in
    select item_id, sum(qty)::numeric(18,4) as qty from jsonb_to_recordset(p_lines) as x(item_id uuid, qty numeric)
    group by item_id order by item_id
  loop
    if v_line.item_id is null or v_line.qty is null or v_line.qty <= 0 then raise exception 'invalid_transfer_line' using errcode = '22023'; end if;
    perform 1 from public.items where id = v_line.item_id and company_id = v_company and is_active;
    if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
    select qty, avg_cost into v_source_qty, v_source_cost from public.item_stock
    where company_id = v_company and warehouse_id = p_source_warehouse_id and item_id = v_line.item_id for update;
    if not found or v_source_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    v_cost := public.apply_stock_movement(v_company, p_source_warehouse_id, v_line.item_id, -v_line.qty, v_source_cost);
    perform public.apply_stock_movement(v_company, p_destination_warehouse_id, v_line.item_id, v_line.qty, v_cost);
    insert into public.warehouse_transfer_items(company_id, transfer_id, item_id, qty, unit_cost) values (v_company, p_transfer_id, v_line.item_id, v_line.qty, v_cost);
  end loop;
  return p_transfer_id;
end;
$$;

create or replace function public.delete_warehouse_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_transfer public.warehouse_transfers%rowtype; v_line record;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;
  for v_line in select * from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id loop
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
  end loop;
  update public.warehouse_transfers set deleted_at = now() where id = p_transfer_id and company_id = v_company;
end;
$$;

create or replace function public.restore_warehouse_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_transfer public.warehouse_transfers%rowtype; v_line record; v_qty numeric(18,4); v_cost numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.warehouse_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is null then raise exception 'transfer_not_deleted' using errcode = '22023'; end if;
  if public.warehouse_transfer_has_later_movement(p_transfer_id) then raise exception 'transfer_has_later_movements' using errcode = '23514'; end if;
  perform 1 from public.warehouses where id = v_transfer.source_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  perform 1 from public.warehouses where id = v_transfer.destination_warehouse_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_warehouse' using errcode = '22023'; end if;
  for v_line in select * from public.warehouse_transfer_items where transfer_id = p_transfer_id order by item_id loop
    select qty, avg_cost into v_qty, v_cost from public.item_stock
    where company_id = v_company and warehouse_id = v_transfer.source_warehouse_id and item_id = v_line.item_id for update;
    if not found or v_qty < v_line.qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;
    perform public.apply_stock_movement(v_company, v_transfer.source_warehouse_id, v_line.item_id, -v_line.qty, v_line.unit_cost);
    perform public.apply_stock_movement(v_company, v_transfer.destination_warehouse_id, v_line.item_id, v_line.qty, v_line.unit_cost);
  end loop;
  update public.warehouse_transfers set deleted_at = null where id = p_transfer_id and company_id = v_company;
end;
$$;

create or replace function public.create_cash_box_transfer(
  p_source_cash_box_id uuid, p_destination_cash_box_id uuid, p_transfer_date date, p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_id uuid; v_balance numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_source_cash_box_id is null or p_destination_cash_box_id is null or p_source_cash_box_id = p_destination_cash_box_id then raise exception 'invalid_transfer_cash_boxes' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where company_id = v_company and id in (p_source_cash_box_id, p_destination_cash_box_id) order by id for update;
  select balance into v_balance from public.v_cash_box_balances where id = p_source_cash_box_id;
  if coalesce(v_balance, 0) < p_amount then raise exception 'insufficient_cash_box_balance' using errcode = '22023'; end if;
  insert into public.cash_box_transfers(company_id, number, transfer_date, source_cash_box_id, destination_cash_box_id, amount, notes)
  values (v_company, public.next_document_number(v_company, 'cash_box_transfer'), coalesce(p_transfer_date, current_date), p_source_cash_box_id, p_destination_cash_box_id, round(p_amount, 4), p_notes)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_cash_box_transfer(
  p_transfer_id uuid, p_source_cash_box_id uuid, p_destination_cash_box_id uuid,
  p_transfer_date date, p_amount numeric, p_notes text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_transfer public.cash_box_transfers%rowtype; v_balance numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.cash_box_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is not null then raise exception 'transfer_deleted' using errcode = '22023'; end if;
  if p_source_cash_box_id is null or p_destination_cash_box_id is null or p_source_cash_box_id = p_destination_cash_box_id then raise exception 'invalid_transfer_cash_boxes' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_source_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = p_destination_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where company_id = v_company and id in (p_source_cash_box_id, p_destination_cash_box_id, v_transfer.source_cash_box_id, v_transfer.destination_cash_box_id) order by id for update;
  select balance into v_balance from public.v_cash_box_balances where id = p_source_cash_box_id;
  if p_source_cash_box_id = v_transfer.source_cash_box_id then v_balance := v_balance + v_transfer.amount; end if;
  if p_source_cash_box_id = v_transfer.destination_cash_box_id then v_balance := v_balance - v_transfer.amount; end if;
  if coalesce(v_balance, 0) < p_amount then raise exception 'insufficient_cash_box_balance' using errcode = '22023'; end if;
  update public.cash_box_transfers set source_cash_box_id = p_source_cash_box_id,
    destination_cash_box_id = p_destination_cash_box_id, transfer_date = coalesce(p_transfer_date, current_date),
    amount = round(p_amount, 4), notes = p_notes where id = p_transfer_id and company_id = v_company;
  return p_transfer_id;
end;
$$;

create or replace function public.delete_cash_box_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.cash_box_transfers set deleted_at = now()
  where id = p_transfer_id and company_id = v_company and deleted_at is null;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;
end;
$$;

create or replace function public.restore_cash_box_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_transfer public.cash_box_transfers%rowtype; v_balance numeric(18,4);
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_transfer from public.cash_box_transfers where id = p_transfer_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_transfer_not_found' using errcode = '22023'; end if;
  if v_transfer.deleted_at is null then raise exception 'transfer_not_deleted' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = v_transfer.source_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where id = v_transfer.destination_cash_box_id and company_id = v_company and is_active;
  if not found then raise exception 'invalid_cash_box' using errcode = '22023'; end if;
  perform 1 from public.cash_boxes where company_id = v_company and id in (v_transfer.source_cash_box_id, v_transfer.destination_cash_box_id) order by id for update;
  select balance into v_balance from public.v_cash_box_balances where id = v_transfer.source_cash_box_id;
  if coalesce(v_balance, 0) < v_transfer.amount then raise exception 'insufficient_cash_box_balance' using errcode = '22023'; end if;
  update public.cash_box_transfers set deleted_at = null where id = p_transfer_id and company_id = v_company;
end;
$$;

-- Keep locations referenced by a transfer from being deleted, even after a transfer is soft-deleted.
create or replace function public.delete_warehouse(p_warehouse_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_warehouse public.warehouses%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and company_id = v_company for update;
  if not found then raise exception 'warehouse_not_found' using errcode = '22023'; end if;
  if v_warehouse.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.invoices where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_documents' using errcode = '23514';
  end if;
  if exists (select 1 from public.warehouse_transfers where company_id = v_company
    and p_warehouse_id in (source_warehouse_id, destination_warehouse_id)) then
    raise exception 'warehouse_has_transfers' using errcode = '23514';
  end if;
  if exists (select 1 from public.item_stock where company_id = v_company and warehouse_id = p_warehouse_id and qty <> 0)
     or exists (select 1 from public.stock_opening_adjustments where company_id = v_company and warehouse_id = p_warehouse_id) then
    raise exception 'warehouse_has_stock_for_delete' using errcode = '23514';
  end if;
  delete from public.warehouses where id = p_warehouse_id and company_id = v_company;
end;
$$;

create or replace function public.delete_cash_box(p_cash_box_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_box public.cash_boxes%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_box from public.cash_boxes where id = p_cash_box_id and company_id = v_company for update;
  if not found then raise exception 'cash_box_not_found' using errcode = '22023'; end if;
  if v_box.is_primary then raise exception 'primary_location_protected' using errcode = '23514'; end if;
  if exists (select 1 from public.receipts where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_documents' using errcode = '23514';
  end if;
  if exists (select 1 from public.cash_box_transfers where company_id = v_company
    and p_cash_box_id in (source_cash_box_id, destination_cash_box_id)) then
    raise exception 'cash_box_has_transfers' using errcode = '23514';
  end if;
  if coalesce(v_box.opening_balance, 0) <> 0
     or exists (select 1 from public.opening_balance_adjustments where company_id = v_company and cash_box_id = p_cash_box_id) then
    raise exception 'cash_box_has_balance' using errcode = '23514';
  end if;
  delete from public.cash_boxes where id = p_cash_box_id and company_id = v_company;
end;
$$;

revoke all on function public.create_warehouse_transfer(uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function public.update_warehouse_transfer(uuid, uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function public.delete_warehouse_transfer(uuid) from public, anon;
revoke all on function public.restore_warehouse_transfer(uuid) from public, anon;
revoke all on function public.create_cash_box_transfer(uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.update_cash_box_transfer(uuid, uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.delete_cash_box_transfer(uuid) from public, anon;
revoke all on function public.restore_cash_box_transfer(uuid) from public, anon;
grant execute on function public.create_warehouse_transfer(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.update_warehouse_transfer(uuid, uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_warehouse_transfer(uuid) to authenticated;
grant execute on function public.restore_warehouse_transfer(uuid) to authenticated;
grant execute on function public.create_cash_box_transfer(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.update_cash_box_transfer(uuid, uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_cash_box_transfer(uuid) to authenticated;
grant execute on function public.restore_cash_box_transfer(uuid) to authenticated;

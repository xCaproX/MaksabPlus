-- Split account numbering by type while preserving order within each type.
alter table public.entity_number_sequences
  drop constraint entity_number_sequences_entity_type_check;
delete from public.entity_number_sequences where entity_type = 'accounts';
alter table public.entity_number_sequences
  add constraint entity_number_sequences_entity_type_check
  check (entity_type in ('customer_accounts', 'supplier_accounts', 'items', 'warehouses', 'cash_boxes'));

drop trigger accounts_serial_number_immutable on public.accounts;
drop index public.accounts_company_serial_number_idx;

with numbered as (
  select id, row_number() over (
    partition by company_id, kind
    order by serial_number, created_at, id
  )::integer as number
  from public.accounts
  where system_key is null
)
update public.accounts a
set serial_number = numbered.number
from numbered
where numbered.id = a.id;

insert into public.entity_number_sequences(company_id, entity_type, last_number)
select company_id,
  case kind when 'customer' then 'customer_accounts' else 'supplier_accounts' end,
  max(serial_number)
from public.accounts
where system_key is null
group by company_id, kind;

create unique index accounts_company_kind_serial_number_idx
  on public.accounts(company_id, kind, serial_number)
  where serial_number is not null;

create or replace function public.next_entity_serial_number(p_company_id uuid, p_entity_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if p_company_id is null or p_entity_type not in ('customer_accounts', 'supplier_accounts', 'items', 'warehouses', 'cash_boxes') then
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
      v_entity_type := case new.kind
        when 'customer' then 'customer_accounts'
        when 'supplier' then 'supplier_accounts'
        else null
      end;
      if v_entity_type is null then
        raise exception 'invalid_account_kind' using errcode = '22023';
      end if;
      new.serial_number := public.next_entity_serial_number(new.company_id, v_entity_type);
    end if;
  else
    new.serial_number := public.next_entity_serial_number(new.company_id, v_entity_type);
  end if;
  return new;
end;
$$;

create trigger accounts_serial_number_immutable before update of serial_number on public.accounts
  for each row execute function public.prevent_entity_serial_number_change();

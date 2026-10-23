-- حسابات ثابتة لكل شركة، مع فرض السداد الكامل عند استخدامها.

alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts
  add constraint accounts_kind_check
  check (kind in ('customer', 'supplier', 'waste'));

alter table public.accounts add column system_key text;
alter table public.accounts
  add constraint accounts_company_system_key_unique unique (company_id, system_key);

-- تعيين السجلات الموجودة مسبقًا، وإنشاء أي حساب ثابت مفقود.
create or replace function public.ensure_fixed_accounts(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (company_id, name, kind, system_key)
  values
    (p_company_id, 'عميل نقدي', 'customer', 'cash_customer'),
    (p_company_id, 'مورد نقدي', 'supplier', 'cash_supplier'),
    (p_company_id, 'هالك', 'waste', 'waste')
  on conflict (company_id, system_key) do nothing;
end;
$$;

update public.accounts
   set system_key = case
     when name = 'عميل نقدي' and kind = 'customer' then 'cash_customer'
     when name = 'مورد نقدي' and kind = 'supplier' then 'cash_supplier'
     when name = 'هالك' and kind = 'waste' then 'waste'
   end
 where system_key is null
   and ((name = 'عميل نقدي' and kind = 'customer')
     or (name = 'مورد نقدي' and kind = 'supplier')
     or (name = 'هالك' and kind = 'waste'));

do $$
declare v_company record;
begin
  for v_company in select id from public.companies loop
    perform public.ensure_fixed_accounts(v_company.id);
  end loop;
end;
$$;

create or replace function public.companies_create_fixed_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_fixed_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists companies_create_fixed_accounts on public.companies;
create trigger companies_create_fixed_accounts
after insert on public.companies
for each row execute function public.companies_create_fixed_accounts();

-- لا يمكن تعديل/تعطيل/حذف الحسابات الثابتة مباشرة.
create or replace function public.accounts_guard_system()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.system_key is not null then
    if tg_op = 'DELETE' then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;
    if new.name is distinct from old.name
       or new.kind is distinct from old.kind
       or new.company_id is distinct from old.company_id
       or new.phone is distinct from old.phone
       or new.created_at is distinct from old.created_at
       or new.system_key is distinct from old.system_key
       or new.is_active is distinct from old.is_active then
      raise exception 'system_account_protected' using errcode = '22023';
    end if;
  elsif new.system_key is not null then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists accounts_guard_system on public.accounts;
create trigger accounts_guard_system
before update or delete on public.accounts
for each row execute function public.accounts_guard_system();

-- فرض السداد الكامل لعميل نقدي/مورد نقدي، بما يشمل مرتجعات البيع والشراء.
create or replace function public.invoices_require_cash_settlement()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_system_key text;
begin
  select system_key into v_system_key
  from public.accounts
  where company_id = new.company_id and id = new.account_id;

  if v_system_key in ('cash_customer', 'cash_supplier') and new.paid <> new.total then
    raise exception 'cash_account_requires_full_payment' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_require_cash_settlement on public.invoices;
create trigger invoices_require_cash_settlement
before insert or update of account_id, total, paid on public.invoices
for each row execute function public.invoices_require_cash_settlement();

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
  (coalesce(inv.total, 0) - coalesce(rec.amount, 0))::numeric(18,4) as balance,
  (coalesce(inv.cnt, 0) + coalesce(rec.cnt, 0)) > 0 as has_documents,
  a.system_key
from public.accounts a
left join (
  select account_id,
    sum(case when kind in ('sale', 'purchase') then total else -total end)
      filter (where deleted_at is null) as total,
    count(*) as cnt
  from public.invoices group by account_id
) inv on inv.account_id = a.id
left join (
  select r.account_id,
    sum(case when r.invoice_id is null then r.amount
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null) as amount,
    count(*) as cnt
  from public.receipts r left join public.invoices i on i.id = r.invoice_id
  group by r.account_id
) rec on rec.account_id = a.id;
grant select on public.v_account_balances to authenticated;

-- حماية عبر RPC الحذف أيضًا، برسالة واضحة قبل التعامل مع قيود الحماية.
create or replace function public.delete_account(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.accounts where id = p_account_id and company_id = v_company and system_key is not null) then
    raise exception 'system_account_protected' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id and company_id = v_company) then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where account_id = p_account_id)
     or exists (select 1 from public.receipts where account_id = p_account_id) then
    update public.accounts set is_active = false where id = p_account_id and company_id = v_company;
    return false;
  end if;
  delete from public.accounts where id = p_account_id and company_id = v_company;
  return true;
end;
$$;

revoke all on function public.ensure_fixed_accounts(uuid) from public, anon, authenticated;
grant execute on function public.ensure_fixed_accounts(uuid) to service_role;
revoke all on function public.companies_create_fixed_accounts() from public, anon, authenticated;
revoke all on function public.accounts_guard_system() from public, anon, authenticated;
revoke all on function public.invoices_require_cash_settlement() from public, anon, authenticated;

-- =====================================================================
-- 0047_running_balances.sql
-- تحويل استعلامات أرصدة الحسابات والخزن إلى أرصدة تراكمية فورية (Running Balances)
-- تلغي عمل فحص كامل للجداول التاريخية (Full Table Scans) وتوفر استجابة O(1)
-- =====================================================================

-- 1. إضافة أعمدة الأرصدة التراكمية على الجداول الأساسية
alter table public.accounts
  add column if not exists current_balance numeric(18,4) not null default 0,
  add column if not exists effective_opening_balance numeric(18,4) not null default 0,
  add column if not exists invoiced_total numeric(18,4) not null default 0,
  add column if not exists paid_total numeric(18,4) not null default 0,
  add column if not exists has_documents boolean not null default false;

alter table public.cash_boxes
  add column if not exists current_balance numeric(18,4) not null default 0,
  add column if not exists effective_opening_balance numeric(18,4) not null default 0;

-- 2. دوال مزامنة الأرصدة (Balance Synchronization Functions)

-- مزامنة رصيد حساب محدد بدقة محاسبية كاملة
create or replace function public.sync_account_balance(p_account_id uuid)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_raw_opening numeric(18,4);
  v_adj_amount numeric(18,4);
  v_adj_cnt integer;
  v_inv_total numeric(18,4);
  v_inv_cnt integer;
  v_rec_amount numeric(18,4);
  v_rec_balance_effect numeric(18,4);
  v_rec_cnt integer;
  v_current_bal numeric(18,4);
  v_effective_opening numeric(18,4);
  v_has_docs boolean;
begin
  if p_account_id is null then
    return 0;
  end if;

  select kind, coalesce(opening_balance, 0)
  into v_kind, v_raw_opening
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    return 0;
  end if;

  -- 1. تسويات الرصيد الافتتاحي
  select coalesce(sum(amount_delta), 0), count(*)
  into v_adj_amount, v_adj_cnt
  from public.opening_balance_adjustments
  where account_id = p_account_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  -- 2. الفواتير غير المحذوفة (مع عد كل الفواتير لتحديد has_documents)
  select
    coalesce(sum(case when kind in ('sale', 'purchase') then total else -total end) filter (where deleted_at is null), 0),
    count(*)
  into v_inv_total, v_inv_cnt
  from public.invoices
  where account_id = p_account_id;

  -- 3. الإيصالات غير المحذوفة
  select
    coalesce(sum(case when r.invoice_id is null then r.amount
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null), 0),
    coalesce(sum(case when r.invoice_id is null then
        case when (v_kind = 'customer' and r.direction = 'in')
               or (v_kind = 'supplier' and r.direction = 'out')
          then r.amount else -r.amount end
      when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
      filter (where r.deleted_at is null), 0),
    count(*)
  into v_rec_amount, v_rec_balance_effect, v_rec_cnt
  from public.receipts r
  left join public.invoices i on i.id = r.invoice_id
  where r.account_id = p_account_id;

  v_current_bal := (v_effective_opening + v_inv_total - v_rec_balance_effect)::numeric(18,4);
  v_has_docs := ((v_inv_cnt + v_rec_cnt) > 0 or v_raw_opening <> 0 or v_adj_cnt > 0);

  perform set_config('maksab.balance_sync', 'true', true);

  update public.accounts
  set
    current_balance = v_current_bal,
    effective_opening_balance = v_effective_opening,
    invoiced_total = v_inv_total::numeric(18,4),
    paid_total = v_rec_amount::numeric(18,4),
    has_documents = v_has_docs
  where id = p_account_id;

  perform set_config('maksab.balance_sync', 'false', true);

  return v_current_bal;
end;
$$;

-- مزامنة رصيد خزنة محددة
create or replace function public.sync_cash_box_balance(p_cash_box_id uuid)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw_opening numeric(18,4);
  v_adj_amount numeric(18,4);
  v_effective_opening numeric(18,4);
  v_rec_amount numeric(18,4);
  v_tr_amount numeric(18,4);
  v_current_bal numeric(18,4);
begin
  if p_cash_box_id is null then
    return 0;
  end if;

  select coalesce(opening_balance, 0)
  into v_raw_opening
  from public.cash_boxes
  where id = p_cash_box_id
  for update;

  if not found then
    return 0;
  end if;

  -- 1. تسويات الرصيد الافتتاحي
  select coalesce(sum(amount_delta), 0)
  into v_adj_amount
  from public.opening_balance_adjustments
  where cash_box_id = p_cash_box_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  -- 2. حركة الإيصالات غير المحذوفة
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  into v_rec_amount
  from public.receipts
  where cash_box_id = p_cash_box_id and deleted_at is null;

  -- 3. التحويلات الداخلية بين الخزن غير المحذوفة
  select coalesce(sum(delta), 0)
  into v_tr_amount
  from (
    select amount as delta from public.cash_box_transfers
    where destination_cash_box_id = p_cash_box_id and deleted_at is null
    union all
    select -amount as delta from public.cash_box_transfers
    where source_cash_box_id = p_cash_box_id and deleted_at is null
  ) tr;

  v_current_bal := (v_effective_opening + v_rec_amount + v_tr_amount)::numeric(18,4);

  perform set_config('maksab.balance_sync', 'true', true);

  update public.cash_boxes
  set
    current_balance = v_current_bal,
    effective_opening_balance = v_effective_opening
  where id = p_cash_box_id;

  perform set_config('maksab.balance_sync', 'false', true);

  return v_current_bal;
end;
$$;

-- 3. محفزات الحماية والمزامنة الفورية (Triggers)

-- محفز إدخال الحسابات
create or replace function public.trg_accounts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.current_balance := coalesce(new.opening_balance, 0);
  new.effective_opening_balance := coalesce(new.opening_balance, 0);
  new.has_documents := (coalesce(new.opening_balance, 0) <> 0);
  new.invoiced_total := 0;
  new.paid_total := 0;
  return new;
end;
$$;

drop trigger if exists accounts_before_insert on public.accounts;
create trigger accounts_before_insert
  before insert on public.accounts
  for each row execute function public.trg_accounts_before_insert();

-- محفز منع تعديل الأعمدة المحسوبة يدويًا
create or replace function public.trg_accounts_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('maksab.balance_sync', true) is distinct from 'true' then
    new.current_balance := old.current_balance;
    new.effective_opening_balance := old.effective_opening_balance;
    new.invoiced_total := old.invoiced_total;
    new.paid_total := old.paid_total;
    new.has_documents := old.has_documents;
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_before_update on public.accounts;
create trigger accounts_before_update
  before update on public.accounts
  for each row execute function public.trg_accounts_before_update();

-- محفز إعادة مزامنة الحساب بعد تعديل الرصيد الافتتاحي أو نوع الحساب
create or replace function public.trg_accounts_after_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.opening_balance is distinct from old.opening_balance
     or new.kind is distinct from old.kind then
    perform public.sync_account_balance(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists accounts_after_update on public.accounts;
create trigger accounts_after_update
  after update of opening_balance, kind on public.accounts
  for each row execute function public.trg_accounts_after_update();

-- محفز إدخال الخزن
create or replace function public.trg_cash_boxes_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.current_balance := coalesce(new.opening_balance, 0);
  new.effective_opening_balance := coalesce(new.opening_balance, 0);
  return new;
end;
$$;

drop trigger if exists cash_boxes_before_insert on public.cash_boxes;
create trigger cash_boxes_before_insert
  before insert on public.cash_boxes
  for each row execute function public.trg_cash_boxes_before_insert();

-- محفز حماية رصيد الخزن من التعديل اليدوي
create or replace function public.trg_cash_boxes_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('maksab.balance_sync', true) is distinct from 'true' then
    new.current_balance := old.current_balance;
    new.effective_opening_balance := old.effective_opening_balance;
  end if;
  return new;
end;
$$;

drop trigger if exists cash_boxes_before_update on public.cash_boxes;
create trigger cash_boxes_before_update
  before update on public.cash_boxes
  for each row execute function public.trg_cash_boxes_before_update();

-- محفز تحديث الخزنة عند تعديل الرصيد الافتتاحي
create or replace function public.trg_cash_boxes_after_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.opening_balance is distinct from old.opening_balance then
    perform public.sync_cash_box_balance(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists cash_boxes_after_update on public.cash_boxes;
create trigger cash_boxes_after_update
  after update of opening_balance on public.cash_boxes
  for each row execute function public.trg_cash_boxes_after_update();

-- محفز الفواتير: يحدث رصيد الحساب تلقائيًا
create or replace function public.trg_invoices_balance_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_account_balance(new.account_id);
  elsif tg_op = 'UPDATE' then
    perform public.sync_account_balance(new.account_id);
    if old.account_id is distinct from new.account_id then
      perform public.sync_account_balance(old.account_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.sync_account_balance(old.account_id);
  end if;
  return null;
end;
$$;

drop trigger if exists invoices_balance_sync on public.invoices;
create trigger invoices_balance_sync
  after insert or update of account_id, total, kind, deleted_at or delete on public.invoices
  for each row execute function public.trg_invoices_balance_sync();

-- محفز الإيصالات: يحدث رصيد الحساب ورصيد الخزنة تلقائيًا
create or replace function public.trg_receipts_balance_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then perform public.sync_account_balance(new.account_id); end if;
    if new.cash_box_id is not null then perform public.sync_cash_box_balance(new.cash_box_id); end if;
  elsif tg_op = 'UPDATE' then
    if new.account_id is not null then perform public.sync_account_balance(new.account_id); end if;
    if old.account_id is distinct from new.account_id and old.account_id is not null then
      perform public.sync_account_balance(old.account_id);
    end if;
    if new.cash_box_id is not null then perform public.sync_cash_box_balance(new.cash_box_id); end if;
    if old.cash_box_id is distinct from new.cash_box_id and old.cash_box_id is not null then
      perform public.sync_cash_box_balance(old.cash_box_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then perform public.sync_account_balance(old.account_id); end if;
    if old.cash_box_id is not null then perform public.sync_cash_box_balance(old.cash_box_id); end if;
  end if;
  return null;
end;
$$;

drop trigger if exists receipts_balance_sync on public.receipts;
create trigger receipts_balance_sync
  after insert or update of account_id, cash_box_id, amount, direction, invoice_id, deleted_at or delete on public.receipts
  for each row execute function public.trg_receipts_balance_sync();

-- محفز تحويلات الخزن
create or replace function public.trg_cash_box_transfers_balance_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_cash_box_balance(new.source_cash_box_id);
    perform public.sync_cash_box_balance(new.destination_cash_box_id);
  elsif tg_op = 'UPDATE' then
    perform public.sync_cash_box_balance(new.source_cash_box_id);
    perform public.sync_cash_box_balance(new.destination_cash_box_id);
    if old.source_cash_box_id is distinct from new.source_cash_box_id then
      perform public.sync_cash_box_balance(old.source_cash_box_id);
    end if;
    if old.destination_cash_box_id is distinct from new.destination_cash_box_id then
      perform public.sync_cash_box_balance(old.destination_cash_box_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.sync_cash_box_balance(old.source_cash_box_id);
    perform public.sync_cash_box_balance(old.destination_cash_box_id);
  end if;
  return null;
end;
$$;

drop trigger if exists cash_box_transfers_balance_sync on public.cash_box_transfers;
create trigger cash_box_transfers_balance_sync
  after insert or update of source_cash_box_id, destination_cash_box_id, amount, deleted_at or delete on public.cash_box_transfers
  for each row execute function public.trg_cash_box_transfers_balance_sync();

-- محفز تسويات الأرصدة الافتتاحية
create or replace function public.trg_opening_adjustments_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then perform public.sync_account_balance(new.account_id); end if;
    if new.cash_box_id is not null then perform public.sync_cash_box_balance(new.cash_box_id); end if;
  elsif tg_op = 'UPDATE' then
    if new.account_id is not null then perform public.sync_account_balance(new.account_id); end if;
    if old.account_id is distinct from new.account_id and old.account_id is not null then
      perform public.sync_account_balance(old.account_id);
    end if;
    if new.cash_box_id is not null then perform public.sync_cash_box_balance(new.cash_box_id); end if;
    if old.cash_box_id is distinct from new.cash_box_id and old.cash_box_id is not null then
      perform public.sync_cash_box_balance(old.cash_box_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then perform public.sync_account_balance(old.account_id); end if;
    if old.cash_box_id is not null then perform public.sync_cash_box_balance(old.cash_box_id); end if;
  end if;
  return null;
end;
$$;

drop trigger if exists opening_adjustments_sync on public.opening_balance_adjustments;
create trigger opening_adjustments_sync
  after insert or update or delete on public.opening_balance_adjustments
  for each row execute function public.trg_opening_adjustments_sync();

-- 4. إعادة بناء الـ Views لتكون استعلامات O(1) مباشرة فائقة السرعة
drop view if exists public.v_account_balances cascade;
create view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  a.invoiced_total as invoiced,
  a.paid_total as paid,
  a.current_balance as balance,
  a.has_documents,
  a.system_key,
  a.effective_opening_balance as opening_balance,
  a.notes,
  a.serial_number
from public.accounts a;

grant select on public.v_account_balances to authenticated;

drop view if exists public.v_cash_box_balances cascade;
create view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  cb.current_balance as balance,
  cb.effective_opening_balance as opening_balance,
  cb.is_primary,
  cb.notes,
  cb.serial_number
from public.cash_boxes cb;

grant select on public.v_cash_box_balances to authenticated;

-- 5. دوال الفحص والمطابقة والتدقيق (Reconciliation & Audit)
create or replace function public.reconcile_all_balances_internal(p_company_id uuid)
returns table (
  entity_type text,
  entity_id uuid,
  entity_name text,
  old_balance numeric(18,4),
  reconciled_balance numeric(18,4),
  discrepancy numeric(18,4)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_rec_bal numeric(18,4);
begin
  if p_company_id is null then
    return;
  end if;

  -- 1. مطابقة حسابات العملاء والموردين
  for r in select id, name, current_balance from public.accounts where company_id = p_company_id order by serial_number loop
    v_rec_bal := public.sync_account_balance(r.id);
    if v_rec_bal is distinct from r.current_balance then
      entity_type := 'account';
      entity_id := r.id;
      entity_name := r.name;
      old_balance := r.current_balance;
      reconciled_balance := v_rec_bal;
      discrepancy := (v_rec_bal - r.current_balance)::numeric(18,4);
      return next;
    end if;
  end loop;

  -- 2. مطابقة أرصدة الخزن
  for r in select id, name, current_balance from public.cash_boxes where company_id = p_company_id order by serial_number loop
    v_rec_bal := public.sync_cash_box_balance(r.id);
    if v_rec_bal is distinct from r.current_balance then
      entity_type := 'cash_box';
      entity_id := r.id;
      entity_name := r.name;
      old_balance := r.current_balance;
      reconciled_balance := v_rec_bal;
      discrepancy := (v_rec_bal - r.current_balance)::numeric(18,4);
      return next;
    end if;
  end loop;

  return;
end;
$$;

create or replace function public.reconcile_all_balances(p_company_id uuid default null)
returns table (
  entity_type text,
  entity_id uuid,
  entity_name text,
  old_balance numeric(18,4),
  reconciled_balance numeric(18,4),
  discrepancy numeric(18,4)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_company_id is not null and p_company_id is distinct from v_company_id then
    raise exception 'unauthorized_company' using errcode = '42501';
  end if;

  return query select * from public.reconcile_all_balances_internal(v_company_id);
end;
$$;

revoke all on function public.reconcile_all_balances_internal(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_all_balances(uuid) from public, anon;
grant execute on function public.reconcile_all_balances(uuid) to authenticated;

-- 6. تهيئة واحتساب الأرصدة الحالية لجميع الحسابات والخزن المسجلة مسبقًا في قاعدة البيانات
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform * from public.reconcile_all_balances_internal(c.id);
  end loop;
end;
$$;

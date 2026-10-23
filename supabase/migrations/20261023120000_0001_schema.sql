-- =====================================================================
-- 0001_schema.sql
-- الهيكل الأساسي: شركات، مستخدمون، حسابات (عملاء/موردون)، أصناف،
-- مخازن، أرصدة مخزون، خزن، فواتير، سطور فواتير، إيصالات + RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- دالة مشتركة: تحديث updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- الشركات
-- ---------------------------------------------------------------------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  currency   text not null default 'EGP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- المستخدمون (ربط مستخدم Auth بشركة) + دالة الشركة الحالية
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_company_idx on public.profiles(company_id);

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- الحسابات: عملاء وموردون في جدول واحد (kind)
-- ---------------------------------------------------------------------
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  kind       text not null check (kind in ('customer', 'supplier')),
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index accounts_company_idx on public.accounts(company_id, kind);

-- ---------------------------------------------------------------------
-- الأصناف
-- ---------------------------------------------------------------------
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  unit           text not null default 'قطعة',
  sale_price     numeric(18,4) not null default 0 check (sale_price >= 0),
  purchase_price numeric(18,4) not null default 0 check (purchase_price >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, id)
);

create index items_company_idx on public.items(company_id);

-- ---------------------------------------------------------------------
-- المخازن
-- ---------------------------------------------------------------------
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index warehouses_company_idx on public.warehouses(company_id);

-- ---------------------------------------------------------------------
-- رصيد كل صنف داخل كل مخزن
-- ---------------------------------------------------------------------
create table public.item_stock (
  company_id   uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null,
  item_id      uuid not null,
  qty          numeric(18,4) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (warehouse_id, item_id),
  foreign key (company_id, warehouse_id)
    references public.warehouses(company_id, id) on delete cascade,
  foreign key (company_id, item_id)
    references public.items(company_id, id) on delete cascade
);

create index item_stock_item_idx on public.item_stock(item_id);

-- ---------------------------------------------------------------------
-- الخزن
-- ---------------------------------------------------------------------
create table public.cash_boxes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index cash_boxes_company_idx on public.cash_boxes(company_id);

-- ---------------------------------------------------------------------
-- عدادات ترقيم المستندات (سريال لكل نوع/شركة)
-- ---------------------------------------------------------------------
create table public.document_sequences (
  company_id  uuid not null references public.companies(id) on delete cascade,
  doc_type    text not null,
  last_number integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, doc_type)
);

-- ---------------------------------------------------------------------
-- الفواتير
-- ---------------------------------------------------------------------
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null check (kind in ('sale', 'purchase')),
  number       text not null,
  invoice_date date not null default current_date,
  account_id   uuid not null,
  warehouse_id uuid not null,
  subtotal     numeric(18,4) not null default 0 check (subtotal >= 0),
  total        numeric(18,4) not null default 0 check (total >= 0),
  paid         numeric(18,4) not null default 0 check (paid >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, kind, number),
  unique (company_id, id),
  check (paid <= total),
  foreign key (company_id, account_id)
    references public.accounts(company_id, id),
  foreign key (company_id, warehouse_id)
    references public.warehouses(company_id, id)
);

create index invoices_company_kind_idx on public.invoices(company_id, kind, invoice_date desc);
create index invoices_account_idx on public.invoices(account_id);

-- ---------------------------------------------------------------------
-- سطور الفواتير (line_total محسوب في قاعدة البيانات)
-- ---------------------------------------------------------------------
create table public.invoice_items (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null,
  item_id    uuid not null,
  qty        numeric(18,4) not null check (qty <> 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  line_total numeric(18,4) generated always as (round(qty * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, invoice_id)
    references public.invoices(company_id, id) on delete cascade,
  foreign key (company_id, item_id)
    references public.items(company_id, id)
);

create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_item_idx on public.invoice_items(item_id);

-- ---------------------------------------------------------------------
-- الإيصالات (إيصال واحد لكل فاتورة، يُنشأ تلقائيًا من قيمة المدفوع)
-- ---------------------------------------------------------------------
create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  invoice_id   uuid not null,
  number       text not null,
  receipt_date date not null default current_date,
  account_id   uuid not null,
  cash_box_id  uuid not null,
  amount       numeric(18,4) not null check (amount > 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (invoice_id),
  unique (company_id, number),
  foreign key (company_id, invoice_id)
    references public.invoices(company_id, id) on delete cascade,
  foreign key (company_id, account_id)
    references public.accounts(company_id, id),
  foreign key (company_id, cash_box_id)
    references public.cash_boxes(company_id, id)
);

create index receipts_account_idx on public.receipts(account_id);
create index receipts_cash_box_idx on public.receipts(cash_box_id);

-- ---------------------------------------------------------------------
-- تريجرات updated_at
-- ---------------------------------------------------------------------
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();
create trigger item_stock_set_updated_at before update on public.item_stock
  for each row execute function public.set_updated_at();
create trigger cash_boxes_set_updated_at before update on public.cash_boxes
  for each row execute function public.set_updated_at();
create trigger document_sequences_set_updated_at before update on public.document_sequences
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger invoice_items_set_updated_at before update on public.invoice_items
  for each row execute function public.set_updated_at();
create trigger receipts_set_updated_at before update on public.receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.companies          enable row level security;
alter table public.profiles           enable row level security;
alter table public.accounts           enable row level security;
alter table public.items              enable row level security;
alter table public.warehouses         enable row level security;
alter table public.item_stock         enable row level security;
alter table public.cash_boxes         enable row level security;
alter table public.document_sequences enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_items      enable row level security;
alter table public.receipts           enable row level security;

-- الشركة: المستخدم يرى شركته فقط
create policy companies_select_own on public.companies
  for select to authenticated
  using (id = public.current_company_id());

-- المستخدم: يرى ويعدّل ملفه فقط
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- بقية الجداول: عزل كامل بالشركة
create policy accounts_company_isolation on public.accounts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy items_company_isolation on public.items
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy warehouses_company_isolation on public.warehouses
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy item_stock_company_isolation on public.item_stock
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy cash_boxes_company_isolation on public.cash_boxes
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy invoices_company_isolation on public.invoices
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy invoice_items_company_isolation on public.invoice_items
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy receipts_company_isolation on public.receipts
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- document_sequences: بدون أي policy => ممنوع على العملاء (الدوال فقط تلمسه)

-- ---------------------------------------------------------------------
-- Grants (Supabase يمنح الصلاحيات افتراضيًا، ونجعلها صريحة)
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select on public.companies to authenticated;
grant select, update on public.profiles to authenticated;

grant select, insert, update, delete on
  public.accounts,
  public.items,
  public.warehouses,
  public.item_stock,
  public.cash_boxes,
  public.invoices,
  public.invoice_items,
  public.receipts
to authenticated;

revoke all on public.document_sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- Views محسوبة (لا نُخزّن أرصدة)
-- ---------------------------------------------------------------------
create view public.v_account_balances
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  a.name,
  a.kind,
  a.phone,
  a.is_active,
  coalesce(inv.total, 0)::numeric(18,4)                         as invoiced,
  coalesce(rec.amount, 0)::numeric(18,4)                        as paid,
  (coalesce(inv.total, 0) - coalesce(rec.amount, 0))::numeric(18,4) as balance
from public.accounts a
left join (
  select account_id, sum(total) as total
  from public.invoices
  group by account_id
) inv on inv.account_id = a.id
left join (
  select account_id, sum(amount) as amount
  from public.receipts
  group by account_id
) rec on rec.account_id = a.id;

create view public.v_item_stock
with (security_invoker = true) as
select
  i.id,
  i.company_id,
  i.name,
  i.unit,
  i.sale_price,
  i.purchase_price,
  i.is_active,
  coalesce(sum(s.qty), 0)::numeric(18,4) as qty
from public.items i
left join public.item_stock s on s.item_id = i.id
group by i.id;

create view public.v_cash_box_balances
with (security_invoker = true) as
select
  cb.id,
  cb.company_id,
  cb.name,
  cb.is_active,
  coalesce(sum(case when i.kind = 'sale' then r.amount else -r.amount end), 0)::numeric(18,4) as balance
from public.cash_boxes cb
left join public.receipts r on r.cash_box_id = cb.id
left join public.invoices i on i.id = r.invoice_id
group by cb.id;

create view public.v_invoice_list
with (security_invoker = true) as
select
  i.id,
  i.company_id,
  i.kind,
  i.number,
  i.invoice_date,
  i.account_id,
  a.name as account_name,
  i.warehouse_id,
  w.name as warehouse_name,
  i.subtotal,
  i.total,
  i.paid,
  (i.total - i.paid)::numeric(18,4) as remaining,
  i.notes,
  i.created_at,
  i.updated_at,
  r.id     as receipt_id,
  r.number as receipt_number,
  r.amount as receipt_amount
from public.invoices i
join public.accounts a on a.id = i.account_id
join public.warehouses w on w.id = i.warehouse_id
left join public.receipts r on r.invoice_id = i.id;

grant select on
  public.v_account_balances,
  public.v_item_stock,
  public.v_cash_box_balances,
  public.v_invoice_list
to authenticated;

-- =====================================================================
-- 0053_reconciliation_audit_logs.sql
-- إنشاء جدول سجل تدقيق ومطابقة الأرصدة والمخزون مع دالة الفحص الشاملة
-- =====================================================================

-- 1. جدول سجل الفحص والتدقيق (Append-Only Audit Log)
create table if not exists public.balance_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mode text not null check (mode in ('reconcile', 'simulation')),
  notes text,
  accounts_count integer not null default 0,
  cash_boxes_count integer not null default 0,
  items_count integer not null default 0,
  discrepancies_count integer not null default 0,
  status text not null check (status in ('clean', 'discrepancies_found')),
  discrepancies jsonb not null default '[]'::jsonb
);

create index if not exists idx_reconciliation_logs_company_created
  on public.balance_reconciliation_logs(company_id, created_at desc);

alter table public.balance_reconciliation_logs enable row level security;

-- سياسة الأمان: قصر قراءة السجل على المالك فقط داخل شركته
drop policy if exists "owners_can_view_reconciliation_logs" on public.balance_reconciliation_logs;
create policy "owners_can_view_reconciliation_logs"
  on public.balance_reconciliation_logs
  for select
  using (
    company_id = public.current_company_id()
    and public.is_company_owner()
  );

-- إغلاق إمكانية التعديل أو الحذف المباشر لضمان نزاهة التدقيق
revoke all on public.balance_reconciliation_logs from public, anon;
grant select on public.balance_reconciliation_logs to authenticated;

-- 2. دوال داخلية لحساب الأرصدة المتوقعة دون تعديل الجداول (لوضع المحاكاة Simulation)
create or replace function public.calculate_expected_account_balance(p_account_id uuid)
returns numeric(18,4)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw_opening numeric(18,4);
  v_kind text;
  v_adj_amount numeric(18,4);
  v_effective_opening numeric(18,4);
  v_inv_total numeric(18,4);
  v_rec_balance_effect numeric(18,4);
begin
  if p_account_id is null then return 0; end if;
  select coalesce(opening_balance, 0), kind
  into v_raw_opening, v_kind
  from public.accounts where id = p_account_id;
  if not found then return 0; end if;

  select coalesce(sum(amount_delta), 0) into v_adj_amount
  from public.opening_balance_adjustments where account_id = p_account_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  select coalesce(sum(case when kind in ('sale', 'purchase') then total else -total end) filter (where deleted_at is null), 0)
  into v_inv_total
  from public.invoices where account_id = p_account_id;

  select coalesce(sum(case when r.invoice_id is null then
      case when (v_kind = 'customer' and r.direction = 'in') or (v_kind = 'supplier' and r.direction = 'out')
        then r.amount else -r.amount end
    when i.kind in ('sale', 'purchase') then r.amount else -r.amount end)
    filter (where r.deleted_at is null), 0)
  into v_rec_balance_effect
  from public.receipts r
  left join public.invoices i on i.id = r.invoice_id
  where r.account_id = p_account_id;

  return (v_effective_opening + v_inv_total - v_rec_balance_effect)::numeric(18,4);
end;
$$;

revoke all on function public.calculate_expected_account_balance(uuid) from public, anon, authenticated;

create or replace function public.calculate_expected_cash_box_balance(p_cash_box_id uuid)
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
begin
  if p_cash_box_id is null then return 0; end if;
  select coalesce(opening_balance, 0) into v_raw_opening from public.cash_boxes where id = p_cash_box_id;
  if not found then return 0; end if;

  select coalesce(sum(amount_delta), 0) into v_adj_amount
  from public.opening_balance_adjustments where cash_box_id = p_cash_box_id;

  v_effective_opening := (v_raw_opening + v_adj_amount)::numeric(18,4);

  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  into v_rec_amount
  from public.receipts where cash_box_id = p_cash_box_id and deleted_at is null;

  select coalesce(sum(delta), 0) into v_tr_amount
  from (
    select amount as delta from public.cash_box_transfers where destination_cash_box_id = p_cash_box_id and deleted_at is null
    union all
    select -amount as delta from public.cash_box_transfers where source_cash_box_id = p_cash_box_id and deleted_at is null
  ) tr;

  return (v_effective_opening + v_rec_amount + v_tr_amount)::numeric(18,4);
end;
$$;

revoke all on function public.calculate_expected_cash_box_balance(uuid) from public, anon, authenticated;

-- 3. دالة التدقيق والمطابقة الشاملة (حسابات + خزن + مخزون)
create or replace function public.run_comprehensive_reconciliation(
  p_mode text default 'reconcile',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_mode text := lower(coalesce(p_mode, 'reconcile'));

  v_accounts_count integer := 0;
  v_cash_boxes_count integer := 0;
  v_items_count integer := 0;
  v_discrepancies_count integer := 0;

  v_discrepancies jsonb := '[]'::jsonb;
  v_status text;
  v_log_id uuid;
  v_created_at timestamptz := now();

  r record;
  v_rec_bal numeric(18,4);
  v_diff numeric(18,4);
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.is_company_owner() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if v_mode not in ('reconcile', 'simulation') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;

  -- جلب اسم المستخدم القائم بالعملية
  select coalesce(p.full_name, u.email, 'المالك')
  into v_user_name
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = v_user_id;

  -- 1. فحص ومطابقة حسابات العملاء والموردين
  for r in (
    select a.id, a.name, a.kind, a.current_balance, a.opening_balance, a.serial_number
    from public.accounts a
    where a.company_id = v_company_id
    order by a.serial_number
  ) loop
    v_accounts_count := v_accounts_count + 1;

    if v_mode = 'reconcile' then
      v_rec_bal := public.sync_account_balance(r.id);
    else
      v_rec_bal := public.calculate_expected_account_balance(r.id);
    end if;

    if v_rec_bal is distinct from r.current_balance then
      v_diff := (v_rec_bal - r.current_balance)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', case when r.kind = 'customer' then 'عميل' else 'مورد' end,
        'entity_category', 'account',
        'entity_id', r.id,
        'entity_name', r.name,
        'old_balance', r.current_balance,
        'reconciled_balance', v_rec_bal,
        'discrepancy', v_diff
      );
    end if;
  end loop;

  -- 2. فحص ومطابقة الخزن النقدية
  for r in (
    select b.id, b.name, b.current_balance, b.opening_balance, b.serial_number
    from public.cash_boxes b
    where b.company_id = v_company_id
    order by b.serial_number
  ) loop
    v_cash_boxes_count := v_cash_boxes_count + 1;

    if v_mode = 'reconcile' then
      v_rec_bal := public.sync_cash_box_balance(r.id);
    else
      v_rec_bal := public.calculate_expected_cash_box_balance(r.id);
    end if;

    if v_rec_bal is distinct from r.current_balance then
      v_diff := (v_rec_bal - r.current_balance)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'خزينة',
        'entity_category', 'cash_box',
        'entity_id', r.id,
        'entity_name', r.name,
        'old_balance', r.current_balance,
        'reconciled_balance', v_rec_bal,
        'discrepancy', v_diff
      );
    end if;
  end loop;

  -- 3. فحص ومطابقة كميات المخزون للأصناف والمخازن
  for r in (
    select
      ti.item_id,
      ti.warehouse_id,
      i.name as item_name,
      i.code as item_code,
      i.unit,
      w.name as warehouse_name,
      coalesce(s.qty, 0) as current_qty,
      coalesce(s.avg_cost, 0) as current_cost,
      round(
        coalesce(o.opening_qty, 0) +
        coalesce((
          select sum(case
            when inv.kind in ('purchase', 'sale_return') then ii.qty
            when inv.kind in ('sale', 'purchase_return', 'waste') then -ii.qty
            else 0
          end)
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.deleted_at is null
        ), 0) +
        coalesce((
          select sum(case
            when t.destination_warehouse_id = ti.warehouse_id then tri.qty
            when t.source_warehouse_id = ti.warehouse_id then -tri.qty
            else 0
          end)
          from public.warehouse_transfers t
          join public.warehouse_transfer_items tri on tri.company_id = t.company_id and tri.transfer_id = t.id
          where t.company_id = ti.company_id
            and ti.warehouse_id in (t.source_warehouse_id, t.destination_warehouse_id)
            and tri.item_id = ti.item_id
            and t.deleted_at is null
        ), 0) +
        coalesce((
          select sum(adj.quantity_delta)
          from public.stock_opening_adjustments adj
          where adj.company_id = ti.company_id
            and adj.warehouse_id = ti.warehouse_id
            and adj.item_id = ti.item_id
        ), 0)
      , 4)::numeric(18,4) as reconciled_qty,
      coalesce(
        s.avg_cost,
        o.unit_cost,
        (
          select ii.unit_cost
          from public.invoices inv
          join public.invoice_items ii on ii.company_id = inv.company_id and ii.invoice_id = inv.id
          where inv.company_id = ti.company_id
            and inv.warehouse_id = ti.warehouse_id
            and ii.item_id = ti.item_id
            and inv.kind = 'purchase'
            and inv.deleted_at is null
          order by inv.invoice_date desc, inv.created_at desc
          limit 1
        ),
        0
      )::numeric(18,4) as effective_cost
    from (
      select it.company_id, it.id as item_id, wh.id as warehouse_id
      from public.items it
      cross join public.warehouses wh
      where it.company_id = v_company_id
        and wh.company_id = v_company_id
        and it.is_active
        and wh.is_active
    ) ti
    join public.items i on i.id = ti.item_id
    join public.warehouses w on w.id = ti.warehouse_id
    left join public.stock_opening_balances o
      on o.company_id = ti.company_id and o.warehouse_id = ti.warehouse_id and o.item_id = ti.item_id
    left join public.item_stock s
      on s.company_id = ti.company_id and s.warehouse_id = ti.warehouse_id and s.item_id = ti.item_id
    order by w.serial_number, i.serial_number
  ) loop
    v_items_count := v_items_count + 1;

    if r.reconciled_qty is distinct from r.current_qty then
      v_diff := (r.reconciled_qty - r.current_qty)::numeric(18,4);
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'entity_type', 'مخزون صنف',
        'entity_category', 'stock',
        'entity_id', r.item_id,
        'warehouse_id', r.warehouse_id,
        'entity_name', r.item_name || ' (' || r.warehouse_name || ')',
        'unit', r.unit,
        'old_balance', r.current_qty,
        'reconciled_balance', r.reconciled_qty,
        'discrepancy', v_diff
      );

      if v_mode = 'reconcile' then
        insert into public.item_stock (company_id, warehouse_id, item_id, qty, avg_cost, updated_at)
        values (v_company_id, r.warehouse_id, r.item_id, r.reconciled_qty, r.effective_cost, now())
        on conflict (warehouse_id, item_id)
        do update set
          qty = excluded.qty,
          avg_cost = case when public.item_stock.avg_cost > 0 then public.item_stock.avg_cost else excluded.avg_cost end,
          updated_at = now();
      end if;
    end if;
  end loop;

  -- 4. تحديد حالة الفحص
  if v_discrepancies_count = 0 then
    v_status := 'clean';
  else
    v_status := 'discrepancies_found';
  end if;

  -- 5. إدراج العملية في السجل
  insert into public.balance_reconciliation_logs (
    company_id,
    performed_by,
    performed_by_name,
    created_at,
    mode,
    notes,
    accounts_count,
    cash_boxes_count,
    items_count,
    discrepancies_count,
    status,
    discrepancies
  ) values (
    v_company_id,
    v_user_id,
    v_user_name,
    v_created_at,
    v_mode,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_accounts_count,
    v_cash_boxes_count,
    v_items_count,
    v_discrepancies_count,
    v_status,
    v_discrepancies
  )
  returning id into v_log_id;

  -- 6. إرجاع النتيجة
  return jsonb_build_object(
    'log_id', v_log_id,
    'created_at', v_created_at,
    'performed_by_name', v_user_name,
    'mode', v_mode,
    'notes', p_notes,
    'accounts_count', v_accounts_count,
    'cash_boxes_count', v_cash_boxes_count,
    'items_count', v_items_count,
    'discrepancies_count', v_discrepancies_count,
    'status', v_status,
    'discrepancies', v_discrepancies
  );
end;
$$;

revoke all on function public.run_comprehensive_reconciliation(text, text) from public, anon;
grant execute on function public.run_comprehensive_reconciliation(text, text) to authenticated;

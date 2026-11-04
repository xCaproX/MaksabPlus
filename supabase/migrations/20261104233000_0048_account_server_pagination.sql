-- =====================================================================
-- 0048_account_server_pagination.sql
-- فهارس تصفح الحسابات والعملاء والموردين بالصفحات (Server-Side Pagination)
-- ودوال تجميعية لحساب مؤشرات الأداء والأرصدة على السيرفر مباشرة
-- =====================================================================

-- 1. فهارس تصفح وترتيب الحسابات غير النظامية (system_key is null)
create index if not exists accounts_paged_name_idx
  on public.accounts (company_id, kind, name)
  where (system_key is null);

create index if not exists accounts_paged_serial_idx
  on public.accounts (company_id, kind, serial_number desc)
  where (system_key is null);

create index if not exists accounts_paged_balance_idx
  on public.accounts (company_id, kind, current_balance desc)
  where (system_key is null);

-- 2. دالة حساب مؤشرات أرصدة الحسابات (Balances Tab)
create or replace function public.get_account_balances_kpis(
  p_kind text,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_res jsonb;
  v_search text := trim(coalesce(p_search, ''));
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'net_balance', coalesce(sum(a.current_balance), 0)::numeric(18,4),
    'total_debit', coalesce(sum(case when a.current_balance > 0 then a.current_balance else 0 end), 0)::numeric(18,4),
    'total_credit', coalesce(sum(case when a.current_balance < 0 then abs(a.current_balance) else 0 end), 0)::numeric(18,4),
    'positive_count', count(*) filter (where a.current_balance > 0),
    'count', count(*)
  )
  into v_res
  from public.accounts a
  where a.company_id = v_company_id
    and a.kind = p_kind
    and a.system_key is null
    and (
      v_search = ''
      or a.name ilike '%' || v_search || '%'
      or a.phone ilike '%' || v_search || '%'
      or a.serial_number::text ilike '%' || v_search || '%'
      or a.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'net_balance', 0,
    'total_debit', 0,
    'total_credit', 0,
    'positive_count', 0,
    'count', 0
  ));
end;
$$;

revoke all on function public.get_account_balances_kpis(text, text) from public, anon;
grant execute on function public.get_account_balances_kpis(text, text) to authenticated;

-- 3. دالة حساب مؤشرات إدارة الحسابات (Master Data Accounts Tab)
create or replace function public.get_master_accounts_kpis(
  p_kind text,
  p_search text default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_res jsonb;
  v_search text := trim(coalesce(p_search, ''));
begin
  if v_company_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'total_count', count(*),
    'active_count', count(*) filter (where a.is_active is true),
    'inactive_count', count(*) filter (where a.is_active is false),
    'with_opening_count', count(*) filter (where coalesce(a.effective_opening_balance, a.opening_balance, 0) <> 0)
  )
  into v_res
  from public.accounts a
  where a.company_id = v_company_id
    and a.kind = p_kind
    and a.system_key is null
    and (
      p_status = 'all' or p_status is null or p_status = ''
      or (p_status = 'active' and a.is_active is true)
      or (p_status = 'inactive' and a.is_active is false)
    )
    and (
      v_search = ''
      or a.name ilike '%' || v_search || '%'
      or a.phone ilike '%' || v_search || '%'
      or a.serial_number::text ilike '%' || v_search || '%'
      or a.notes ilike '%' || v_search || '%'
    );

  return coalesce(v_res, jsonb_build_object(
    'total_count', 0,
    'active_count', 0,
    'inactive_count', 0,
    'with_opening_count', 0
  ));
end;
$$;

revoke all on function public.get_master_accounts_kpis(text, text, text) from public, anon;
grant execute on function public.get_master_accounts_kpis(text, text, text) to authenticated;

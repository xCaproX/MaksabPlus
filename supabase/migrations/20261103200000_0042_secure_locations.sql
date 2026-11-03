-- =====================================================================
-- 0042_secure_locations.sql
-- تأمين إنشاء وتعديل المخازن والخزن عبر دوال RPC تستخرج company_id تلقائياً
-- ومنع إرسال company_id أو إجراء تحديثات مباشرة من جانب العميل
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. إنشاء مخزن جديد
-- ---------------------------------------------------------------------
create or replace function public.create_warehouse(
  p_name text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'warehouse_name_required' using errcode = '22023';
  end if;

  insert into public.warehouses (company_id, name, notes)
  values (v_company, btrim(p_name), nullif(btrim(p_notes), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_warehouse(text, text) from public, anon;
grant execute on function public.create_warehouse(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. تعديل مخزن
-- ---------------------------------------------------------------------
create or replace function public.update_warehouse(
  p_warehouse_id uuid,
  p_name text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'warehouse_name_required' using errcode = '22023';
  end if;

  update public.warehouses
  set name = btrim(p_name),
      notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_warehouse_id
    and company_id = v_company;

  if not found then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.update_warehouse(uuid, text, text) from public, anon;
grant execute on function public.update_warehouse(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. تفعيل / إيقاف مخزن
-- ---------------------------------------------------------------------
create or replace function public.toggle_warehouse_active(
  p_warehouse_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_next_state boolean;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.warehouses
  set is_active = not is_active,
      updated_at = now()
  where id = p_warehouse_id
    and company_id = v_company
  returning is_active into v_next_state;

  if not found then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;

  return v_next_state;
end;
$$;

revoke all on function public.toggle_warehouse_active(uuid) from public, anon;
grant execute on function public.toggle_warehouse_active(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. تعديل خزنة
-- ---------------------------------------------------------------------
create or replace function public.update_cash_box(
  p_cash_box_id uuid,
  p_name text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'cash_box_name_required' using errcode = '22023';
  end if;

  update public.cash_boxes
  set name = btrim(p_name),
      notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_cash_box_id
    and company_id = v_company;

  if not found then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.update_cash_box(uuid, text, text) from public, anon;
grant execute on function public.update_cash_box(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. تفعيل / إيقاف خزنة
-- ---------------------------------------------------------------------
create or replace function public.toggle_cash_box_active(
  p_cash_box_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_is_primary boolean;
  v_current_active boolean;
  v_next_state boolean;
begin
  if v_company is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select is_primary, is_active into v_is_primary, v_current_active
  from public.cash_boxes
  where id = p_cash_box_id
    and company_id = v_company;

  if not found then
    raise exception 'cash_box_not_found' using errcode = '22023';
  end if;

  if v_is_primary and v_current_active then
    raise exception 'primary_location_protected' using errcode = '23514';
  end if;

  update public.cash_boxes
  set is_active = not is_active,
      updated_at = now()
  where id = p_cash_box_id
    and company_id = v_company
  returning is_active into v_next_state;

  return v_next_state;
end;
$$;

revoke all on function public.toggle_cash_box_active(uuid) from public, anon;
grant execute on function public.toggle_cash_box_active(uuid) to authenticated;

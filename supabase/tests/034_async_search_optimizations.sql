begin;

-- التحقق من وجود الفهرس الجديد
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'accounts_search_active_idx'
  ) then
    raise exception 'Missing expected index: accounts_search_active_idx';
  end if;
end;
$$;

-- التحقق من وجود أعمدة sale_price و purchase_price في v_stock_opening_balances
do $$
declare
  v_rec record;
begin
  select sale_price, purchase_price
  into v_rec
  from public.v_stock_opening_balances
  limit 1;
end;
$$;

rollback;

begin;

-- التحقق من وجود وسلامة الفهارس الجديدة
do $$
declare
  v_idx text;
  v_expected text[] := array[
    'invoices_account_active_idx',
    'receipts_account_active_idx',
    'receipts_cash_box_active_idx',
    'cash_box_transfers_source_active_idx',
    'cash_box_transfers_dest_active_idx',
    'warehouse_transfers_source_active_idx',
    'warehouse_transfers_dest_active_idx'
  ];
begin
  foreach v_idx in array v_expected loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = v_idx
    ) then
      raise exception 'Missing expected performance index: %', v_idx;
    end if;
  end loop;

  -- فحص سلامة استعلامات الـ Views بعد الفهارس
  perform * from public.v_account_balances limit 1;
  perform * from public.v_cash_box_balances limit 1;
  perform * from public.v_warehouse_transfer_list limit 1;
  perform * from public.v_cash_box_transfer_list limit 1;
end;
$$;

rollback;

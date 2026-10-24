-- Prevent adding the same item more than once to a single invoice.
create or replace function public.prevent_duplicate_invoice_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Serialize edits to the same invoice so two concurrent RPC calls cannot
  -- both pass the duplicate check at the same time.
  perform 1
  from public.invoices
  where id = new.invoice_id
  for update;

  if exists (
    select 1
    from public.invoice_items existing
    where existing.invoice_id = new.invoice_id
      and existing.item_id = new.item_id
      and existing.id <> new.id
  ) then
    raise exception 'invoice_item_duplicate' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger invoice_items_prevent_duplicate
before insert or update of invoice_id, item_id on public.invoice_items
for each row execute function public.prevent_duplicate_invoice_item();

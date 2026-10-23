-- =====================================================================
-- 0005_edit_guards.sql
-- حماية تعديل البيانات: منع تغيير نوع الحساب بعد وجود فواتير أو إيصالات،
-- لأن نوع الحساب هو ما يحدد اتجاه حركة الخزنة وتصنيف الفواتير.
-- =====================================================================

create or replace function public.accounts_guard_kind()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind then
    if exists (select 1 from public.invoices where account_id = old.id)
       or exists (select 1 from public.receipts where account_id = old.id) then
      raise exception 'account_has_documents' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_guard_kind on public.accounts;

create trigger accounts_guard_kind
before update on public.accounts
for each row execute function public.accounts_guard_kind();

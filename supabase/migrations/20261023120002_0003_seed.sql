-- =====================================================================
-- 0003_seed.sql
-- بيانات البداية: شركة واحدة + مخزن رئيسي + خزنة رئيسية
-- (المستخدم يُربط بالشركة عبر supabase/bootstrap_profile.sql بعد
--  إنشائه من Supabase Dashboard > Authentication > Users)
-- =====================================================================

insert into public.companies (id, name, currency)
values ('00000000-0000-4000-8000-000000000001', 'الشركة الرئيسية', 'EGP')
on conflict (id) do nothing;

insert into public.warehouses (id, company_id, name)
values (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  'المخزن الرئيسي'
)
on conflict (id) do nothing;

insert into public.cash_boxes (id, company_id, name)
values (
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-000000000001',
  'الخزنة الرئيسية'
)
on conflict (id) do nothing;

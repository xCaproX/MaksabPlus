-- =====================================================================
-- bootstrap_profile.sql
-- شغّل هذا الملف مرة واحدة بعد إنشاء المستخدم من
-- Supabase Dashboard > Authentication > Users > Add user
--
-- 1) غيّر الإيميل في السطر التالي لإيميل المستخدم الذي أنشأته.
-- 2) شغّل الملف كامل من SQL Editor.
-- =====================================================================

insert into public.profiles (id, company_id, full_name)
select u.id,
       '00000000-0000-4000-8000-000000000001'::uuid,
       coalesce(u.email, 'مدير النظام')
from auth.users u
where u.email = 'admin@example.com'   -- <-- غيّر الإيميل هنا
on conflict (id) do update
  set company_id = excluded.company_id,
      full_name  = excluded.full_name;

import { supabase } from './supabase';

/** الشركة المرتبطة بالمستخدم الحالي (RLS يسمح بقراءة صفّه فقط). */
export async function getCompanyId(): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .maybeSingle();

  if (error) throw error;
  const companyId = (data as { company_id?: string } | null)?.company_id;
  if (!companyId) {
    throw new Error(
      'المستخدم غير مرتبط بأي شركة. شغّل ملف supabase/bootstrap_profile.sql من SQL Editor.',
    );
  }
  return companyId;
}

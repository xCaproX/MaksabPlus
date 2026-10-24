import { supabase } from './supabase';

/** الشركة المرتبطة بالمستخدم الحالي؛ تقييد الاستعلام بالهوية مهم للمالكين أيضًا. */
export async function getCompanyId(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');

  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
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

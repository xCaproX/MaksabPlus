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

export interface UserIdentity {
  userId: string;
  userName: string;
  companyName: string;
}

/** جلب هوية المستخدم والشركة الحالية بشكل مركزي وموحد */
export async function getCurrentUserIdentity(): Promise<UserIdentity | null> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const user = sessionRes?.session?.user;
  if (!user) return null;

  const [profileRes, companyRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('companies').select('name').maybeSingle(),
  ]);

  const userName =
    profileRes?.data?.full_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'المستخدم';

  const companyName = companyRes?.data?.name || 'مكسب بلس';

  return {
    userId: user.id,
    userName,
    companyName,
  };
}

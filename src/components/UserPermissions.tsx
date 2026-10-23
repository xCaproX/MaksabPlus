import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';

const groups = [
  { label: 'البضاعة', module: 'goods', actions: [['view', 'عرض'], ['create', 'إضافة'], ['edit', 'تعديل'], ['delete', 'حذف']] },
  { label: 'الفلوس', module: 'money', actions: [['view', 'عرض'], ['create', 'إضافة'], ['edit', 'تعديل'], ['delete', 'حذف']] },
  { label: 'البيانات', module: 'data', actions: [['view', 'عرض'], ['create', 'إضافة'], ['edit', 'تعديل'], ['delete', 'حذف']] },
  { label: 'الأرصدة', module: 'balances', actions: [['view', 'عرض']] },
  { label: 'إدارة الأرصدة الافتتاحية', module: 'management', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
] as const;

type PermissionKey = `${(typeof groups)[number]['module']}.${string}`;
type CompanyUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  permission_keys: PermissionKey[];
};

function allPermissionKeys(): PermissionKey[] {
  return groups.flatMap((group) => group.actions.map(([action]) => `${group.module}.${action}` as PermissionKey));
}

export default function UserPermissions() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<PermissionKey[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function request(action: string, payload: Record<string, unknown> = {}) {
    const { data, error: invokeError } = await supabase.functions.invoke('manage-users', { body: { action, ...payload } });
    if (invokeError) throw new Error(errorMessage(invokeError));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const data = await request('list');
      const loaded = (data.users ?? []) as CompanyUser[];
      setUsers(loaded);
      setDrafts(Object.fromEntries(loaded.map((user) => [user.user_id, user.permission_keys ?? []])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  function toggle(values: PermissionKey[], key: PermissionKey) {
    return values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('invite', { email: email.trim(), full_name: fullName.trim(), permission_keys: invitePermissions });
      setEmail(''); setFullName(''); setInvitePermissions([]);
      setNotice('تم إرسال دعوة تسجيل الدخول للموظف.');
      await loadUsers();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'تعذر إرسال الدعوة');
    } finally { setBusy(false); }
  }

  async function savePermissions(user: CompanyUser) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('permissions', { user_id: user.user_id, permission_keys: drafts[user.user_id] ?? [] });
      setNotice(`تم حفظ صلاحيات ${user.full_name || user.email}.`);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الصلاحيات');
    } finally { setBusy(false); }
  }

  async function toggleActive(user: CompanyUser) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('active', { user_id: user.user_id, is_active: !user.is_active });
      setNotice(user.is_active ? 'تم إيقاف دخول الموظف.' : 'تم تفعيل دخول الموظف.');
      await loadUsers();
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : 'تعذر تغيير حالة المستخدم');
    } finally { setBusy(false); }
  }

  return <div className="stack">
    <div className="card">
      <h2>دعوة موظف</h2>
      <p className="hint">أرسل دعوة إلى بريده، ثم حدد ما يمكنه مشاهدته وتنفيذه داخل البرنامج.</p>
      <form className="stack" onSubmit={invite}>
        <div className="form-grid">
          <label>اسم الموظف<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
          <label>البريد الإلكتروني<input type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        </div>
        <PermissionChooser values={invitePermissions} onChange={setInvitePermissions} toggle={toggle} />
        <div className="actions"><button className="btn primary" disabled={busy} type="submit">{busy ? 'جارٍ الإرسال…' : 'إرسال الدعوة'}</button></div>
      </form>
    </div>

    {error && <p className="alert error">{error}</p>}{notice && <p className="alert success">{notice}</p>}
    <div className="card">
      <h2>مستخدمو الشركة</h2>
      {loading ? <p className="empty">جارٍ التحميل…</p> : users.length === 0 ? <p className="empty">لا يوجد مستخدمون.</p> : users.map((user) => (
        <section className="user-permission-card" key={user.user_id}>
          <div className="page-head"><div><h3>{user.full_name || user.email}</h3><p className="muted" dir="ltr">{user.email}</p></div>
            <span className="badge">{user.is_active ? 'نشط' : 'موقوف'}</span></div>
          <PermissionChooser values={drafts[user.user_id] ?? []} onChange={(values) => setDrafts((current) => ({ ...current, [user.user_id]: values }))} toggle={toggle} />
          <div className="actions">
            <button className="btn primary" type="button" disabled={busy} onClick={() => void savePermissions(user)}>حفظ الصلاحيات</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void toggleActive(user)}>{user.is_active ? 'إيقاف الدخول' : 'تفعيل الدخول'}</button>
          </div>
        </section>
      ))}
    </div>
  </div>;
}

function PermissionChooser({ values, onChange, toggle }: {
  values: PermissionKey[];
  onChange: (values: PermissionKey[]) => void;
  toggle: (values: PermissionKey[], key: PermissionKey) => PermissionKey[];
}) {
  return <div className="permission-groups">
    {groups.map((group) => <fieldset className="permission-group" key={group.module}>
      <legend>{group.label}</legend>
      {group.actions.map(([action, label]) => {
        const key = `${group.module}.${action}` as PermissionKey;
        return <label className="permission-option" key={key}><input type="checkbox" checked={values.includes(key)} onChange={() => onChange(toggle(values, key))} />{label}</label>;
      })}
    </fieldset>)}
    <button className="btn" type="button" onClick={() => onChange(allPermissionKeys())}>تحديد الكل</button>
    <button className="btn" type="button" onClick={() => onChange([])}>إلغاء الكل</button>
  </div>;
}

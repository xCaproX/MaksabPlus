import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import Modal from './Modal';

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
  access_role: 'owner' | 'employee';
  permission_keys: PermissionKey[];
};

type UserFilterStatus = 'all' | 'active' | 'suspended' | 'owner';

function allPermissionKeys(): PermissionKey[] {
  return groups.flatMap((group) => group.actions.map(([action]) => `${group.module}.${action}` as PermissionKey));
}

export default function UserPermissions() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // مساحة العمل: الموظف المحدد والتصفية
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserFilterStatus>('all');

  // نافذة دعوة موظف جديد
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<PermissionKey[]>([]);

  const allKeys = useMemo(() => allPermissionKeys(), []);

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
      setSelectedUserId((current) => {
        if (current && loaded.some((u) => u.user_id === current)) return current;
        return loaded[0]?.user_id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  // تصفية المستخدمين للقائمة الجانبية
  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchQuery =
        !query ||
        (user.full_name?.toLowerCase().includes(query) ?? false) ||
        user.email.toLowerCase().includes(query);
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'owner'
          ? user.access_role === 'owner'
          : statusFilter === 'active'
          ? user.access_role !== 'owner' && user.is_active
          : user.access_role !== 'owner' && !user.is_active;
      return matchQuery && matchStatus;
    });
  }, [users, searchTerm, statusFilter]);

  // ضمان تحديد أول موظف يطابق التصفية إذا لم يكن هناك تحديد
  useEffect(() => {
    if (filteredUsers.length > 0 && (!selectedUserId || !filteredUsers.some((u) => u.user_id === selectedUserId))) {
      setSelectedUserId(filteredUsers[0].user_id);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;
  const currentDraftKeys = selectedUser
    ? drafts[selectedUser.user_id] ?? selectedUser.permission_keys ?? []
    : [];

  function togglePermission(key: PermissionKey) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const exists = currentDraftKeys.includes(key);
    const updated = exists ? currentDraftKeys.filter((k) => k !== key) : [...currentDraftKeys, key];
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: updated }));
  }

  function toggleGroup(moduleKeys: PermissionKey[]) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const allChecked = moduleKeys.every((k) => currentDraftKeys.includes(k));
    const updated = allChecked
      ? currentDraftKeys.filter((k) => !moduleKeys.includes(k))
      : [...currentDraftKeys, ...moduleKeys.filter((k) => !currentDraftKeys.includes(k))];
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: updated }));
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('invite', {
        email: inviteEmail.trim(),
        full_name: inviteFullName.trim(),
        permission_keys: invitePermissions,
      });
      setInviteEmail('');
      setInviteFullName('');
      setInvitePermissions([]);
      setIsInviteOpen(false);
      setNotice('تم إرسال دعوة تسجيل الدخول للموظف بنجاح.');
      await loadUsers();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'تعذر إرسال الدعوة');
    } finally {
      setBusy(false);
    }
  }

  async function savePermissions(user: CompanyUser) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const keysToSave = drafts[user.user_id] ?? [];
      await request('permissions', { user_id: user.user_id, permission_keys: keysToSave });
      setNotice(`تم حفظ صلاحيات «${user.full_name || user.email}» بنجاح.`);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الصلاحيات');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: CompanyUser) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('active', { user_id: user.user_id, is_active: !user.is_active });
      setNotice(
        user.is_active
          ? `تم إيقاف دخول ${user.full_name || user.email}.`
          : `تم تفعيل دخول ${user.full_name || user.email}.`,
      );
      await loadUsers();
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : 'تعذر تغيير حالة المستخدم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      {loading ? (
        <div className="card empty">جارٍ تحميل المستخدمين والصلاحيات…</div>
      ) : (
        <div className="erp-users-workspace">
          {/* الجانب الأيمن (Master List): قائمة الموظفين مدمجة وأنيقة (320px) */}
          <aside className="users-sidebar-panel" aria-label="قائمة الموظفين">
            <div className="users-sidebar-head">
              <div className="head-row">
                <strong>المستخدمون ({filteredUsers.length})</strong>
                <button
                  type="button"
                  className="btn primary compact"
                  onClick={() => setIsInviteOpen(true)}
                >
                  + دعوة موظف
                </button>
              </div>

              <div className="users-sidebar-filters">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="بحث بالاسم أو البريد…"
                />
                <select
                  aria-label="تصفية الموظفين"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as UserFilterStatus)}
                >
                  <option value="all">كل المستخدمين</option>
                  <option value="active">النشطون فقط</option>
                  <option value="suspended">الموقوفون فقط</option>
                  <option value="owner">مديرو المنشأة</option>
                </select>
              </div>
            </div>

            <div className="users-list-scroll">
              {filteredUsers.length === 0 && (
                <p className="empty" style={{ padding: '16px', fontSize: '12px' }}>
                  لا يوجد مستخدمون يطابقون البحث.
                </p>
              )}
              {filteredUsers.map((user) => {
                const isSelected = selectedUserId === user.user_id;
                const isOwner = user.access_role === 'owner';
                const userKeys = drafts[user.user_id] ?? user.permission_keys ?? [];
                return (
                  <button
                    key={user.user_id}
                    type="button"
                    className={`user-item-card ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedUserId(user.user_id)}
                  >
                    <div className="card-top">
                      <span className="user-name">{user.full_name || 'بدون اسم'}</span>
                      {isOwner ? (
                        <span className="badge info">مدير المنشأة</span>
                      ) : (
                        <span className="badge">موظف</span>
                      )}
                    </div>
                    <span className="user-email">{user.email}</span>
                    <div className="card-bottom">
                      {isOwner || user.is_active ? (
                        <span className="badge ok">نشط</span>
                      ) : (
                        <span className="badge danger">موقوف</span>
                      )}
                      <span className="muted">
                        {isOwner ? 'كامل الصلاحيات' : `${userKeys.length} من ${allKeys.length} صلاحية`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* الجانب الأيسر (Detail Workspace): المساحة الواسعة لإدارة الصلاحيات (70%+) */}
          <main className="permissions-main-panel" aria-label="مساحة إدارة الصلاحيات">
            {selectedUser ? (
              <>
                <div className="permissions-main-head">
                  <div className="user-details">
                    <h2>{selectedUser.full_name || selectedUser.email}</h2>
                    <div className="user-meta">
                      <span dir="ltr">{selectedUser.email}</span>
                      <span>•</span>
                      {selectedUser.access_role === 'owner' ? (
                        <span className="badge info">مدير المنشأة (مالك)</span>
                      ) : (
                        <span className="badge">موظف</span>
                      )}
                      <span>•</span>
                      {selectedUser.access_role === 'owner' ? (
                        <span className="badge ok">نشط دائمًا</span>
                      ) : selectedUser.is_active ? (
                        <span className="badge ok">الحساب نشط</span>
                      ) : (
                        <span className="badge danger">الحساب موقوف</span>
                      )}
                    </div>
                  </div>

                  {selectedUser.access_role === 'employee' && (
                    <div className="head-actions">
                      <button
                        type="button"
                        className={selectedUser.is_active ? 'btn' : 'btn primary'}
                        disabled={busy}
                        onClick={() => void toggleActive(selectedUser)}
                      >
                        {selectedUser.is_active ? 'إيقاف الدخول' : 'تفعيل الدخول'}
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void savePermissions(selectedUser)}
                      >
                        {busy ? 'جارٍ الحفظ…' : 'حفظ الصلاحيات'}
                      </button>
                    </div>
                  )}
                </div>

                {selectedUser.access_role === 'owner' ? (
                  <div style={{ padding: '24px' }}>
                    <div className="alert success" style={{ marginBottom: '20px' }}>
                      <strong>مدير المنشأة:</strong> يمتلك كافة صلاحيات النظام تلقائيًا بحكم دوره المالي والإداري، ولا يحتاج لتحديد أو تعديل.
                    </div>
                    <div className="permissions-cards-grid" style={{ padding: 0 }}>
                      {groups.map((group) => (
                        <div className="permission-card" key={group.module}>
                          <div className="permission-card-head">
                            <strong>قسم {group.label}</strong>
                            <span className="badge ok">مفعل بالكامل</span>
                          </div>
                          <div className="permission-card-body">
                            {group.actions.map(([action, label]) => (
                              <label className="permission-card-item" key={action} style={{ opacity: 0.85 }}>
                                <input type="checkbox" checked disabled />
                                <span>صلاحية {label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="permissions-bulk-bar">
                      <span className="summary-text">
                        الصلاحيات الممنوحة حالياً: {currentDraftKeys.length} من أصل {allKeys.length}
                      </span>
                      <div className="bulk-buttons">
                        <button
                          type="button"
                          className="btn compact"
                          disabled={busy}
                          onClick={() =>
                            setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: allKeys }))
                          }
                        >
                          تحديد كامل الصلاحيات
                        </button>
                        <button
                          type="button"
                          className="btn compact"
                          disabled={busy}
                          onClick={() =>
                            setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: [] }))
                          }
                        >
                          إلغاء تحديد الكل
                        </button>
                      </div>
                    </div>

                    <div className="permissions-cards-grid">
                      {groups.map((group) => {
                        const moduleKeys = group.actions.map(
                          ([action]) => `${group.module}.${action}` as PermissionKey,
                        );
                        const allGroupChecked = moduleKeys.every((key) =>
                          currentDraftKeys.includes(key),
                        );
                        const groupSelectedCount = moduleKeys.filter((key) =>
                          currentDraftKeys.includes(key),
                        ).length;

                        return (
                          <div className="permission-card" key={group.module}>
                            <div className="permission-card-head">
                              <strong>
                                قسم {group.label}{' '}
                                <span className="muted" style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                  ({groupSelectedCount}/{moduleKeys.length})
                                </span>
                              </strong>
                              <button
                                type="button"
                                className="btn compact"
                                style={{ fontSize: '11px', minHeight: '22px', padding: '1px 8px' }}
                                disabled={busy}
                                onClick={() => toggleGroup(moduleKeys)}
                              >
                                {allGroupChecked ? 'إلغاء القسم' : 'تحديد القسم'}
                              </button>
                            </div>
                            <div className="permission-card-body">
                              {group.actions.map(([action, label]) => {
                                const key = `${group.module}.${action}` as PermissionKey;
                                const isChecked = currentDraftKeys.includes(key);
                                return (
                                  <label className="permission-card-item" key={key}>
                                    <input
                                      type="checkbox"
                                      disabled={busy}
                                      checked={isChecked}
                                      onChange={() => togglePermission(key)}
                                    />
                                    <span>صلاحية {label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="erp-detail-empty" style={{ minHeight: '350px' }}>
                <strong>اختر موظفًا من القائمة</strong>
                <span>اضغط على أي موظف من القائمة الجانبية لإدارة وتعديل صلاحياته بكل سهولة.</span>
              </div>
            )}
          </main>
        </div>
      )}

      {/* نافذة دعوة موظف جديد */}
      {isInviteOpen && (
        <Modal title="دعوة موظف جديد" onClose={() => setIsInviteOpen(false)}>
          <form className="stack invoice-form" onSubmit={invite}>
            <p className="hint">
              أدخل بيانات الموظف لتصله دعوة تسجيل الدخول عبر البريد الإلكتروني مع الصلاحيات المحددة له.
            </p>

            <div className="form-grid">
              <label>
                اسم الموظف
                <input
                  value={inviteFullName}
                  onChange={(event) => setInviteFullName(event.target.value)}
                  placeholder="مثال: أحمد محمد"
                  required
                />
              </label>

              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  dir="ltr"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="employee@example.com"
                  required
                />
              </label>
            </div>

            <div className="permissions-bulk-bar" style={{ marginTop: '8px', padding: '8px 4px' }}>
              <span className="summary-text" style={{ fontSize: '12px' }}>
                الصلاحيات المبدئية ({invitePermissions.length} من {allKeys.length})
              </span>
              <div className="bulk-buttons">
                <button
                  type="button"
                  className="btn compact"
                  onClick={() => setInvitePermissions(allKeys)}
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  className="btn compact"
                  onClick={() => setInvitePermissions([])}
                >
                  إلغاء الكل
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '6px' }}>
              <div className="permissions-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', padding: '4px', gap: '10px' }}>
                {groups.map((group) => {
                  const moduleKeys = group.actions.map(
                    ([action]) => `${group.module}.${action}` as PermissionKey,
                  );
                  const allGroupChecked = moduleKeys.every((key) =>
                    invitePermissions.includes(key),
                  );
                  function toggleInviteGroup() {
                    if (allGroupChecked) {
                      setInvitePermissions((prev) => prev.filter((k) => !moduleKeys.includes(k)));
                    } else {
                      setInvitePermissions((prev) => [
                        ...prev,
                        ...moduleKeys.filter((k) => !prev.includes(k)),
                      ]);
                    }
                  }
                  return (
                    <div className="permission-card" key={group.module}>
                      <div className="permission-card-head" style={{ padding: '6px 10px' }}>
                        <strong style={{ fontSize: '12px' }}>{group.label}</strong>
                        <button
                          type="button"
                          className="btn compact"
                          style={{ fontSize: '10px', minHeight: '19px', padding: '1px 6px' }}
                          onClick={toggleInviteGroup}
                        >
                          {allGroupChecked ? 'إلغاء' : 'تحديد'}
                        </button>
                      </div>
                      <div className="permission-card-body" style={{ padding: '8px 10px' }}>
                        {group.actions.map(([action, label]) => {
                          const key = `${group.module}.${action}` as PermissionKey;
                          const isChecked = invitePermissions.includes(key);
                          function toggleInviteKey() {
                            setInvitePermissions((prev) =>
                              isChecked ? prev.filter((k) => k !== key) : [...prev, key],
                            );
                          }
                          return (
                            <label className="permission-card-item" key={key} style={{ fontSize: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={toggleInviteKey}
                              />
                              <span>{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="actions" style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setIsInviteOpen(false)}
                disabled={busy}
              >
                إلغاء
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'جارٍ إرسال الدعوة…' : 'إرسال الدعوة'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

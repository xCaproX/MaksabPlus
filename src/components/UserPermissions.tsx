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
const PAGE_SIZE = 20;

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

  // مساحة العمل: التحديد والتصفية والصفحات
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserFilterStatus>('all');
  const [page, setPage] = useState(1);

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

  // تصفية المستخدمين
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

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;
  const currentDraftKeys = selectedUser
    ? drafts[selectedUser.user_id] ?? selectedUser.permission_keys ?? []
    : [];

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
      setNotice(`تم حفظ صلاحيات ${user.full_name || user.email} بنجاح.`);
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
        <div className="erp-sales-workspace">
          {/* الشق الأيمن: شريط الأدوات وجدول المستخدمين */}
          <section className="erp-list-panel" aria-label="قائمة المستخدمين">
            <div className="erp-toolbar">
              <div className="erp-toolbar-title">
                <strong>المستخدمون والصلاحيات</strong>
                <span>{filteredUsers.length} مستخدم</span>
              </div>

              <div className="erp-filters">
                <button
                  type="button"
                  className="btn primary compact erp-create-btn"
                  onClick={() => setIsInviteOpen(true)}
                >
                  + دعوة موظف جديد
                </button>

                <label className="erp-search">
                  <span className="sr-only">البحث</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="بحث بالاسم أو البريد…"
                  />
                </label>

                <select
                  aria-label="تصفية حسب الحالة"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as UserFilterStatus)}
                >
                  <option value="all">كل المستخدمين</option>
                  <option value="active">الموظفون النشطون</option>
                  <option value="suspended">الموظفون الموقوفون</option>
                  <option value="owner">مديرو المنشأة</option>
                </select>
              </div>
            </div>

            <div className="erp-table-wrap">
              <table className="table erp-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>الدور</th>
                    <th>الحالة</th>
                    <th className="num">الصلاحيات الممنوحة</th>
                    <th aria-label="الإجراءات السريعة" />
                  </tr>
                </thead>
                <tbody>
                  {pageUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        لا يوجد مستخدمون يطابقون خيارات البحث.
                      </td>
                    </tr>
                  )}
                  {pageUsers.map((user) => {
                    const isSelected = selectedUserId === user.user_id;
                    const isOwner = user.access_role === 'owner';
                    const userKeys = drafts[user.user_id] ?? user.permission_keys ?? [];
                    return (
                      <tr
                        key={user.user_id}
                        className={isSelected ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setSelectedUserId(user.user_id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedUserId(user.user_id);
                          }
                        }}
                      >
                        <td>
                          <div className="strong">{user.full_name || 'بدون اسم'}</div>
                          <div className="muted" dir="ltr" style={{ fontSize: '11px' }}>
                            {user.email}
                          </div>
                        </td>
                        <td>
                          {isOwner ? (
                            <span className="badge info">مدير المنشأة</span>
                          ) : (
                            <span className="badge">موظف</span>
                          )}
                        </td>
                        <td>
                          {isOwner || user.is_active ? (
                            <span className="badge ok">نشط</span>
                          ) : (
                            <span className="badge danger">موقوف</span>
                          )}
                        </td>
                        <td className="num">
                          {isOwner ? (
                            <span className="strong">كامل الصلاحيات</span>
                          ) : (
                            <span className="num">
                              {userKeys.length} من {allKeys.length}
                            </span>
                          )}
                        </td>
                        <td className="row-actions erp-row-actions" onClick={(e) => e.stopPropagation()}>
                          {!isOwner && (
                            <button
                              type="button"
                              className="btn compact"
                              disabled={busy}
                              onClick={() => void toggleActive(user)}
                            >
                              {user.is_active ? 'إيقاف' : 'تفعيل'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="erp-pagination">
              <span>
                عرض {filteredUsers.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
                {Math.min(page * PAGE_SIZE, filteredUsers.length)} من {filteredUsers.length}
              </span>
              <div>
                <button
                  type="button"
                  className="btn compact"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  السابق
                </button>
                <span>
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  className="btn compact"
                  disabled={page === pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </button>
              </div>
            </div>
          </section>

          {/* الشق الأيسر: اللوحة الجانبية لتعديل الصلاحيات */}
          <aside
            className={selectedUser ? 'erp-detail-panel open' : 'erp-detail-panel'}
            aria-label="تفاصيل صلاحيات المستخدم"
          >
            {selectedUser ? (
              <>
                <div className="erp-detail-head">
                  <div>
                    <span>{selectedUser.access_role === 'owner' ? 'مدير المنشأة' : 'صلاحيات الموظف'}</span>
                    <h2>{selectedUser.full_name || selectedUser.email}</h2>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="إغلاق التفاصيل"
                    onClick={() => setSelectedUserId(null)}
                  >
                    ×
                  </button>
                </div>

                <dl className="erp-detail-summary">
                  <div>
                    <dt>البريد الإلكتروني</dt>
                    <dd dir="ltr">{selectedUser.email}</dd>
                  </div>
                  <div>
                    <dt>الدور</dt>
                    <dd>{selectedUser.access_role === 'owner' ? 'مدير المنشأة' : 'موظف'}</dd>
                  </div>
                  <div>
                    <dt>حالة الحساب</dt>
                    <dd>
                      {selectedUser.access_role === 'owner' ? (
                        <span className="badge ok">نشط دائمًا</span>
                      ) : selectedUser.is_active ? (
                        <span className="badge ok">نشط</span>
                      ) : (
                        <span className="badge danger">موقوف</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>الصلاحيات المفعلة</dt>
                    <dd className="num">
                      {selectedUser.access_role === 'owner'
                        ? 'كاملة (15)'
                        : `${currentDraftKeys.length} من ${allKeys.length}`}
                    </dd>
                  </div>
                </dl>

                <div className="erp-detail-lines">
                  {selectedUser.access_role === 'owner' ? (
                    <div className="card empty">
                      <p className="hint">
                        مدير المنشأة يمتلك كافة الصلاحيات تلقائيًا بحكم دوره، ولا يحتاج إلى تحديدها أو تعديلها.
                      </p>
                      <div style={{ marginTop: '12px' }}>
                        <PermissionChooser values={allKeys} onChange={() => undefined} disabled />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="permission-toolbar-helpers">
                        <span className="muted" style={{ fontSize: '12px' }}>
                          المحدد حالياً ({currentDraftKeys.length} من {allKeys.length})
                        </span>
                        <div>
                          <button
                            type="button"
                            className="btn compact"
                            disabled={busy}
                            onClick={() =>
                              setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: allKeys }))
                            }
                          >
                            تحديد الكل
                          </button>
                          <button
                            type="button"
                            className="btn compact"
                            disabled={busy}
                            onClick={() =>
                              setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: [] }))
                            }
                          >
                            إلغاء الكل
                          </button>
                        </div>
                      </div>

                      <PermissionChooser
                        values={currentDraftKeys}
                        onChange={(keys) =>
                          setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: keys }))
                        }
                        disabled={busy}
                      />
                    </>
                  )}
                </div>

                {selectedUser.access_role === 'employee' && (
                  <div className="erp-detail-actions">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => void savePermissions(selectedUser)}
                    >
                      {busy ? 'جارٍ الحفظ…' : 'حفظ الصلاحيات'}
                    </button>
                    <button
                      type="button"
                      className={selectedUser.is_active ? 'btn' : 'btn primary'}
                      disabled={busy}
                      onClick={() => void toggleActive(selectedUser)}
                    >
                      {selectedUser.is_active ? 'إيقاف الدخول' : 'تفعيل الدخول'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="erp-detail-empty">
                <strong>اختر مستخدمًا</strong>
                <span>اضغط على أي مستخدم في الجدول لعرض وتعديل صلاحياته أو تفعيل/إيقاف حسابه.</span>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* نافذة منبثقة: دعوة موظف جديد */}
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

            <div className="permission-toolbar-helpers" style={{ marginTop: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>
                تحديد الصلاحيات الأولية ({invitePermissions.length} من {allKeys.length})
              </span>
              <div>
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

            <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px 2px' }}>
              <PermissionChooser
                values={invitePermissions}
                onChange={setInvitePermissions}
                disabled={busy}
              />
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

function PermissionChooser({
  values,
  onChange,
  disabled = false,
}: {
  values: PermissionKey[];
  onChange: (values: PermissionKey[]) => void;
  disabled?: boolean;
}) {
  function toggle(key: PermissionKey) {
    if (disabled) return;
    const next = values.includes(key) ? values.filter((val) => val !== key) : [...values, key];
    onChange(next);
  }

  return (
    <div className="permission-groups">
      {groups.map((group) => {
        const groupKeys = group.actions.map(([action]) => `${group.module}.${action}` as PermissionKey);
        const allGroupChecked = groupKeys.every((key) => values.includes(key));

        function toggleGroup() {
          if (disabled) return;
          if (allGroupChecked) {
            onChange(values.filter((key) => !groupKeys.includes(key)));
          } else {
            const missing = groupKeys.filter((key) => !values.includes(key));
            onChange([...values, ...missing]);
          }
        }

        return (
          <fieldset className="permission-group" key={group.module}>
            <legend style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span>{group.label}</span>
              {!disabled && (
                <button
                  type="button"
                  className="btn compact"
                  style={{ fontSize: '10px', minHeight: '19px', padding: '1px 6px', marginInlineStart: 'auto' }}
                  onClick={toggleGroup}
                >
                  {allGroupChecked ? 'إلغاء القسم' : 'تحديد القسم'}
                </button>
              )}
            </legend>
            {group.actions.map(([action, label]) => {
              const key = `${group.module}.${action}` as PermissionKey;
              return (
                <label className="permission-option" key={key}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={values.includes(key)}
                    onChange={() => toggle(key)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import Modal from './Modal';

type ActionKey = 'view' | 'create' | 'edit' | 'delete';

interface PermissionItemDef {
  id: string;
  label: string;
  actions: ActionKey[];
}

interface SectionDef {
  id: string;
  label: string;
  items: PermissionItemDef[];
}

// الهيكل الديناميكي القابل للتوسع المستقبلي: كل قسم رئيسي يضم تفريعاته الفرعية التفاعلية
const sections: SectionDef[] = [
  {
    id: 'goods',
    label: 'قسم البضاعة',
    items: [
      { id: 'goods.sale', label: 'فواتير المبيعات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.purchase', label: 'فواتير المشتريات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.sale_return', label: 'مرتجعات المبيعات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.purchase_return', label: 'مرتجعات المشتريات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.waste', label: 'الهالك والتوالف', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.warehouse_transfer', label: 'التحويل بين المخازن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'money',
    label: 'قسم الفلوس',
    items: [
      { id: 'money.in', label: 'إيصالات الاستلام (سندات القبض)', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'money.out', label: 'إيصالات الصرف (سندات الدفع)', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'money.cash_box_transfer', label: 'التحويل بين الخزن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'data',
    label: 'قسم البيانات الأساسية',
    items: [
      { id: 'data.customers', label: 'دليل العملاء', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.suppliers', label: 'دليل الموردين', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.items', label: 'دليل الأصناف', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.warehouses', label: 'دليل المخازن', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.cashBoxes', label: 'دليل الخزن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'balances',
    label: 'قسم الأرصدة والتقارير',
    items: [
      { id: 'balances.customers', label: 'كشوف وحسابات العملاء', actions: ['view'] },
      { id: 'balances.suppliers', label: 'كشوف وحسابات الموردين', actions: ['view'] },
      { id: 'balances.items', label: 'أرصدة وحركات الأصناف', actions: ['view'] },
      { id: 'balances.cashBoxes', label: 'أرصدة وحركات الخزن', actions: ['view'] },
    ],
  },
  {
    id: 'management',
    label: 'قسم إدارة الأرصدة الافتتاحية',
    items: [
      { id: 'management.customers', label: 'افتتاحيات العملاء', actions: ['view', 'edit'] },
      { id: 'management.suppliers', label: 'افتتاحيات الموردين', actions: ['view', 'edit'] },
      { id: 'management.items', label: 'افتتاحيات المخزون', actions: ['view', 'edit'] },
      { id: 'management.cashBoxes', label: 'افتتاحيات الخزن', actions: ['view', 'edit'] },
    ],
  },
];

type PermissionKey = `${string}.${ActionKey}`;

type CompanyUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  access_role: 'owner' | 'employee';
  permission_keys: PermissionKey[];
};

type UserFilterStatus = 'all' | 'active' | 'suspended' | 'owner';

// جمع كافة الصلاحيات المتاحة
function getAllPermissionKeys(): PermissionKey[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.actions.map((action) => `${item.id}.${action}` as PermissionKey),
    ),
  );
}

// قوالب الصلاحيات السريعة لتوفير الوقت
const PRESETS: { id: string; label: string; keys: PermissionKey[] }[] = [
  {
    id: 'cashier',
    label: 'كاشير / مبيعات',
    keys: [
      'goods.sale.view', 'goods.sale.create',
      'goods.sale_return.view', 'goods.sale_return.create',
      'money.in.view', 'money.in.create',
      'data.customers.view',
      'data.items.view',
    ],
  },
  {
    id: 'warehouse',
    label: 'أمين مخزن',
    keys: [
      'goods.warehouse_transfer.view', 'goods.warehouse_transfer.create', 'goods.warehouse_transfer.edit',
      'goods.waste.view', 'goods.waste.create',
      'data.items.view', 'data.items.create', 'data.items.edit',
      'data.warehouses.view',
      'balances.items.view',
    ],
  },
  {
    id: 'accountant',
    label: 'محاسب مالي',
    keys: [
      'goods.sale.view', 'goods.sale.create', 'goods.sale.edit',
      'goods.purchase.view', 'goods.purchase.create', 'goods.purchase.edit',
      'goods.sale_return.view', 'goods.sale_return.create', 'goods.sale_return.edit',
      'goods.purchase_return.view', 'goods.purchase_return.create', 'goods.purchase_return.edit',
      'goods.warehouse_transfer.view', 'goods.warehouse_transfer.create',
      'money.in.view', 'money.in.create', 'money.in.edit',
      'money.out.view', 'money.out.create', 'money.out.edit',
      'money.cash_box_transfer.view', 'money.cash_box_transfer.create',
      'data.customers.view', 'data.customers.create', 'data.customers.edit',
      'data.suppliers.view', 'data.suppliers.create', 'data.suppliers.edit',
      'data.items.view', 'data.warehouses.view', 'data.cashBoxes.view',
      'balances.customers.view', 'balances.suppliers.view', 'balances.items.view', 'balances.cashBoxes.view',
    ],
  },
  {
    id: 'viewer',
    label: 'مشاهد فقط',
    keys: [
      'goods.sale.view', 'goods.purchase.view', 'goods.sale_return.view', 'goods.purchase_return.view',
      'goods.waste.view', 'goods.warehouse_transfer.view',
      'money.in.view', 'money.out.view', 'money.cash_box_transfer.view',
      'data.customers.view', 'data.suppliers.view', 'data.items.view', 'data.warehouses.view', 'data.cashBoxes.view',
      'balances.customers.view', 'balances.suppliers.view', 'balances.items.view', 'balances.cashBoxes.view',
      'management.customers.view', 'management.suppliers.view', 'management.items.view', 'management.cashBoxes.view',
    ],
  },
];

export default function UserPermissions() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // الموظف المختار والبحث
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserFilterStatus>('all');

  // حالة طي/فرد الأقسام الهرمية
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    goods: true,
    money: true,
    data: true,
    balances: true,
    management: true,
  });

  // نافذة دعوة موظف جديد
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<PermissionKey[]>([]);

  const allKeys = useMemo(() => getAllPermissionKeys(), []);

  async function request(action: string, payload: Record<string, unknown> = {}) {
    const { data, error: invokeError } = await supabase.functions.invoke('manage-users', {
      body: { action, ...payload },
    });
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

  useEffect(() => {
    if (filteredUsers.length > 0 && (!selectedUserId || !filteredUsers.some((u) => u.user_id === selectedUserId))) {
      setSelectedUserId(filteredUsers[0].user_id);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;
  const currentDraftKeys = selectedUser
    ? drafts[selectedUser.user_id] ?? selectedUser.permission_keys ?? []
    : [];

  function toggleSectionCollapse(sectionId: string) {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  function expandAll() {
    setExpandedSections(Object.fromEntries(sections.map((s) => [s.id, true])));
  }

  function collapseAll() {
    setExpandedSections(Object.fromEntries(sections.map((s) => [s.id, false])));
  }

  // تبديل صلاحية مفردة
  function togglePermission(key: PermissionKey) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const exists = currentDraftKeys.includes(key);
    const updated = exists ? currentDraftKeys.filter((k) => k !== key) : [...currentDraftKeys, key];
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: updated }));
  }

  // تبديل قسم رئيسي بالكامل
  function toggleSection(section: SectionDef) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const sectionKeys = section.items.flatMap((item) =>
      item.actions.map((act) => `${item.id}.${act}` as PermissionKey),
    );
    const allChecked = sectionKeys.every((k) => currentDraftKeys.includes(k));
    const updated = allChecked
      ? currentDraftKeys.filter((k) => !sectionKeys.includes(k))
      : [...currentDraftKeys, ...sectionKeys.filter((k) => !currentDraftKeys.includes(k))];
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: updated }));
  }

  // تبديل سطر فرعي بالكامل
  function toggleItem(item: PermissionItemDef) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const itemKeys = item.actions.map((act) => `${item.id}.${act}` as PermissionKey);
    const allChecked = itemKeys.every((k) => currentDraftKeys.includes(k));
    const updated = allChecked
      ? currentDraftKeys.filter((k) => !itemKeys.includes(k))
      : [...currentDraftKeys, ...itemKeys.filter((k) => !currentDraftKeys.includes(k))];
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: updated }));
  }

  // تطبيق قالب جاهز
  function applyPreset(keys: PermissionKey[]) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: keys }));
  }

  // تبديل عمود كامل (مثل تفعيل/إلغاء 'عرض' للكل)
  function toggleColumnAction(action: ActionKey) {
    if (!selectedUser || selectedUser.access_role === 'owner') return;
    const actionKeys = sections.flatMap((section) =>
      section.items
        .filter((item) => item.actions.includes(action))
        .map((item) => `${item.id}.${action}` as PermissionKey),
    );
    const allActionChecked = actionKeys.every((k) => currentDraftKeys.includes(k));
    const updated = allActionChecked
      ? currentDraftKeys.filter((k) => !actionKeys.includes(k))
      : [...currentDraftKeys, ...actionKeys.filter((k) => !currentDraftKeys.includes(k))];
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
          {/* الجانب الأيمن (Master List): قائمة الموظفين مدمجة */}
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

          {/* الجانب الأيسر (Matrix Tree-Table Workspace): جدول مصفوفة الصلاحيات الهرمي الشامل */}
          <main className="permissions-main-panel" aria-label="مصفوفة إدارة الصلاحيات">
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
                  <div style={{ padding: '20px' }}>
                    <div className="alert success" style={{ marginBottom: '16px' }}>
                      <strong>مدير المنشأة:</strong> يمتلك كافة صلاحيات النظام وتفريعاته تلقائيًا بحكم دوره، ولا يحتاج إلى تعديل يدوي.
                    </div>
                    <HierarchyMatrixTable
                      sections={sections}
                      draftKeys={allKeys}
                      onToggleKey={() => undefined}
                      onToggleSection={() => undefined}
                      onToggleItem={() => undefined}
                      onToggleColumnAction={() => undefined}
                      expandedSections={expandedSections}
                      onToggleSectionCollapse={toggleSectionCollapse}
                      readOnly
                    />
                  </div>
                ) : (
                  <>
                    {/* شريط الأدوار والتحكم الموحد */}
                    <div className="matrix-toolbar">
                      <div className="matrix-toolbar-presets">
                        <span className="presets-title">أدوار جاهزة:</span>
                        <div className="presets-list">
                          {PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className="preset-chip-btn"
                              disabled={busy}
                              onClick={() => applyPreset(preset.keys)}
                            >
                              <span>{preset.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="matrix-toolbar-actions">
                        <span className="matrix-toolbar-count">
                          <strong>{currentDraftKeys.length}</strong> من <strong>{allKeys.length}</strong>
                        </span>
                        <button
                          type="button"
                          className="btn compact"
                          onClick={() =>
                            setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: allKeys }))
                          }
                        >
                          تحديد كافة الصلاحيات
                        </button>
                        <button
                          type="button"
                          className="btn compact"
                          onClick={() =>
                            setDrafts((prev) => ({ ...prev, [selectedUser.user_id]: [] }))
                          }
                        >
                          إلغاء تحديد الكل
                        </button>
                        <span style={{ color: '#cbd5e1' }}>|</span>
                        <button type="button" className="btn compact" onClick={expandAll}>
                          توسيع
                        </button>
                        <button type="button" className="btn compact" onClick={collapseAll}>
                          طي
                        </button>
                      </div>
                    </div>

                    {/* جدول مصفوفة الصلاحيات الهرمي */}
                    <div className="matrix-table-wrap">
                      <HierarchyMatrixTable
                        sections={sections}
                        draftKeys={currentDraftKeys}
                        onToggleKey={togglePermission}
                        onToggleSection={toggleSection}
                        onToggleItem={toggleItem}
                        onToggleColumnAction={toggleColumnAction}
                        expandedSections={expandedSections}
                        onToggleSectionCollapse={toggleSectionCollapse}
                        disabled={busy}
                      />
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

            <div className="matrix-toolbar" style={{ marginTop: '8px', padding: '6px 10px' }}>
              <div className="matrix-toolbar-presets">
                <span className="presets-title" style={{ fontSize: '11px' }}>
                  أدوار جاهزة:
                </span>
                <div className="presets-list">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="preset-chip-btn"
                      onClick={() => setInvitePermissions(preset.keys)}
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="matrix-toolbar-actions">
                <span className="matrix-toolbar-count" style={{ fontSize: '11px' }}>
                  ({invitePermissions.length} من {allKeys.length})
                </span>
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

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <HierarchyMatrixTable
                sections={sections}
                draftKeys={invitePermissions}
                onToggleKey={(key) =>
                  setInvitePermissions((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                onToggleSection={(sec) => {
                  const secKeys = sec.items.flatMap((item) =>
                    item.actions.map((act) => `${item.id}.${act}` as PermissionKey),
                  );
                  const allChecked = secKeys.every((k) => invitePermissions.includes(k));
                  setInvitePermissions((prev) =>
                    allChecked
                      ? prev.filter((k) => !secKeys.includes(k))
                      : [...prev, ...secKeys.filter((k) => !prev.includes(k))],
                  );
                }}
                onToggleItem={(item) => {
                  const itemKeys = item.actions.map((act) => `${item.id}.${act}` as PermissionKey);
                  const allChecked = itemKeys.every((k) => invitePermissions.includes(k));
                  setInvitePermissions((prev) =>
                    allChecked
                      ? prev.filter((k) => !itemKeys.includes(k))
                      : [...prev, ...itemKeys.filter((k) => !prev.includes(k))],
                  );
                }}
                onToggleColumnAction={(action) => {
                  const actionKeys = sections.flatMap((section) =>
                    section.items
                      .filter((item) => item.actions.includes(action))
                      .map((item) => `${item.id}.${action}` as PermissionKey),
                  );
                  const allActionChecked = actionKeys.every((k) => invitePermissions.includes(k));
                  setInvitePermissions((prev) =>
                    allActionChecked
                      ? prev.filter((k) => !actionKeys.includes(k))
                      : [...prev, ...actionKeys.filter((k) => !prev.includes(k))],
                  );
                }}
                expandedSections={expandedSections}
                onToggleSectionCollapse={toggleSectionCollapse}
              />
            </div>

            <div
              className="actions"
              style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
            >
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

// مكون جدول مصفوفة الصلاحيات الهرمي المشترك
function HierarchyMatrixTable({
  sections,
  draftKeys,
  onToggleKey,
  onToggleSection,
  onToggleItem,
  onToggleColumnAction,
  expandedSections,
  onToggleSectionCollapse,
  disabled = false,
  readOnly = false,
}: {
  sections: SectionDef[];
  draftKeys: PermissionKey[];
  onToggleKey: (key: PermissionKey) => void;
  onToggleSection: (section: SectionDef) => void;
  onToggleItem: (item: PermissionItemDef) => void;
  onToggleColumnAction: (action: ActionKey) => void;
  expandedSections: Record<string, boolean>;
  onToggleSectionCollapse: (sectionId: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const actionsList: { key: ActionKey; label: string }[] = [
    { key: 'view', label: 'عرض' },
    { key: 'create', label: 'إضافة' },
    { key: 'edit', label: 'تعديل' },
    { key: 'delete', label: 'حذف' },
  ];

  return (
    <table className="matrix-table">
      <thead>
        <tr>
          <th style={{ width: '42%' }}>القسم / البند الفرعي</th>
          {actionsList.map((action) => (
            <th key={action.key} className="center" style={{ width: '12%' }}>
              {!readOnly ? (
                <button
                  type="button"
                  className="matrix-column-btn"
                  title={`تبديل صلاحية "${action.label}" للجميع`}
                  onClick={() => onToggleColumnAction(action.key)}
                >
                  <span>{action.label}</span>
                  <span style={{ fontSize: '10px' }}>▾</span>
                </button>
              ) : (
                action.label
              )}
            </th>
          ))}
          <th className="center" style={{ width: '10%' }}>
            تحكم سريع
          </th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => {
          const isExpanded = expandedSections[section.id] ?? true;
          const sectionKeys = section.items.flatMap((item) =>
            item.actions.map((act) => `${item.id}.${act}` as PermissionKey),
          );
          const checkedCount = sectionKeys.filter((k) => draftKeys.includes(k)).length;
          const allSectionChecked = sectionKeys.length > 0 && checkedCount === sectionKeys.length;

          return (
            <SectionGroupRows
              key={section.id}
              section={section}
              isExpanded={isExpanded}
              checkedCount={checkedCount}
              totalCount={sectionKeys.length}
              allSectionChecked={allSectionChecked}
              draftKeys={draftKeys}
              actionsList={actionsList}
              onToggleKey={onToggleKey}
              onToggleSection={onToggleSection}
              onToggleItem={onToggleItem}
              onToggleSectionCollapse={onToggleSectionCollapse}
              disabled={disabled}
              readOnly={readOnly}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function SectionGroupRows({
  section,
  isExpanded,
  checkedCount,
  totalCount,
  allSectionChecked,
  draftKeys,
  actionsList,
  onToggleKey,
  onToggleSection,
  onToggleItem,
  onToggleSectionCollapse,
  disabled,
  readOnly,
}: {
  section: SectionDef;
  isExpanded: boolean;
  checkedCount: number;
  totalCount: number;
  allSectionChecked: boolean;
  draftKeys: PermissionKey[];
  actionsList: { key: ActionKey; label: string }[];
  onToggleKey: (key: PermissionKey) => void;
  onToggleSection: (section: SectionDef) => void;
  onToggleItem: (item: PermissionItemDef) => void;
  onToggleSectionCollapse: (sectionId: string) => void;
  disabled: boolean;
  readOnly: boolean;
}) {
  return (
    <>
      {/* صف رأس القسم القابل للطي والفتح */}
      <tr className="matrix-section-row">
        <td colSpan={5}>
          <button
            type="button"
            className="matrix-section-btn"
            onClick={() => onToggleSectionCollapse(section.id)}
          >
            <span className="matrix-section-chevron">{isExpanded ? '▾' : '▸'}</span>
            <span>{section.label}</span>
            <span className="muted" style={{ fontSize: '11px', fontWeight: 'normal' }}>
              ({checkedCount} من {totalCount})
            </span>
          </button>
        </td>
        <td className="center">
          {!readOnly && (
            <button
              type="button"
              className="btn compact"
              style={{ fontSize: '11px', minHeight: '22px', padding: '1px 8px' }}
              disabled={disabled}
              onClick={() => onToggleSection(section)}
            >
              {allSectionChecked ? 'إلغاء القسم' : 'تحديد القسم'}
            </button>
          )}
        </td>
      </tr>

      {/* صفوف البنود والتبويبات الفرعية التابعة للقسم */}
      {isExpanded &&
        section.items.map((item) => {
          const itemKeys = item.actions.map((act) => `${item.id}.${act}` as PermissionKey);
          const allItemChecked = itemKeys.every((k) => draftKeys.includes(k));

          return (
            <tr className="matrix-item-row" key={item.id}>
              <td>
                <div className="matrix-item-title">
                  <span className="matrix-item-bullet" />
                  <span>{item.label}</span>
                </div>
              </td>
              {actionsList.map((action) => {
                const isSupported = item.actions.includes(action.key);
                const key = `${item.id}.${action.key}` as PermissionKey;
                const isChecked = draftKeys.includes(key);

                if (!isSupported) {
                  return (
                    <td key={action.key} className="center">
                      <span className="matrix-cell-disabled">—</span>
                    </td>
                  );
                }

                return (
                  <td key={action.key} className="center">
                    <label
                      className={`matrix-cell-interactive ${isChecked ? 'checked' : ''}`}
                      title={`${action.label} — ${item.label}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={disabled || readOnly}
                        title={`${action.label} — ${item.label}`}
                        aria-label={`${action.label} — ${item.label}`}
                        onChange={() => onToggleKey(key)}
                      />
                    </label>
                  </td>
                );
              })}
              <td className="center">
                {!readOnly && (
                  <button
                    type="button"
                    className="btn compact"
                    style={{ fontSize: '10px', minHeight: '20px', padding: '1px 6px' }}
                    disabled={disabled}
                    onClick={() => onToggleItem(item)}
                  >
                    {allItemChecked ? 'إلغاء' : 'الكل'}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
    </>
  );
}

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup({
  hasAuth = true,
  isPlatformAdmin = true,
  companiesById = { 'comp-1': { id: 'comp-1', name: 'شركة النور' } },
  profilesByKey = {
    'comp-1:u-1': { id: 'u-1', company_id: 'comp-1', full_name: 'أحمد المالك', access_role: 'owner', is_active: true },
    'comp-1:u-pending': { id: 'u-pending', company_id: 'comp-1', full_name: 'سعيد الموظف', access_role: 'employee', is_active: true },
  },
  authUsersById = {
    'u-1': { id: 'u-1', email: 'owner@noor.test', email_confirmed_at: '2026-10-01T10:00:00Z', user_metadata: { full_name: 'أحمد المالك' } },
    'u-pending': { id: 'u-pending', email: 'pending@noor.test', email_confirmed_at: null, user_metadata: { full_name: 'سعيد الموظف' } },
  },
  adminRpcError = null,
  adminRpcErrorByFn = {},
  adminRpcResult = null,
  deleteUserFailures = new Set(),
  inviteError = null,
  generateLinkInviteError = null,
  allowedOrigins = null,
} = {}) {
  let handler;
  const adminRpcCalls = [];
  const createUserCalls = [];
  const inviteCalls = [];
  const generateLinkCalls = [];
  const updateUserCalls = [];
  const deleteUserCalls = [];

  const caller = {
    auth: {
      getUser: async () =>
        hasAuth
          ? { data: { user: { id: 'platform-admin-id' } }, error: null }
          : { data: { user: null }, error: new Error('not_authenticated') },
    },
    rpc: async (fn) => {
      if (fn === 'is_platform_admin') return { data: isPlatformAdmin, error: null };
      return { data: null, error: null };
    },
  };

  function makeQueryBuilder(table) {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        filters[col] = val;
        return builder;
      },
      maybeSingle: async () => {
        if (table === 'companies' && filters.id) {
          return { data: companiesById[filters.id] ?? null, error: null };
        }
        if (table === 'profiles' && filters.id && filters.company_id) {
          return { data: profilesByKey[`${filters.company_id}:${filters.id}`] ?? null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  const admin = {
    from: (table) => makeQueryBuilder(table),
    rpc: async (fn, params) => {
      adminRpcCalls.push({ fn, params });
      if (adminRpcErrorByFn[fn]) return { data: null, error: adminRpcErrorByFn[fn] };
      if (adminRpcError) return { data: null, error: adminRpcError };
      if (fn === 'platform_provision_company_records') {
        return { data: adminRpcResult ?? 'new-comp-id', error: null };
      }
      if (fn === 'platform_delete_company_data') {
        return { data: adminRpcResult ?? ['u-1', 'u-2'], error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id) => {
          const user = authUsersById[id] ?? null;
          return user ? { data: { user }, error: null } : { data: { user: null }, error: new Error('user_not_found') };
        },
        createUser: async (payload) => {
          createUserCalls.push(payload);
          return { data: { user: { id: 'created-user-id' } }, error: null };
        },
        inviteUserByEmail: async (email, options) => {
          inviteCalls.push({ email, options });
          if (inviteError) return { data: { user: null }, error: inviteError };
          return { data: { user: { id: 'invited-user-id' } }, error: null };
        },
        generateLink: async (params) => {
          generateLinkCalls.push(params);
          if (params.type === 'invite' && generateLinkInviteError) {
            return { data: null, error: generateLinkInviteError };
          }
          return {
            data: {
              properties: {
                action_link: `https://example.invalid/auth/v1/verify?type=${params.type}&token=tok`,
              },
              user: authUsersById['u-pending'] ?? { id: 'u-pending' },
            },
            error: null,
          };
        },
        updateUserById: async (id, attrs) => {
          updateUserCalls.push({ id, attrs });
          return { data: { user: { ...(authUsersById[id] ?? { id }), ...attrs } }, error: null };
        },
        deleteUser: async (id) => {
          deleteUserCalls.push(id);
          if (deleteUserFailures.has(id)) {
            return { error: new Error('delete_user_failed') };
          }
          return { error: null };
        },
      },
    },
  };

  const source = readFileSync(new URL('../functions/manage-companies/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;

  vm.runInNewContext(js, {
    createClient: (_url, key) => (key === 'test-service-role' ? admin : caller),
    Deno: {
      env: {
        get: (key) => ({
          SUPABASE_URL: 'https://example.invalid',
          SUPABASE_ANON_KEY: 'test-anon',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
          ALLOWED_ORIGINS: allowedOrigins,
        }[key]),
      },
      serve: (fn) => { handler = fn; },
    },
    Response,
    Request,
    URL,
  });

  return {
    handler,
    adminRpcCalls,
    createUserCalls,
    inviteCalls,
    generateLinkCalls,
    updateUserCalls,
    deleteUserCalls,
  };
}

function makeRequest(body, { auth = 'Bearer jwt', origin = 'https://app.example.com' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.Authorization = auth;
  if (origin) headers.origin = origin;
  return new Request('https://example.invalid/functions/v1/manage-companies', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('denies unauthenticated callers and non-platform-admin callers', async () => {
  const unauth = setup();
  const r1 = await unauth.handler(makeRequest({ action: 'create' }, { auth: null }));
  assert.equal(r1.status, 401);

  const nonAdmin = setup({ isPlatformAdmin: false });
  const r2 = await nonAdmin.handler(makeRequest({ action: 'create' }));
  assert.equal(r2.status, 403);
  assert.deepEqual(await r2.json(), { error: 'permission_denied' });
});

test('creates company with direct password and confirms email', async () => {
  const ctx = setup();
  const res = await ctx.handler(makeRequest({
    action: 'create',
    company_name: 'شركة التوفيق',
    admin_notes: 'ملاحظة داخلية',
    owner_full_name: 'أحمد علي',
    owner_email: 'Owner@Test.com',
    auth_mode: 'password',
    owner_password: 'Password#123',
  }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.company_id, 'new-comp-id');
  assert.equal(ctx.createUserCalls.length, 1);
  assert.equal(ctx.createUserCalls[0].email, 'owner@test.com');
  assert.equal(ctx.createUserCalls[0].email_confirm, true);
  assert.equal(ctx.adminRpcCalls[0].fn, 'platform_provision_company_records');
  assert.equal(ctx.adminRpcCalls[0].params.p_owner_user_id, 'created-user-id');
});

test('creates company via email invite and allows trusted origin redirect', async () => {
  const ctx = setup({ allowedOrigins: 'https://maksab.example.com' });
  const res = await ctx.handler(makeRequest({
    action: 'create',
    company_name: 'شركة الرسالة',
    admin_notes: '',
    owner_full_name: 'سارة محمد',
    owner_email: 'sara@example.com',
    auth_mode: 'invite',
  }, { origin: 'https://maksab.example.com' }));
  assert.equal(res.status, 200);
  assert.equal(ctx.inviteCalls.length, 1);
  assert.equal(ctx.inviteCalls[0].options.redirectTo, 'https://maksab.example.com/set-password');
});

test('drops untrusted origin when inviting user during company creation', async () => {
  const ctx = setup({ allowedOrigins: 'https://maksab.example.com' });
  const res = await ctx.handler(makeRequest({
    action: 'create',
    company_name: 'شركة الرسالة',
    admin_notes: '',
    owner_full_name: 'سارة محمد',
    owner_email: 'sara@example.com',
    auth_mode: 'invite',
  }, { origin: 'https://evil.example.com' }));
  assert.equal(res.status, 200);
  assert.equal(ctx.inviteCalls[0].options.redirectTo, undefined);
});

test('rolls back newly created Auth user when DB provisioning fails', async () => {
  const ctx = setup({ adminRpcError: { message: 'company_name_required' } });
  const res = await ctx.handler(makeRequest({
    action: 'create',
    company_name: 'شركة فاشلة',
    owner_full_name: 'خالد',
    owner_email: 'khaled@example.com',
    auth_mode: 'password',
    owner_password: 'Password#123',
  }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'company_name_required' });
  assert.deepEqual(ctx.deleteUserCalls, ['created-user-id']);
});

test('adds a company user to an existing company and rejects missing company before auth creation', async () => {
  const ctx = setup();
  const missingRes = await ctx.handler(makeRequest({
    action: 'add_user',
    company_id: 'missing-comp',
    full_name: 'محمود',
    email: 'mahmoud@example.com',
    access_role: 'owner',
    auth_mode: 'password',
    password: 'Password#123',
  }));
  assert.equal(missingRes.status, 404);
  assert.equal(ctx.createUserCalls.length, 0);

  const okRes = await ctx.handler(makeRequest({
    action: 'add_user',
    company_id: 'comp-1',
    full_name: 'محمود',
    email: 'mahmoud@example.com',
    access_role: 'employee',
    auth_mode: 'password',
    password: 'Password#123',
  }));
  assert.equal(okRes.status, 200);
  assert.equal(ctx.adminRpcCalls[0].fn, 'platform_add_company_user_record');
  assert.equal(ctx.adminRpcCalls[0].params.p_access_role, 'employee');
});

test('deletes company only when exact company name matches and reports partial Auth cleanup errors', async () => {
  const ctxMismatch = setup();
  const rMismatch = await ctxMismatch.handler(makeRequest({
    action: 'delete',
    company_id: 'comp-1',
    confirm_name: 'اسم غلط',
  }));
  assert.equal(rMismatch.status, 400);
  assert.deepEqual(await rMismatch.json(), { error: 'confirm_name_mismatch' });
  assert.equal(ctxMismatch.adminRpcCalls.length, 0);

  const ctxOk = setup({ deleteUserFailures: new Set(['u-2']) });
  const rOk = await ctxOk.handler(makeRequest({
    action: 'delete',
    company_id: 'comp-1',
    confirm_name: 'شركة النور',
  }));
  assert.equal(rOk.status, 200);
  assert.deepEqual(await rOk.json(), {
    ok: true,
    deleted_user_count: 1,
    failed_user_ids: ['u-2'],
  });
  assert.deepEqual(ctxOk.deleteUserCalls, ['u-1', 'u-2']);
});

test('handles activation_link for pending users (email and link with magiclink fallback) and blocks confirmed users', async () => {
  const ctxConfirmed = setup();
  const rConfirmed = await ctxConfirmed.handler(makeRequest({
    action: 'activation_link',
    company_id: 'comp-1',
    user_id: 'u-1',
    delivery: 'link',
  }));
  assert.equal(rConfirmed.status, 400);
  assert.deepEqual(await rConfirmed.json(), { error: 'user_already_confirmed' });

  const ctxEmailFallback = setup({ inviteError: new Error('A user with this email address has already been registered') });
  const rEmailErr = await ctxEmailFallback.handler(makeRequest({
    action: 'activation_link',
    company_id: 'comp-1',
    user_id: 'u-pending',
    delivery: 'email',
  }));
  assert.equal(rEmailErr.status, 400);
  assert.deepEqual(await rEmailErr.json(), { error: 'invite_resend_email_unavailable' });

  const ctxLink = setup({
    allowedOrigins: 'https://maksab.example.com',
    generateLinkInviteError: new Error('already registered'),
  });
  const rLink = await ctxLink.handler(makeRequest({
    action: 'activation_link',
    company_id: 'comp-1',
    user_id: 'u-pending',
    delivery: 'link',
  }, { origin: 'https://maksab.example.com' }));
  assert.equal(rLink.status, 200);
  const json = await rLink.json();
  assert.equal(json.ok, true);
  assert.equal(json.delivery, 'link');
  assert.match(json.action_link, /type=magiclink/);
  assert.equal(ctxLink.generateLinkCalls.length, 2);
  assert.equal(ctxLink.generateLinkCalls[1].options.redirectTo, 'https://maksab.example.com/set-password');
});

test('updates user auth email + profile and rolls back auth changes when RPC enforces last-owner guard', async () => {
  const ctxOk = setup();
  const resOk = await ctxOk.handler(makeRequest({
    action: 'update_user',
    company_id: 'comp-1',
    user_id: 'u-pending',
    full_name: 'سعيد المعدل',
    email: 'Saeed.New@Noor.test',
    access_role: 'owner',
  }));
  assert.equal(resOk.status, 200);
  assert.equal(ctxOk.updateUserCalls.length, 1);
  assert.equal(ctxOk.updateUserCalls[0].attrs.email, 'saeed.new@noor.test');
  assert.equal(ctxOk.updateUserCalls[0].attrs.email_confirm, false);
  assert.equal(ctxOk.adminRpcCalls[0].fn, 'platform_update_company_user_profile');
  assert.equal(ctxOk.adminRpcCalls[0].params.p_access_role, 'owner');

  const ctxRollback = setup({
    adminRpcErrorByFn: { platform_update_company_user_profile: { message: 'cannot_remove_last_active_owner' } },
  });
  const resFail = await ctxRollback.handler(makeRequest({
    action: 'update_user',
    company_id: 'comp-1',
    user_id: 'u-1',
    full_name: 'أحمد جديد',
    email: 'changed@noor.test',
    access_role: 'employee',
  }));
  assert.equal(resFail.status, 400);
  assert.deepEqual(await resFail.json(), { error: 'cannot_remove_last_active_owner' });
  assert.equal(ctxRollback.updateUserCalls.length, 2);
  assert.equal(ctxRollback.updateUserCalls[1].attrs.email, 'owner@noor.test');
  assert.equal(ctxRollback.updateUserCalls[1].attrs.user_metadata.full_name, 'أحمد المالك');
});

test('deletes a single user only when confirmation matches email or name and prevents auth delete if RPC blocks', async () => {
  const ctxMismatch = setup();
  const rMismatch = await ctxMismatch.handler(makeRequest({
    action: 'delete_user',
    company_id: 'comp-1',
    user_id: 'u-pending',
    confirm_identifier: 'غلط',
  }));
  assert.equal(rMismatch.status, 400);
  assert.deepEqual(await rMismatch.json(), { error: 'confirm_user_mismatch' });
  assert.equal(ctxMismatch.adminRpcCalls.length, 0);

  const ctxGuard = setup({
    adminRpcErrorByFn: { platform_delete_company_user_data: { message: 'cannot_remove_last_active_owner' } },
  });
  const rGuard = await ctxGuard.handler(makeRequest({
    action: 'delete_user',
    company_id: 'comp-1',
    user_id: 'u-1',
    confirm_identifier: 'OWNER@NOOR.TEST',
  }));
  assert.equal(rGuard.status, 400);
  assert.deepEqual(await rGuard.json(), { error: 'cannot_remove_last_active_owner' });
  assert.equal(ctxGuard.deleteUserCalls.length, 0);

  const ctxOk = setup();
  const rOk = await ctxOk.handler(makeRequest({
    action: 'delete_user',
    company_id: 'comp-1',
    user_id: 'u-pending',
    confirm_identifier: 'سعيد الموظف',
  }));
  assert.equal(rOk.status, 200);
  assert.deepEqual(await rOk.json(), { ok: true, auth_delete_failed: false });
  assert.deepEqual(ctxOk.deleteUserCalls, ['u-pending']);
});

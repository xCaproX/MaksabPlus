import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup({
  hasAuth = true,
  isPlatformAdmin = true,
  companiesById = { 'comp-1': { id: 'comp-1', name: 'شركة النور' } },
  adminRpcError = null,
  adminRpcResult = null,
  deleteUserFailures = new Set(),
  allowedOrigins = null,
} = {}) {
  let handler;
  const adminRpcCalls = [];
  const createUserCalls = [];
  const inviteCalls = [];
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

  const admin = {
    from: (table) => ({
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            if (table === 'companies' && col === 'id') {
              return { data: companiesById[val] ?? null, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn, params) => {
      adminRpcCalls.push({ fn, params });
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
        createUser: async (payload) => {
          createUserCalls.push(payload);
          return { data: { user: { id: 'created-user-id' } }, error: null };
        },
        inviteUserByEmail: async (email, options) => {
          inviteCalls.push({ email, options });
          return { data: { user: { id: 'invited-user-id' } }, error: null };
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

  return { handler, adminRpcCalls, createUserCalls, inviteCalls, deleteUserCalls };
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

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup({ owner = true, rpcError = null, allowedOrigins = null } = {}) {
  let handler;
  const adminCalls = [];
  const inviteCalls = [];
  const rpcCalls = [];
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-owner' } } }) },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'is_company_owner') return { data: owner, error: null };
      if (name === 'current_company_id') return { data: 'test-company', error: null };
      return { error: rpcError };
    },
  };
  const admin = {
    auth: {
      admin: {
        updateUserById: async () => {
          adminCalls.push(true);
          return { error: null };
        },
        inviteUserByEmail: async (email, options) => {
          inviteCalls.push({ email, options });
          return { data: { user: { id: 'invited-user-id' } }, error: null };
        },
      },
    },
    from: () => ({ insert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }),
  };
  const source = readFileSync(new URL('../functions/manage-users/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  vm.runInNewContext(js, {
    createClient: (_url, key) => key === 'test-service-role' ? admin : caller,
    Deno: {
      env: { get: (key) => ({
        SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
        ...(allowedOrigins ? { ALLOWED_ORIGINS: allowedOrigins } : {}),
      })[key] },
      serve: (fn) => { handler = fn; },
    },
    Response, Set, Error, URL,
  });
  return { handler, adminCalls, inviteCalls, rpcCalls };
}

function request() {
  return {
    method: 'POST', headers: new Headers({ Authorization: 'Bearer synthetic-test' }),
    json: async () => ({ action: 'password', user_id: 'test-employee', password: 'synthetic-test-value' }),
  };
}

test('owner can change their employee password through the validated RPC', async () => {
  const { handler, adminCalls, rpcCalls } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(rpcCalls.at(-1).name, 'set_company_user_password');
  assert.equal(adminCalls.length, 0);
});

for (const reason of ['invalid_company_user', 'permission_denied', 'database_unavailable']) {
  test(`RPC rejection ${reason} never falls back to the admin API`, async () => {
    const { handler, adminCalls } = setup({ rpcError: { message: reason } });
    const response = await handler(request());
    assert.equal(response.status, 400);
    assert.equal(adminCalls.length, 0);
  });
}

test('employee cannot use the password management endpoint', async () => {
  const { handler, rpcCalls, adminCalls } = setup({ owner: false });
  assert.equal((await handler(request())).status, 403);
  assert.equal(rpcCalls.length, 1);
  assert.equal(adminCalls.length, 0);
});

test('missing Authorization header returns 401 instead of 500', async () => {
  const { handler } = setup();
  const response = await handler({
    method: 'POST',
    headers: new Headers(),
    json: async () => ({ action: 'list' }),
  });
  assert.equal(response.status, 401);
});

test('owner can invite and update permissions with cashBoxes and wildcard * keys', async () => {
  const { handler, inviteCalls, rpcCalls } = setup({ allowedOrigins: 'https://app.maksabplus.test' });
  const inviteResp = await handler({
    method: 'POST',
    headers: new Headers({ Authorization: 'Bearer synthetic-test', origin: 'https://app.maksabplus.test' }),
    json: async () => ({
      action: 'invite',
      email: 'cashier@example.test',
      full_name: 'Cashier',
      permission_keys: ['data.cashBoxes.view', 'balances.cashBoxes.view', '*'],
    }),
  });
  assert.equal(inviteResp.status, 200);
  assert.equal(inviteCalls[0].options.redirectTo, 'https://app.maksabplus.test/set-password');

  const permResp = await handler({
    method: 'POST',
    headers: new Headers({ Authorization: 'Bearer synthetic-test' }),
    json: async () => ({
      action: 'permissions',
      user_id: 'emp-1',
      permission_keys: ['management.cashBoxes.edit', '*'],
    }),
  });
  assert.equal(permResp.status, 200);
  assert.equal(rpcCalls.at(-1).name, 'set_user_permissions');
});

test('invite ignores disallowed origin when ALLOWED_ORIGINS is configured', async () => {
  const { handler, inviteCalls } = setup({ allowedOrigins: 'https://app.maksabplus.test' });
  const resp = await handler({
    method: 'POST',
    headers: new Headers({ Authorization: 'Bearer synthetic-test', origin: 'https://evil.example' }),
    json: async () => ({
      action: 'invite',
      email: 'cashier@example.test',
      full_name: 'Cashier',
      permission_keys: ['goods.sale.view'],
    }),
  });
  assert.equal(resp.status, 200);
  assert.equal(inviteCalls[0].options.redirectTo, undefined);
});

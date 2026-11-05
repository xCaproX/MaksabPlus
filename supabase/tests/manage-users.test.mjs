import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup({ owner = true, rpcError = null } = {}) {
  let handler;
  const adminCalls = [];
  const rpcCalls = [];
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-owner' } } }) },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return name === 'is_company_owner' ? { data: owner, error: null } : { error: rpcError };
    },
  };
  const admin = { auth: { admin: { updateUserById: async () => {
    adminCalls.push(true);
    return { error: null };
  } } } };
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
      })[key] },
      serve: (fn) => { handler = fn; },
    },
    Response, Set, Error,
  });
  return { handler, adminCalls, rpcCalls };
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

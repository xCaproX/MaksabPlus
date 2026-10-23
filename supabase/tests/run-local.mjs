/**
 * run-local.mjs
 * يشغّل الـmigrations ثم الاختبارات على Postgres حقيقي (PGlite/WASM)
 * بعد تهيئة بيئة تشبه Supabase (schema auth + الأدوار + الصلاحيات).
 *
 * التشغيل: npm run test:db
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');
const migrationsDir = join(supabaseDir, 'migrations');

const bootstrapSql = `
create schema auth;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

function sqlFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

const db = new PGlite();
let failures = 0;

console.log('Postgres (PGlite) — تهيئة بيئة تشبه Supabase...');
await db.exec(bootstrapSql);

console.log('\n-- Migrations --');
for (const file of sqlFiles(migrationsDir)) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  try {
    await db.exec(sql);
    console.log(`  OK   ${file}`);
  } catch (error) {
    console.error(`  FAIL ${file}\n${error.message}`);
    process.exit(1);
  }
}

console.log('\n-- Tests --');
for (const file of sqlFiles(here)) {
  const sql = readFileSync(join(here, file), 'utf8');
  try {
    const results = await db.exec(sql);
    const last = results[results.length - 1];
    const row = last?.rows?.[0];
    if (row && row.result) {
      console.log(`  ${row.result}`);
    } else {
      console.log(`  PASS ${file}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${file}\n${error.message}`);
    try {
      await db.exec('rollback;');
    } catch {
      /* ignore */
    }
  }
}

console.log('');
if (failures > 0) {
  console.error(`${failures} test file(s) failed`);
  process.exit(1);
}
console.log('كل الاختبارات نجحت ✅');
await db.close();

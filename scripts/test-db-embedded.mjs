// Run from the repository root after copying this file beside the temporary dependencies.
// The Auth schema below supplies only the identities and claims that the SQL fixtures use.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pgtap } from '@electric-sql/pglite-pgtap'
import { readFile, readdir } from 'node:fs/promises'
const db = new PGlite({ extensions: { pgcrypto, pgtap } })
const sql = (file) => readFile(file, 'utf8')
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users(id uuid primary key, email text);
    grant usage on schema auth, extensions to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true), ''),
        nullif(current_setting('request.jwt.claims',true), '')::jsonb ->> 'sub')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim',true), ''),
        nullif(current_setting('request.jwt.claims',true), ''))::jsonb
    $$;
    set search_path = public, extensions;
  `)
  console.log((await db.query('show server_version')).rows[0])
  const dir = 'supabase/migrations'
  for (const file of (await readdir(dir)).sort()) {
    await db.exec(await sql(dir + '/' + file))
    console.log('applied ' + file)
  }
  await db.exec(await sql('supabase/seed.sql'))
  const [catalog] = (await db.query(`
    select
      count(*) filter (where relkind = 'r')::int as tables,
      count(*) filter (where relkind = 'r' and relrowsecurity)::int as rls,
      count(*) filter (where relkind in ('v', 'm'))::int as views
    from pg_class
    where relnamespace = 'public'::regnamespace
  `)).rows
  console.log(catalog)
  if (catalog.tables !== catalog.rls) process.exitCode = 1
  for (const file of ['peoplepulse_rls_test.sql', 'peoplepulse_import_rpc_test.sql']) {
    try {
      const result = await db.exec(await sql('supabase/tests/' + file))
      const tap = result.flatMap((part) => part.rows.flatMap(Object.values)).filter((value) => typeof value === 'string')
      const plan = Number(tap.find((line) => /^1\.\.\d+/.test(line))?.split('..')[1])
      const pass = tap.filter((line) => /^ok \d+/.test(line)).length
      const failures = tap.filter((line) => /^not ok |^#/.test(line))
      console.log({ file, plan, pass, failures })
      if (pass !== plan || failures.length) process.exitCode = 1
    } catch (error) {
      console.log({ file, code: error.code, message: error.message })
      await db.exec('rollback')
      process.exitCode = 1
    }
  }
} catch (error) {
  console.log({ code: error.code, message: error.message })
  process.exitCode = 1
} finally {
  await db.close()
}

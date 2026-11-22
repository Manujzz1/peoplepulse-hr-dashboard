-- Run only on a disposable local database with the project migrations applied.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'rpc-uploader@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'rpc-unassigned@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'rpc-reviewer@example.test');
insert into public.organizations (id, organization_key, organization_name) values
  ('92000000-0000-4000-8000-000000000001', 'rpc-org-a', 'Synthetic RPC Org A'),
  ('92000000-0000-4000-8000-000000000002', 'rpc-org-b', 'Synthetic RPC Org B');
insert into public.companies (id, organization_id, company_key, company_name) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'rpc-a', 'Synthetic Company A'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'rpc-b', 'Synthetic Company B'),
  ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000002', 'rpc-c', 'Synthetic Company C');
insert into public.user_roles (user_id, organization_id, company_id, role_key) values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'hr_admin'),
  ('91000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'hr_admin');

create function pg_temp.submit(
  batch_number integer,
  rows jsonb,
  company_number integer default 1,
  dataset text default 'department_master'
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.submit_peoplepulse_import_batch(
    ids.batch_id, ids.company_id, dataset, null,
    pg_catalog.jsonb_build_object('payloadHash', pg_catalog.repeat('a', 64)),
    case when pg_catalog.jsonb_typeof(rows) = 'array' then (
      select coalesce(pg_catalog.jsonb_agg(
        case when pg_catalog.jsonb_typeof(item) = 'object' then item ||
          pg_catalog.jsonb_build_object('company_id', ids.company_id, 'source_batch_id', ids.batch_id)
        else item end order by ordinality), '[]'::jsonb)
      from pg_catalog.jsonb_array_elements(rows) with ordinality as data(item, ordinality)
    ) else rows end
  )
  from (select
    ('94000000-0000-4000-8000-' || pg_catalog.lpad(batch_number::text, 12, '0'))::uuid as batch_id,
    ('93000000-0000-4000-8000-' || pg_catalog.lpad(company_number::text, 12, '0'))::uuid as company_id
  ) ids;
$$;

select ok(not has_function_privilege('anon', 'public.submit_peoplepulse_import_batch(uuid,uuid,text,date,jsonb,jsonb)', 'EXECUTE'), 'Anon has no execute grant');
select ok(not pg_has_role('authenticated', 'peoplepulse_import_executor', 'MEMBER'), 'Authenticated sessions cannot assume the executor role');
select ok((select not rolcanlogin and not rolbypassrls from pg_roles where rolname = 'peoplepulse_import_executor'), 'Executor has no login or RLS bypass');
select ok(
  not exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
      and (has_table_privilege('authenticated', oid, 'truncate')
        or has_table_privilege('authenticated', oid, 'trigger')
        or has_table_privilege('authenticated', oid, 'references'))
  ),
  'Authenticated users have no table privileges that bypass or alter row-level policy enforcement'
);
select ok(
  not has_table_privilege('authenticated', 'public.role_permissions', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.app_roles', 'insert,update,delete'),
  'Authenticated users have read-only access to role definitions'
);

-- Model a row already approved by the pre-cutover workflow.
alter table public.import_batches disable trigger user;
insert into public.import_batches (id, company_id, dataset_type, status)
values ('94000000-0000-4000-8000-000000000009', '93000000-0000-4000-8000-000000000001', 'department_master', 'Approved');
alter table public.import_batches enable trigger user;

set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","exp":1}';
select throws_ok($$select pg_temp.submit(1, '[{}]')$$, '42501', null, 'Expired claims are rejected');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","exp":4102444800,"is_anonymous":true}';
select throws_ok($$select pg_temp.submit(1, '[{}]')$$, '42501', null, 'Anonymous Auth identity is rejected');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000002","exp":4102444800}';
select throws_ok($$select pg_temp.submit(1, '[{}]')$$, '42501', null, 'User without assignments cannot submit');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","exp":4102444800}';
select throws_ok($$select pg_temp.submit(1, '[{}]', 2)$$, '42501', null, 'Other company in same organization is denied');
select throws_ok($$select pg_temp.submit(1, '[{}]', 3)$$, '42501', null, 'Other organization is denied');
select throws_ok($$select pg_temp.submit(1, '{}')$$, '22023', null, 'Rows must be an array');
select throws_ok($$select pg_temp.submit(1, '[1]')$$, '22023', 'Every import row must be a JSON object.', 'Scalar rows are rejected before field iteration');
select throws_ok($$select pg_temp.submit(1, '[{"department_name":{"nested":"value"}}]')$$, '22023', null, 'Nested row values are rejected');
select throws_ok($$select pg_temp.submit(1, (select jsonb_agg('{}'::jsonb) from generate_series(1, 5001)))$$, '22023', 'Import batches are limited to 5000 rows; split the file into smaller batches.', 'Row cap applies at the database');
select throws_ok($$select pg_temp.submit(1, jsonb_build_array(jsonb_build_object('department_name', repeat('a', 8388609))))$$, '22023', 'Serialized import payload exceeds the 8388608 byte limit.', 'Byte cap applies at the database');
select throws_ok($$select pg_temp.submit(1, jsonb_build_array(jsonb_build_object('department_name', repeat('a', 161))))$$, '22023', null, 'Field length cap applies at the database');
select throws_ok(
  $$select pg_temp.submit(1, '[{"employee_id":"95000000-0000-4000-8000-000000000001","effective_from":"2025-01-01"}]', 1, 'employee_history')$$,
  '23503', null, 'Missing employee reference is rejected'
);
select is(pg_temp.submit(1, '[{"department_key":"RPC-OK","department_name":"Synthetic Department"}]') ->> 'status', 'Validated', 'Valid import stops at Validated');
select ok(
  (select atomic_submission from public.import_batches where id = '94000000-0000-4000-8000-000000000001'),
  'A successful RPC batch records trusted submission provenance'
);
select throws_ok(
  $$insert into public.import_batches (company_id, dataset_type) values ('93000000-0000-4000-8000-000000000001', 'department_master')$$,
  '42501', null, 'Authenticated writer cannot directly create an import batch'
);
select throws_ok(
  $$insert into public.departments (company_id, department_key, department_name, source_batch_id)
    values ('93000000-0000-4000-8000-000000000001','RPC-DIRECT','Synthetic Direct','94000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Authenticated writer cannot directly add a dataset row'
);
select throws_ok(
  $$update public.import_batches set atomic_submission = true where id = '94000000-0000-4000-8000-000000000009'$$,
  '42501', null, 'Authenticated roles cannot set submission provenance'
);
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000002","exp":4102444800}';
reset role;
insert into public.user_roles (user_id, organization_id, role_key) values
  ('91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'super_admin');
set local role authenticated;
select throws_ok(
  $$update public.import_batches set status = 'Published' where id = '94000000-0000-4000-8000-000000000009'$$,
  '42501', 'Legacy batches require administrator reconciliation and cannot advance.',
  'Even a permitted publisher cannot publish a pre-cutover batch'
);
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","exp":4102444800}';
select is(pg_temp.submit(1, '[{"department_key":"RPC-OK","department_name":"Synthetic Department"}]') ->> 'reused', 'true', 'Same key and payload reuse the batch');
select throws_ok($$select pg_temp.submit(1, '[{"department_key":"RPC-OK","department_name":"Changed"}]')$$, '23505', null, 'Reused client hash cannot disguise changed mapped rows');
select is((select count(*) from public.departments where department_key = 'RPC-OK'), 0::bigint, 'Validated import is hidden from dashboard reads');
select throws_ok(
  $$select public.inspect_peoplepulse_import_batch('94000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Uploader cannot independently inspect own batch'
);
select ok(not pg_has_role('authenticated', 'peoplepulse_import_reviewer', 'MEMBER'), 'Browser role cannot assume the private reviewer role');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000003","exp":1}';
select throws_ok(
  $$select public.inspect_peoplepulse_import_batch('94000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Expired reviewer token cannot read staged rows'
);
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000003","exp":4102444800}';
select is(
  public.inspect_peoplepulse_import_batch('94000000-0000-4000-8000-000000000001') #>> '{rows,0,department_key}',
  'RPC-OK', 'Independent scoped reviewer can read the submitted row'
);
select is(
  public.inspect_peoplepulse_import_batch('94000000-0000-4000-8000-000000000001', 50) -> 'rows',
  '[]'::jsonb, 'Inspection respects page offset'
);
select throws_ok(
  $$select public.inspect_peoplepulse_import_batch('94000000-0000-4000-8000-000000000009')$$,
  '42501', null, 'Pre-cutover batches are unavailable through inspection'
);
select is((select count(*) from public.departments where department_key = 'RPC-OK'), 0::bigint, 'Reviewer dashboard still cannot see staged rows');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","exp":4102444800}';
select throws_ok(
  $$select pg_temp.submit(2, '[{"department_key":"RPC-ROLLBACK","department_name":"Synthetic"},{"department_key":"RPC-OK","department_name":"Duplicate"}]')$$,
  '23505', null, 'Duplicate in a later row fails the entire submission'
);
reset role;
select ok(
  not exists (select 1 from public.import_batches where id = '94000000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.departments where department_key = 'RPC-ROLLBACK')
  and not exists (select 1 from public.audit_logs where entity_id = '94000000-0000-4000-8000-000000000002'),
  'Failed submission rolls back batch, data and audit rows'
);
select * from finish();
rollback;

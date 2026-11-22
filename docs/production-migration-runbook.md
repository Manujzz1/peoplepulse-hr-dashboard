# Production migration runbook

**NO-GO pending independently verified recovery and explicit owner authorization.** This runbook has been prepared for review. Keep live imports disabled, leave the draft PR unmerged, and perform this database change separately from any Vercel deployment.

1. Match the exact release SHA and the four ordered file checksums in [the security verification](final-security-verification.md#exact-production-sql-package). Use LF bytes from the reviewed Git blobs for the checksum comparison. Review the restore sign-off and record the approved window, operator and migration method. Confirm the protected connection identifies the production project outside this workspace.
2. Run the read-only checks below in the approved window. Expect the six baseline migrations only on first application. Investigate unexpected versions, unpublished batches, over-allocation or schema exposure before proceeding.
3. Apply the four reviewed files using the approved migration runner with history tracking. Review its pending list and stop unless the exact four are listed. Apply in order `20261121235346`, `20261121235434`, `20261122010333`, `20261122015125`. Confirm the runner's transaction and history semantics in isolation first. Treat the files as versioned, one-time migrations.
4. Repeat the checks and verify that the four versions are recorded, grants match the reviewed scope, both public RPCs are invoker wrappers, private roles have no login or RLS bypass, and the Data API excludes `private`. Compare definitions and ownership against the reviewed files. Exercise mutations only in the synthetic stack.
5. If execution fails, stop, retain the error and recorded versions, and identify the last committed migration. The submit endpoint may exist before the third migration closes legacy writes. Keep live imports disabled and request separate approval for a targeted execute revoke or forward fix if needed. Preserve audit history and reconcile writes before any separately approved restore. Frontend rollback does not reverse database migrations.

For the reviewed Supabase CLI v3 workflow, first confirm the installed CLI exposes these flags with `supabase db push --help`. Run only from the approved release checkout, with owner credentials provided through the approved secret store. Validate the plan before running the apply command. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push)

```powershell
# Plan in the approved window.
supabase db push --remote=moxnyczdleagujjxwncw --dry-run --skip-vault
# Apply only after the approved operator verifies the exact plan.
supabase db push --remote=moxnyczdleagujjxwncw --skip-vault
```

Run the catalog checks in a protected psql session against the approved target.

```sql
begin read only;
select version from supabase_migrations.schema_migrations order by version;
select rolname, rolcanlogin, rolbypassrls from pg_roles
where rolname in ('peoplepulse_import_executor', 'peoplepulse_import_reviewer');
select count(*) as public_tables_without_rls from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select status, count(*) from public.import_batches group by status;
select count(*) as overallocated_employee_months
from (
  select company_id, employee_id, reporting_month
  from public.project_allocations
  group by company_id, employee_id, reporting_month
  having sum(allocation_percentage) > 100
) as exceptions;
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
  and (privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
       or table_name in ('import_batches', 'import_errors', 'app_roles', 'role_permissions'))
order by table_name, privilege_type;
select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proconfig, pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in ('submit_peoplepulse_import_batch', 'inspect_peoplepulse_import_batch',
                    'read_import_review', 'enforce_atomic_import_origin', 'enforce_project_allocation_limit');
rollback;
```

Record only aggregate counts and catalog evidence in the release record. Keep data and connection details out of Git and CI.

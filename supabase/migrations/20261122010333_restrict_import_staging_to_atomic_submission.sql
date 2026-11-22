begin;

-- This role has no login, cannot bypass RLS, and owns no data tables.
create role peoplepulse_import_executor nologin inherit nobypassrls;
grant authenticated to peoplepulse_import_executor;
grant peoplepulse_import_executor to current_user;
grant usage on schema public, auth to peoplepulse_import_executor;
grant execute on function auth.uid(), auth.jwt() to peoplepulse_import_executor;

-- Hosted Supabase default grants can include privileges that do not follow RLS.
revoke truncate, trigger, references on all tables in schema public from public, anon, authenticated;
revoke insert, update, delete on public.app_roles, public.role_permissions from public, anon, authenticated;

alter table public.import_batches add column atomic_submission boolean not null default false;
revoke insert, update, delete on public.import_batches from public, anon, authenticated;
grant update (status) on public.import_batches to authenticated;
grant insert, update on public.import_batches to peoplepulse_import_executor;

do $$
declare
  dataset_table text;
begin
  foreach dataset_table in array array[
    'employees', 'employee_history', 'payroll_records', 'attendance_records', 'leave_records',
    'performance_reviews', 'increments', 'project_allocations', 'projects', 'departments',
    'locations', 'recruitment_records', 'contract_manpower', 'budget_records'
  ] loop
    execute pg_catalog.format(
      'revoke insert, update, delete on public.%I from public, anon, authenticated', dataset_table
    );
    execute pg_catalog.format(
      'grant insert on public.%I to peoplepulse_import_executor', dataset_table
    );
  end loop;
end;
$$;

create function private.enforce_atomic_import_origin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.atomic_submission := current_user = 'peoplepulse_import_executor';
  elsif new.atomic_submission is distinct from old.atomic_submission then
    raise exception 'Import submission origin is immutable.' using errcode = '23514';
  elsif new.status is distinct from old.status
    and new.status in ('Uploaded', 'Validated')
    and current_user <> 'peoplepulse_import_executor' then
    raise exception 'Use the atomic submission endpoint to stage and validate imports.' using errcode = '42501';
  elsif new.status is distinct from old.status
    and new.status in ('Reviewed', 'Approved', 'Published')
    and not old.atomic_submission then
    raise exception 'Legacy batches require administrator reconciliation and cannot advance.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_atomic_import_origin() from public, anon, authenticated, service_role;
create trigger import_batch_atomic_origin_trigger
before insert or update on public.import_batches
for each row execute function private.enforce_atomic_import_origin();

-- Keep the public entry point invoker-only. The private body runs under the
-- narrowly granted executor, with caller JWT checks and existing RLS intact.
alter function public.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb)
  set schema private;
alter function private.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb)
  rename to execute_atomic_import;
alter function private.execute_atomic_import(uuid, uuid, text, date, jsonb, jsonb)
  security definer;
grant create on schema private to peoplepulse_import_executor;
alter function private.execute_atomic_import(uuid, uuid, text, date, jsonb, jsonb)
  owner to peoplepulse_import_executor;
revoke create on schema private from peoplepulse_import_executor;
revoke all on function private.execute_atomic_import(uuid, uuid, text, date, jsonb, jsonb) from public, anon, service_role;
grant execute on function private.execute_atomic_import(uuid, uuid, text, date, jsonb, jsonb) to authenticated;

create function public.submit_peoplepulse_import_batch(
  target_batch_id uuid,
  target_company_id uuid,
  target_dataset_type text,
  target_reporting_month date,
  target_metadata jsonb,
  target_rows jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.execute_atomic_import(
    target_batch_id, target_company_id, target_dataset_type,
    target_reporting_month, target_metadata, target_rows
  );
$$;

revoke all on function public.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb) to authenticated;

commit;

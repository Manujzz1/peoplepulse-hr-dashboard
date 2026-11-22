begin;

create role peoplepulse_import_reviewer nologin noinherit nobypassrls;
grant peoplepulse_import_reviewer to current_user;
grant usage on schema public, private to peoplepulse_import_reviewer;
grant execute on function private.has_company_permission(uuid, text, uuid) to peoplepulse_import_reviewer;
revoke insert, update, delete on public.import_errors from public, anon, authenticated;
grant select on public.import_batches, public.import_errors to peoplepulse_import_reviewer;

create function private.import_review_actor()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'is_anonymous' = 'true'::jsonb, false) then null::uuid
    when pg_catalog.jsonb_typeof(auth.jwt() -> 'exp') is distinct from 'number' then null::uuid
    when (auth.jwt() ->> 'exp')::numeric <= extract(epoch from pg_catalog.statement_timestamp()) then null::uuid
    else auth.uid()
  end;
$$;
revoke all on function private.import_review_actor() from public, anon, authenticated, service_role;
grant execute on function private.import_review_actor() to peoplepulse_import_reviewer;

create policy import_batches_independent_review on public.import_batches
for select to peoplepulse_import_reviewer using (
  atomic_submission
  and status in ('Validated', 'Reviewed')
  and uploaded_by <> (select private.import_review_actor())
  and private.has_company_permission(company_id, 'imports.read', department_id)
  and private.has_company_permission(company_id, 'imports.review', department_id)
);

create function private.import_review_datasets()
returns table(dataset text, table_name text, read_permission text, department_column text)
language sql immutable set search_path = ''
as $$
  values
    ('department_master','departments','employee.read','id'),
    ('location_master','locations','employee.read',null),
    ('employee_master','employees','employee.read','department_id'),
    ('employee_history','employee_history','employee.read','department_id'),
    ('project_master','projects','projects.read','department_id'),
    ('payroll','payroll_records','payroll.read','department_id'),
    ('attendance','attendance_records','attendance.read','department_id'),
    ('leave','leave_records','leave.read','department_id'),
    ('performance','performance_reviews','performance.read','department_id'),
    ('increment','increments','increments.read','department_id'),
    ('project_allocation','project_allocations','projects.read','department_id'),
    ('recruitment','recruitment_records','recruitment.read','department_id'),
    ('contract_manpower','contract_manpower','contracts.read','department_id'),
    ('hr_budget','budget_records','budget.read','department_id');
$$;
revoke all on function private.import_review_datasets() from public, anon, authenticated, service_role;
grant execute on function private.import_review_datasets() to peoplepulse_import_reviewer;

do $$
declare
  rule record;
  row_department text;
begin
  for rule in select * from private.import_review_datasets() loop
    row_department := case when rule.department_column is null then 'null::uuid'
      else pg_catalog.format('%I.%I', rule.table_name, rule.department_column) end;
    execute pg_catalog.format('grant select on public.%I to peoplepulse_import_reviewer', rule.table_name);
    execute pg_catalog.format(
      'create policy independent_import_review on public.%1$I for select to peoplepulse_import_reviewer
       using (private.has_company_permission(%1$I.company_id, %2$L, %3$s)
         and exists (select 1 from public.import_batches b
           where b.id = %1$I.source_batch_id and b.company_id = %1$I.company_id
             and b.dataset_type = %4$L and (b.department_id is null or b.department_id = %3$s)))',
      rule.table_name, rule.read_permission, row_department, rule.dataset
    );
  end loop;
end;
$$;

create policy independent_import_review on public.import_errors
for select to peoplepulse_import_reviewer using (
  exists (select 1 from public.import_batches b join private.import_review_datasets() d on d.dataset = b.dataset_type
    where b.id = import_errors.batch_id and b.company_id = import_errors.company_id
      and (b.department_id is null or b.department_id = import_errors.department_id)
      and private.has_company_permission(b.company_id, d.read_permission, import_errors.department_id))
);

create function private.read_import_review(target_batch_id uuid, page_offset integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  batch public.import_batches%rowtype;
  dataset record;
  row_page jsonb;
  error_page jsonb;
begin
  if page_offset is null or page_offset < 0 or page_offset >= 100000 then
    raise exception 'Invalid review page.' using errcode = '22023';
  end if;
  select * into batch from public.import_batches b where b.id = target_batch_id;
  if not found then
    raise exception 'Import review is unavailable.' using errcode = '42501';
  end if;
  select * into dataset from private.import_review_datasets() d where d.dataset = batch.dataset_type;
  if not found or not private.has_company_permission(batch.company_id, dataset.read_permission, batch.department_id) then
    raise exception 'Import review is unavailable.' using errcode = '42501';
  end if;

  execute pg_catalog.format(
    'select coalesce(jsonb_agg(to_jsonb(r) - array[''id'',''company_id'',''source_batch_id'',''created_at'',''updated_at''] order by r.id), ''[]''::jsonb)
     from (select * from public.%I where company_id = $1 and source_batch_id = $2 order by id limit 51 offset $3) r',
    dataset.table_name
  ) into row_page using batch.company_id, batch.id, page_offset;

  select coalesce(jsonb_agg(jsonb_build_object('row', e.source_row, 'severity', e.severity,
    'field', e.field_name, 'message', e.message) order by e.source_row, e.id), '[]'::jsonb)
  into error_page
  from (select id, source_row, severity, field_name, message from public.import_errors
    where company_id = batch.company_id and batch_id = batch.id
    order by source_row, id limit 51 offset page_offset) e;

  return jsonb_build_object('rows', row_page - 50, 'issues', error_page - 50,
    'hasMore', jsonb_array_length(row_page) > 50 or jsonb_array_length(error_page) > 50);
end;
$$;

grant create on schema private to peoplepulse_import_reviewer;
alter function private.read_import_review(uuid, integer) owner to peoplepulse_import_reviewer;
revoke create on schema private from peoplepulse_import_reviewer;
revoke all on function private.read_import_review(uuid, integer) from public, anon, service_role;
grant execute on function private.read_import_review(uuid, integer) to authenticated;

create function public.inspect_peoplepulse_import_batch(target_batch_id uuid, page_offset integer default 0)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select private.read_import_review(target_batch_id, page_offset);
$$;
revoke all on function public.inspect_peoplepulse_import_batch(uuid, integer) from public, anon, service_role;
grant execute on function public.inspect_peoplepulse_import_batch(uuid, integer) to authenticated;

commit;

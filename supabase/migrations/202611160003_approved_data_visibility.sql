begin;

-- Every dashboard source row written through the authenticated API must be
-- attached to a batch. Seed rows inserted by the local database owner remain
-- visible with a null batch id; authenticated users cannot write such rows.
alter table public.departments add column source_batch_id uuid;
alter table public.locations add column source_batch_id uuid;
alter table public.employees add column source_batch_id uuid;
alter table public.employee_history add column source_batch_id uuid;
alter table public.projects add column source_batch_id uuid;

alter table public.departments add constraint departments_source_batch_fk
  foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.locations add constraint locations_source_batch_fk
  foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.employees add constraint employees_source_batch_fk
  foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.employee_history add constraint employee_history_source_batch_fk
  foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.projects add constraint projects_source_batch_fk
  foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;

create or replace function private.is_published_import_batch(target_company_id uuid, target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_batch_id is not null and exists (
    select 1 from public.import_batches b
    where b.company_id = target_company_id
      and b.id = target_batch_id
      and b.status = 'Published'
  );
$$;

create or replace function private.can_write_import_row(
  target_company_id uuid,
  target_batch_id uuid,
  expected_dataset_type text,
  target_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and target_batch_id is not null and exists (
    select 1 from public.import_batches b
    where b.company_id = target_company_id
      and b.id = target_batch_id
      and b.dataset_type = expected_dataset_type
      and b.status = 'Uploaded'
      and b.uploaded_by = (select auth.uid())
      and (b.department_id is null or b.department_id = target_department_id)
      and private.has_company_permission(target_company_id, 'imports.write', target_department_id)
  );
$$;

revoke all on function private.is_published_import_batch(uuid, uuid) from public, anon;
revoke all on function private.can_write_import_row(uuid, uuid, text, uuid) from public, anon;
grant execute on function private.is_published_import_batch(uuid, uuid) to authenticated;
grant execute on function private.can_write_import_row(uuid, uuid, text, uuid) to authenticated;

do $$
declare
  item record;
  department_expression text;
begin
  for item in
    select * from (values
      ('departments','employee.read','employee.write','department_master','id'),
      ('locations','employee.read','employee.write','location_master','null::uuid'),
      ('employees','employee.read','employee.write','employee_master','department_id'),
      ('employee_history','employee.read','employee.write','employee_master','department_id'),
      ('projects','projects.read','projects.write','project_master','department_id'),
      ('payroll_records','payroll.read','payroll.write','payroll','department_id'),
      ('attendance_records','attendance.read','attendance.write','attendance','department_id'),
      ('leave_records','leave.read','leave.write','leave','department_id'),
      ('performance_reviews','performance.read','performance.write','performance','department_id'),
      ('increments','increments.read','increments.write','increment','department_id'),
      ('project_allocations','projects.read','projects.write','project_allocation','department_id'),
      ('recruitment_records','recruitment.read','recruitment.write','recruitment','department_id'),
      ('contract_manpower','contracts.read','contracts.write','contract_manpower','department_id'),
      ('budget_records','budget.read','budget.write','hr_budget','department_id')
    ) as rules(table_name, read_permission, write_permission, dataset_type, department_column)
  loop
    department_expression := item.department_column;

    execute format('drop policy if exists %I on public.%I', item.table_name || '_read', item.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        private.has_company_permission(company_id, %L, %s)
        and (source_batch_id is null or private.is_published_import_batch(company_id, source_batch_id))
      )',
      item.table_name || '_read', item.table_name, item.read_permission, department_expression
    );

    execute format('drop policy if exists %I on public.%I', item.table_name || '_write', item.table_name);
    execute format('drop policy if exists %I on public.%I', item.table_name || '_batch_insert', item.table_name);
    execute format('drop policy if exists %I on public.%I', item.table_name || '_batch_update', item.table_name);
    execute format('drop policy if exists %I on public.%I', item.table_name || '_batch_delete', item.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated
        with check (private.has_company_permission(company_id, %L, %s)
          and private.can_write_import_row(company_id, source_batch_id, %L, %s))',
      item.table_name || '_batch_insert', item.table_name,
      item.write_permission, department_expression, item.dataset_type, department_expression
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
        using (private.has_company_permission(company_id, %L, %s)
          and private.can_write_import_row(company_id, source_batch_id, %L, %s))
        with check (private.has_company_permission(company_id, %L, %s)
          and private.can_write_import_row(company_id, source_batch_id, %L, %s))',
      item.table_name || '_batch_update', item.table_name,
      item.write_permission, department_expression, item.dataset_type, department_expression,
      item.write_permission, department_expression, item.dataset_type, department_expression
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
        using (private.has_company_permission(company_id, %L, %s)
          and private.can_write_import_row(company_id, source_batch_id, %L, %s))',
      item.table_name || '_batch_delete', item.table_name,
      item.write_permission, department_expression, item.dataset_type, department_expression
    );
  end loop;
end $$;

commit;

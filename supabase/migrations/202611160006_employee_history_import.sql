begin;

alter table public.employee_history
  add column grade text,
  add column manager_employee_id uuid,
  add column cost_center text,
  add constraint employee_history_manager_fk
    foreign key (company_id, manager_employee_id) references public.employees(company_id, id) on delete restrict,
  add constraint employee_history_manager_not_self_check
    check (manager_employee_id is null or manager_employee_id <> employee_id);

create index employee_history_manager_idx on public.employee_history (company_id, manager_employee_id) where manager_employee_id is not null;
create unique index employee_history_effective_start_unique_idx on public.employee_history (company_id, employee_id, effective_from);

alter table public.import_batches drop constraint if exists import_batches_dataset_type_check;
alter table public.import_batches add constraint import_batches_dataset_type_check check (dataset_type in (
  'employee_master', 'employee_history', 'payroll', 'attendance', 'leave', 'performance', 'increment',
  'project_allocation', 'project_master', 'department_master', 'location_master', 'exit_records',
  'recruitment', 'contract_manpower', 'hr_budget'
));

drop policy if exists employee_history_read on public.employee_history;
drop policy if exists employee_history_write on public.employee_history;
drop policy if exists employee_history_batch_insert on public.employee_history;
drop policy if exists employee_history_batch_update on public.employee_history;
drop policy if exists employee_history_batch_delete on public.employee_history;

create policy employee_history_read on public.employee_history for select to authenticated using (
  private.has_company_permission(company_id, 'employee.read', department_id)
  and (source_batch_id is null or private.is_published_import_batch(company_id, source_batch_id))
);
create policy employee_history_batch_insert on public.employee_history for insert to authenticated with check (
  private.has_company_permission(company_id, 'employee.write', department_id)
  and private.can_write_import_row(company_id, source_batch_id, 'employee_history', department_id)
);
create policy employee_history_batch_update on public.employee_history for update to authenticated using (
  private.has_company_permission(company_id, 'employee.write', department_id)
  and private.can_write_import_row(company_id, source_batch_id, 'employee_history', department_id)
) with check (
  private.has_company_permission(company_id, 'employee.write', department_id)
  and private.can_write_import_row(company_id, source_batch_id, 'employee_history', department_id)
);
create policy employee_history_batch_delete on public.employee_history for delete to authenticated using (
  private.has_company_permission(company_id, 'employee.write', department_id)
  and private.can_write_import_row(company_id, source_batch_id, 'employee_history', department_id)
);

commit;

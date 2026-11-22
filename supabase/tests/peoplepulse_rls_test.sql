begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'hr-admin-a@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'hr-admin-b@example.test'),
  ('81000000-0000-4000-8000-000000000003', 'management-a@example.test'),
  ('81000000-0000-4000-8000-000000000004', 'department-head-a@example.test'),
  ('81000000-0000-4000-8000-000000000005', 'import-reviewer-a@example.test'),
  ('81000000-0000-4000-8000-000000000006', 'import-approver-a@example.test'),
  ('81000000-0000-4000-8000-000000000007', 'super-admin-a@example.test'),
  ('81000000-0000-4000-8000-000000000008', 'super-admin-b@example.test'),
  ('81000000-0000-4000-8000-000000000009', 'unassigned@example.test');

insert into public.organizations (id, organization_key, organization_name) values
  ('82000000-0000-4000-8000-000000000001', 'rls-test-org', 'RLS Test Synthetic Org'),
  ('82000000-0000-4000-8000-000000000002', 'rls-test-org-b', 'RLS Test Synthetic Org B');
insert into public.companies (id, organization_id, company_key, company_name) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'rls-a', 'RLS Synthetic Company A'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'rls-b', 'RLS Synthetic Company B'),
  ('83000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', 'rls-org-b', 'RLS Synthetic Org B Company');
insert into public.departments (id, company_id, department_key, department_name) values
  ('84000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'A-ENG', 'Sample Engineering A'),
  ('84000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', 'A-OPS', 'Sample Operations A'),
  ('84000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000002', 'B-ENG', 'Sample Engineering B'),
  ('84000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000003', 'ORG-B-ENG', 'Sample Org B Engineering');
insert into public.employees (id, company_id, employee_code, employee_name, department_id, hire_date) values
  ('85000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'SYN-A1', 'Synthetic A Employee 1', '84000000-0000-4000-8000-000000000001', '2024-01-01'),
  ('85000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', 'SYN-A2', 'Synthetic A Employee 2', '84000000-0000-4000-8000-000000000002', '2024-01-01'),
  ('85000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000002', 'SYN-B1', 'Synthetic B Employee 1', '84000000-0000-4000-8000-000000000003', '2024-01-01'),
  ('85000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000003', 'SYN-ORG-B', 'Synthetic Org B Employee', '84000000-0000-4000-8000-000000000004', '2024-01-01');
insert into public.payroll_records (company_id, employee_id, department_id, reporting_month, monthly_gross) values
  ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '2025-04-01', 100000),
  ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002', '2025-04-01', 75000),
  ('83000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003', '2025-04-01', 50000);
insert into public.user_roles (user_id, organization_id, company_id, role_key) values
  ('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'hr_admin'),
  ('81000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', 'hr_admin'),
  ('81000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'management'),
  ('81000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'department_head'),
  ('81000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'hr_admin'),
  ('81000000-0000-4000-8000-000000000006', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'hr_admin'),
  ('81000000-0000-4000-8000-000000000007', '82000000-0000-4000-8000-000000000001', null, 'super_admin'),
  ('81000000-0000-4000-8000-000000000008', '82000000-0000-4000-8000-000000000002', null, 'super_admin');
update public.user_roles set department_id = '84000000-0000-4000-8000-000000000001'
where user_id = '81000000-0000-4000-8000-000000000004';

insert into public.projects (id, company_id, department_id, project_code, project_name) values
  ('86000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'SYN-A-P1', 'Synthetic Project A1'),
  ('86000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'SYN-A-P2', 'Synthetic Project A2');

select has_column('public', 'employee_history', 'grade', 'Employee history stores grade changes');
select has_column('public', 'employee_history', 'manager_employee_id', 'Employee history stores manager changes');
select has_column('public', 'employee_history', 'cost_center', 'Employee history stores cost-centre changes');
select throws_ok(
  $$insert into public.employee_history (company_id, employee_id, manager_employee_id, effective_from)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2024-01-01')$$,
  '23514', null,
  'An employee cannot be their own reporting manager in effective history'
);
-- Exercise the staging RLS policies with the database-only executor fixture.
set local role peoplepulse_import_executor;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
select lives_ok(
  $$insert into public.import_batches (company_id, dataset_type)
    values ('83000000-0000-4000-8000-000000000001', 'employee_history')$$,
  'Executor can create an Employee History batch using uploader claims'
);
select lives_ok(
  $$update public.import_batches set status = 'Uploaded'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'employee_history'$$,
  'Uploader can mark the Employee History batch uploaded'
);
select lives_ok(
  $$insert into public.employee_history (company_id, employee_id, department_id, effective_from, source_batch_id)
    select '83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '2024-01-01', id
    from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'employee_history'$$,
  'Uploader can stage effective-dated Employee History against its Uploaded batch'
);
select is(
  (select count(*)::bigint from public.employee_history where effective_from = '2024-01-01'),
  0::bigint,
  'Unpublished Employee History rows are hidden from dashboard reads'
);
reset role;

select has_column('public', 'attendance_records', 'calendar_days', 'Attendance stores employee-eligible calendar days');
select has_column('public', 'attendance_records', 'weekly_off_days', 'Attendance stores weekly-off days');
select has_column('public', 'attendance_records', 'holiday_days', 'Attendance stores holiday days');
select has_column('public', 'attendance_records', 'paid_leave_days', 'Attendance stores paid leave days');
select has_column('public', 'attendance_records', 'unpaid_leave_days', 'Attendance stores unpaid leave days');
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, working_days, present_days)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 20, 21)$$,
  '23514', null,
  'Attendance present days cannot exceed working days'
);
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, working_days, present_days, attendance_percentage)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 22, 21, 90)$$,
  '23514', null,
  'Reported attendance percentage must agree with the day ratio'
);
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, calendar_days, working_days, weekly_off_days, holiday_days)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 30, 22, 8, 1)$$,
  '23514', null,
  'Working days, weekly offs, and holidays cannot exceed eligible calendar days'
);
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, calendar_days, working_days, weekly_off_days, holiday_days)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 31, 22, 8, 0)$$,
  '23514', null,
  'Working days, weekly offs, and holidays must fully reconcile to eligible calendar days'
);
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, working_days, present_days, paid_leave_days)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 20, 19, 2)$$,
  '23514', null,
  'Attendance and paid leave cannot exceed working days'
);
select throws_ok(
  $$insert into public.attendance_records (company_id, employee_id, reporting_month, calendar_days, payable_days)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '2025-05-01', 30, 31)$$,
  '23514', null,
  'Payable days cannot exceed eligible calendar days'
);

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
select results_eq(
  'select employee_code from public.employees order by employee_code',
  array['SYN-A1','SYN-A2']::text[],
  'HR Admin reads every employee in their company and no other company'
);
select results_eq(
  'select sum(monthly_gross)::numeric from public.payroll_records',
  array[175000::numeric],
  'HR Admin can read payroll in their company'
);
select throws_ok(
  $$update public.employees set employee_name = 'Synthetic A Employee 1 Updated' where employee_code = 'SYN-A1' returning employee_code$$,
  '42501', null,
  'HR Admin cannot directly edit employee data outside an uploaded batch'
);
select throws_ok(
  $$update public.employees set employee_name = 'Cross Company Change' where employee_code = 'SYN-B1' returning employee_code$$,
  '42501', null,
  'HR Admin cannot update another company employee'
);
select throws_ok(
  $$delete from public.employees where employee_code = 'SYN-B1' returning employee_code$$,
  '42501', null,
  'HR Admin cannot delete another company employee'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000009';
select is_empty('select employee_code from public.employees', 'Authenticated identity with no role sees no employees');

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000002';
select results_eq(
  'select employee_code from public.employees order by employee_code',
  array['SYN-B1']::text[],
  'Second company HR Admin is isolated to their company'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000004';
select results_eq(
  'select employee_code from public.employees order by employee_code',
  array['SYN-A1']::text[],
  'Department Head is scoped to the assigned department'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';
select results_eq(
  'select count(*)::bigint from public.payroll_records',
  array[0::bigint],
  'Management cannot read employee-level payroll rows'
);

select ok(not has_table_privilege('anon', 'public.payroll_records', 'SELECT'), 'Anonymous role has no payroll table grant');
select ok(not has_table_privilege('anon', 'public.employees', 'SELECT'), 'Anonymous role has no employee table grant');
select ok(not has_table_privilege('anon', 'public.import_batches', 'SELECT'), 'Anonymous role has no import workflow table grant');
select ok(not has_table_privilege('anon', 'public.organizations', 'SELECT'), 'Anonymous role has no organization table grant');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE'), 'Authenticated role cannot update audit rows');
select ok((select relrowsecurity from pg_class where oid = 'public.employees'::regclass), 'Employee master has row-level security enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.payroll_records'::regclass), 'Payroll records have row-level security enabled');

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.user_roles (user_id, organization_id, company_id, role_key)
    values ('81000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', null, 'super_admin')$$,
  '42501', null,
  'HR Admin cannot grant a Super Admin role'
);

set local role peoplepulse_import_executor;
select lives_ok(
  $$insert into public.import_batches (company_id, dataset_type, reporting_month)
    values ('83000000-0000-4000-8000-000000000001', 'payroll', '2025-05-01')$$,
  'Executor can open a Draft import batch using the HR Admin claims'
);
select results_eq(
  $$update public.import_batches set status = 'Uploaded'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'
    returning uploaded_by::text$$,
  array['81000000-0000-4000-8000-000000000001']::text[],
  'Upload actor is captured from the authenticated user'
);
select throws_ok(
  $$insert into public.payroll_records (company_id, employee_id, department_id, reporting_month, monthly_gross)
    values ('83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '2025-05-01', 100000)$$,
  '42501', null,
  'Payroll writes without an import batch are rejected'
);
select lives_ok(
  $$insert into public.payroll_records (company_id, employee_id, department_id, reporting_month, monthly_gross, source_batch_id)
    select '83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '2025-05-01', 100000, id
    from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  'Uploader can stage payroll rows only against their matching Uploaded batch'
);
select results_eq(
  'select count(*)::bigint from public.payroll_records where reporting_month = ''2025-05-01''',
  array[0::bigint],
  'Unpublished payroll rows are hidden from dashboard reads'
);
select throws_ok(
  $$update public.import_batches set department_id = '84000000-0000-4000-8000-000000000002'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '23514', 'Import batch identity fields cannot be changed.',
  'Import department scope is immutable after batch creation'
);
set local role authenticated;
select throws_ok(
  $$update public.import_batches set status = 'Rejected'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', 'The uploader cannot reject their own import.',
  'Uploader cannot self-reject their import'
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000005';
select throws_ok(
  $$update public.import_batches set status = 'Validated'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', null,
  'A different HR Admin cannot validate the uploader’s batch'
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
set local role peoplepulse_import_executor;
select lives_ok(
  $$update public.import_batches set total_rows = 2, accepted_rows = 1, rejected_rows = 1, status = 'Validated'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  'Uploader can validate and reconcile row counts'
);
set local role authenticated;
select throws_ok(
  $$update public.import_batches set status = 'Reviewed'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', null,
  'Uploader cannot review their own import'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000005';
select lives_ok(
  $$update public.import_batches set status = 'Reviewed'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  'A second HR Admin can review the validated import'
);
select throws_ok(
  $$update public.import_batches set status = 'Approved'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', null,
  'Reviewer cannot approve the same import'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000006';
select lives_ok(
  $$update public.import_batches set status = 'Approved'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  'A distinct HR Admin can approve a reviewed import'
);
select throws_ok(
  $$update public.import_batches set status = 'Published'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', null,
  'HR Admin cannot publish an approved import'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000007';
select lives_ok(
  $$update public.import_batches set status = 'Published'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  'Super Admin can publish an approved import'
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
select results_eq(
  'select count(*)::bigint from public.payroll_records where reporting_month = ''2025-05-01''',
  array[1::bigint],
  'Published payroll rows become visible to authorised dashboard readers'
);
select throws_ok(
  $$update public.payroll_records set monthly_gross = 1 where reporting_month = '2025-05-01' returning id$$,
  '42501', null,
  'Published payroll rows cannot be edited through the authenticated API'
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000007';
select throws_ok(
  $$update public.import_batches set metadata = '{"edited":true}'::jsonb
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01'$$,
  '42501', null,
  'Authenticated publishers cannot edit published import metadata'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs
    where entity_type = 'import_batch'
      and entity_id = (select id::text from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'payroll' and reporting_month = '2025-05-01')$$,
  array[5::bigint],
  'Each successful import state transition is recorded in the audit log'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.employees (company_id, employee_code, employee_name, department_id, hire_date)
    values ('83000000-0000-4000-8000-000000000001', 'SYN-A3', 'Synthetic A Employee 3', '84000000-0000-4000-8000-000000000001', '2025-05-01')$$,
  '42501', null,
  'Employee master writes without an import batch are rejected'
);
set local role peoplepulse_import_executor;
select lives_ok(
  $$insert into public.import_batches (company_id, dataset_type)
    values ('83000000-0000-4000-8000-000000000001', 'employee_master')$$,
  'Executor can create an Employee Master batch using uploader claims'
);
select lives_ok(
  $$update public.import_batches set status = 'Uploaded'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'employee_master'$$,
  'Uploader can open Employee Master for staging'
);
select lives_ok(
  $$insert into public.employees (company_id, employee_code, employee_name, department_id, hire_date, source_batch_id)
    select '83000000-0000-4000-8000-000000000001', 'SYN-A3', 'Synthetic A Employee 3', '84000000-0000-4000-8000-000000000001', '2025-05-01', id
      from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'employee_master'$$,
  'Uploader can stage employee master rows against an Uploaded batch'
);
select results_eq(
  $$select count(*)::bigint from public.employees where employee_code = 'SYN-A3'$$,
  array[0::bigint],
  'Unpublished employee master rows are hidden from roster reads'
);

select lives_ok(
  $$insert into public.import_batches (company_id, dataset_type, reporting_month)
    values ('83000000-0000-4000-8000-000000000001', 'project_allocation', '2025-05-01')$$,
  'Executor can create a project allocation batch using uploader claims'
);
select lives_ok(
  $$update public.import_batches set status = 'Uploaded'
    where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'project_allocation' and reporting_month = '2025-05-01'$$,
  'Uploader can open the project allocation batch for staging'
);
select lives_ok(
  $$insert into public.project_allocations (company_id, employee_id, department_id, project_id, reporting_month, allocation_percentage, source_batch_id)
    select '83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', '2025-05-01', 70, id
      from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'project_allocation' and reporting_month = '2025-05-01'$$,
  'A first monthly project allocation can be staged without reading it back'
);
select is_empty(
  $$select id from public.project_allocations where reporting_month = '2025-05-01'$$,
  'Allocation enforcement keeps staged rows invisible to employee reporting'
);
select throws_ok(
  $$insert into public.project_allocations (company_id, employee_id, department_id, project_id, reporting_month, allocation_percentage, source_batch_id)
    select '83000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000002', '2025-05-01', 40, id
      from public.import_batches where company_id = '83000000-0000-4000-8000-000000000001' and dataset_type = 'project_allocation' and reporting_month = '2025-05-01'$$,
  '23514',
  'Combined project allocation for employee and month exceeds 100 percent.',
  'Database rejects allocations above 100 percent'
);

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000007';
select results_eq(
  'select organization_key from public.organizations order by organization_key',
  array['rls-test-org']::text[],
  'Organization Super Admin can read only their own organization'
);
select results_eq(
  'select company_key from public.companies order by company_key',
  array['rls-a','rls-b']::text[],
  'Organization Super Admin can read companies in their organization only'
);
select results_eq(
  'select employee_code from public.employees order by employee_code',
  array['SYN-A1','SYN-A2','SYN-B1']::text[],
  'Organization Super Admin reads employees across own companies only'
);
select is_empty(
  $$select employee_code from public.employees where employee_code = 'SYN-ORG-B'$$,
  'Organization Super Admin cannot read another organization employee'
);
select is_empty(
  $$select company_key from public.companies where company_key = 'rls-org-b'$$,
  'Organization Super Admin cannot read another organization company'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000008';
select results_eq(
  'select organization_key from public.organizations order by organization_key',
  array['rls-test-org-b']::text[],
  'Second Organization Super Admin is limited to the second organization'
);
select results_eq(
  'select employee_code from public.employees order by employee_code',
  array['SYN-ORG-B']::text[],
  'Second Organization Super Admin sees only its own employee data'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000007';
select throws_ok(
  $$insert into public.user_roles (user_id, organization_id, company_id, role_key)
    values ('81000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', null, 'hr_admin')$$,
  '42501', null,
  'Organization Super Admin cannot assign roles in another organization'
);

select * from finish();
rollback;

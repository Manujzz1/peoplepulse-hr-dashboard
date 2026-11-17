begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_key text not null unique,
  organization_name text not null,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_key text not null,
  company_name text not null,
  currency_code char(3) not null default 'INR',
  reporting_calendar text not null default 'APR_MAR' check (reporting_calendar in ('APR_MAR', 'JAN_DEC')),
  created_at timestamptz not null default now(),
  unique (organization_id, company_key),
  unique (organization_id, id)
);

create table public.app_roles (
  role_key text primary key,
  display_name text not null unique
);

create table public.role_permissions (
  role_key text not null references public.app_roles(role_key) on delete cascade,
  permission_key text not null,
  primary key (role_key, permission_key)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_key text not null,
  department_name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, department_key),
  unique (company_id, id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  location_key text not null,
  location_name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, location_key),
  unique (company_id, id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id uuid,
  department_id uuid,
  role_key text not null references public.app_roles(role_key) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (department_id is null or company_id is not null),
  foreign key (organization_id, company_id) references public.companies(organization_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);
create index user_roles_lookup_idx on public.user_roles (user_id, organization_id, company_id, role_key) where active;
create unique index user_roles_scope_unique_idx on public.user_roles (
  user_id, organization_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), role_key
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_code text not null,
  employee_name text not null,
  department_id uuid,
  location_id uuid,
  designation text,
  grade text,
  employment_type text check (employment_type is null or employment_type in ('Permanent', 'Contract', 'Intern', 'Other')),
  hire_date date not null,
  exit_date date,
  manager_employee_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exit_date is null or exit_date >= hire_date),
  unique (company_id, employee_code),
  unique (company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict,
  foreign key (company_id, location_id) references public.locations(company_id, id) on delete restrict,
  foreign key (company_id, manager_employee_id) references public.employees(company_id, id) on delete restrict
);
create index employees_company_department_idx on public.employees (company_id, department_id);
create index employees_company_location_idx on public.employees (company_id, location_id);

create table public.employee_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  location_id uuid,
  designation text,
  employment_type text,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict,
  foreign key (company_id, location_id) references public.locations(company_id, id) on delete restrict
);
create index employee_history_lookup_idx on public.employee_history (company_id, employee_id, effective_from desc);

create table public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  monthly_gross numeric(14,2) not null check (monthly_gross >= 0),
  annual_ctc numeric(16,2) check (annual_ctc is null or annual_ctc >= 0),
  components jsonb not null default '{}'::jsonb check (jsonb_typeof(components) = 'object'),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, reporting_month),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);
create index payroll_month_department_idx on public.payroll_records (company_id, reporting_month, department_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  working_days numeric(6,2) check (working_days is null or working_days >= 0),
  present_days numeric(6,2) check (present_days is null or present_days >= 0),
  attendance_percentage numeric(5,2) check (attendance_percentage is null or attendance_percentage between 0 and 100),
  lop_days numeric(6,2) not null default 0 check (lop_days >= 0),
  payable_days numeric(6,2) check (payable_days is null or payable_days >= 0),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, reporting_month),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.leave_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  leave_type text not null,
  opening_balance numeric(8,2) check (opening_balance is null or opening_balance >= 0),
  days_availed numeric(8,2) not null default 0 check (days_availed >= 0),
  days_credited numeric(8,2) not null default 0 check (days_credited >= 0),
  closing_balance numeric(8,2) check (closing_balance is null or closing_balance >= 0),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, reporting_month, leave_type),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  review_period text not null,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  score numeric(4,2) not null check (score between 0 and 5),
  performance_category text,
  approval_status text not null default 'Pending' check (approval_status in ('Pending', 'Approved', 'Rejected')),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, review_period),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.increments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  effective_date date not null,
  current_ctc numeric(16,2) not null check (current_ctc >= 0),
  revised_ctc numeric(16,2) not null check (revised_ctc >= 0),
  increment_amount numeric(14,2) generated always as (revised_ctc - current_ctc) stored,
  increment_percentage numeric(7,3) check (increment_percentage is null or increment_percentage >= 0),
  approval_status text not null default 'Pending' check (approval_status in ('Pending', 'Approved', 'Rejected')),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  check (revised_ctc >= current_ctc),
  unique (company_id, employee_id, effective_date),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_id uuid,
  project_code text not null,
  project_name text not null,
  status text not null default 'Active' check (status in ('Active', 'On Hold', 'Closed')),
  created_at timestamptz not null default now(),
  unique (company_id, project_code),
  unique (company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.project_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  department_id uuid,
  project_id uuid not null,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  allocation_percentage numeric(5,2) not null check (allocation_percentage between 0 and 100),
  monthly_gross_cost numeric(14,2) check (monthly_gross_cost is null or monthly_gross_cost >= 0),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, project_id, reporting_month),
  foreign key (company_id, employee_id) references public.employees(company_id, id) on delete restrict,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict,
  foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict
);
create index allocations_employee_month_idx on public.project_allocations (company_id, employee_id, reporting_month);

create table public.recruitment_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_id uuid,
  requisition_code text not null,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  designation text not null,
  requisition_date date not null,
  approved_positions integer not null check (approved_positions >= 0),
  filled_positions integer not null default 0 check (filled_positions >= 0 and filled_positions <= approved_positions),
  offers_extended integer check (offers_extended is null or offers_extended >= 0),
  offers_accepted integer check (offers_accepted is null or offers_accepted >= 0),
  status text not null check (status in ('Open', 'On Hold', 'Closed', 'Cancelled')),
  joining_date date,
  recruitment_source text,
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, requisition_code, reporting_month),
  check (offers_accepted is null or offers_extended is null or offers_accepted <= offers_extended),
  check (joining_date is null or joining_date >= requisition_date),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  vendor_code text not null,
  vendor_name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, vendor_code),
  unique (company_id, id)
);

create table public.contract_manpower (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid,
  location_id uuid,
  vendor_id uuid not null,
  contractor_code text not null,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  contract_start_date date not null,
  contract_end_date date,
  monthly_gross numeric(14,2) not null check (monthly_gross >= 0),
  service_charges numeric(14,2) not null default 0 check (service_charges >= 0),
  reported_gst_amount numeric(14,2) not null default 0 check (reported_gst_amount >= 0),
  status text not null check (status in ('Active', 'Upcoming', 'Expired', 'Closed')),
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  check (contract_end_date is null or contract_end_date >= contract_start_date),
  unique (company_id, contractor_code, reporting_month),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict,
  foreign key (company_id, location_id) references public.locations(company_id, id) on delete restrict,
  foreign key (company_id, vendor_id) references public.vendors(company_id, id) on delete restrict
);

create table public.budget_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid not null,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  budget_category text not null check (budget_category in ('Payroll', 'Increment', 'Contract Manpower', 'Recruitment', 'Other')),
  budget_amount numeric(16,2) not null check (budget_amount >= 0),
  budget_version integer not null default 1 check (budget_version > 0),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, department_id, reporting_month, budget_category, budget_version),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_id uuid,
  dataset_type text not null check (dataset_type in ('employee_master', 'payroll', 'attendance', 'leave', 'performance', 'increment', 'project_allocation', 'project_master', 'department_master', 'location_master', 'exit_records', 'recruitment', 'contract_manpower', 'hr_budget')),
  reporting_month date check (reporting_month is null or extract(day from reporting_month) = 1),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'Draft' check (status in ('Draft', 'Uploaded', 'Validated', 'Reviewed', 'Approved', 'Published', 'Rejected')),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  replaces_batch_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict,
  foreign key (company_id, replaces_batch_id) references public.import_batches(company_id, id) on delete restrict
);
create index import_batches_period_idx on public.import_batches (company_id, dataset_type, reporting_month, status);

create table public.import_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid,
  batch_id uuid not null,
  source_row integer not null check (source_row > 0),
  severity text not null check (severity in ('error', 'warning')),
  field_name text,
  message text not null,
  created_at timestamptz not null default now(),
  foreign key (company_id, batch_id) references public.import_batches(company_id, id) on delete cascade,
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

alter table public.payroll_records add constraint payroll_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.attendance_records add constraint attendance_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.leave_records add constraint leave_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.performance_reviews add constraint performance_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.increments add constraint increments_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.project_allocations add constraint allocations_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.recruitment_records add constraint recruitment_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.contract_manpower add constraint contracts_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;
alter table public.budget_records add constraint budgets_source_batch_fk foreign key (company_id, source_batch_id) references public.import_batches(company_id, id) on delete restrict;

create or replace function private.enforce_project_allocation_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_lock bigint;
  old_lock bigint;
  current_total numeric(7,2);
begin
  new_lock := hashtextextended(new.company_id::text || ':' || new.employee_id::text || ':' || new.reporting_month::text, 0);
  if tg_op = 'UPDATE' then
    old_lock := hashtextextended(old.company_id::text || ':' || old.employee_id::text || ':' || old.reporting_month::text, 0);
    perform pg_advisory_xact_lock(least(new_lock, old_lock));
    if new_lock <> old_lock then perform pg_advisory_xact_lock(greatest(new_lock, old_lock)); end if;
  else
    perform pg_advisory_xact_lock(new_lock);
  end if;

  select coalesce(sum(allocation_percentage), 0)
  into current_total
  from public.project_allocations
  where company_id = new.company_id
    and employee_id = new.employee_id
    and reporting_month = new.reporting_month
    and id <> new.id;

  if current_total + new.allocation_percentage > 100 then
    raise exception 'Combined project allocation for employee and month exceeds 100 percent.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_allocation_limit_trigger
before insert or update on public.project_allocations
for each row execute function private.enforce_project_allocation_limit();
revoke all on function private.enforce_project_allocation_limit() from public, anon, authenticated;

create table public.reporting_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid,
  reporting_month date not null check (extract(day from reporting_month) = 1),
  snapshot_type text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  generated_at timestamptz not null default now(),
  source_batch_ids uuid[] not null default '{}',
  unique (company_id, department_id, reporting_month, snapshot_type),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  department_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  foreign key (company_id, department_id) references public.departments(company_id, id) on delete restrict
);
create index audit_logs_history_idx on public.audit_logs (company_id, occurred_at desc);

create table public.application_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  setting_key text not null,
  setting_value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, setting_key)
);

insert into public.app_roles (role_key, display_name) values
  ('super_admin', 'Super Admin'), ('hr_admin', 'HR Admin'), ('hr_analyst', 'HR Analyst'),
  ('management', 'Management'), ('department_head', 'Department Head'), ('payroll_specialist', 'Payroll Specialist')
on conflict (role_key) do update set display_name = excluded.display_name;

insert into public.role_permissions (role_key, permission_key)
select 'hr_admin', permission_key from unnest(array[
  'org.read','org.manage','users.manage','employee.read','employee.write','payroll.read','payroll.write',
  'attendance.read','attendance.write','leave.read','leave.write','performance.read','performance.write',
  'increments.read','increments.write','projects.read','projects.write','recruitment.read','recruitment.write',
  'contracts.read','contracts.write','budget.read','budget.write','imports.read','imports.write',
  'reports.aggregate','reports.write','audit.read','audit.write','settings.read','settings.manage'
]) as permission_key
union all
select 'hr_analyst', permission_key from unnest(array[
  'org.read','employee.read','attendance.read','leave.read','performance.read','increments.read','projects.read',
  'recruitment.read','contracts.read','budget.read','imports.read','reports.aggregate'
]) as permission_key
union all
select 'management', permission_key from unnest(array['org.read','reports.aggregate']) as permission_key
union all
select 'department_head', permission_key from unnest(array[
  'org.read','employee.read','attendance.read','leave.read','performance.read','projects.read','recruitment.read',
  'contracts.read','budget.read','reports.aggregate'
]) as permission_key
union all
select 'payroll_specialist', permission_key from unnest(array[
  'org.read','employee.read','payroll.read','payroll.write','reports.aggregate','imports.read'
]) as permission_key
on conflict do nothing;

create or replace function private.has_company_permission(target_company_id uuid, permission_name text, target_department_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.user_roles ur
    join public.companies c on c.id = target_company_id and c.organization_id = ur.organization_id
    left join public.role_permissions rp on rp.role_key = ur.role_key and rp.permission_key = permission_name
    where ur.user_id = (select auth.uid())
      and ur.active
      and (ur.company_id is null or ur.company_id = target_company_id)
      and (ur.department_id is null or ur.department_id = target_department_id)
      and (ur.role_key = 'super_admin' or rp.permission_key is not null)
  );
$$;

create or replace function private.has_organization_permission(target_organization_id uuid, permission_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.user_roles ur
    left join public.role_permissions rp on rp.role_key = ur.role_key and rp.permission_key = permission_name
    where ur.user_id = (select auth.uid())
      and ur.organization_id = target_organization_id
      and ur.company_id is null
      and ur.department_id is null
      and ur.active
      and (ur.role_key = 'super_admin' or rp.permission_key is not null)
  );
$$;

create or replace function private.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_roles ur
    join public.companies c on c.organization_id = ur.organization_id
    where ur.user_id = (select auth.uid()) and ur.active and c.id = target_company_id
      and (ur.company_id is null or ur.company_id = target_company_id)
  );
$$;

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.organization_id = target_organization_id and ur.active
  );
$$;

revoke all on function private.has_company_permission(uuid, text, uuid) from public, anon;
revoke all on function private.has_organization_permission(uuid, text) from public, anon;
revoke all on function private.is_company_member(uuid) from public, anon;
revoke all on function private.is_organization_member(uuid) from public, anon;
grant execute on function private.has_company_permission(uuid, text, uuid) to authenticated;
grant execute on function private.has_organization_permission(uuid, text) to authenticated;
grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.companies enable row level security;
alter table public.app_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

create policy organizations_read on public.organizations for select to authenticated
  using (private.is_organization_member(id));
create policy organizations_manage on public.organizations for all to authenticated
  using (private.has_organization_permission(id, 'org.manage'))
  with check (private.has_organization_permission(id, 'org.manage'));
create policy companies_read on public.companies for select to authenticated
  using (private.is_company_member(id));
create policy companies_manage on public.companies for all to authenticated
  using (private.has_organization_permission(organization_id, 'org.manage'))
  with check (private.has_organization_permission(organization_id, 'org.manage'));
create policy roles_read on public.app_roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.has_organization_permission(organization_id, 'users.manage'));
create policy user_roles_manage on public.user_roles for all to authenticated
  using (private.has_organization_permission(organization_id, 'users.manage'))
  with check (private.has_organization_permission(organization_id, 'users.manage'));

alter table public.locations enable row level security;
revoke all on table public.locations from public, anon;
grant select, insert, update, delete on table public.locations to authenticated;
create policy locations_read on public.locations for select to authenticated using (private.is_company_member(company_id));
create policy locations_write on public.locations for all to authenticated
  using (private.has_company_permission(company_id, 'employee.write'))
  with check (private.has_company_permission(company_id, 'employee.write'));

alter table public.vendors enable row level security;
revoke all on table public.vendors from public, anon;
grant select, insert, update, delete on table public.vendors to authenticated;
create policy vendors_read on public.vendors for select to authenticated
  using (
    private.has_company_permission(company_id, 'contracts.read')
    or exists (
      select 1 from public.contract_manpower cm
      where cm.company_id = vendors.company_id and cm.vendor_id = vendors.id
        and private.has_company_permission(cm.company_id, 'contracts.read', cm.department_id)
    )
  );
create policy vendors_write on public.vendors for all to authenticated
  using (private.has_company_permission(company_id, 'contracts.write'))
  with check (private.has_company_permission(company_id, 'contracts.write'));

do $$
declare
  item record;
  scope_expression text;
begin
  for item in
    select * from (values
      ('departments','employee.read','employee.write','id'),
      ('employees','employee.read','employee.write','department_id'),
      ('employee_history','employee.read','employee.write','department_id'),
      ('payroll_records','payroll.read','payroll.write','department_id'),
      ('attendance_records','attendance.read','attendance.write','department_id'),
      ('leave_records','leave.read','leave.write','department_id'),
      ('performance_reviews','performance.read','performance.write','department_id'),
      ('increments','increments.read','increments.write','department_id'),
      ('projects','projects.read','projects.write','department_id'),
      ('project_allocations','projects.read','projects.write','department_id'),
      ('recruitment_records','recruitment.read','recruitment.write','department_id'),
      ('contract_manpower','contracts.read','contracts.write','department_id'),
      ('budget_records','budget.read','budget.write','department_id'),
      ('import_batches','imports.read','imports.write','department_id'),
      ('import_errors','imports.read','imports.write','department_id'),
      ('reporting_snapshots','reports.aggregate','reports.write','department_id'),
      ('audit_logs','audit.read','audit.write','department_id'),
      ('application_settings','settings.read','settings.manage','')
    ) as rules(table_name, read_permission, write_permission, scope_column)
  loop
    scope_expression := case when item.scope_column = '' then 'null::uuid' else format('%I', item.scope_column) end;
    execute format('alter table public.%I enable row level security', item.table_name);
    execute format('revoke all on table public.%I from public, anon', item.table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', item.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_company_permission(company_id, %L, %s))',
      item.table_name || '_read', item.table_name, item.read_permission, scope_expression
    );
    if item.table_name = 'audit_logs' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (private.has_company_permission(company_id, %L, %s))',
        item.table_name || '_append', item.table_name, item.write_permission, scope_expression
      );
      execute format('revoke update, delete on table public.%I from authenticated', item.table_name);
    else
      execute format(
        'create policy %I on public.%I for all to authenticated using (private.has_company_permission(company_id, %L, %s)) with check (private.has_company_permission(company_id, %L, %s))',
        item.table_name || '_write', item.table_name, item.write_permission, scope_expression, item.write_permission, scope_expression
      );
    end if;
  end loop;
end $$;

revoke all on public.organizations, public.companies, public.app_roles, public.role_permissions, public.user_roles from public, anon;
grant select, insert, update, delete on public.organizations, public.companies, public.user_roles to authenticated;
grant select on public.app_roles, public.role_permissions to authenticated;

commit;

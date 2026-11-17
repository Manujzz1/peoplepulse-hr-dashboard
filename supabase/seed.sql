-- Fictional records for local development only. No Auth users or real HR data are seeded.
insert into public.organizations (id, organization_key, organization_name)
values ('10000000-0000-4000-8000-000000000001', 'peoplepulse-demo', 'PeoplePulse Synthetic Demo')
on conflict (id) do nothing;

insert into public.companies (id, organization_id, company_key, company_name, currency_code, reporting_calendar)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'northstar-demo', 'Northstar Labs (Synthetic)', 'INR', 'APR_MAR')
on conflict (id) do nothing;

insert into public.departments (id, company_id, department_key, department_name) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'ENG', 'Engineering'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'PEO', 'People'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'OPS', 'Operations')
on conflict (company_id, department_key) do nothing;

insert into public.locations (id, company_id, location_key, location_name) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'BLR', 'Bengaluru (Sample)'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'PUN', 'Pune (Sample)')
on conflict (company_id, location_key) do nothing;

insert into public.employees (id, company_id, employee_code, employee_name, department_id, location_id, designation, grade, employment_type, hire_date) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'SYN-001', 'Sample Employee 001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Sample Engineer', 'S2', 'Permanent', '2021-04-12'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'SYN-002', 'Sample Employee 002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'Sample Analyst', 'S1', 'Permanent', '2022-07-01'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'SYN-003', 'Sample Employee 003', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'Sample Coordinator', 'S1', 'Contract', '2024-02-15')
on conflict (company_id, employee_code) do nothing;

insert into public.employee_history (company_id, employee_id, department_id, location_id, designation, grade, employment_type, effective_from) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Sample Engineer', 'S2', 'Permanent', '2021-04-12'),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'Sample Analyst', 'S1', 'Permanent', '2022-07-01'),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'Sample Coordinator', 'S1', 'Contract', '2024-02-15')
on conflict (company_id, employee_id, effective_from) do nothing;

insert into public.payroll_records (company_id, employee_id, department_id, reporting_month, monthly_gross, annual_ctc, components) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-04-01', 100000, 1380000, '{"synthetic":true}'),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '2025-04-01', 75000, 1035000, '{"synthetic":true}'),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '2025-04-01', 50000, 690000, '{"synthetic":true}')
on conflict (company_id, employee_id, reporting_month) do nothing;

insert into public.attendance_records (company_id, employee_id, department_id, reporting_month, working_days, present_days, attendance_percentage, lop_days, payable_days) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-04-01', 22, 21, 95.45, 0, 22),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-05-01', 21, 20, 95.24, 1, 20),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '2025-04-01', 22, 22, 100, 0, 22),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '2025-04-01', 22, 20, 90.91, 2, 20)
on conflict (company_id, employee_id, reporting_month) do nothing;

insert into public.leave_records (company_id, employee_id, department_id, reporting_month, leave_type, opening_balance, days_availed, days_credited, closing_balance) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-04-01', 'Sample Paid Leave', 10, 1, 1, 10),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '2025-04-01', 'Sample Paid Leave', 8, 2, 1, 7)
on conflict (company_id, employee_id, reporting_month, leave_type) do nothing;

insert into public.performance_reviews (company_id, employee_id, department_id, review_period, reporting_month, score, performance_category, approval_status) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'SYN-2025', '2025-04-01', 4.2, 'Synthetic sample', 'Approved'),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'SYN-2025', '2025-04-01', 3.8, 'Synthetic sample', 'Approved')
on conflict (company_id, employee_id, review_period) do nothing;

insert into public.increments (company_id, employee_id, department_id, effective_date, current_ctc, revised_ctc, increment_percentage, approval_status) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-04-01', 1200000, 1296000, 8, 'Approved')
on conflict (company_id, employee_id, effective_date) do nothing;

insert into public.projects (id, company_id, department_id, project_code, project_name) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'SYN-PROJ-01', 'Synthetic Sample Project')
on conflict (company_id, project_code) do nothing;

insert into public.project_allocations (company_id, employee_id, department_id, project_id, reporting_month, allocation_percentage, monthly_gross_cost) values
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '2025-04-01', 75, 100000),
  ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '2025-04-01', 50, 75000)
on conflict (company_id, employee_id, project_id, reporting_month) do nothing;

insert into public.recruitment_records (company_id, department_id, requisition_code, reporting_month, designation, requisition_date, approved_positions, filled_positions, offers_extended, offers_accepted, status, recruitment_source) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'SYN-REQ-01', '2025-04-01', 'Sample Analyst', '2025-04-02', 2, 1, 2, 1, 'Open', 'Synthetic sample')
on conflict (company_id, requisition_code, reporting_month) do nothing;

insert into public.vendors (id, company_id, vendor_code, vendor_name) values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'SYN-VENDOR-01', 'Sample Vendor')
on conflict (company_id, vendor_code) do nothing;

insert into public.contract_manpower (company_id, department_id, location_id, vendor_id, contractor_code, reporting_month, contract_start_date, contract_end_date, monthly_gross, service_charges, reported_gst_amount, status) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'SYN-CNT-01', '2025-04-01', '2025-01-01', '2025-12-31', 50000, 5000, 900, 'Active')
on conflict (company_id, contractor_code, reporting_month) do nothing;

insert into public.budget_records (company_id, department_id, reporting_month, budget_category, budget_amount) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-04-01', 'Payroll', 1200000),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '2025-04-01', 'Contract Manpower', 60000)
on conflict (company_id, department_id, reporting_month, budget_category, budget_version) do nothing;

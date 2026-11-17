begin;

-- Add employee-active-period day inputs without changing existing percentage-only
-- attendance rows. calendar_days means eligible calendar days for this employee
-- in the reporting period, which supports mid-month hires and exits.
alter table public.attendance_records
  add column calendar_days numeric(6,2) check (calendar_days is null or calendar_days >= 0),
  add column weekly_off_days numeric(6,2) check (weekly_off_days is null or weekly_off_days >= 0),
  add column holiday_days numeric(6,2) check (holiday_days is null or holiday_days >= 0),
  add column paid_leave_days numeric(6,2) check (paid_leave_days is null or paid_leave_days >= 0),
  add column unpaid_leave_days numeric(6,2) check (unpaid_leave_days is null or unpaid_leave_days >= 0);

alter table public.attendance_records
  add constraint attendance_present_within_working_days_check
    check (working_days is null or present_days is null or present_days <= working_days),
  add constraint attendance_percentage_matches_day_ratio_check
    check (working_days is null or present_days is null or attendance_percentage is null or working_days = 0
      or abs(attendance_percentage - present_days / working_days * 100) <= 0.5),
  add constraint attendance_calendar_days_reconcile_check
    check (calendar_days is null or working_days is null or weekly_off_days is null or holiday_days is null
      or working_days + weekly_off_days + holiday_days = calendar_days),
  add constraint attendance_leave_within_working_days_check
    check (working_days is null
      or coalesce(present_days, 0) + coalesce(paid_leave_days, 0) + coalesce(unpaid_leave_days, 0) <= working_days),
  add constraint attendance_payable_within_calendar_check
    check (calendar_days is null or payable_days is null or payable_days <= calendar_days);

commit;

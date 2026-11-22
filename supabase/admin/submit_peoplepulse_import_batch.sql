-- Reviewed draft only. Depends on migrations 202611160001 through 202611160006.
-- Apply only as a separately approved production migration.
-- The invoker's normal grants, import triggers, and RLS policies remain active.
-- Limits: 5,000 rows, 8 MiB serialized metadata+rows, JSON container depth below 5.
begin;

create or replace function public.submit_peoplepulse_import_batch(
  target_batch_id uuid,
  target_company_id uuid,
  target_dataset_type text,
  target_reporting_month date,
  target_metadata jsonb,
  target_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  table_name text;
  column_list text;
  allowed_columns text[];
  row_columns text[];
  inserted_count integer := 0;
  batch_row public.import_batches%rowtype;
  inserted_batches integer;
  payload_hash text;
  database_payload_hash text;
  claims jsonb := (select auth.jwt());
  stored_metadata jsonb;
  payload_size_bytes integer;
  row_count integer;
  new_employee_ids uuid[];
  max_batch_rows constant integer := 5000;
  max_payload_size_bytes constant integer := 8 * 1024 * 1024;
  max_json_depth constant integer := 5;
begin
  if actor_id is null or coalesce(claims -> 'is_anonymous' = 'true'::jsonb, false)
    or (case when pg_catalog.jsonb_typeof(claims -> 'exp') = 'number'
         then (claims ->> 'exp')::numeric <= extract(epoch from pg_catalog.statement_timestamp())
         else true
       end) then
    raise exception 'An authenticated user is required.' using errcode = '42501';
  end if;
  if target_batch_id is null or target_company_id is null
    or jsonb_typeof(target_metadata) is distinct from 'object'
    or jsonb_typeof(target_rows) is distinct from 'array' then
    raise exception 'A batch id, company, metadata object, and non-empty rows array are required.' using errcode = '22023';
  end if;
  row_count := pg_catalog.jsonb_array_length(target_rows);
  if row_count = 0 then
    raise exception 'A non-empty rows array is required.' using errcode = '22023';
  end if;
  if row_count > max_batch_rows then
    raise exception 'Import batches are limited to % rows; split the file into smaller batches.', max_batch_rows using errcode = '22023';
  end if;
  payload_size_bytes := pg_catalog.octet_length(pg_catalog.convert_to(target_metadata::text, 'UTF8'))
    + pg_catalog.octet_length(pg_catalog.convert_to(target_rows::text, 'UTF8'));
  if payload_size_bytes > max_payload_size_bytes then
    raise exception 'Serialized import payload exceeds the % byte limit.', max_payload_size_bytes using errcode = '22023';
  end if;
  if exists (
    with recursive payload_nodes(value, depth) as (
      values (target_metadata, 0), (target_rows, 0)
      union all
      select child.value, parent.depth + 1
      from payload_nodes parent
      cross join lateral (
        select object_item.value
        from pg_catalog.jsonb_each(
          case when pg_catalog.jsonb_typeof(parent.value) = 'object' then parent.value else '{}'::jsonb end
        ) as object_item(key, value)
        union all
        select array_item.value
        from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(parent.value) = 'array' then parent.value else '[]'::jsonb end
        ) as array_item(value)
      ) child
      where parent.depth < max_json_depth
    )
    select 1 from payload_nodes
    where depth = max_json_depth and pg_catalog.jsonb_typeof(value) in ('object', 'array')
  ) then
    raise exception 'Import JSON nesting exceeds the maximum supported depth of %.', max_json_depth using errcode = '22023';
  end if;
  if target_reporting_month is not null and extract(day from target_reporting_month) <> 1 then
    raise exception 'Reporting month must be the first calendar day of the month.' using errcode = '22023';
  end if;
  if not private.has_company_permission(target_company_id, 'imports.write', null::uuid) then
    raise exception 'The authenticated user cannot import data for this company.' using errcode = '42501';
  end if;

  case target_dataset_type
    when 'employee_master' then
      table_name := 'employees';
      allowed_columns := array['company_id','source_batch_id','id','employee_code','employee_name','department_id','location_id','designation','grade','employment_type','hire_date','exit_date','manager_employee_id'];
    when 'employee_history' then
      table_name := 'employee_history';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','location_id','designation','grade','employment_type','manager_employee_id','cost_center','effective_from','effective_to'];
    when 'payroll' then
      table_name := 'payroll_records';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','reporting_month','monthly_gross','annual_ctc','components'];
    when 'attendance' then
      table_name := 'attendance_records';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','reporting_month','calendar_days','working_days','present_days','attendance_percentage','weekly_off_days','holiday_days','paid_leave_days','unpaid_leave_days','lop_days','payable_days'];
    when 'leave' then
      table_name := 'leave_records';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','reporting_month','leave_type','opening_balance','days_availed','days_credited','closing_balance'];
    when 'performance' then
      table_name := 'performance_reviews';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','review_period','reporting_month','score','performance_category','approval_status'];
    when 'increment' then
      table_name := 'increments';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','effective_date','current_ctc','revised_ctc','increment_percentage','approval_status'];
    when 'project_allocation' then
      table_name := 'project_allocations';
      allowed_columns := array['company_id','source_batch_id','employee_id','department_id','project_id','reporting_month','allocation_percentage','monthly_gross_cost'];
    when 'project_master' then
      table_name := 'projects';
      allowed_columns := array['company_id','source_batch_id','id','department_id','project_code','project_name','status'];
    when 'department_master' then
      table_name := 'departments';
      allowed_columns := array['company_id','source_batch_id','id','department_key','department_name'];
    when 'location_master' then
      table_name := 'locations';
      allowed_columns := array['company_id','source_batch_id','id','location_key','location_name'];
    when 'recruitment' then
      table_name := 'recruitment_records';
      allowed_columns := array['company_id','source_batch_id','department_id','requisition_code','reporting_month','designation','requisition_date','approved_positions','filled_positions','offers_extended','offers_accepted','status','joining_date','recruitment_source'];
    when 'contract_manpower' then
      table_name := 'contract_manpower';
      allowed_columns := array['company_id','source_batch_id','department_id','location_id','vendor_id','contractor_code','reporting_month','contract_start_date','contract_end_date','monthly_gross','service_charges','reported_gst_amount','status'];
    when 'hr_budget' then
      table_name := 'budget_records';
      allowed_columns := array['company_id','source_batch_id','department_id','reporting_month','budget_category','budget_amount'];
    else
      table_name := null;
      allowed_columns := array[]::text[];
  end case;
  if table_name is null then
    raise exception 'Unsupported import dataset type.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    where pg_catalog.jsonb_typeof(rows.value) is distinct from 'object'
  ) then
    raise exception 'Every import row must be a JSON object.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    cross join lateral pg_catalog.jsonb_each(rows.value) as fields(key, value)
    where pg_catalog.jsonb_typeof(fields.value) in ('object', 'array')
      and not (target_dataset_type = 'payroll' and fields.key = 'components' and pg_catalog.jsonb_typeof(fields.value) = 'object')
  ) then
    raise exception 'Nested row values are not supported except for payroll components.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    cross join lateral pg_catalog.jsonb_each(rows.value) as fields(key, value)
    where pg_catalog.jsonb_typeof(fields.value) = 'string'
      and pg_catalog.char_length(fields.value #>> '{}') > case
        when fields.key in ('employee_name', 'project_name', 'department_name', 'location_name', 'designation') then 160
        when fields.key in ('employee_code', 'department_key', 'location_key', 'project_code', 'requisition_code', 'contractor_code') then 80
        when fields.key in ('employment_type', 'status', 'approval_status', 'performance_category', 'leave_type', 'grade', 'recruitment_source', 'budget_category', 'review_period') then 120
        when fields.key in ('hire_date', 'exit_date', 'effective_from', 'effective_to', 'reporting_month', 'effective_date', 'requisition_date', 'joining_date', 'contract_start_date', 'contract_end_date') then 10
        else 250
      end
  ) then
    raise exception 'An import field exceeds its maximum supported length.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    cross join lateral pg_catalog.jsonb_each(rows.value) as fields(key, value)
    where fields.key = 'components' and pg_catalog.jsonb_typeof(fields.value) is distinct from 'object'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    cross join lateral pg_catalog.jsonb_each(rows.value) as fields(key, value)
    cross join lateral pg_catalog.jsonb_each(
      case when fields.key = 'components' and pg_catalog.jsonb_typeof(fields.value) = 'object' then fields.value else '{}'::jsonb end
    ) as components(key, value)
    where fields.key = 'components'
      and (
        components.key not in ('monthlyBasic', 'monthlyHra', 'monthlyOtherAllowances', 'employerPf', 'employerEsic', 'gratuity', 'variablePay', 'incentives', 'arrears', 'overtime')
        or pg_catalog.jsonb_typeof(components.value) is distinct from 'number'
      )
  ) then
    raise exception 'Payroll components must use the supported numeric component fields.' using errcode = '22023';
  end if;

  payload_hash := target_metadata ->> 'payloadHash';
  if payload_hash is null or payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Import payload hash is missing or invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(target_metadata) as metadata_key(key)
    where key not in ('payloadHash', 'fileName', 'sourceSheet', 'complete', 'completeMonths', 'completeAsOf', 'employeeHistoryComplete')
  ) then
    raise exception 'Import metadata contains an unsupported field.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(target_metadata -> 'payloadHash') is distinct from 'string'
    or pg_catalog.char_length(target_metadata ->> 'payloadHash') <> 64
    or (target_metadata ? 'fileName' and (pg_catalog.jsonb_typeof(target_metadata -> 'fileName') is distinct from 'string' or pg_catalog.char_length(target_metadata ->> 'fileName') > 180))
    or (target_metadata ? 'sourceSheet' and (pg_catalog.jsonb_typeof(target_metadata -> 'sourceSheet') is distinct from 'string' or pg_catalog.char_length(target_metadata ->> 'sourceSheet') > 100))
    or (target_metadata ? 'complete' and pg_catalog.jsonb_typeof(target_metadata -> 'complete') is distinct from 'boolean')
    or (target_metadata ? 'employeeHistoryComplete' and pg_catalog.jsonb_typeof(target_metadata -> 'employeeHistoryComplete') is distinct from 'boolean')
    or (target_metadata ? 'completeAsOf' and (pg_catalog.jsonb_typeof(target_metadata -> 'completeAsOf') is distinct from 'string' or pg_catalog.char_length(target_metadata ->> 'completeAsOf') > 10))
    or (target_metadata ? 'completeMonths' and pg_catalog.jsonb_typeof(target_metadata -> 'completeMonths') is distinct from 'array') then
    raise exception 'Import metadata has an invalid type or exceeds a field length limit.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(target_metadata -> 'completeMonths') = 'array' then target_metadata -> 'completeMonths' else '[]'::jsonb end
    ) as month_item(value)
    where pg_catalog.jsonb_typeof(value) is distinct from 'string'
      or pg_catalog.char_length(value #>> '{}') <> 7
      or value #>> '{}' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ) then
    raise exception 'Completeness months must use YYYY-MM strings.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    where pg_catalog.jsonb_typeof(rows.value) <> 'object'
      or rows.value ->> 'company_id' is distinct from target_company_id::text
      or rows.value ->> 'source_batch_id' is distinct from target_batch_id::text
  ) then
    raise exception 'Every row must carry the target company and batch id.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    where (
      select pg_catalog.array_agg(keys.field_name order by keys.field_name)
      from pg_catalog.jsonb_object_keys(rows.value) as keys(field_name)
    ) is distinct from (
      select pg_catalog.array_agg(keys.field_name order by keys.field_name)
      from pg_catalog.jsonb_object_keys(target_rows -> 0) as keys(field_name)
    )
  ) then
    raise exception 'Every row in a batch must have the same mapped columns.' using errcode = '22023';
  end if;
  select pg_catalog.string_agg(pg_catalog.format('%I', keys.field_name), ', ' order by keys.field_name)
    into column_list
  from pg_catalog.jsonb_object_keys(target_rows -> 0) as keys(field_name);
  select pg_catalog.array_agg(keys.field_name order by keys.field_name)
    into row_columns
  from pg_catalog.jsonb_object_keys(target_rows -> 0) as keys(field_name);
  if column_list is null then
    raise exception 'Import rows cannot be empty objects.' using errcode = '22023';
  end if;
  if not (row_columns <@ allowed_columns) then
    raise exception 'Import row contains a field that is not supported for this dataset.' using errcode = '22023';
  end if;
  if 'reporting_month' = any (allowed_columns) and (
    target_reporting_month is null or exists (
      select 1 from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
      where (rows.value ->> 'reporting_month')::date is distinct from target_reporting_month
    )
  ) then
    raise exception 'Every row must match the batch reporting month.' using errcode = '22023';
  end if;
  inserted_count := row_count;

  database_payload_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'actor', actor_id,
    'company', target_company_id,
    'dataset', target_dataset_type,
    'reportingMonth', target_reporting_month,
    'metadata', target_metadata - 'fileName' - 'sourceSheet',
    'rows', target_rows
  )::text, 'UTF8')), 'hex');
  stored_metadata := target_metadata || pg_catalog.jsonb_build_object('databasePayloadHash', database_payload_hash);

  insert into public.import_batches (
    id, company_id, department_id, dataset_type, reporting_month, status,
    total_rows, accepted_rows, rejected_rows, warning_count, metadata
  ) values (
    target_batch_id, target_company_id, null, target_dataset_type, target_reporting_month, 'Draft',
    0, 0, 0, 0, stored_metadata
  ) on conflict (id) do nothing;
  get diagnostics inserted_batches = row_count;

  select * into batch_row
  from public.import_batches b
  where b.id = target_batch_id
  for update;
  if not found then
    raise exception 'The import batch is not visible to this account.' using errcode = '42501';
  end if;
  if inserted_batches = 0 then
    if batch_row.uploaded_by is not null and batch_row.uploaded_by <> actor_id then
      raise exception 'Only the original uploader can retry or inspect this batch.' using errcode = '42501';
    end if;
    if batch_row.status in ('Draft', 'Uploaded') then
      raise exception 'An incomplete legacy batch needs administrator review; it was not modified.' using errcode = '55000';
    end if;
    if batch_row.uploaded_by is distinct from actor_id then
      raise exception 'Only the original uploader can retry or inspect this batch.' using errcode = '42501';
    end if;
    if batch_row.company_id <> target_company_id
      or batch_row.dataset_type <> target_dataset_type
      or batch_row.reporting_month is distinct from target_reporting_month
      or batch_row.metadata ->> 'payloadHash' is distinct from payload_hash then
      raise exception 'This idempotency key is already bound to a different batch.' using errcode = '23505';
    end if;
    if batch_row.metadata ->> 'databasePayloadHash' is distinct from database_payload_hash then
      raise exception 'This idempotency key was reused with different mapped data.' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'batchId', batch_row.id, 'status', batch_row.status,
      'totalRows', batch_row.total_rows, 'reportingMonth', batch_row.reporting_month,
      'reused', true
    );
  end if;

  -- Employee RLS excludes unpublished references as well as out-of-scope rows.
  if target_dataset_type = 'employee_master' then
    select pg_catalog.array_agg((value ->> 'id')::uuid) filter (where value ->> 'id' is not null)
    into new_employee_ids
    from pg_catalog.jsonb_array_elements(target_rows);
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_rows) as rows(value)
    cross join lateral (values (rows.value ->> 'employee_id'), (rows.value ->> 'manager_employee_id')) ref(employee_id)
    where ref.employee_id is not null
      and not coalesce(ref.employee_id::uuid = any (new_employee_ids), false)
      and not exists (
      select 1 from public.employees e
      where e.company_id = target_company_id and e.id = ref.employee_id::uuid
    )
  ) then
    raise exception 'An employee reference is unavailable for the target company.' using errcode = '23503';
  end if;

  update public.import_batches b set status = 'Uploaded'
  where b.id = target_batch_id;
  if not found then
    raise exception 'The import batch could not be opened for staging.' using errcode = '42501';
  end if;

  execute pg_catalog.format(
    'insert into public.%I (%s) select %s from pg_catalog.jsonb_populate_recordset(null::public.%I, $1)',
    table_name, column_list, column_list, table_name
  ) using target_rows;

  update public.import_batches b set
    total_rows = inserted_count,
    accepted_rows = inserted_count,
    rejected_rows = 0,
    warning_count = 0,
    status = 'Validated'
  where b.id = target_batch_id;
  if not found then
    raise exception 'The import batch could not be marked Validated.' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'batchId', target_batch_id, 'status', 'Validated',
    'totalRows', inserted_count, 'reportingMonth', target_reporting_month,
    'reused', false
  );
end;
$$;

revoke all on function public.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.submit_peoplepulse_import_batch(uuid, uuid, text, date, jsonb, jsonb) to authenticated;

commit;

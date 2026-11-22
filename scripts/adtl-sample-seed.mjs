import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { demoEmployees, months, getEmployeeSnapshot, isActiveAt, getMonthEnd } from '../src/data/demoData.js'
import { ADTL_SAMPLE_DEPARTMENT_PREFIX, ADTL_SAMPLE_PREFIX } from '../src/data/sampleData.js'

const seedKey = 'peoplepulse.adtl.temporary-sample.v1'
const key = (name) => name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
const id = (type, value) => {
  const hash = createHash('sha256').update(`${seedKey}/${type}/${value}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
const unique = (items) => [...new Set(items)].sort()
const money = (amount) => Number(amount.toFixed(2))

export function createSampleRows() {
  const rows = {
    departments: unique(demoEmployees.map((row) => row.department)).map((name) => ({
      id: id('department', name), department_key: ADTL_SAMPLE_DEPARTMENT_PREFIX + key(name), department_name: name,
    })),
    locations: unique(demoEmployees.map((row) => row.location)).map((name) => ({
      id: id('location', name), location_key: ADTL_SAMPLE_DEPARTMENT_PREFIX + key(name), location_name: name,
    })),
    projects: unique(demoEmployees.flatMap((row) => [row.project, ...row.projectHistory.map((item) => item.project)])).map((name) => ({
      id: id('project', name), project_code: 'SYN-ADTL-' + key(name), project_name: name,
    })),
    employees: demoEmployees.map((row) => ({
      id: id('employee', row.id), employee_code: ADTL_SAMPLE_PREFIX + row.id.slice(4), employee_name: row.name,
      department_id: id('department', row.department), location_id: id('location', row.location),
      employment_type: row.employmentType, hire_date: row.hireDate, exit_date: row.exitDate,
    })),
    payroll_records: [], attendance_records: [], leave_records: [], performance_reviews: [], project_allocations: [],
  }

  for (const employee of demoEmployees) {
    let balance = 0
    for (const { value, month } of months) {
      if (month === 3) balance = 0
      if (!isActiveAt(employee, getMonthEnd(value))) continue
      const snapshot = getEmployeeSnapshot(employee, value)
      const rowKey = `${employee.id}/${value}`
      const common = { employee_id: id('employee', employee.id), department_id: id('department', employee.department), reporting_month: `${value}-01` }
      const gross = money(snapshot.monthlySalary)
      rows.payroll_records.push({ id: id('payroll', rowKey), ...common, monthly_gross: gross, annual_ctc: money(snapshot.annualCtc) })
      rows.attendance_records.push({ id: id('attendance', rowKey), ...common, attendance_percentage: snapshot.attendance, lop_days: snapshot.lopDays })
      rows.leave_records.push({ id: id('leave', rowKey), ...common, leave_type: 'Annual', opening_balance: balance,
        days_availed: snapshot.leaveTaken, days_credited: 2, closing_balance: balance + 2 - snapshot.leaveTaken })
      balance += 2 - snapshot.leaveTaken
      rows.performance_reviews.push({ id: id('performance', rowKey), ...common, review_period: value, score: employee.performanceScore, approval_status: 'Approved' })
      rows.project_allocations.push({ id: id('allocation', rowKey), ...common, project_id: id('project', snapshot.project),
        allocation_percentage: employee.allocation, monthly_gross_cost: gross })
    }
  }
  return rows
}

export function buildSeedSql(action = 'seed') {
  if (!['seed', 'cleanup'].includes(action)) throw new Error('Expected seed or cleanup')
  const rows = createSampleRows()
  const tables = Object.keys(rows)
  const conflictTables = ['employee_history', 'increments', 'recruitment_records', 'contract_manpower', 'budget_records', 'import_batches', 'reporting_snapshots', 'vendors']
  const inserts = tables.map((table) => {
    const columns = Object.keys(rows[table][0])
    return `insert into public.${table} (company_id, ${columns.join(', ')})
    select target_company, ${columns.map((c) => `r.${c}`).join(', ')}
      from jsonb_populate_recordset(null::public.${table}, $fixture$${JSON.stringify(rows[table])}$fixture$::jsonb) r;`
  }).join('\n')
  const inventory = `foreach table_name in array array[${tables.map((name) => `'${name}'`).join(', ')}] loop
    execute format(
      'select coalesce(jsonb_object_agg(t.id::text, encode(sha256(convert_to(to_jsonb(t)::text, ''UTF8'')), ''hex'')), ''{}''::jsonb)
       from public.%I t where t.company_id = $1', table_name
    ) into collected using target_company;
    observed := observed || jsonb_build_object(table_name, collected);
  end loop;`
  return `begin;
set local search_path = pg_catalog;
set local time zone 'UTC';
set local row_security = off;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
lock table public.companies, ${[...tables, ...conflictTables, 'application_settings'].map((name) => `public.${name}`).join(', ')}
  in share row exclusive mode;
do $seed$
declare
  target_company uuid;
  previous jsonb;
  observed jsonb := '{}'::jsonb;
  collected jsonb;
  table_name text;
begin
  select id into strict target_company from public.companies where company_key = 'adtl';
  if not exists (
    select 1 from public.companies
    where id = target_company and company_name = 'Alpha Design Technologies Pvt. Ltd.' and currency_code = 'INR'
  ) then raise exception 'ADTL identity or currency mismatch'; end if;

  select setting_value into previous from public.application_settings
    where company_id = target_company and setting_key = '${seedKey}';
  ${inventory}
  if previous is not null and previous is distinct from observed then
    raise exception 'Seed inventory differs: unexpected, missing or changed rows. No changes made.';
  end if;
  ${action === 'cleanup' ? `
  if previous is null then return; end if;
  ${tables.slice().reverse().map((table) => `delete from public.${table} where company_id = target_company
    and id::text in (select jsonb_object_keys(previous -> '${table}'));`).join('\n  ')}
  delete from public.application_settings where company_id = target_company and setting_key = '${seedKey}';
  ` : `
  if previous is not null then return; end if;
  if exists (select 1 from jsonb_each(observed) i where i.value <> '{}'::jsonb)
    ${conflictTables.map((name) => `or exists (select 1 from public.${name} where company_id = target_company)`).join('\n    ')}
  then raise exception 'Existing ADTL records detected. No sample records inserted.'; end if;
  ${inserts}
  observed := '{}'::jsonb;
  ${inventory}
  insert into public.application_settings (company_id, setting_key, setting_value)
  values (target_company, '${seedKey}', observed);
  `}
end;
$seed$;
commit;
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(buildSeedSql(process.argv[2]))
}

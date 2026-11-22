// Read-only entry point for future live dashboard data. The browser uses only
// the publishable-key client; Postgres RLS is the tenant boundary.
const RESOURCES = Object.freeze({
  companies: { table: 'companies', columns: 'id, organization_id, company_key, company_name, currency_code, reporting_calendar' },
  departments: { table: 'departments', columns: 'id, company_id, department_key, department_name' },
  employees: { table: 'employees', columns: 'id, company_id, employee_code, employee_name, department_id, location_id, designation, grade, employment_type, hire_date, exit_date' },
  payroll: { table: 'payroll_records', columns: 'id, company_id, employee_id, department_id, reporting_month, monthly_gross, annual_ctc, components' },
  attendance: { table: 'attendance_records', columns: 'id, company_id, employee_id, department_id, reporting_month, working_days, present_days, attendance_percentage, lop_days, payable_days' },
})

/**
 * Read one allowlisted resource using the current user's verified Supabase
 * session. No tenant id supplied by the browser is treated as authorization;
 * PostgreSQL RLS must filter every returned row.
 */
export async function readTenantResource(client, resource) {
  const definition = RESOURCES[resource]
  if (!definition) throw new Error(`Unsupported tenant resource: ${resource}`)
  if (!client?.auth?.getUser || typeof client.from !== 'function') {
    throw new Error('An authenticated Supabase client is required')
  }

  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData?.user?.id) throw new Error('Sign in before reading organization data')

  const { data, error } = await client.from(definition.table).select(definition.columns)
  if (error) throw error
  return data || []
}

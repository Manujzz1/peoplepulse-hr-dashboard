import { MONTHLY_IMPORT_CATEGORIES } from '../import/importSchemas'
import { PAYROLL_COMPONENTS } from './hrModel'
import { ADTL_SAMPLE_DEPARTMENT_PREFIX, ADTL_SAMPLE_PREFIX } from './sampleData'

export class LiveWorkspaceError extends Error {
  constructor(message, code = 'LIVE_DATA_ERROR') {
    super(message)
    this.name = 'LiveWorkspaceError'
    this.code = code
  }
}

const DEFINITIONS = Object.freeze({
  organizations: { table: 'organizations', columns: 'id, organization_key, organization_name' },
  companies: { table: 'companies', columns: 'id, organization_id, company_key, company_name, currency_code, reporting_calendar' },
  departments: { table: 'departments', columns: 'id, company_id, department_key, department_name, source_batch_id' },
  locations: { table: 'locations', columns: 'id, company_id, location_key, location_name' },
  employees: { table: 'employees', columns: 'id, company_id, employee_code, employee_name, department_id, location_id, designation, grade, employment_type, hire_date, exit_date, manager_employee_id, source_batch_id', permission: 'employee.read' },
  employeeHistory: { table: 'employee_history', columns: 'id, company_id, employee_id, department_id, location_id, designation, grade, employment_type, manager_employee_id, cost_center, effective_from, effective_to, source_batch_id', permission: 'employee.read' },
  payroll: { table: 'payroll_records', columns: 'id, company_id, employee_id, department_id, reporting_month, monthly_gross, annual_ctc, components, source_batch_id', permission: 'payroll.read' },
  attendance: { table: 'attendance_records', columns: 'id, company_id, employee_id, department_id, reporting_month, calendar_days, working_days, present_days, attendance_percentage, weekly_off_days, holiday_days, paid_leave_days, unpaid_leave_days, lop_days, payable_days, source_batch_id', permission: 'attendance.read' },
  leave: { table: 'leave_records', columns: 'id, company_id, employee_id, department_id, reporting_month, leave_type, opening_balance, days_availed, days_credited, closing_balance, source_batch_id', permission: 'leave.read' },
  performance: { table: 'performance_reviews', columns: 'id, company_id, employee_id, department_id, review_period, reporting_month, score, performance_category, approval_status, source_batch_id', permission: 'performance.read' },
  increments: { table: 'increments', columns: 'id, company_id, employee_id, department_id, effective_date, current_ctc, revised_ctc, increment_percentage, approval_status, source_batch_id', permission: 'increments.read' },
  projects: { table: 'projects', columns: 'id, company_id, department_id, project_code, project_name, status, source_batch_id', permission: 'projects.read' },
  allocations: { table: 'project_allocations', columns: 'id, company_id, employee_id, department_id, project_id, reporting_month, allocation_percentage, monthly_gross_cost, source_batch_id', permission: 'projects.read' },
  recruitment: { table: 'recruitment_records', columns: 'id, company_id, department_id, requisition_code, reporting_month, designation, requisition_date, approved_positions, filled_positions, offers_extended, offers_accepted, status, joining_date, recruitment_source, source_batch_id', permission: 'recruitment.read' },
  vendors: { table: 'vendors', columns: 'id, company_id, vendor_code, vendor_name', permission: 'contracts.read' },
  contractors: { table: 'contract_manpower', columns: 'id, company_id, department_id, location_id, vendor_id, contractor_code, reporting_month, contract_start_date, contract_end_date, monthly_gross, service_charges, reported_gst_amount, status, source_batch_id', permission: 'contracts.read' },
  budgets: { table: 'budget_records', columns: 'id, company_id, department_id, reporting_month, budget_category, budget_amount, budget_version, source_batch_id', permission: 'budget.read' },
  batches: { table: 'import_batches', columns: 'id, company_id, department_id, dataset_type, reporting_month, uploaded_by, reviewed_by, approved_by, status, total_rows, accepted_rows, rejected_rows, warning_count, uploaded_at, reviewed_at, approved_at, published_at, metadata', permission: 'imports.read' },
})

const emptyStages = () => Object.fromEntries([
  'employeeMaster', 'employeeHistory', 'payroll', 'attendance', 'leave', 'performance', 'increments',
  'projectAllocation', 'projectMaster', 'departmentMaster', 'locationMaster', 'exitRecords',
  'recruitment', 'contractManpower', 'hrBudget',
].map((key) => [key, { rows: [], complete: false, completeMonths: [], completeAsOf: '' }]))

async function readPaged(client, key, companyIds = null) {
  const definition = DEFINITIONS[key]
  let start = 0
  const pageSize = 500
  const all = []
  while (true) {
    let query = client.from(definition.table).select(definition.columns)
    if (companyIds && definition.table !== 'companies' && definition.table !== 'organizations') {
      if (!companyIds.length) return []
      query = query.in('company_id', companyIds)
    }
    query = query.order('id').range(start, start + pageSize - 1)
    const { data, error } = await query
    if (error) throw new LiveWorkspaceError(`Could not load ${definition.table}: ${error.message || 'database access failed'}`, 'QUERY_FAILED')
    all.push(...(data || []))
    if (!data || data.length < pageSize) return all
    start += pageSize
  }
}

const monthOf = (value) => value ? String(value).slice(0, 7) : ''
const stage = (rows, extras = {}) => ({ rows, ...extras })

function buildStages(data, metadataAllowed) {
  const organizationById = new Map(data.organizations.map((row) => [row.id, row.organization_name]))
  const stages = emptyStages()
  const companyById = new Map(data.companies.map((row) => [row.id, row.company_name]))
  const organizationByCompanyId = new Map(data.companies.map((row) => [row.id, organizationById.get(row.organization_id) || '']))
  const departmentById = new Map(data.departments.map((row) => [row.id, row.department_name]))
  const locationById = new Map(data.locations.map((row) => [row.id, row.location_name]))
  const employeeById = new Map(data.employees.map((row) => [row.id, row]))
  const projectById = new Map(data.projects.map((row) => [row.id, row]))
  const vendorById = new Map(data.vendors.map((row) => [row.id, row]))
  const addCompany = (row) => ({ ...row, employeeRecordId: row.employee_id, projectRecordId: row.project_id,
    company: companyById.get(row.company_id) || '', organization: organizationByCompanyId.get(row.company_id) || '' })
  const batchesByType = new Map()
  data.batches.forEach((batch) => {
    if (batch.status !== 'Published') return
    batchesByType.set(batch.dataset_type, [...(batchesByType.get(batch.dataset_type) || []), batch])
  })
  const metadataByCompany = (type) => data.companies.map(({ id }) =>
    (batchesByType.get(type) || []).filter((batch) => batch.company_id === id))
  const sampleCompanyIds = new Set(data.companies.filter((company) => company.company_key === 'adtl' &&
    (data.departments.some((row) => row.company_id === company.id && row.department_key?.startsWith(ADTL_SAMPLE_DEPARTMENT_PREFIX)) ||
      data.employees.some((row) => row.company_id === company.id && row.employee_code?.startsWith(ADTL_SAMPLE_PREFIX))))
    .map((company) => company.id))
  const sampleOnly = data.companies.length === 1 && sampleCompanyIds.has(data.companies[0].id) &&
    data.employees.every((row) => row.employee_code?.startsWith(ADTL_SAMPLE_PREFIX))
  const allCompaniesComplete = (type, test = (batch) => batch.metadata?.complete === true) => metadataAllowed
    && data.companies.length > 0 && metadataByCompany(type).every((batches) => batches.some(test))
  const rosterDates = metadataAllowed ? metadataByCompany('employee_master').map((batches) =>
    batches.map((batch) => batch.metadata?.completeAsOf).filter(Boolean).sort().at(-1)) : []
  const monthMetadata = (type) => {
    const sampleRows = { payroll: data.payroll, attendance: data.attendance, leave: data.leave,
      performance: data.performance, project_allocation: data.allocations }
    if (sampleOnly && Object.hasOwn(sampleRows, type)) {
      return { completeMonths: [...new Set(sampleRows[type].map((row) => monthOf(row.reporting_month)).filter(Boolean))].sort() }
    }
    const monthsByCompany = metadataByCompany(type).map((batches) => new Set(batches.flatMap((batch) => {
      const months = batch.metadata?.completeMonths
      return Array.isArray(months) && months.length ? months : batch.metadata?.complete && batch.reporting_month ? [monthOf(batch.reporting_month)] : []
    })))
    const completeMonths = metadataAllowed ? [...(monthsByCompany[0] || [])]
      .filter((month) => monthsByCompany.every((months) => months.has(month))).sort() : []
    return { completeMonths }
  }

  stages.employeeMaster = stage(data.employees.map((row) => ({
    employeeId: row.employee_code, employeeRecordId: row.id, employeeName: row.employee_name, company: companyById.get(row.company_id) || '',
    organization: organizationByCompanyId.get(row.company_id) || '',
    department: departmentById.get(row.department_id) || '', location: locationById.get(row.location_id) || '',
    designation: row.designation || '', grade: row.grade || '', employmentType: row.employment_type || '',
    hireDate: row.hire_date, exitDate: row.exit_date || '', managerEmployeeId: employeeById.get(row.manager_employee_id)?.employee_code || '',
  })), { temporarySample: sampleCompanyIds.size > 0, sampleOnly,
    completeAsOf: sampleOnly && data.employees.length ? '2025-12-31' : rosterDates.length && rosterDates.every(Boolean) ? rosterDates.sort()[0] : '' })

  stages.employeeHistory = stage(data.employeeHistory.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', department: departmentById.get(row.department_id) || '',
    location: locationById.get(row.location_id) || '', designation: row.designation || '', employmentType: row.employment_type || '',
    grade: row.grade || '', managerEmployeeId: employeeById.get(row.manager_employee_id)?.employee_code || '', costCentre: row.cost_center || '',
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to || '',
  })), { complete: allCompaniesComplete('employee_history', (batch) => batch.metadata?.employeeHistoryComplete === true || batch.metadata?.complete === true)
    || allCompaniesComplete('employee_master', (batch) => batch.metadata?.employeeHistoryComplete === true) })

  stages.payroll = stage(data.payroll.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', reportingMonth: monthOf(row.reporting_month),
    monthlyGrossSalary: row.monthly_gross, annualCtc: row.annual_ctc,
    ...Object.fromEntries(PAYROLL_COMPONENTS.map(({ key }) => [key, row.components?.[key]])),
  })), monthMetadata('payroll'))
  stages.attendance = stage(data.attendance.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', reportingMonth: monthOf(row.reporting_month),
    calendarDays: row.calendar_days, workingDays: row.working_days, presentDays: row.present_days,
    attendancePercentage: row.attendance_percentage, weeklyOffDays: row.weekly_off_days, holidayDays: row.holiday_days,
    paidLeaveDays: row.paid_leave_days, unpaidLeaveDays: row.unpaid_leave_days, lopDays: row.lop_days, payableDays: row.payable_days,
  })), monthMetadata('attendance'))
  stages.leave = stage(data.leave.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', reportingMonth: monthOf(row.reporting_month),
    leaveType: row.leave_type, openingBalance: row.opening_balance, daysAvailed: row.days_availed, daysCredited: row.days_credited, closingBalance: row.closing_balance,
  })), monthMetadata('leave'))
  stages.performance = stage(data.performance.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', reportingMonth: monthOf(row.reporting_month),
    performanceScore: row.score, performanceCategory: row.performance_category, incrementPercent: null,
  })), monthMetadata('performance'))
  stages.increments = stage(data.increments.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', effectiveDate: row.effective_date,
    currentCtc: row.current_ctc, revisedCtc: row.revised_ctc, incrementPercentage: row.increment_percentage, approvalStatus: row.approval_status,
  })), monthMetadata('increment'))
  stages.projectMaster = stage(data.projects.map((row) => ({ ...addCompany(row), projectId: row.project_code, projectRecordId: row.id, projectName: row.project_name })), { complete: (sampleOnly && data.projects.length > 0) || allCompaniesComplete('project_master') })
  stages.projectAllocation = stage(data.allocations.map((row) => ({
    ...addCompany(row), employeeId: employeeById.get(row.employee_id)?.employee_code || '', projectId: projectById.get(row.project_id)?.project_code || '',
    reportingMonth: monthOf(row.reporting_month), allocationPercentage: row.allocation_percentage, monthlyGrossCost: row.monthly_gross_cost,
  })), monthMetadata('project_allocation'))
  stages.departmentMaster = stage(data.departments.map((row) => ({ ...addCompany(row), departmentId: row.department_key, department: row.department_name })), { complete: allCompaniesComplete('department_master') })
  stages.locationMaster = stage(data.locations.map((row) => ({ ...addCompany(row), locationId: row.location_key, location: row.location_name })), { complete: allCompaniesComplete('location_master') })
  stages.exitRecords = stage(data.employees.filter((row) => row.exit_date).map((row) => ({ ...addCompany(row), employeeId: row.employee_code, employeeRecordId: row.id, exitDate: row.exit_date, exitType: '', reasonCategory: '' })))
  stages.recruitment = stage(data.recruitment.map((row) => ({
    ...addCompany(row), requisitionId: row.requisition_code, reportingMonth: monthOf(row.reporting_month), department: departmentById.get(row.department_id) || '',
    designation: row.designation, recruitmentSource: row.recruitment_source || '', requisitionDate: row.requisition_date,
    approvedPositions: row.approved_positions, filledPositions: row.filled_positions, status: row.status,
    offersExtended: row.offers_extended, offersAccepted: row.offers_accepted, joiningDate: row.joining_date,
  })), monthMetadata('recruitment'))
  stages.contractManpower = stage(data.contractors.map((row) => ({
    ...addCompany(row), contractorId: row.contractor_code, reportingMonth: monthOf(row.reporting_month), vendor: vendorById.get(row.vendor_id)?.vendor_name || '',
    department: departmentById.get(row.department_id) || '', location: locationById.get(row.location_id) || '',
    contractStartDate: row.contract_start_date, contractEndDate: row.contract_end_date, monthlyGross: row.monthly_gross,
    vendorServiceCharges: row.service_charges, monthlyGstAmount: row.reported_gst_amount, status: row.status,
  })), monthMetadata('contract_manpower'))
  stages.hrBudget = stage(data.budgets.map((row) => ({
    ...addCompany(row), reportingMonth: monthOf(row.reporting_month), department: departmentById.get(row.department_id) || '',
    budgetCategory: row.budget_category, budgetAmount: row.budget_amount,
  })), monthMetadata('hr_budget'))
  return stages
}

export function scopedLiveStages(workspace, organization, company) {
  if (!workspace) return {}
  if (organization === 'All organizations' && company === 'All companies') return workspace.stagedImports
  const data = workspace.rowsByTable
  const organizations = data.organizations.filter((row) => organization === 'All organizations' || row.organization_name === organization)
  const organizationIds = new Set(organizations.map((row) => row.id))
  const companies = data.companies.filter((row) => organizationIds.has(row.organization_id)
    && (company === 'All companies' || row.company_name === company))
  const companyIds = new Set(companies.map((row) => row.id))
  const scoped = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.filter((row) => companyIds.has(row.company_id))]))
  return buildStages({ ...scoped, organizations, companies }, workspace.metadataAllowed)
}

export async function loadLiveWorkspace(client, accessProfile) {
  if (!client?.auth?.getUser || typeof client.from !== 'function') throw new LiveWorkspaceError('Live database access is not configured.', 'CONFIGURATION')
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw new LiveWorkspaceError(`Your session could not be verified: ${authError.message || 'sign in again'}`, 'SESSION')
  const userId = authData?.user?.id
  if (!userId || authData.user.is_anonymous) throw new LiveWorkspaceError('Sign in with an organization account to access live HR data.', 'UNAUTHORIZED')

  const roles = await readPaged(client, 'organizations')
  const userRolesResult = await client.from('user_roles').select('organization_id, company_id, department_id, role_key, active').eq('user_id', userId).eq('active', true)
  if (userRolesResult.error) throw new LiveWorkspaceError(`Could not verify your organization access: ${userRolesResult.error.message || 'access denied'}`, 'UNAUTHORIZED')
  if (!userRolesResult.data?.length) throw new LiveWorkspaceError('This account has no active organization role.', 'UNAUTHORIZED')
  const companies = await readPaged(client, 'companies')
  const companyIds = companies.map((company) => company.id)
  const catalogQueries = await Promise.all([
    readPaged(client, 'departments', companyIds),
    readPaged(client, 'locations', companyIds),
  ])
  const departments = catalogQueries[0]
  const locations = catalogQueries[1]
  const permissions = accessProfile?.permissions || new Set()
  const hasPermission = (permission) => permissions.has('*') || permissions.has(permission)
  const data = { organizations: roles, companies, departments, locations }
  const resourceKeys = Object.keys(DEFINITIONS).filter((key) => DEFINITIONS[key].permission && hasPermission(DEFINITIONS[key].permission))
  const resourceValues = await Promise.all(resourceKeys.map((key) => readPaged(client, key, companyIds)))
  resourceKeys.forEach((key, index) => { data[key] = resourceValues[index] })
  for (const key of Object.keys(DEFINITIONS)) if (!data[key]) data[key] = []
  const metadataAllowed = hasPermission('imports.read')
  const mappedStages = buildStages(data, metadataAllowed)
  return {
    userId,
    scopeKey: accessProfile?.scopeKey,
    organizations: roles,
    roles: userRolesResult.data,
    companies,
    departments,
    locations,
    rowsByTable: data,
    stagedImports: mappedStages,
    metadataAllowed,
    loadedAt: new Date().toISOString(),
    authorized: true,
    empty: companies.length === 0 || !resourceKeys.some((key) => data[key]?.length),
    monthlyCategories: MONTHLY_IMPORT_CATEGORIES,
  }
}

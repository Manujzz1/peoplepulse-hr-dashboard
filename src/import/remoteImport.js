const DATASETS = Object.freeze({
  employeeMaster: 'employee_master', employeeHistory: 'employee_history', payroll: 'payroll', attendance: 'attendance',
  leave: 'leave', performance: 'performance', increments: 'increment', projectAllocation: 'project_allocation',
  projectMaster: 'project_master', departmentMaster: 'department_master', locationMaster: 'location_master',
  recruitment: 'recruitment', contractManpower: 'contract_manpower', hrBudget: 'hr_budget',
})

const key = (value) => String(value ?? '').trim().toLocaleLowerCase('en-US')
const rowsFor = (workspace, name) => workspace?.rowsByTable?.[name] || []
const idFor = (values, rows, idField, valueField, label) => {
  const normalized = key(values)
  if (!normalized) return null
  const match = rows.find((row) => key(row[valueField]) === normalized || key(row[label]) === normalized)
  return match?.[idField] || null
}
const employeeIdFor = (value, employees) => employees.find((row) => key(row.employee_code) === key(value))?.id || null
const dateMonth = (value) => value ? `${String(value).slice(0, 7)}-01` : null

function monthFor(category, rows) {
  const months = [...new Set(rows.map((row) => category === 'increments' ? String(row.effectiveDate || '').slice(0, 7) : row.reportingMonth).filter(Boolean))]
  if (months.length > 1) throw new Error('Submit one reporting month per database batch. Split this file by month and retry after reviewing the current batch status.')
  return months[0] ? `${months[0]}-01` : null
}

function rejectUnrepresentable(category, rows) {
  if (category === 'exitRecords') throw new Error('Exit Records cannot be stored: the current schema has no exit_records table. Put exit_date in an Employee Master import instead.')
  if (category === 'performance' && rows.some((row) => row.incrementPercent != null && row.incrementPercent !== '')) throw new Error('The current performance_reviews table does not store increment percentage. Import increments through the Increment category.')
  if (category === 'attendance' && rows.some((row) => row.leaveTaken != null && row.leaveTaken !== '')) throw new Error('The attendance schema stores paid and unpaid leave days separately; import leave usage through the Leave category instead of dropping leaveTaken.')
}

function mapRows(category, inputRows, companyId, batchId, workspace, makeUuid) {
  const employees = rowsFor(workspace, 'employees').filter((row) => row.company_id === companyId)
  const departments = rowsFor(workspace, 'departments').filter((row) => row.company_id === companyId)
  const locations = rowsFor(workspace, 'locations').filter((row) => row.company_id === companyId)
  const projects = rowsFor(workspace, 'projects').filter((row) => row.company_id === companyId)
  const vendors = rowsFor(workspace, 'vendors').filter((row) => row.company_id === companyId)
  const newEmployeeIds = new Map()
  if (category === 'employeeMaster') inputRows.forEach((row) => {
    const employeeKey = key(row.employeeId)
    if (newEmployeeIds.has(employeeKey)) throw new Error(`Employee ID ${row.employeeId} appears more than once in this file.`)
    const id = makeUuid()
    if (!id) throw new Error('Secure UUID generation is unavailable in this browser.')
    newEmployeeIds.set(employeeKey, id)
  })
  const employee = (record) => {
    const id = employeeIdFor(record.employeeId, employees)
    if (!id) throw new Error(`Employee ID ${record.employeeId} is not present in published Employee Master data for the selected company.`)
    return id
  }
  const department = (record) => {
    const id = idFor(record.department, departments, 'id', 'department_name', 'department_key')
    if (!id) throw new Error(`Department ${record.department} is not present in the selected company's published department list.`)
    return id
  }
  const location = (record) => {
    const id = idFor(record.location, locations, 'id', 'location_name', 'location_key')
    if (!id) throw new Error(`Location ${record.location} is not present in the selected company's published location list.`)
    return id
  }
  const base = { company_id: companyId, source_batch_id: batchId }
  return inputRows.map((row) => {
    switch (category) {
      case 'employeeMaster': {
        const managerId = row.managerEmployeeId ? employeeIdFor(row.managerEmployeeId, employees) || newEmployeeIds.get(key(row.managerEmployeeId)) : null
        if (row.managerEmployeeId && !managerId) throw new Error(`Manager Employee ID ${row.managerEmployeeId} is not present in published Employee Master data.`)
        return { ...base, id: newEmployeeIds.get(key(row.employeeId)), employee_code: row.employeeId, employee_name: row.employeeName, department_id: row.department ? department(row) : null,
          location_id: row.location ? location(row) : null, designation: row.designation || null, grade: row.grade || null,
          employment_type: row.employmentType || null, hire_date: row.hireDate, exit_date: row.exitDate || null, manager_employee_id: managerId }
      }
      case 'employeeHistory': {
        const managerId = row.managerEmployeeId ? employeeIdFor(row.managerEmployeeId, employees) : null
        if (row.managerEmployeeId && !managerId) throw new Error(`Manager Employee ID ${row.managerEmployeeId} is not present in published Employee Master data.`)
        return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
          location_id: row.location ? location(row) : null, designation: row.designation || null, grade: row.grade || null,
          employment_type: row.employmentType || null, manager_employee_id: managerId, cost_center: row.costCentre || null,
          effective_from: row.effectiveFrom, effective_to: row.effectiveTo || null }
      }
      case 'payroll': return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
        reporting_month: dateMonth(row.reportingMonth), monthly_gross: row.monthlyGrossSalary, annual_ctc: row.annualCtc ?? null,
        components: Object.fromEntries(['monthlyBasic', 'monthlyHra', 'monthlyOtherAllowances', 'employerPf', 'employerEsic', 'gratuity', 'variablePay', 'incentives', 'arrears', 'overtime'].filter((field) => row[field] != null && row[field] !== '').map((field) => [field, Number(row[field])])) }
      case 'attendance': return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
        reporting_month: dateMonth(row.reportingMonth), calendar_days: row.calendarDays ?? null, working_days: row.workingDays ?? null,
        present_days: row.presentDays ?? null, attendance_percentage: row.attendancePercentage ?? null, weekly_off_days: row.weeklyOffDays ?? null,
        holiday_days: row.holidayDays ?? null, paid_leave_days: row.paidLeaveDays ?? null, unpaid_leave_days: row.unpaidLeaveDays ?? null,
        lop_days: row.lopDays ?? 0, payable_days: row.payableDays ?? null }
      case 'leave': return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
        reporting_month: dateMonth(row.reportingMonth), leave_type: row.leaveType, opening_balance: row.openingBalance ?? null,
        days_availed: row.daysAvailed, days_credited: row.daysCredited ?? 0, closing_balance: row.closingBalance ?? null }
      case 'performance': return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
        review_period: row.reportingMonth, reporting_month: dateMonth(row.reportingMonth), score: row.performanceScore,
        performance_category: row.performanceCategory || null, approval_status: 'Pending' }
      case 'increments': return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null,
        effective_date: row.effectiveDate, current_ctc: row.currentCtc, revised_ctc: row.revisedCtc,
        increment_percentage: row.incrementPercentage ?? null, approval_status: row.approvalStatus || 'Pending' }
      case 'projectAllocation': {
        const projectId = projects.find((project) => key(project.project_code) === key(row.projectId))?.id
        if (!projectId) throw new Error(`Project ID ${row.projectId} is not present in published Project Master data for the selected company.`)
        return { ...base, employee_id: employee(row), department_id: row.department ? department(row) : null, project_id: projectId,
          reporting_month: dateMonth(row.reportingMonth), allocation_percentage: row.allocationPercentage, monthly_gross_cost: row.monthlyGrossCost ?? null }
      }
      case 'projectMaster': {
        const id = makeUuid()
        if (!id) throw new Error('Secure UUID generation is unavailable in this browser.')
        return { ...base, id, department_id: row.department ? department(row) : null, project_code: row.projectId, project_name: row.projectName, status: row.status || 'Active' }
      }
      case 'departmentMaster': {
        const id = makeUuid()
        if (!id) throw new Error('Secure UUID generation is unavailable in this browser.')
        return { ...base, id, department_key: row.departmentId, department_name: row.department }
      }
      case 'locationMaster': {
        const id = makeUuid()
        if (!id) throw new Error('Secure UUID generation is unavailable in this browser.')
        return { ...base, id, location_key: row.locationId, location_name: row.location }
      }
      case 'recruitment': return { ...base, department_id: row.department ? department(row) : null, requisition_code: row.requisitionId,
        reporting_month: dateMonth(row.reportingMonth), designation: row.designation, requisition_date: row.requisitionDate,
        approved_positions: row.approvedPositions, filled_positions: row.filledPositions, offers_extended: row.offersExtended ?? null,
        offers_accepted: row.offersAccepted ?? null, status: row.status, joining_date: row.joiningDate || null, recruitment_source: row.recruitmentSource || null }
      case 'contractManpower': {
        const vendor = vendors.find((item) => key(item.vendor_name) === key(row.vendor) || key(item.vendor_code) === key(row.vendor))
        if (!vendor) throw new Error(`Vendor ${row.vendor} is not present in the selected company's vendor list. Vendor creation is not part of this import.`)
        return { ...base, department_id: row.department ? department(row) : null, location_id: row.location ? location(row) : null, vendor_id: vendor.id,
          contractor_code: row.contractorId, reporting_month: dateMonth(row.reportingMonth), contract_start_date: row.contractStartDate,
          contract_end_date: row.contractEndDate || null, monthly_gross: row.monthlyGross, service_charges: row.vendorServiceCharges ?? 0,
          reported_gst_amount: row.monthlyGstAmount ?? 0, status: row.status }
      }
      case 'hrBudget': return { ...base, department_id: department(row), reporting_month: dateMonth(row.reportingMonth),
        budget_category: row.budgetCategory, budget_amount: row.budgetAmount }
      default: throw new Error(`The ${category} import is not supported by the current database schema.`)
    }
  })
}

function existingDuplicate(category, rows, companyId, workspace) {
  const tableFor = {
    employeeMaster: 'employees', employeeHistory: 'employeeHistory', payroll: 'payroll', attendance: 'attendance', leave: 'leave',
    performance: 'performance', increments: 'increments', projectAllocation: 'allocations', projectMaster: 'projects',
    departmentMaster: 'departments', locationMaster: 'locations', recruitment: 'recruitment', contractManpower: 'contractors', hrBudget: 'budgets',
  }[category]
  const existing = rowsFor(workspace, tableFor).filter((record) => record.company_id === companyId)
  const keys = {
    employeeMaster: (row) => key(row.employee_code), employeeHistory: (row) => `${row.employee_id}:${row.effective_from}`,
    payroll: (row) => `${row.employee_id}:${String(row.reporting_month).slice(0, 7)}`, attendance: (row) => `${row.employee_id}:${String(row.reporting_month).slice(0, 7)}`,
    leave: (row) => `${row.employee_id}:${String(row.reporting_month).slice(0, 7)}:${key(row.leave_type)}`,
    performance: (row) => `${row.employee_id}:${row.review_period}`, increments: (row) => `${row.employee_id}:${row.effective_date}`,
    projectAllocation: (row) => `${row.employee_id}:${row.project_id}:${String(row.reporting_month).slice(0, 7)}`,
    projectMaster: (row) => key(row.project_code), departmentMaster: (row) => key(row.department_key), locationMaster: (row) => key(row.location_key),
    recruitment: (row) => `${key(row.requisition_code)}:${String(row.reporting_month).slice(0, 7)}`,
    contractManpower: (row) => `${key(row.contractor_code)}:${String(row.reporting_month).slice(0, 7)}`,
    hrBudget: (row) => `${row.department_id}:${String(row.reporting_month).slice(0, 7)}:${row.budget_category}`,
  }[category]
  const existingKeys = new Set(existing.map(keys))
  const duplicates = rows.filter((row) => existingKeys.has(keys(row)))
  return duplicates.length
}

async function assertCurrentUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error) throw new Error(`Session verification failed: ${error.message || 'sign in again before importing'}`)
  if (!data?.user?.id || data.user.is_anonymous) throw new Error('Sign in with an organization account before importing.')
  return data.user.id
}

async function importIdentity({ userId, companyId, datasetType, reportingMonth, stage }) {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('Secure retry protection is unavailable in this browser.')
  const payload = JSON.stringify({
    userId, companyId, datasetType, reportingMonth, rows: stage.rows,
    complete: Boolean(stage.complete), completeMonths: stage.completeMonths || [], completeAsOf: stage.completeAsOf || '',
  })
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)))
  const payloadHash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const uuidBytes = [...digest.slice(0, 16)]
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80
  const hex = uuidBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const batchId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return { batchId, payloadHash }
}

async function stableMappedIds(batchId, category, count) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure retry protection is unavailable in this browser.')
  const encoder = new TextEncoder()
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const input = encoder.encode(`peoplepulse-import-row-v1:${batchId}:${category}:${index}`)
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input))
    const bytes = [...digest.slice(0, 16)]
    // UUID version 8 is used for stable row identifiers derived from this batch.
    bytes[6] = (bytes[6] & 0x0f) | 0x80
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }))
}

/**
 * Submit one atomic, idempotent batch through the reviewed database RPC.
 */
export async function submitImportBatch({ client, category, stage, companyId, workspace, makeUuid }) {
  if (!client?.auth?.getUser || typeof client.from !== 'function' || typeof client.rpc !== 'function') throw new Error('Authenticated database client with atomic import support is unavailable.')
  const userId = await assertCurrentUser(client)
  if (!DATASETS[category]) throw new Error(`The ${category} category is not supported by the current database schema.`)
  if (!companyId || !(workspace?.companies || []).some((company) => company.id === companyId)) throw new Error('Choose a company visible to your current organization session.')
  if (!stage?.rows?.length) throw new Error('Stage and validate rows before submitting an import.')
  if (stage.rows.length > 5000) throw new Error('Split this file into batches of at most 5,000 rows before submitting.')
  if (stage.summary?.rejectedRows || stage.summary?.warningCount) throw new Error('Resolve every validation error and warning before submitting a database import.')
  rejectUnrepresentable(category, stage.rows)
  const reportingMonth = monthFor(category, stage.rows)
  const { batchId, payloadHash } = await importIdentity({ userId, companyId, datasetType: DATASETS[category], reportingMonth, stage })
  const needsStableRowIds = ['employeeMaster', 'projectMaster', 'departmentMaster', 'locationMaster'].includes(category)
  const generatedIds = makeUuid || !needsStableRowIds ? [] : await stableMappedIds(batchId, category, stage.rows.length)
  const makeIdFactory = () => {
    let index = 0
    return () => makeUuid ? makeUuid() : generatedIds[index++] || null
  }

  const { data: existingBatch, error: lookupError } = await client.from('import_batches')
    .select('id, company_id, dataset_type, reporting_month, uploaded_by, status, metadata')
    .eq('id', batchId)
    .maybeSingle()
  if (lookupError) throw new Error(`Could not check the previous submission before retrying: ${lookupError.message || 'database access failed'}`)
  const mapped = mapRows(category, stage.rows, companyId, batchId, workspace, makeIdFactory())
  if (!existingBatch) {
    const duplicateCount = existingDuplicate(category, mapped, companyId, workspace)
    if (duplicateCount) throw new Error(`${duplicateCount} visible database duplicate${duplicateCount === 1 ? '' : 's'} already exist for this company and category.`)
  }

  const metadata = {
    payloadHash,
    fileName: String(stage.fileName || '').slice(0, 180),
    sourceSheet: String(stage.sheetName || '').slice(0, 100),
    complete: Boolean(stage.complete), completeMonths: stage.completeMonths || [], completeAsOf: stage.completeAsOf || '',
    employeeHistoryComplete: category === 'employeeHistory' && Boolean(stage.complete),
  }
  const { data, error } = await client.rpc('submit_peoplepulse_import_batch', {
    target_batch_id: batchId,
    target_company_id: companyId,
    target_dataset_type: DATASETS[category],
    target_reporting_month: reportingMonth,
    target_metadata: metadata,
    target_rows: mapped,
  })
  if (error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(error?.message || '')) {
    throw new Error('Atomic import is not available because the reviewed database RPC has not been installed. No import batch was submitted.')
  }
  if (error?.code === '55000') {
    throw new Error('This batch needs administrator review before it can be retried. No existing rows were changed.')
  }
  if (error) throw new Error(`Atomic import was not confirmed. Retry with the same staged file; the batch key is stable. ${error.message || 'The database rejected the request.'}`)
  if (!data?.batchId || !data.status) throw new Error('The database did not return a confirmed batch status. Check the batch history before retrying.')
  return { batchId: data.batchId, status: data.status, totalRows: data.totalRows, reportingMonth: data.reportingMonth, reused: Boolean(data.reused) }
}

export async function transitionImportBatch(client, batchId, status) {
  await assertCurrentUser(client)
  if (!['Reviewed', 'Approved', 'Published', 'Rejected'].includes(status)) throw new Error('Unsupported import workflow transition.')
  const { data, error } = await client.from('import_batches').update({ status }).eq('id', batchId).select('id, status').single()
  if (error) throw new Error(error.message || `Import batch could not transition to ${status}.`)
  return data
}

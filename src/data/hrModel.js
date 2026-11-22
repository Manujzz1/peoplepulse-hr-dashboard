import { getLatestPayrollReconciliationBatch, getPayrollControlMismatches } from '../import/payrollReconciliation'
import { financialYearMonthsFor } from './reportingCalendar'

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const keyOf = (value) => String(value ?? '').trim().toUpperCase()
export const employeeModelKey = (row) => keyOf(row.employeeRecordId || row.employeeId)
const projectModelKey = (row) => keyOf(row?.projectRecordId || row?.projectId)

const parseMonth = (value) => {
  const match = MONTH_PATTERN.exec(String(value ?? ''))
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null
}

const dateValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date.getTime() : null
}

const rowsFor = (staged, category) => staged?.[category]?.rows || []
const monthsFor = (staged, category) => new Set(staged?.[category]?.completeMonths || [])
export const PAYROLL_COMPONENTS = Object.freeze([
  { key: 'monthlyBasic', label: 'Basic' },
  { key: 'monthlyHra', label: 'HRA' },
  { key: 'monthlyOtherAllowances', label: 'Other allowances' },
  { key: 'employerPf', label: 'Employer PF' },
  { key: 'employerEsic', label: 'Employer ESIC' },
  { key: 'gratuity', label: 'Gratuity' },
  { key: 'variablePay', label: 'Variable pay' },
  { key: 'incentives', label: 'Incentives' },
  { key: 'arrears', label: 'Arrears' },
  { key: 'overtime', label: 'Overtime' },
])
const numberOrNull = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
export function createHrModel(staged = {}) {
  const employees = new Map(rowsFor(staged, 'employeeMaster').map((employee) => [employeeModelKey(employee), employee]))
  const employeeHistory = rowsFor(staged, 'employeeHistory')
  const projects = new Map(rowsFor(staged, 'projectMaster').map((project) => [projectModelKey(project), project]))
  const payroll = rowsFor(staged, 'payroll')
  const attendance = rowsFor(staged, 'attendance')
  const leave = rowsFor(staged, 'leave')
  const performance = rowsFor(staged, 'performance')
  const increments = rowsFor(staged, 'increments')
  const exitRecords = rowsFor(staged, 'exitRecords')
  // Exit Records confirm explicit departures. A partial file never implies that
  // employees omitted from it are still active. Conflicts stay unresolved.
  const exitDatesByEmployee = new Map()
  exitRecords.forEach((record) => {
    const employeeKey = employeeModelKey(record)
    if (!employeeKey || !dateValue(record.exitDate)) return
    exitDatesByEmployee.set(employeeKey, [...(exitDatesByEmployee.get(employeeKey) || []), record.exitDate])
  })
  const exitRecordConflicts = []
  exitDatesByEmployee.forEach((dates, employeeKey) => {
    const uniqueDates = [...new Set(dates.map((date) => dateValue(date)))].sort((a, b) => a - b)
    const employee = employees.get(employeeKey)
    if (!employee) return
    const masterDate = employee.exitDate ? dateValue(employee.exitDate) : null
    if (uniqueDates.length > 1 || (masterDate != null && uniqueDates.some((date) => date !== masterDate))) {
      exitRecordConflicts.push(employee.employeeId)
      return
    }
    if (masterDate == null && uniqueDates.length === 1) {
      const exitRecord = exitRecords.find((record) => employeeModelKey(record) === employeeKey && dateValue(record.exitDate) === uniqueDates[0])
      employees.set(employeeKey, { ...employee, exitDate: exitRecord.exitDate, exitType: exitRecord.exitType || '' })
    } else if (masterDate != null && uniqueDates.length === 1 && uniqueDates[0] === masterDate) {
      const exitRecord = exitRecords.find((record) => employeeModelKey(record) === employeeKey && dateValue(record.exitDate) === masterDate)
      if (exitRecord?.exitType) employees.set(employeeKey, { ...employee, exitType: exitRecord.exitType })
    }
  })
  const allocations = rowsFor(staged, 'projectAllocation')
  const recruitment = rowsFor(staged, 'recruitment')
  const contractManpower = rowsFor(staged, 'contractManpower')
  const hrBudget = rowsFor(staged, 'hrBudget')

  const unmatchedEmployees = [
    ...employeeHistory, ...payroll, ...attendance, ...leave, ...performance, ...increments, ...exitRecords, ...allocations,
  ].filter((record) => !employees.has(employeeModelKey(record)))
  const unmatchedProjects = allocations.filter((record) => !projects.has(projectModelKey(record)))

  return {
    employees,
    employeeHistory,
    projects,
    employeeMasterAsOf: staged.employeeMaster?.completeAsOf || '',
    payroll,
    payrollReconciliationBatches: staged.payroll?.reconciliationBatches || [],
    attendance,
    leave,
    performance,
    increments,
    exitRecords,
    exitRecordConflicts,
    allocations,
    projectAllocation: allocations,
    recruitment,
    contractManpower,
    hrBudget,
    unmatchedEmployees,
    unmatchedProjects,
    completeness: {
      employeeMaster: Boolean(staged.employeeMaster?.completeAsOf),
      employeeHistory: Boolean(staged.employeeHistory?.complete),
      projectMaster: Boolean(staged.projectMaster?.complete),
      payroll: monthsFor(staged, 'payroll'),
      attendance: monthsFor(staged, 'attendance'),
      leave: monthsFor(staged, 'leave'),
      performance: monthsFor(staged, 'performance'),
      increments: monthsFor(staged, 'increments'),
      projectAllocation: monthsFor(staged, 'projectAllocation'),
      recruitment: monthsFor(staged, 'recruitment'),
      contractManpower: monthsFor(staged, 'contractManpower'),
      hrBudget: monthsFor(staged, 'hrBudget'),
    },
  }
}

function activeOn(employee, timestamp) {
  const hire = dateValue(employee.hireDate)
  const exit = employee.exitDate ? dateValue(employee.exitDate) : null
  return hire != null && hire <= timestamp && (exit == null || exit > timestamp)
}

function matches(employee, filters) {
  return (!filters.department || filters.department === 'All departments' || employee.department === filters.department) &&
    (!filters.location || filters.location === 'All locations' || employee.location === filters.location) &&
    (!filters.company || filters.company === 'All companies' || (filters.company === 'Not specified' ? !employee.company : employee.company === filters.company)) &&
    (!filters.employmentType || filters.employmentType === 'All employment types' || employee.employmentType === filters.employmentType)
}

const HISTORY_ATTRIBUTE_FIELDS = ['department', 'location', 'designation', 'grade', 'employmentType', 'managerEmployeeId', 'costCentre']

function employeeAt(model, employee, timestamp) {
  if (!model.completeness.employeeHistory || timestamp == null) return employee
  const history = model.employeeHistory
    .filter((row) => {
      if (employeeModelKey(row) !== employeeModelKey(employee)) return false
      const from = dateValue(row.effectiveFrom)
      const to = row.effectiveTo ? dateValue(row.effectiveTo) : null
      return from != null && from <= timestamp && (to == null || to + 86400000 - 1 >= timestamp)
    })
    .sort((left, right) => dateValue(right.effectiveFrom) - dateValue(left.effectiveFrom))[0]
  if (!history) return employee
  return {
    ...employee,
    ...Object.fromEntries(HISTORY_ATTRIBUTE_FIELDS
      .filter((field) => history[field] != null && String(history[field]).trim() !== '')
      .map((field) => [field, history[field]])),
  }
}

export function getImportedEmployeeDirectory(model, asOfDate, filters = {}) {
  const timestamp = dateValue(asOfDate)
  if (timestamp == null) return []
  return [...model.employees.values()]
    .map((employee) => {
      const effectiveHistory = model.completeness.employeeHistory
        ? model.employeeHistory
          .filter((row) => {
            const effectiveFrom = dateValue(row.effectiveFrom)
            return employeeModelKey(row) === employeeModelKey(employee) && effectiveFrom != null && effectiveFrom <= timestamp
          })
          .sort((left, right) => dateValue(left.effectiveFrom) - dateValue(right.effectiveFrom))
        : []
      return {
        ...employeeAt(model, employee, timestamp + 86400000 - 1),
        effectiveHistory,
      }
    })
    .filter((employee) => matches(employee, filters))
}

const avg = (rows, selector) => rows.length ? rows.reduce((sum, row) => sum + Number(selector(row) || 0), 0) / rows.length : null
const sum = (rows, selector) => rows.reduce((total, row) => total + Number(selector(row) || 0), 0)

export function getImportedMonthMetrics(model, reportingMonth, filters = {}, asOfDate = '', options = {}) {
  const financialYearStartMonth = options.financialYearStartMonth ?? 4
  const parsed = parseMonth(reportingMonth)
  if (!parsed) throw new Error('Reporting month must use YYYY-MM format.')
  const { year, month } = parsed
  const monthStart = Date.UTC(year, month, 1)
  const monthEnd = Date.UTC(year, month + 1, 0, 23, 59, 59, 999)
  const selectedTimestamp = asOfDate ? dateValue(asOfDate) + 86400000 - 1 : monthEnd
  if (selectedTimestamp == null || new Date(selectedTimestamp).getUTCFullYear() !== year || new Date(selectedTimestamp).getUTCMonth() !== month) {
    throw new Error('As-of date must be valid and belong to the selected reporting month.')
  }
  const periodEnd = selectedTimestamp
  const payrollControlBatch = getLatestPayrollReconciliationBatch(model.payrollReconciliationBatches, reportingMonth)
  const payrollControlMismatch = getPayrollControlMismatches(model.payrollReconciliationBatches, reportingMonth).length > 0
  const payrollComplete = model.completeness.payroll.has(reportingMonth) && !payrollControlMismatch
  const previousEnd = monthStart - 1
  const periodEmployees = [...model.employees.values()].map((employee) => employeeAt(model, employee, periodEnd))
  const opening = [...model.employees.values()].map((employee) => employeeAt(model, employee, previousEnd))
    .filter((employee) => activeOn(employee, previousEnd) && matches(employee, filters))
  const closing = periodEmployees.filter((employee) => activeOn(employee, periodEnd) && matches(employee, filters))
  const joiners = [...model.employees.values()].filter((employee) => {
    const hired = dateValue(employee.hireDate)
    return hired != null && hired >= monthStart && hired <= periodEnd && matches(employeeAt(model, employee, hired), filters)
  })
  const exits = [...model.employees.values()].filter((employee) => {
    const exited = employee.exitDate ? dateValue(employee.exitDate) : null
    return exited != null && exited >= monthStart && exited <= periodEnd && matches(employeeAt(model, employee, exited), filters)
  })
  const scopedEmployees = new Map(periodEmployees.map((employee) => [employeeModelKey(employee), employee]))
  const monthRows = (rows) => rows.filter((row) => row.reportingMonth === reportingMonth && scopedEmployees.has(employeeModelKey(row)) && matches(scopedEmployees.get(employeeModelKey(row)), filters))
  const payrollRows = monthRows(model.payroll)
  const attendanceRows = monthRows(model.attendance)
  const performanceRows = monthRows(model.performance)
  const allocationRows = monthRows(model.allocations)
  const projectCostBasis = ['payroll', 'allocation', 'hybrid'].includes(options.projectCostBasis) ? options.projectCostBasis : 'hybrid'
  const incrementRowsForMonth = model.increments.filter((row) => {
    const effective = dateValue(row.effectiveDate)
    return effective != null && effective >= monthStart && effective <= periodEnd && model.employees.has(employeeModelKey(row)) && matches(employeeAt(model, model.employees.get(employeeModelKey(row)), effective), filters)
  }).map((row) => {
    const employee = employeeAt(model, model.employees.get(employeeModelKey(row)), dateValue(row.effectiveDate))
    const annualCostImpact = Number(row.revisedCtc) - Number(row.currentCtc)
    const incrementPercent = row.incrementPercentage == null
      ? Number(row.currentCtc) > 0 ? annualCostImpact / Number(row.currentCtc) * 100 : null
      : Number(row.incrementPercentage)
    return {
      ...row,
      company: employee.company || 'Not specified',
      employeeName: employee.employeeName,
      department: employee.department || 'Not specified',
      effectiveDate: row.effectiveDate,
      incrementPercent,
      annualCostImpact,
      monthlyCostImpact: annualCostImpact / 12,
    }
  })
  const approvedIncrementRows = incrementRowsForMonth.filter((row) => row.approvalStatus === 'Approved')
  const pendingIncrementCount = incrementRowsForMonth.filter((row) => row.approvalStatus === 'Pending').length
  const rejectedIncrementCount = incrementRowsForMonth.filter((row) => row.approvalStatus === 'Rejected').length
  const incrementUnmatchedCount = model.increments.filter((row) => {
    const effective = dateValue(row.effectiveDate)
    return effective != null && effective >= monthStart && effective <= periodEnd && !model.employees.has(employeeModelKey(row))
  }).length
  const incrementComplete = model.completeness.increments.has(reportingMonth) && incrementUnmatchedCount === 0
  const incrementByDepartment = [...approvedIncrementRows.reduce((groups, row) => {
    const group = groups.get(row.department) || { department: row.department, approvedCount: 0, incrementCount: 0, annualCostImpact: 0, monthlyCostImpact: 0, incrementTotal: 0 }
    group.approvedCount += 1
    group.annualCostImpact += row.annualCostImpact
    group.monthlyCostImpact += row.monthlyCostImpact
    if (row.incrementPercent != null) {
      group.incrementCount += 1
      group.incrementTotal += Number(row.incrementPercent)
    }
    groups.set(row.department, group)
    return groups
  }, new Map()).values()].map((group) => ({
    ...group,
    averageIncrementPercent: group.incrementCount ? group.incrementTotal / group.incrementCount : null,
  }))
  const incrementBudgetFiltersSupported = (!filters.location || filters.location === 'All locations') && (!filters.employmentType || filters.employmentType === 'All employment types')
  const incrementBudgetRows = model.hrBudget.filter((row) => row.reportingMonth === reportingMonth && row.budgetCategory === 'Increment' &&
    (!filters.company || filters.company === 'All companies' || (filters.company === 'Not specified' ? !row.company : row.company === filters.company)) &&
    (!filters.department || filters.department === 'All departments' || row.department === filters.department))
  const incrementBudgetComplete = model.completeness.hrBudget.has(reportingMonth) && incrementBudgetFiltersSupported
  const incrementBudget = incrementBudgetComplete ? sum(incrementBudgetRows, (row) => row.budgetAmount) : null
  const incrementActualMonthlyCost = incrementComplete ? sum(approvedIncrementRows, (row) => row.monthlyCostImpact) : null
  const grossByEmployee = new Map(payrollRows.map((row) => [employeeModelKey(row), Number(row.monthlyGrossSalary)]))

  const allocationPercentByEmployee = new Map()
  allocationRows.forEach((row) => {
    const id = employeeModelKey(row)
    allocationPercentByEmployee.set(id, (allocationPercentByEmployee.get(id) || 0) + Number(row.allocationPercentage || 0))
  })
  const allocatedEmployees = new Set(allocationRows.map((row) => employeeModelKey(row)))
  const overallocatedEmployees = [...allocationPercentByEmployee].filter(([, value]) => value > 100).map(([id]) => id)
  const payrollProjectCostAvailable = payrollComplete && allocationRows.length > 0 && allocationRows.every((row) => grossByEmployee.has(employeeModelKey(row)))
  const allocationProjectCostAvailable = allocationRows.length > 0 && allocationRows.every((row) => row.monthlyGrossCost != null && row.monthlyGrossCost !== '')
  const hybridProjectCostAvailable = allocationRows.length > 0 && allocationRows.every((row) => (payrollComplete && grossByEmployee.has(employeeModelKey(row))) || (row.monthlyGrossCost != null && row.monthlyGrossCost !== ''))
  const projectCostAvailable = projectCostBasis === 'payroll' ? payrollProjectCostAvailable
    : projectCostBasis === 'allocation' ? allocationProjectCostAvailable
      : hybridProjectCostAvailable
  const projectCostBasisLabel = projectCostBasis === 'payroll' ? 'Payroll monthly gross'
    : projectCostBasis === 'allocation' ? 'Allocation row monthly gross'
      : 'Best available gross per employee (payroll, then allocation row)'
  const projectGrossCost = (row) => {
    if (projectCostBasis === 'payroll') return projectCostAvailable ? grossByEmployee.get(employeeModelKey(row)) : null
    if (projectCostBasis === 'allocation') return projectCostAvailable ? Number(row.monthlyGrossCost) : null
    return payrollComplete && grossByEmployee.has(employeeModelKey(row)) ? grossByEmployee.get(employeeModelKey(row))
      : row.monthlyGrossCost == null || row.monthlyGrossCost === '' ? null : Number(row.monthlyGrossCost)
  }
  const projectCosts = projectCostAvailable ? allocationRows.reduce((total, row) => (
    total + projectGrossCost(row) * Number(row.allocationPercentage || 0) / 100
  ), 0) : null
  const projectGroups = new Map()
  allocationRows.forEach((row) => {
    const projectKey = projectModelKey(row)
    const projectName = model.projects.get(projectKey)?.projectName || row.projectId
    const group = projectGroups.get(projectKey) || { projectId: row.projectId, project: projectName, employeeIds: new Set(), allocationTotal: 0, cost: 0 }
    const gross = projectGrossCost(row)
    group.employeeIds.add(employeeModelKey(row))
    group.allocationTotal += Number(row.allocationPercentage || 0)
    if (gross != null) group.cost += gross * Number(row.allocationPercentage || 0) / 100
    projectGroups.set(projectKey, group)
  })
  const projectAllocationData = [...projectGroups.values()].map((group) => {
    const headcount = group.employeeIds.size
    const allocated = headcount ? Math.round(group.allocationTotal / headcount) : 0
    return { projectId: group.projectId, project: group.project, headcount, allocated, available: Math.round(100 - allocated), allocationWeightedFTE: Math.round(group.allocationTotal / 100 * 100) / 100, cost: projectCostAvailable ? Math.round(group.cost) : null, costBasis: projectCostBasisLabel }
  })
  const projectAllocationRows = allocationRows.map((row) => {
    const employee = scopedEmployees.get(employeeModelKey(row))
    return {
      ...employee,
      id: row.id || `${row.employeeId}-${row.projectId}`,
      employeeId: row.employeeId,
      name: employee.employeeName,
      project: model.projects.get(projectModelKey(row))?.projectName || row.projectId,
      allocation: Number(row.allocationPercentage),
      monthlySalary: projectCostAvailable ? projectGrossCost(row) : null,
      allocationWeightedCost: projectCostAvailable ? projectGrossCost(row) * Number(row.allocationPercentage || 0) / 100 : null,
    }
  })
  const averageHeadcount = (opening.length + closing.length) / 2

  const attendanceComplete = model.completeness.attendance.has(reportingMonth)
  const performanceComplete = model.completeness.performance.has(reportingMonth)
  const allocationComplete = model.completeness.projectAllocation.has(reportingMonth)
  const employeeMasterAsOf = dateValue(model.employeeMasterAsOf)
  const employeeMasterComplete = model.completeness.employeeMaster && employeeMasterAsOf != null && employeeMasterAsOf + 86400000 - 1 >= periodEnd
  const payrollByEmployee = new Map(payrollRows.map((row) => [employeeModelKey(row), row]))
  const attendanceByEmployee = new Map(attendanceRows.map((row) => [employeeModelKey(row), row]))
  const performanceByEmployee = new Map(performanceRows.map((row) => [employeeModelKey(row), row]))
  const allocationsByEmployee = new Map()
  allocationRows.forEach((row) => allocationsByEmployee.set(employeeModelKey(row), [...(allocationsByEmployee.get(employeeModelKey(row)) || []), row]))
  const financialYearMonths = financialYearMonthsFor(reportingMonth, financialYearStartMonth)
  const financialYearStart = financialYearMonths[0]
  const annualLeaveByEmployee = new Map()
  const leaveRowsForYear = model.leave.filter((row) => row.reportingMonth >= financialYearStart && row.reportingMonth <= reportingMonth && model.employees.has(employeeModelKey(row)))
  const leaveDatasetPresent = model.leave.length > 0
  const leaveRecordsForYear = leaveDatasetPresent ? leaveRowsForYear : model.attendance.filter((row) => row.reportingMonth >= financialYearStart && row.reportingMonth <= reportingMonth && row.leaveTaken != null)
  const attendanceLeaveYtdComplete = !leaveDatasetPresent && financialYearMonths.every((value) => {
    if (!model.completeness.attendance.has(value)) return false
    const parsed = parseMonth(value)
    const monthEnd = Date.UTC(parsed.year, parsed.month + 1, 0, 23, 59, 59, 999)
    const activeEmployees = [...model.employees.values()].map((employee) => employeeAt(model, employee, monthEnd))
      .filter((employee) => matches(employee, filters) && activeOn(employee, monthEnd))
    return activeEmployees.every((employee) => model.attendance.some((row) => row.reportingMonth === value && employeeModelKey(row) === employeeModelKey(employee) && row.leaveTaken != null))
  })
  leaveRecordsForYear.forEach((row) => {
    const id = employeeModelKey(row)
    const value = leaveDatasetPresent ? row.daysAvailed : row.leaveTaken
    annualLeaveByEmployee.set(id, (annualLeaveByEmployee.get(id) || 0) + Number(value || 0))
  })
  const leaveRowsByEmployee = new Map()
  leaveRowsForYear.forEach((row) => leaveRowsByEmployee.set(employeeModelKey(row), [...(leaveRowsByEmployee.get(employeeModelKey(row)) || []), row]))
  let leaveAvailableDays = 0
  let leaveAvailedDays = 0
  let missingLeaveEmployeeCount = 0
  let missingLeaveBalanceCount = 0
  let leaveBalanceMismatchCount = 0
  const leaveDepartmentTotals = new Map()
  closing.forEach((employee) => {
    const employeeId = employeeModelKey(employee)
    const rows = leaveRowsByEmployee.get(employeeId) || []
    if (!rows.length) {
      missingLeaveEmployeeCount += 1
      return
    }
    const byType = new Map()
    rows.forEach((row) => byType.set(String(row.leaveType || '').trim(), [...(byType.get(String(row.leaveType || '').trim()) || []), row]))
    let employeeAvailableDays = 0
    let employeeAvailedDays = 0
    let employeeBalancesComplete = true
    for (const typeRows of byType.values()) {
      const ordered = [...typeRows].sort((left, right) => left.reportingMonth.localeCompare(right.reportingMonth))
      const opening = Number(ordered[0].openingBalance)
      if (ordered[0].openingBalance == null || ordered.some((row) => row.daysCredited == null)) {
        employeeBalancesComplete = false
        continue
      }
      const credits = sum(ordered, (row) => row.daysCredited)
      const availed = sum(ordered, (row) => row.daysAvailed)
      employeeAvailableDays += opening + credits
      employeeAvailedDays += availed
      ordered.forEach((row) => {
        if (row.closingBalance == null) return
        if (row.openingBalance == null || row.daysCredited == null) {
          employeeBalancesComplete = false
          return
        }
        if (Math.abs(Number(row.openingBalance) + Number(row.daysCredited) - Number(row.daysAvailed) - Number(row.closingBalance)) > 0.01) leaveBalanceMismatchCount += 1
      })
    }
    if (!employeeBalancesComplete || !byType.size) missingLeaveBalanceCount += 1
    leaveAvailableDays += employeeAvailableDays
    leaveAvailedDays += employeeAvailedDays
    const department = employee.department || 'Not specified'
    const group = leaveDepartmentTotals.get(department) || { department, availableDays: 0, availedDays: 0, headcount: 0 }
    group.availableDays += employeeAvailableDays
    group.availedDays += employeeAvailedDays
    group.headcount += 1
    leaveDepartmentTotals.set(department, group)
  })
  const leavePeriodsComplete = leaveDatasetPresent && financialYearMonths.every((value) => model.completeness.leave.has(value))
  const leaveComplete = leavePeriodsComplete && missingLeaveEmployeeCount === 0 && missingLeaveBalanceCount === 0 && leaveBalanceMismatchCount === 0 && employeeMasterComplete && leaveAvailableDays > 0
  const leaveUtilisationPercentage = leaveComplete && leaveAvailableDays > 0 ? leaveAvailedDays / leaveAvailableDays * 100 : null
  const leaveByDepartment = [...leaveDepartmentTotals.values()].map((group) => ({
    ...group,
    utilisation: group.availableDays > 0 && leaveComplete ? Math.round(group.availedDays / group.availableDays * 1000) / 10 : null,
  }))
  const snapshot = (employee) => {
    const id = employeeModelKey(employee)
    const salary = payrollByEmployee.get(id)
    const time = attendanceByEmployee.get(id)
    const review = performanceByEmployee.get(id)
    const assigned = allocationsByEmployee.get(id) || []
    const projectId = assigned[0]?.projectId
    const projectName = model.projects.get(projectModelKey(assigned[0]))?.projectName || projectId || 'Unallocated'
    return {
      ...employee,
      id: employee.employeeId,
      name: employee.employeeName,
      monthlySalary: salary ? Number(salary.monthlyGrossSalary) : null,
      monthlyBase: salary ? Number(salary.monthlyGrossSalary) : null,
      annualCtc: salary?.annualCtc == null ? null : Number(salary.annualCtc),
      ...Object.fromEntries(PAYROLL_COMPONENTS.map(({ key }) => [key, numberOrNull(salary?.[key])])),
      attendance: time?.attendancePercentage == null ? null : Number(time.attendancePercentage),
      lopDays: time?.lopDays == null ? null : Number(time.lopDays),
      leaveTaken: time?.leaveTaken == null ? null : Number(time.leaveTaken),
      leaveTakenYtd: leaveDatasetPresent
        ? leaveComplete && annualLeaveByEmployee.has(id) ? annualLeaveByEmployee.get(id) : null
        : attendanceLeaveYtdComplete && annualLeaveByEmployee.has(id) ? annualLeaveByEmployee.get(id) : null,
      performanceScore: review?.performanceScore == null ? null : Number(review.performanceScore),
      incrementPercent: review?.incrementPercent == null ? null : Number(review.incrementPercent),
      project: projectName,
      allocation: assigned.reduce((total, row) => total + Number(row.allocationPercentage || 0), 0),
      projectAssignments: assigned.map((row) => ({ ...row, project: model.projects.get(projectModelKey(row))?.projectName || row.projectId })),
      tenureYears: Math.max(0, (periodEnd - (dateValue(employee.hireDate) || periodEnd)) / 31557600000),
    }
  }
  const activeSnapshots = closing.map(snapshot)
  const openingSnapshots = opening.map(snapshot)
  const joinerSnapshots = joiners.map(snapshot)
  const exitSnapshots = exits.map((employee) => {
    const employeeSnapshot = snapshot(employee)
    const exitedAt = dateValue(employee.exitDate)
    const hiredAt = dateValue(employee.hireDate)
    return {
      ...employeeSnapshot,
      exitType: employee.exitType || 'Not specified',
      tenureAtExitYears: exitedAt != null && hiredAt != null ? Math.max(0, (exitedAt - hiredAt) / 31557600000) : null,
    }
  })
  const exitTypes = [...exitSnapshots.reduce((groups, employee) => {
    groups.set(employee.exitType, (groups.get(employee.exitType) || 0) + 1)
    return groups
  }, new Map())].map(([exitType, count]) => ({ exitType, count }))
  const missingPayrollCount = closing.filter((employee) => !payrollByEmployee.has(employeeModelKey(employee))).length
  const missingAnnualCtcCount = payrollRows.filter((row) => row.annualCtc == null).length
  const payrollComponentTotals = PAYROLL_COMPONENTS.map(({ key, label }) => {
    const reportedCount = payrollRows.filter((row) => numberOrNull(row[key]) != null).length
    const complete = payrollComplete && employeeMasterComplete && missingPayrollCount === 0 && payrollRows.length > 0 && reportedCount === payrollRows.length
    return {
      component: label,
      field: key,
      amount: complete ? sum(payrollRows, (row) => row[key]) : null,
      complete,
      reportedCount,
      employeeCount: closing.length,
    }
  })
  const payrollComponentFields = PAYROLL_COMPONENTS.filter(({ key }) => payrollRows.some((row) => numberOrNull(row[key]) != null)).map(({ key }) => key)
  const missingAttendanceCount = closing.filter((employee) => !attendanceByEmployee.has(employeeModelKey(employee))).length
  const missingLopCount = closing.filter((employee) => attendanceByEmployee.get(employeeModelKey(employee))?.lopDays == null).length
  const missingLeaveCount = closing.filter((employee) => attendanceByEmployee.get(employeeModelKey(employee))?.leaveTaken == null).length
  const attendanceDayFields = ['calendarDays', 'workingDays', 'presentDays', 'weeklyOffDays', 'holidayDays', 'paidLeaveDays', 'unpaidLeaveDays', 'payableDays']
  const attendanceDayRows = attendanceRows.filter((row) => attendanceDayFields.every((field) => Number.isFinite(row[field])))
  const attendanceReconciledRows = attendanceDayRows.filter((row) => {
    const calendarPartition = Number(row.workingDays) + Number(row.weeklyOffDays) + Number(row.holidayDays)
    const workingPartition = Number(row.presentDays) + Number(row.paidLeaveDays) + Number(row.unpaidLeaveDays)
    return Math.abs(calendarPartition - Number(row.calendarDays)) <= 0.01
      && workingPartition <= Number(row.workingDays) + 0.01
      && Number(row.presentDays) <= Number(row.workingDays) + 0.01
      && Number(row.payableDays) <= Number(row.calendarDays) + 0.01
  })
  const attendanceDayReconciliation = {
    available: attendanceRows.length > 0 && attendanceDayRows.length === attendanceRows.length,
    rowCount: attendanceRows.length,
    checkedRows: attendanceDayRows.length,
    reconciledRows: attendanceReconciledRows.length,
    mismatchRows: attendanceDayRows.length - attendanceReconciledRows.length,
  }
  const missingPerformanceScoreCount = closing.filter((employee) => performanceByEmployee.get(employeeModelKey(employee))?.performanceScore == null).length
  const missingIncrementCount = closing.filter((employee) => performanceByEmployee.get(employeeModelKey(employee))?.incrementPercent == null).length
  const previous = new Date(Date.UTC(year, month - 1, 1))
  const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
  const previousProjectAssignments = new Map()
  model.allocations.filter((row) => row.reportingMonth === previousMonth).forEach((row) => previousProjectAssignments.set(employeeModelKey(row), [...(previousProjectAssignments.get(employeeModelKey(row)) || []), projectModelKey(row)]))
  const projectTransfers = model.completeness.projectAllocation.has(previousMonth) && allocationComplete
    ? closing.filter((employee) => {
      const id = employeeModelKey(employee)
      if (!opening.some((item) => employeeModelKey(item) === id)) return false
      const oldProjects = [...(previousProjectAssignments.get(id) || [])].sort().join('|')
      const newProjects = [...(allocationsByEmployee.get(id) || []).map((row) => projectModelKey(row))].sort().join('|')
      return oldProjects !== newProjects
    }).length
    : null

  return {
    reportingMonth,
    headcount: {
      opening: opening.length,
      closing: closing.length,
      average: averageHeadcount,
      joiners: joiners.length,
      exits: exits.length,
      netMovement: joiners.length - exits.length,
      attritionRate: averageHeadcount ? exits.length / averageHeadcount * 100 : null,
      retentionRate: averageHeadcount ? (averageHeadcount - exits.length) / averageHeadcount * 100 : null,
      complete: employeeMasterComplete,
      activeEmployees: activeSnapshots,
      openingEmployees: openingSnapshots,
      joinerEmployees: joinerSnapshots,
      exitEmployees: exitSnapshots,
      exitTypeDistribution: exitTypes,
      averageTenureAtExitYears: avg(exitSnapshots.filter((employee) => employee.tenureAtExitYears != null), (employee) => employee.tenureAtExitYears),
      basis: 'Effective-dated Employee Master; omitted rows are not interpreted as exits.',
    },
    payroll: {
      gross: sum(payrollRows, (row) => row.monthlyGrossSalary),
      annualCtc: sum(payrollRows, (row) => row.annualCtc),
      employeeCount: new Set(payrollRows.map((row) => employeeModelKey(row))).size,
      byDepartment: [...payrollRows.reduce((groups, row) => {
        const employee = scopedEmployees.get(employeeModelKey(row))
        const department = employee?.department || 'Not specified'
        const group = groups.get(department) || { department, headcount: 0, payroll: 0, incrementCost: 0, increment: 0, attendance: 0 }
        group.headcount += 1
        group.payroll += Number(row.monthlyGrossSalary || 0)
        groups.set(department, group)
        return groups
      }, new Map()).values()],
      byDepartmentAndCompany: [...payrollRows.reduce((groups, row) => {
        const employee = scopedEmployees.get(employeeModelKey(row))
        const department = employee?.department || 'Not specified'
        const company = employee?.company || 'Not specified'
        const key = `${company}\u0000${department}`
        const group = groups.get(key) || { company, department, headcount: 0, payroll: 0 }
        group.headcount += 1
        group.payroll += Number(row.monthlyGrossSalary || 0)
        groups.set(key, group)
        return groups
      }, new Map()).values()],
      missingEmployeeCount: payrollComplete && employeeMasterComplete ? missingPayrollCount : null,
      missingAnnualCtcCount,
      complete: payrollComplete,
      available: payrollRows.length > 0,
      controlReconciliation: payrollControlBatch,
      controlMismatch: payrollControlMismatch,
      componentTotals: payrollComponentTotals,
      componentFields: payrollComponentFields,
    },
    attendance: {
      averagePercentage: avg(attendanceRows, (row) => row.attendancePercentage),
      lopDays: sum(attendanceRows, (row) => row.lopDays),
      leaveTaken: sum(attendanceRows, (row) => row.leaveTaken),
      byDepartment: [...attendanceRows.reduce((groups, row) => {
        const department = scopedEmployees.get(employeeModelKey(row))?.department || 'Not specified'
        const group = groups.get(department) || { department, headcount: 0, payroll: 0, incrementCost: 0, increment: 0, attendanceTotal: 0 }
        group.headcount += 1
        group.attendanceTotal += Number(row.attendancePercentage || 0)
        groups.set(department, group)
        return groups
      }, new Map()).values()].map((group) => ({ ...group, attendance: Math.round(group.attendanceTotal / group.headcount * 10) / 10 })),
      employeeCount: new Set(attendanceRows.map((row) => employeeModelKey(row))).size,
      missingEmployeeCount: missingAttendanceCount,
      missingLopCount,
      missingLeaveCount,
      dayReconciliation: attendanceDayReconciliation,
      complete: attendanceComplete,
      available: attendanceRows.length > 0,
    },
    leave: {
      utilisationPercentage: leaveUtilisationPercentage,
      availableDays: leaveAvailableDays,
      availedDays: leaveAvailedDays,
      byDepartment: leaveByDepartment,
      missingEmployeeCount: missingLeaveEmployeeCount,
      missingBalanceCount: missingLeaveBalanceCount,
      balanceMismatchCount: leaveBalanceMismatchCount,
      complete: leaveComplete,
      available: leaveDatasetPresent && leaveRowsForYear.length > 0,
      periodsComplete: leavePeriodsComplete,
      periodMonths: financialYearMonths,
      source: leaveDatasetPresent ? 'Leave records' : 'Attendance leave-taken field',
    },
    performance: {
      averageScore: avg(performanceRows, (row) => row.performanceScore),
      averageIncrementPercent: avg(performanceRows.filter((row) => row.incrementPercent != null), (row) => row.incrementPercent),
      highPerformers: performanceRows.filter((row) => Number(row.performanceScore) >= 4.2).length,
      employeeCount: new Set(performanceRows.map((row) => employeeModelKey(row))).size,
      missingScoreCount: missingPerformanceScoreCount,
      missingIncrementCount,
      complete: performanceComplete,
      available: performanceRows.length > 0,
    },
    increments: {
      approvedCount: approvedIncrementRows.length,
      pendingCount: pendingIncrementCount,
      rejectedCount: rejectedIncrementCount,
      averagePercentage: incrementComplete && approvedIncrementRows.some((row) => row.incrementPercent != null) ? avg(approvedIncrementRows.filter((row) => row.incrementPercent != null), (row) => row.incrementPercent) : null,
      annualCostImpact: incrementComplete ? sum(approvedIncrementRows, (row) => row.annualCostImpact) : null,
      monthlyCostImpact: incrementActualMonthlyCost,
      byDepartment: incrementComplete ? incrementByDepartment : [],
      approvedRows: incrementComplete ? approvedIncrementRows : [],
      rows: incrementRowsForMonth,
      complete: incrementComplete,
      available: incrementComplete && incrementRowsForMonth.length > 0,
      unmatchedEmployeeCount: incrementUnmatchedCount,
      budget: incrementBudget,
      budgetComplete: incrementBudgetComplete,
      budgetVariance: incrementBudget != null && incrementActualMonthlyCost != null ? incrementActualMonthlyCost - incrementBudget : null,
      budgetFiltersSupported: incrementBudgetFiltersSupported,
      basis: 'Approved effective-dated annual CTC changes converted to a monthly run-rate (annual increase / 12). Pending and rejected revisions are excluded from cost impact.',
    },
    projects: {
      allocationWeightedCost: projectCosts,
      costAvailable: projectCostAvailable,
      costBasisId: projectCostBasis,
      costBasisLabel: projectCostBasisLabel,
      byProject: projectAllocationData,
      allocationRows: projectAllocationRows,
      uniqueEmployees: allocatedEmployees.size,
      allocatedFte: sum(allocationRows, (row) => row.allocationPercentage) / 100,
      unallocatedEmployees: allocationComplete && employeeMasterComplete ? closing.filter((employee) => !allocatedEmployees.has(employeeModelKey(employee))).length : null,
      overallocatedEmployees,
      allocationCount: allocationRows.length,
      projectTransfers,
      complete: allocationComplete,
      available: allocationRows.length > 0,
      costFormula: 'Allocation-weighted cost = selected gross cost × allocation percentage / 100.',
    },
    dataQuality: {
      unmatchedEmployeeReferences: model.unmatchedEmployees.length,
      unmatchedProjectReferences: model.unmatchedProjects.length,
      exitRecordConflictCount: model.exitRecordConflicts.length,
      employeeMasterComplete,
      employeeMasterAsOf: model.employeeMasterAsOf,
      reportingPeriodComplete: {
        payroll: payrollComplete,
        attendance: attendanceComplete,
        performance: performanceComplete,
        projectAllocation: allocationComplete,
      },
    },
  }
}

export const KPI_CATALOG = {
  openingHeadcount: { name: 'Opening headcount', description: 'Unique employees active at the end of the preceding period.', formula: 'Count of employees active immediately before period start', fields: 'Employee ID, hire date, exit date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires complete, effective-dated Employee Master data.', unit: 'Employees', rounding: 'Whole number', example: '100 employees active before month start → 100' },
  closingHeadcount: { name: 'Closing headcount', description: 'Unique employees active on the selected reporting date.', formula: 'Count of employees hired on/before as-of date and not exited on/before that date', fields: 'Employee ID, hire date, exit date', period: 'Monthly/as of date', filters: 'Company, department, location, employment type', completeness: 'Requires complete Employee Master coverage through selected date.', unit: 'Employees', rounding: 'Whole number', example: '102 active employee IDs on 2025-03-31 → 102' },
  joiners: { name: 'Joiners', description: 'Employees whose hire date falls within the reporting period through the selected as-of date.', formula: 'Count of unique employee IDs with hire date in period', fields: 'Employee ID, hire date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires verified Employee Master records.', unit: 'Employees', rounding: 'Whole number', example: '3 hire dates in March → 3 joiners' },
  exits: { name: 'Exits', description: 'Employees with a confirmed exit date in the reporting period.', formula: 'Count of unique employee IDs with exit date in period', fields: 'Employee ID, exit date; optional Exit Type', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires verified Employee Master records; missing rows are not exits. Exit type and tenure analysis require valid Exit Records or dates.', unit: 'Employees', rounding: 'Whole number', example: '2 confirmed exit dates in March → 2 exits' },
  averageTenureAtExit: { name: 'Average tenure at exit', description: 'Average elapsed service time for employees with confirmed exit dates in the selected period.', formula: 'Mean(exit date − hire date) / 365.25 days for exits with valid hire and exit dates', fields: 'Employee ID, hire date, exit date', period: 'Monthly exits', filters: 'Company, department, location, employment type', completeness: 'Requires valid hire and confirmed exit dates; employees missing from a partial Exit Records file are not counted as exits.', unit: 'Years', rounding: 'One decimal', example: 'Two confirmed exits at 2.0 and 4.0 years → 3.0 years' },
  permanentHeadcount: { name: 'Permanent headcount', description: 'Active employees with employment type Permanent.', formula: 'Count of active employee IDs where employment type = Permanent', fields: 'Employee ID, employment type, hire date, exit date', period: 'As of selected date', filters: 'Company, department, location', completeness: 'Missing employment type must not be interpreted as Permanent.', unit: 'Employees', rounding: 'Whole number', example: '80 active permanent employee records → 80' },
  contractHeadcount: { name: 'Contract headcount', description: 'Active employees with employment type Contract.', formula: 'Count of active employee IDs where employment type = Contract', fields: 'Employee ID, employment type, hire date, exit date', period: 'As of selected date', filters: 'Company, department, location', completeness: 'Missing employment type must not be interpreted as Contract.', unit: 'Employees', rounding: 'Whole number', example: '20 active contract employee records → 20' },
  averageHeadcount: { name: 'Average headcount', description: 'Average workforce size across the reporting period.', formula: '(Opening active headcount + closing active headcount) / 2', fields: 'Employee ID, hire date, exit date, reporting date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires a verified employee master snapshot for the period.', unit: 'Employees', rounding: 'One decimal in detail views; raw value for rates', example: '(100 + 104) / 2 = 102' },
  attritionRate: { name: 'Attrition rate', description: 'Confirmed employee exits relative to average workforce size.', formula: 'Confirmed exits during period / average headcount × 100', fields: 'Employee ID, hire date, exit date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires complete employee master coverage; omissions are not exits.', unit: '%', rounding: 'One decimal', example: '4 exits / 102 × 100 = 3.9%' },
  retentionRate: { name: 'Retention rate', description: 'Average workforce remaining after confirmed exits.', formula: '(Average headcount − confirmed exits) / average headcount × 100', fields: 'Employee ID, hire date, exit date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires complete employee master coverage.', unit: '%', rounding: 'One decimal', example: '(102 − 4) / 102 × 100 = 96.1%' },
  netMovement: { name: 'Net headcount movement', description: 'Net additions during the reporting period.', formula: 'Joiners − confirmed exits', fields: 'Employee ID, hire date, exit date', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Requires complete employee master coverage.', unit: 'Employees', rounding: 'Whole number', example: '7 joiners − 4 exits = +3' },
  projectCost: { name: 'Allocation-weighted project cost', description: 'Monthly gross cost apportioned to each project allocation using the selected cost basis.', formula: 'Σ(selected gross cost basis × allocation percentage / 100)', fields: 'Employee ID, project ID, allocation percentage, selected Payroll monthly gross and/or allocation-row monthly gross', period: 'Monthly', filters: 'Company, department, location, project', completeness: 'Cost is unavailable unless the selected basis covers every filtered allocation; Payroll gross also requires a confirmed payroll month. Best available mode uses payroll gross per employee then allocation-row cost.', unit: 'INR', rounding: 'Whole rupee for display', example: '₹100,000 × 50% = ₹50,000' },
  completeness: { name: 'Reporting completeness', description: 'Whether a dataset period has been explicitly certified complete.', formula: 'Complete only when the category and reporting period are explicitly marked complete and required references reconcile.', fields: 'Dataset category, reporting month, completeness marker', period: 'Monthly or as-of date', filters: 'Dataset category and period', completeness: 'Never inferred from row count alone.', unit: 'Complete / incomplete', rounding: 'Not applicable', example: 'Payroll 2025-03 marked complete → complete' },
  monthlyGrossPayroll: { name: 'Monthly gross payroll', description: 'Sum of monthly gross salary for employees in scope.', formula: 'Sum of monthly gross salary', fields: 'Employee ID, reporting month, monthly gross salary', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Imported coverage and employee references must reconcile.', unit: 'INR', rounding: 'Whole rupee for display', example: '₹100,000 + ₹80,000 = ₹180,000' },
  payrollComponentBreakdown: { name: 'Reported payroll component breakdown', description: 'Totals for individually supplied payroll components such as Basic, HRA, employer contributions, variable pay, arrears, and overtime.', formula: 'Sum of one reported component across in-scope payroll rows; component values are not added to monthly gross or CTC.', fields: 'Employee ID, reporting month, selected payroll component', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'A component total is shown only when every in-scope active employee has a payroll row and that component is supplied for every row in a complete, reconciled month.', unit: 'INR per component', rounding: 'Whole rupee for display', example: 'Basic: ₹50,000 + ₹60,000 = ₹110,000; gross remains the separately reported total' },
  annualisedGrossPayroll: { name: 'Annualised gross payroll', description: 'Annualised run-rate based on current monthly gross payroll.', formula: 'Current monthly gross payroll × 12', fields: 'Employee ID, reporting month, monthly gross salary', period: 'Annualised from selected month', filters: 'Company, department, location, employment type', completeness: 'Run-rate is not a historical full-year payroll total.', unit: 'INR per year', rounding: 'Whole rupee for display', example: '₹180,000 × 12 = ₹2,160,000' },
  averageMonthlyGross: { name: 'Average monthly gross per employee', description: 'Current monthly gross payroll divided by employees with reported payroll.', formula: 'Monthly gross payroll / distinct employees with payroll', fields: 'Employee ID, reporting month, monthly gross salary', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Coverage should be reconciled to active workforce before company-wide use.', unit: 'INR per employee per month', rounding: 'Whole rupee for display', example: '₹180,000 / 2 = ₹90,000' },
  annualCtc: { name: 'Annual CTC', description: 'Annual cost to company based on selected source.', formula: 'Imported: sum reported annual CTC. Demo: sum monthly gross salary × 12 × 1.15 synthetic benefits assumption.', fields: 'Employee ID, annual CTC (demo additionally uses monthly gross salary)', period: 'As of selected date', filters: 'Company, department, location, employment type', completeness: 'Imported values are not derived when absent.', unit: 'INR', rounding: 'Whole rupee for display', example: 'Demo ₹100,000 monthly × 12 × 1.15 = ₹1,380,000' },
  payrollVariance: { name: 'Payroll month-on-month variance', description: 'Relative change in gross payroll against the preceding month.', formula: '(Current payroll − prior payroll) / prior payroll × 100', fields: 'Employee ID, reporting month, monthly gross salary', period: 'Monthly comparison', filters: 'Company, department, location, employment type', completeness: 'Both periods must be complete and prior payroll non-zero.', unit: '%', rounding: 'One decimal', example: '(₹110,000 − ₹100,000) / ₹100,000 = 10.0%' },
  payrollYearOverYear: { name: 'Payroll year-on-year variance', description: 'Relative change in monthly gross payroll against the same month in the prior year.', formula: '(Current month payroll − same month prior year payroll) / same month prior year payroll × 100', fields: 'Employee ID, reporting month, monthly gross salary', period: 'Selected month compared with the same month one year earlier', filters: 'Company, department, location, employment type', completeness: 'Both monthly payroll periods must be complete and prior-year payroll non-zero; otherwise unavailable.', unit: '%', rounding: 'One decimal', example: '(₹120,000 − ₹100,000) / ₹100,000 = 20.0%' },
  openVacancies: { name: 'Open vacancies', description: 'Approved recruitment positions that remain unfilled in the selected reporting month.', formula: 'Sum of max(approved positions − filled positions, 0) for open requisitions', fields: 'Requisition ID, reporting month, status, approved positions, filled positions', period: 'Selected reporting month', filters: 'Company and department; recruitment data has no location or employment-type dimensions', completeness: 'Shown as confirmed only when the recruitment reporting month is explicitly complete; otherwise labelled provisional.', unit: 'Positions', rounding: 'Whole number', example: '3 approved − 1 filled = 2 open positions' },
  attendance: { name: 'Attendance percentage', description: 'Mean validated attendance percentage for employees in scope. When day totals are supplied, each employee percentage is present days divided by working days.', formula: 'Mean employee attendance percentage; employee percentage = present days / working days × 100 when day totals are supplied', fields: 'Employee ID, reporting month, attendance percentage or present and working days', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Imported period completeness and employee coverage are required for trends; day reconciliation requires all calendar, work, leave, and payable day inputs.', unit: '%', rounding: 'One decimal for dashboard; two decimals in staged records', example: '(20 / 22 × 100 + 9 / 9 × 100) / 2 = 95.5%' },
  absenteeism: { name: 'Absenteeism rate', description: 'Complement of the mean validated attendance percentage used by this dashboard.', formula: '100% − attendance percentage', fields: 'Employee ID, reporting month, attendance percentage or present and working days', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Reflects the coverage and quality of the underlying attendance values.', unit: '%', rounding: 'One decimal', example: '100% − 95% = 5.0%' },
  lopDays: { name: 'LOP days', description: 'Sum of reported loss-of-pay days.', formula: 'Sum of reported LOP days', fields: 'Employee ID, reporting month, LOP days', period: 'Monthly', filters: 'Company, department, location, employment type', completeness: 'Imported source must provide LOP values; omitted optional values are not independently inferable.', unit: 'Days', rounding: 'Whole days', example: '1 + 2 = 3 LOP days' },
  leaveUtilisation: { name: 'Leave utilisation', description: 'Configured financial-year-to-date leave availed as a share of leave available.', formula: 'Imported: FYTD days availed / (opening balance + FYTD credits) × 100. Demo: FYTD leave taken / (active employees × 24 synthetic annual entitlement days) × 100.', fields: 'Employee ID, reporting month, leave type, opening balance, days availed, days credited', period: 'Configured reporting year to date (April–March by default)', filters: 'Company, department, location, employment type', completeness: 'Imported: every configured FYTD month confirmed complete, active employee coverage present, balances reconciled, and starting balances/credits supplied. Demo: synthetic estimate only.', unit: '%', rounding: 'One decimal', example: 'Imported: 12 days availed / (5 opening + 12 credited) = 70.6%' },
  averagePmsScore: { name: 'Average PMS score', description: 'Mean reported performance score for employees in scope.', formula: 'Sum of reported PMS scores / employees with a reported score', fields: 'Employee ID, review period, PMS score', period: 'Selected review/reporting period', filters: 'Company, department, location, employment type', completeness: 'Requires a complete performance source for company-wide comparison.', unit: 'Score out of 5', rounding: 'Two decimals', example: '(4.0 + 4.5) / 2 = 4.25' },
  highPerformers: { name: 'High performers', description: 'Employees with a PMS score at or above the dashboard threshold.', formula: 'Count of employees with PMS score ≥ 4.2', fields: 'Employee ID, review period, PMS score', period: 'Selected review/reporting period', filters: 'Company, department, location, employment type', completeness: 'Threshold is a current dashboard convention, not a configurable company policy.', unit: 'Employees', rounding: 'Whole number', example: 'Scores 4.2, 4.5, 3.8 → 2 high performers' },
  averageIncrement: { name: 'Average increment', description: 'Mean percentage across approved effective-dated increment changes for the selected month.', formula: 'Imported: mean increment percentage on approved changes effective in the selected month through the as-of date. Demo: mean synthetic employee increment percentage.', fields: 'Employee ID, effective date, approval status, current/revised annual CTC, increment percentage', period: 'Monthly effective period', filters: 'Company, department, location, employment type', completeness: 'Imported source month must be confirmed complete; pending and rejected changes are excluded.', unit: '%', rounding: 'One decimal', example: '(8% + 10%) / 2 = 9.0%' },
  incrementBudget: { name: 'Increment budget versus actual', description: 'Compares approved incremental monthly run-rate with the selected-period Increment budget.', formula: 'Imported actual = sum(approved revised annual CTC − current annual CTC) / 12; variance = actual − approved Increment budget. Demo budget remains a labelled 10% proxy.', fields: 'Employee ID, current/revised annual CTC, effective date, approval status, reporting month, department, company, budget amount', period: 'Monthly effective period', filters: 'Company, department; location and employment-type filtered budgets are unavailable because the budget source has no such dimensions', completeness: 'Imported actual and budget are shown only when both reporting-period sources are complete; pending and rejected changes are excluded from actual.', unit: 'INR per month', rounding: 'Whole rupee for display', example: '(₹1,100,000 − ₹1,000,000) / 12 = ₹8,333 monthly run-rate' },
  recruitmentOpenPositions: { name: 'Open recruitment positions', description: 'Unfilled approved positions on open requisitions.', formula: 'Sum(max(approved positions − filled positions, 0)) for Open requisitions', fields: 'Requisition ID, reporting month, approved positions, filled positions, status', period: 'Monthly', filters: 'Company, department', completeness: 'Requires a confirmed Recruitment reporting month; otherwise displayed as provisional.', unit: 'Positions', rounding: 'Whole number', example: '3 approved − 1 filled = 2 open positions' },
  recruitmentTimeToHire: { name: 'Recruitment time to hire', description: 'Average elapsed days from requisition date to accepted-offer date.', formula: 'Mean(offer accepted date − requisition date) for accepted requisitions through the as-of date', fields: 'Requisition date, accepted-offer date, offers accepted', period: 'Monthly cohort through selected as-of date', filters: 'Company, department', completeness: 'Unavailable when accepted-offer dates are missing for any requisition with accepted offers.', unit: 'Days', rounding: 'One decimal', example: '9 and 6 days → 7.5 days' },
  recruitmentTimeToFill: { name: 'Recruitment time to fill', description: 'Average elapsed days from requisition date to joining date.', formula: 'Mean(joining date − requisition date) for joined requisitions through the as-of date', fields: 'Requisition date, joining date', period: 'Monthly cohort through selected as-of date', filters: 'Company, department', completeness: 'Requires valid requisition and joining dates; no duration is inferred from open requisitions.', unit: 'Days', rounding: 'One decimal', example: '20 and 10 days → 15.0 days' },
  offerAcceptanceRate: { name: 'Offer acceptance rate', description: 'Share of extended offers that were accepted.', formula: 'Sum(offers accepted) / sum(offers extended) × 100', fields: 'Reporting month, offers extended, offers accepted', period: 'Monthly', filters: 'Company, department', completeness: 'Unavailable unless offer counts are supplied for all selected requisitions.', unit: '%', rounding: 'One decimal', example: '2 accepted / 3 extended = 66.7%' },
  projectHeadcount: { name: 'Project headcount', description: 'Number of active employees associated with each project.', formula: 'Count of employees assigned to project (unique employee count)', fields: 'Employee ID, project ID, effective/reporting period', period: 'Monthly or as of selected date', filters: 'Company, department, location, project', completeness: 'Imported allocations must be complete and project references resolved.', unit: 'Employees', rounding: 'Whole number', example: 'Employees A, B assigned → 2' },
  resourceUtilisation: { name: 'Resource utilisation', description: 'Average allocation percentage across employees represented on projects.', formula: 'Sum of employee allocation percentages / represented employees', fields: 'Employee ID, project ID, allocation percentage', period: 'Monthly or as of selected date', filters: 'Company, department, location, project', completeness: 'Percentages should be validated across all assignments; over-allocation requires review.', unit: '%', rounding: 'One decimal', example: '(100% + 80%) / 2 = 90.0%' },
  allocatedFte: { name: 'Allocated FTE', description: 'Allocation-weighted employee equivalent across projects.', formula: 'Sum of allocation percentages / 100', fields: 'Employee ID, project ID, allocation percentage', period: 'Monthly', filters: 'Company, department, location, project', completeness: 'Requires complete monthly allocation data.', unit: 'FTE', rounding: 'Two decimals for display', example: '(50% + 75%) / 100 = 1.25 FTE' },
  incrementImpact: { name: 'Increment cost impact', description: 'Monthly run-rate impact of approved effective-dated CTC changes.', formula: 'Imported: sum(revised annual CTC − current annual CTC) / 12 for approved records effective in the selected month through the as-of date. Demo: sum(monthly salary − base monthly salary).', fields: 'Employee ID, current/revised annual CTC, effective date, approval status (imported); base/current monthly gross (demo)', period: 'Monthly effective period and selected as-of date', filters: 'Company, department, location, employment type', completeness: 'Imported values require a complete Increment month and resolved employee references; pending and rejected rows are excluded. Demo values use synthetic sample salaries.', unit: 'INR per month run-rate', rounding: 'Whole rupee for display', example: '(₹1,100,000 − ₹1,000,000) / 12 = ₹8,333 monthly run-rate' },
}

export const KPI_DEFINITIONS = Object.fromEntries(Object.entries(KPI_CATALOG).map(([key, item]) => [key, `${item.name}: ${item.formula}.`]))

export function getImportedAvailableMonths(model) {
  const values = new Set()
  for (const category of ['payroll', 'attendance', 'leave', 'performance', 'projectAllocation', 'recruitment', 'contractManpower', 'hrBudget']) {
    model[category].forEach((row) => { if (parseMonth(row.reportingMonth)) values.add(row.reportingMonth) })
  }
  model.increments.forEach((row) => {
    const timestamp = dateValue(row.effectiveDate)
    if (timestamp != null) {
      const point = new Date(timestamp)
      values.add(`${point.getUTCFullYear()}-${String(point.getUTCMonth() + 1).padStart(2, '0')}`)
    }
  })
  model.employees.forEach((employee) => {
    for (const date of [employee.hireDate, employee.exitDate].filter(Boolean)) {
      const timestamp = dateValue(date)
      if (timestamp != null) {
        const point = new Date(timestamp)
        values.add(`${point.getUTCFullYear()}-${String(point.getUTCMonth() + 1).padStart(2, '0')}`)
      }
    }
  })
  return [...values].sort()
}

export function getImportedTrendData(model, filters = {}, options = {}) {
  return getImportedAvailableMonths(model).map((reportingMonth) => {
    const metrics = getImportedMonthMetrics(model, reportingMonth, filters, '', options)
    const payrollIsComplete = metrics.payroll.complete && metrics.payroll.missingEmployeeCount === 0
    const attendanceIsComplete = metrics.attendance.complete && metrics.attendance.missingEmployeeCount === 0
    return {
      month: new Date(Number(reportingMonth.slice(0, 4)), Number(reportingMonth.slice(5, 7)) - 1, 1).toLocaleString('en-IN', { month: 'short' }),
      reportingMonth,
      headcount: metrics.headcount.complete ? metrics.headcount.closing : null,
      openingHeadcount: metrics.headcount.complete ? metrics.headcount.opening : null,
      averageHeadcount: metrics.headcount.complete ? metrics.headcount.average : null,
      attrition: metrics.headcount.complete ? metrics.headcount.attritionRate : null,
      payroll: payrollIsComplete ? metrics.payroll.gross : null,
      joiners: metrics.headcount.complete ? metrics.headcount.joiners : null,
      exits: metrics.headcount.complete ? metrics.headcount.exits : null,
      attendance: attendanceIsComplete ? metrics.attendance.averagePercentage : null,
      projectTransfers: metrics.projects.projectTransfers,
      payrollComplete: payrollIsComplete,
      attendanceComplete: attendanceIsComplete,
    }
  })
}

export function getImportedDashboardReadiness(model, reportingMonth, options = {}) {
  const metrics = getImportedMonthMetrics(model, reportingMonth, {}, '', options)
  const reasons = []
  if (!metrics.headcount.complete) reasons.push('Employee Master is not confirmed complete through this reporting month.')
  if (!model.completeness.projectMaster) reasons.push('Project Master is not confirmed complete.')
  if (metrics.payroll.controlMismatch) reasons.push(`Payroll rows do not reconcile to the latest source-file control total for ${reportingMonth}.`)
  for (const [category, label] of [['payroll', 'Payroll'], ['attendance', 'Attendance'], ['performance', 'Performance'], ['projectAllocation', 'Project Allocation']]) {
    if (!model.completeness[category].has(reportingMonth)) reasons.push(`${label} is not confirmed complete for ${reportingMonth}.`)
  }
  if (metrics.dataQuality.unmatchedEmployeeReferences > 0) reasons.push('Some staged records refer to Employee IDs missing from the staged Employee Master.')
  if (metrics.dataQuality.unmatchedProjectReferences > 0) reasons.push('Some project allocations refer to Project IDs missing from the staged Project Master.')
  if (metrics.dataQuality.exitRecordConflictCount > 0) reasons.push('Some Exit Records conflict with Employee Master exit dates or contain multiple exit dates for the same employee.')
  if (metrics.payroll.missingEmployeeCount > 0) reasons.push(`${metrics.payroll.missingEmployeeCount} active employees have no payroll row for ${reportingMonth}.`)
  if (metrics.attendance.missingEmployeeCount > 0) reasons.push(`${metrics.attendance.missingEmployeeCount} active employees have no attendance row for ${reportingMonth}.`)
  if (metrics.attendance.missingLopCount > 0) reasons.push(`${metrics.attendance.missingLopCount} active employees are missing LOP days for ${reportingMonth}.`)
  if (!model.leave.length && metrics.attendance.missingLeaveCount > 0) reasons.push(`${metrics.attendance.missingLeaveCount} active employees are missing leave taken for ${reportingMonth}.`)
  if (metrics.performance.missingScoreCount > 0) reasons.push(`${metrics.performance.missingScoreCount} active employees have no PMS score for ${reportingMonth}.`)
  if (metrics.projects.overallocatedEmployees.length > 0) reasons.push(`${metrics.projects.overallocatedEmployees.length} employees have allocation totals over 100%.`)
  const financialYearMonths = financialYearMonthsFor(reportingMonth, options.financialYearStartMonth)
  for (const ytdMonth of financialYearMonths) {
    const category = model.leave.length ? 'leave' : 'attendance'
    const label = model.leave.length ? 'Leave' : 'Attendance'
    if (!model.completeness[category].has(ytdMonth)) reasons.push(`${label} is not confirmed complete for ${ytdMonth}; year-to-date leave utilisation would be incomplete.`)
    else if (!model.leave.length) {
      const ytdMetrics = getImportedMonthMetrics(model, ytdMonth, {}, '', options)
      if (ytdMetrics.attendance.missingEmployeeCount > 0) reasons.push(`${ytdMetrics.attendance.missingEmployeeCount} active employees are missing attendance in ${ytdMonth}.`)
      if (ytdMetrics.attendance.missingLeaveCount > 0) reasons.push(`${ytdMetrics.attendance.missingLeaveCount} active employees are missing leave totals in ${ytdMonth}.`)
    }
  }
  if (model.leave.length && metrics.leave.missingEmployeeCount > 0) reasons.push(`${metrics.leave.missingEmployeeCount} active employees are missing FYTD Leave records.`)
  if (model.leave.length && metrics.leave.missingBalanceCount > 0) reasons.push(`${metrics.leave.missingBalanceCount} active employees are missing opening leave balances or monthly credits.`)
  if (model.leave.length && metrics.leave.balanceMismatchCount > 0) reasons.push(`${metrics.leave.balanceMismatchCount} Leave balance rows do not reconcile.`)
  if (model.leave.length && metrics.leave.availableDays <= 0) reasons.push('No available FYTD leave balance was supplied for utilisation analysis.')
  return { ready: reasons.length === 0, reasons, metrics }
}

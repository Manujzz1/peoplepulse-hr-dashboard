import { DEFAULT_INCREMENT_BAND_LIMITS, getIncrementBandLabel, normalizeIncrementBandLimits } from '../data/incrementPolicy'
import { PAYROLL_COMPONENTS } from '../data/hrModel'

const money = (value) => Number.isFinite(value) ? Math.round(value) : null
const isNumeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const numericOrNull = (value) => isNumeric(value) ? Number(value) : null

export const REPORT_COLUMNS = {
  summary: ['metric', 'value', 'unit'],
  workforce: ['employeeId', 'employeeName', 'company', 'department', 'location', 'employmentType', 'monthlyGrossSalaryINR', 'annualCtcINR', ...PAYROLL_COMPONENTS.map(({ key }) => key), 'attendancePercentage', 'lopDays', 'leaveTaken', 'performanceScore', 'incrementPercentage', 'project', 'allocationPercentage'],
  departments: ['department', 'headcount', 'monthlyGrossPayrollINR', 'incrementCostINR', 'averageAttendance'],
  trends: ['month', 'headcount', 'joiners', 'exits', 'attritionPercentage', 'monthlyGrossPayrollINR', 'attendancePercentage'],
  headcount: ['employeeId', 'employeeName', 'company', 'department', 'location', 'employmentType', 'hireDate', 'exitDate', 'statusAsOf'],
  movements: ['movementType', 'employeeId', 'employeeName', 'company', 'department', 'location', 'effectiveDate'],
  payroll: ['department', 'employeeCount', 'monthlyGrossPayrollINR', 'annualisedGrossPayrollINR', 'annualCtcINR'],
  employeeCost: ['employeeId', 'employeeName', 'company', 'department', 'location', 'employmentType', 'monthlyGrossSalaryINR', 'annualCtcINR', ...PAYROLL_COMPONENTS.map(({ key }) => key)],
  attendance: ['employeeId', 'employeeName', 'company', 'department', 'location', 'attendancePercentage'],
  leaveLop: ['employeeId', 'employeeName', 'company', 'department', 'location', 'lopDays', 'leaveTaken', 'leaveTakenYtd'],
  performance: ['employeeId', 'employeeName', 'company', 'department', 'performanceScore', 'performanceCategory'],
  increments: ['employeeId', 'employeeName', 'company', 'department', 'effectiveDate', 'incrementPercentage', 'policyBand', 'annualCtcIncreaseINR', 'monthlyRunRateImpactINR', 'approvalStatus', 'dataCompleteness'],
  projectAllocation: ['employeeId', 'employeeName', 'company', 'department', 'project', 'allocationPercentage', 'monthlyGrossSalaryINR', 'allocationWeightedCostINR', 'costBasis'],
  projectCost: ['project', 'uniqueHeadcount', 'allocationWeightedFTE', 'allocationWeightedCostINR', 'costBasis'],
  recruitment: ['requisitionId', 'company', 'department', 'designation', 'reportingMonth', 'approvedPositions', 'filledPositions', 'status', 'requisitionDate', 'offerDate', 'offerAcceptedDate', 'joiningDate', 'recruitmentSource', 'dataCompleteness'],
  contracts: ['contractorId', 'company', 'vendor', 'department', 'location', 'reportingMonth', 'contractStartDate', 'contractEndDate', 'monthlyGrossINR', 'vendorServiceChargesINR', 'reportedGstINR', 'totalVendorCostINR', 'status', 'dataCompleteness'],
  budget: ['reportingMonth', 'company', 'department', 'budgetCategory', 'budgetAmountINR', 'actualINR', 'varianceINR', 'actualBasis', 'dataCompleteness'],
}
const COLUMN_LABELS = {
  ...Object.fromEntries(PAYROLL_COMPONENTS.map(({ key, label }) => [key, `${label} (reported INR)`])),
  employeeId: 'Employee ID', employeeName: 'Employee name', monthlyGrossSalaryINR: 'Monthly gross (INR)', annualCtcINR: 'Annual CTC (INR)',
  company: 'Company',
  attendancePercentage: 'Attendance (%)', lopDays: 'LOP days', leaveTaken: 'Leave taken', performanceScore: 'PMS score',
  incrementPercentage: 'Increment (%)', allocationPercentage: 'Allocation (%)', monthlyGrossPayrollINR: 'Monthly gross payroll (INR)',
  incrementCostINR: 'Increment cost (INR)', averageAttendance: 'Average attendance (%)', attritionPercentage: 'Attrition (%)',
  annualisedGrossPayrollINR: 'Annualised gross payroll (INR)',
  movementType: 'Movement type', effectiveDate: 'Effective date', statusAsOf: 'Status as of selected date',
  employeeCount: 'Employee count', leaveTakenYtd: 'Leave taken FYTD', incrementAmountINR: 'Increment amount (INR)',
  annualCtcIncreaseINR: 'Annual CTC increase (INR)', monthlyRunRateImpactINR: 'Monthly run-rate impact (INR)', dataCompleteness: 'Source completeness',
  approvalStatus: 'Approval status', policyBand: 'Configured increment band', uniqueHeadcount: 'Unique headcount', allocationWeightedFTE: 'Allocation weighted FTE',
  allocationWeightedCostINR: 'Allocation weighted cost (INR)', costBasis: 'Cost basis', requisitionId: 'Requisition ID', reportingMonth: 'Reporting month',
  approvedPositions: 'Approved positions', filledPositions: 'Filled positions', recruitmentSource: 'Recruitment source',
  offerDate: 'Offer date', offerAcceptedDate: 'Offer accepted date',
  contractorId: 'Contractor ID', vendor: 'Vendor', contractStartDate: 'Contract start date',
  contractEndDate: 'Contract end date', monthlyGrossINR: 'Monthly gross (INR)', vendorServiceChargesINR: 'Vendor service charges (INR)',
  reportedGstINR: 'Reported GST (INR)', totalVendorCostINR: 'Total vendor cost (INR)', budgetCategory: 'Budget category',
  budgetAmountINR: 'Budget amount (INR)', actualINR: 'Actual (INR)', varianceINR: 'Variance (INR)', actualBasis: 'Actual basis',
  performanceCategory: 'Performance category',
}
export const reportColumnLabel = (key) => COLUMN_LABELS[key] || key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())

const average = (employees, key) => {
  const values = employees.map((employee) => employee[key]).filter(isNumeric).map(Number)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function createDashboardReport({ month, asOfDate, employees, departments, trends, current, previous, sourceLabel, projectAssignments = employees, planning = {}, filters = {}, incrementBandLimits = DEFAULT_INCREMENT_BAND_LIMITS }) {
  const configuredIncrementBands = normalizeIncrementBandLimits(incrementBandLimits) || DEFAULT_INCREMENT_BAND_LIMITS
  const opening = current.openingHeadcount ?? previous.headcount
  const closing = current.headcount
  const averageHeadcount = Number.isFinite(opening) && Number.isFinite(closing) ? (opening + closing) / 2 : null
  const exits = current.exits?.length ?? 0
  const joiners = current.joiners?.length ?? 0
  const attrition = averageHeadcount ? exits / averageHeadcount * 100 : null
  const previousPayrollComplete = previous.payrollComplete !== false
  const currentPayrollComplete = current.payrollComplete !== false
  const payrollVariance = previousPayrollComplete && currentPayrollComplete && previous.payroll > 0
    ? (current.payroll - previous.payroll) / previous.payroll * 100
    : null
  const averageAttendance = average(employees, 'attendance')
  const annualCtc = employees.length > 0 && employees.every((employee) => isNumeric(employee.annualCtc))
    ? money(employees.reduce((sum, employee) => sum + Number(employee.annualCtc), 0))
    : null

  const summary = [
    { metric: 'Reporting month', value: month, unit: '' },
    { metric: 'As of date', value: asOfDate, unit: '' },
    { metric: 'Data source', value: sourceLabel, unit: '' },
    { metric: 'Company filter', value: filters.company || 'All companies', unit: '' },
    { metric: 'Department filter', value: filters.department || 'All departments', unit: '' },
    { metric: 'Location filter', value: filters.location || 'All locations', unit: '' },
    { metric: 'Employment type filter', value: filters.employmentType || 'All employment types', unit: '' },
    { metric: 'Opening headcount', value: opening ?? null, unit: 'employees' },
    { metric: 'Closing headcount', value: closing, unit: 'employees' },
    { metric: 'Average headcount', value: averageHeadcount == null ? null : Math.round(averageHeadcount * 10) / 10, unit: 'employees' },
    { metric: 'Permanent headcount', value: employees.filter((employee) => employee.employmentType === 'Permanent').length, unit: 'employees' },
    { metric: 'Contract headcount', value: employees.filter((employee) => employee.employmentType === 'Contract').length, unit: 'employees' },
    { metric: 'Joiners', value: joiners, unit: 'employees' },
    { metric: 'Exits', value: exits, unit: 'employees' },
    { metric: 'Net movement', value: joiners - exits, unit: 'employees' },
    { metric: 'Attrition rate', value: attrition == null ? null : Math.round(attrition * 10) / 10, unit: '%' },
    { metric: 'Monthly gross payroll', value: money(current.payroll), unit: 'INR' },
    { metric: 'Annualised gross payroll', value: money(current.payroll * 12), unit: 'INR' },
    { metric: 'Payroll month-on-month variance', value: payrollVariance == null ? null : Math.round(payrollVariance * 10) / 10, unit: '%' },
    { metric: 'Total annual CTC', value: annualCtc, unit: annualCtc == null ? 'Not fully provided' : 'INR' },
    { metric: 'Average attendance', value: averageAttendance == null ? null : Math.round(averageAttendance * 10) / 10, unit: '%' },
  ]
  if (current.incrementAnalytics) {
    summary.push(
      { metric: 'Approved effective increment changes', value: current.incrementAnalytics.complete ? current.incrementAnalytics.approvedCount : null, unit: current.incrementAnalytics.complete ? 'changes' : 'Source incomplete' },
      { metric: 'Increment annual CTC impact', value: money(current.incrementAnalytics.annualCostImpact), unit: 'INR' },
      { metric: 'Increment monthly run-rate impact', value: money(current.incrementAnalytics.monthlyCostImpact), unit: 'INR' },
      { metric: 'Increment budget', value: money(current.incrementAnalytics.budget), unit: current.incrementAnalytics.budgetComplete ? 'INR' : 'Not complete or not filterable' },
      { metric: 'Increment budget variance', value: money(current.incrementAnalytics.budgetVariance), unit: 'INR · actual less budget' },
    )
  }

  const workforce = employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    company: employee.company || 'Not specified',
    department: employee.department,
    location: employee.location,
    employmentType: employee.employmentType,
    monthlyGrossSalaryINR: money(employee.monthlySalary),
    annualCtcINR: isNumeric(employee.annualCtc) ? money(Number(employee.annualCtc)) : null,
    ...Object.fromEntries(PAYROLL_COMPONENTS.map(({ key }) => [key, numericOrNull(employee[key]) == null ? null : money(Number(employee[key]))])),
    attendancePercentage: numericOrNull(employee.attendance),
    lopDays: numericOrNull(employee.lopDays),
    leaveTaken: numericOrNull(employee.leaveTaken),
    performanceScore: numericOrNull(employee.performanceScore),
    incrementPercentage: numericOrNull(employee.incrementPercent),
    project: employee.project,
    allocationPercentage: numericOrNull(employee.allocation),
  }))

  const departmentRows = departments.map((department) => ({
    department: department.department,
    headcount: department.headcount,
    monthlyGrossPayrollINR: money(department.payroll),
    incrementCostINR: money(department.incrementCost),
    averageAttendance: department.attendance,
  }))
  const monthlyTrends = trends.map((point) => ({
    month: point.reportingMonth || point.month,
    headcount: point.headcount,
    joiners: point.joiners,
    exits: point.exits,
    attritionPercentage: point.attrition,
    monthlyGrossPayrollINR: point.payroll,
    attendancePercentage: point.attendance,
  }))

  const statusOf = (employee) => employee.hireDate > asOfDate ? 'Not yet joined' : employee.exitDate && employee.exitDate <= asOfDate ? 'Exited' : 'Active'
  const headcount = employees.map((employee) => ({
    employeeId: employee.id, employeeName: employee.name, company: employee.company || 'Not specified', department: employee.department, location: employee.location,
    employmentType: employee.employmentType, hireDate: employee.hireDate, exitDate: employee.exitDate, statusAsOf: statusOf(employee),
  }))
  const movements = [
    ...(current.joiners || []).map((employee) => ({ movementType: 'Joiner', employeeId: employee.id, employeeName: employee.name, company: employee.company || 'Not specified', department: employee.department, location: employee.location, effectiveDate: employee.hireDate })),
    ...(current.exits || []).map((employee) => ({ movementType: 'Exit', employeeId: employee.id, employeeName: employee.name, company: employee.company || 'Not specified', department: employee.department, location: employee.location, effectiveDate: employee.exitDate })),
  ]
  const payroll = departments.map((department) => {
    const departmentEmployees = employees.filter((employee) => employee.department === department.department)
    const departmentCtcComplete = departmentEmployees.length > 0 && departmentEmployees.every((employee) => isNumeric(employee.annualCtc))
    return {
      department: department.department, employeeCount: department.headcount, monthlyGrossPayrollINR: money(department.payroll),
      annualisedGrossPayrollINR: money(department.payroll * 12),
      annualCtcINR: departmentCtcComplete ? money(departmentEmployees.reduce((sum, employee) => sum + Number(employee.annualCtc), 0)) : null,
    }
  })
  payroll.push({ department: 'Filtered total', employeeCount: employees.length, monthlyGrossPayrollINR: money(current.payroll), annualisedGrossPayrollINR: money(current.payroll * 12), annualCtcINR: annualCtc })
  const employeeCost = workforce.map(({ employeeId, employeeName, company, department, location, employmentType, monthlyGrossSalaryINR, annualCtcINR, ...components }) => ({ employeeId, employeeName, company, department, location, employmentType, monthlyGrossSalaryINR, annualCtcINR, ...components }))
  const attendanceRows = workforce.map(({ employeeId, employeeName, company, department, location, attendancePercentage }) => ({ employeeId, employeeName, company, department, location, attendancePercentage }))
  const leaveLop = workforce.map(({ employeeId, employeeName, company, department, location, lopDays, leaveTaken }) => ({ employeeId, employeeName, company, department, location, lopDays, leaveTaken, leaveTakenYtd: employees.find((employee) => employee.id === employeeId)?.leaveTakenYtd ?? null }))
  const performance = workforce.map(({ employeeId, employeeName, company, department, performanceScore }) => ({ employeeId, employeeName, company, department, performanceScore, performanceCategory: employees.find((employee) => employee.id === employeeId)?.performanceCategory ?? null }))
  const increments = current.incrementAnalytics
    ? current.incrementAnalytics.rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      company: row.company,
      department: row.department,
      effectiveDate: row.effectiveDate,
      incrementPercentage: numericOrNull(row.incrementPercent),
      policyBand: getIncrementBandLabel(row.incrementPercent, configuredIncrementBands),
      annualCtcIncreaseINR: row.approvalStatus === 'Approved' ? money(row.annualCostImpact) : null,
      monthlyRunRateImpactINR: row.approvalStatus === 'Approved' ? money(row.monthlyCostImpact) : null,
      approvalStatus: row.approvalStatus,
      dataCompleteness: current.incrementAnalytics.complete ? 'Confirmed complete' : 'Provisional',
    }))
    : workforce.map(({ employeeId, employeeName, company, department, incrementPercentage }) => {
      const employee = employees.find((item) => item.id === employeeId)
      const monthlyIncrease = isNumeric(employee?.monthlyBase) && isNumeric(employee?.monthlySalary) ? Number(employee.monthlySalary) - Number(employee.monthlyBase) : null
      return {
        employeeId, employeeName, company, department, effectiveDate: employee?.incrementPercent ? '2025-04-01' : '', incrementPercentage,
        policyBand: getIncrementBandLabel(incrementPercentage, configuredIncrementBands),
        annualCtcIncreaseINR: monthlyIncrease == null ? null : money(monthlyIncrease * 12 * 1.15),
        monthlyRunRateImpactINR: monthlyIncrease == null ? null : money(monthlyIncrease * 1.15),
        approvalStatus: 'Synthetic demo estimate',
        dataCompleteness: 'Synthetic demo estimate',
      }
    })
  const allocations = (Array.isArray(current.projectAllocationRows) ? current.projectAllocationRows : projectAssignments).map((employee) => ({
    employeeId: employee.employeeId || employee.id, employeeName: employee.name, company: employee.company || 'Not specified', department: employee.department, project: employee.project || 'Unallocated',
    allocationPercentage: numericOrNull(employee.allocation), monthlyGrossSalaryINR: money(employee.monthlySalary),
    allocationWeightedCostINR: employee.allocationWeightedCost !== undefined ? money(employee.allocationWeightedCost) : money(Number(employee.monthlySalary || 0) * Number(employee.allocation || 0) / 100),
    costBasis: current.projectAllocationCostBasisLabel || 'Synthetic monthly gross salary',
  }))
  const projectGroups = new Map()
  projectAssignments.forEach((employee) => {
    const project = employee.project || 'Unallocated'
    const value = projectGroups.get(project) || { project, employeeIds: new Set(), allocationWeightedFTE: 0, allocationWeightedCostINR: 0 }
    value.employeeIds.add(employee.id)
    const allocation = Number(employee.allocation || 0)
    value.allocationWeightedFTE += allocation / 100
    value.allocationWeightedCostINR += Number(employee.monthlySalary || 0) * allocation / 100
    projectGroups.set(project, value)
  })
  const projectCost = Array.isArray(current.projectAllocationData)
    ? current.projectAllocationData.map((project) => ({
      project: project.project,
      uniqueHeadcount: project.headcount,
      allocationWeightedFTE: project.allocationWeightedFTE,
      allocationWeightedCostINR: money(project.cost),
      costBasis: project.costBasis || current.projectAllocationCostBasisLabel || 'Synthetic monthly gross salary',
    }))
    : [...projectGroups.values()].map(({ employeeIds, ...row }) => ({ ...row, uniqueHeadcount: employeeIds.size, allocationWeightedFTE: Math.round(row.allocationWeightedFTE * 100) / 100, allocationWeightedCostINR: money(row.allocationWeightedCostINR), costBasis: 'Synthetic monthly gross salary' }))
  const recruitment = (planning.recruitment?.rows || []).map((row) => ({ ...row, company: row.company || 'Not specified', dataCompleteness: planning.recruitment.complete ? 'Confirmed complete' : 'Provisional' }))
  const contracts = (planning.contracts?.rows || []).map((row) => ({
    contractorId: row.contractorId, company: row.company || 'Not specified', vendor: row.vendor, department: row.department, location: row.location, reportingMonth: row.reportingMonth,
    contractStartDate: row.contractStartDate, contractEndDate: row.contractEndDate, monthlyGrossINR: money(row.monthlyGross),
    vendorServiceChargesINR: money(row.vendorServiceCharges), reportedGstINR: money(row.monthlyGstAmount),
    totalVendorCostINR: money(Number(row.monthlyGross || 0) + Number(row.vendorServiceCharges || 0) + Number(row.monthlyGstAmount || 0)),
    status: row.status, dataCompleteness: planning.contracts.complete ? 'Confirmed complete' : 'Provisional',
  }))
  const budget = (planning.budget?.rows || []).map((row) => ({
    reportingMonth: row.reportingMonth, company: row.company || 'Not specified', department: row.department, budgetCategory: row.budgetCategory, budgetAmountINR: money(row.budgetAmount),
    actualINR: money(row.actual), varianceINR: money(row.variance), actualBasis: row.actualBasis,
    dataCompleteness: planning.budget.complete ? 'Confirmed complete' : 'Provisional',
  }))

  return {
    summary, consolidated: summary, workforce, departments: departmentRows, trends: monthlyTrends, headcount, movements,
    payroll, employeeCost, attendance: attendanceRows, leaveLop, performance, increments, projectAllocation: allocations, projectCost,
    recruitment, contracts, budget,
  }
}

export function toCsv(rows, columns = Object.keys(rows[0] || {})) {
  return serializeCsv(columns.map(reportColumnLabel), rows.map((row) => columns.map((key) => row[key] ?? '')))
}

import { serializeCsv } from '../data/csv'


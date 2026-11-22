import { describe, expect, it } from 'vitest'
import { createDashboardReport, REPORT_COLUMNS, toCsv } from './reportData'

const base = {
  month: '2025-03',
  asOfDate: '2025-03-31',
  sourceLabel: 'Synthetic sample',
  current: { openingHeadcount: 90, headcount: 100, joiners: [{}, {}, {}], exits: [{}], payroll: 1050000 },
  previous: { headcount: 90, payroll: 1000000 },
  employees: [
    { id: 'SYN-001', name: 'Sample One', department: 'People', location: 'Pune', employmentType: 'Permanent', monthlySalary: 50000, annualCtc: 690000, attendance: 95, allocation: 50 },
    { id: 'SYN-002', name: 'Sample Two', department: 'People', location: 'Pune', employmentType: 'Contract', monthlySalary: 40000, annualCtc: null, attendance: 85, allocation: 50 },
  ],
  departments: [{ department: 'People', headcount: 2, payroll: 90000, incrementCost: 3000, attendance: 90 }],
  trends: [{ month: 'Mar', reportingMonth: '2025-03', headcount: 100, joiners: 3, exits: 1, attrition: 1.1, payroll: 1050000, attendance: 90 }],
}

describe('filtered management report data', () => {
  it('keeps missing attendance and incomplete payroll comparisons unavailable', () => {
    const report = createDashboardReport({
      ...base,
      current: { ...base.current, payrollComplete: false, attendanceAveragePercentage: null },
    })
    const summary = Object.fromEntries(report.summary.map(({ metric, value }) => [metric, value]))
    expect(summary).toMatchObject({
      'Average attendance': null,
      'Annualised gross payroll': null,
      'Payroll month-on-month variance': null,
    })
  })
  it('uses dashboard metrics for movement and payroll variance', () => {
    const report = createDashboardReport({ ...base, filters: { company: 'Northstar Labs', department: 'People', location: 'Pune', employmentType: 'Permanent' } })
    expect(report.summary.find((row) => row.metric === 'Average headcount').value).toBe(95)
    expect(report.summary.find((row) => row.metric === 'Attrition rate').value).toBe(1.1)
    expect(report.summary.find((row) => row.metric === 'Payroll month-on-month variance').value).toBe(5)
    expect(report.summary.find((row) => row.metric === 'Net movement').value).toBe(2)
    expect(report.summary).toEqual(expect.arrayContaining([
      { metric: 'Company filter', value: 'Northstar Labs', unit: '' },
      { metric: 'Department filter', value: 'People', unit: '' },
      { metric: 'Location filter', value: 'Pune', unit: '' },
      { metric: 'Employment type filter', value: 'Permanent', unit: '' },
    ]))
    expect(report.departments).toHaveLength(1)
    expect(report.workforce).toHaveLength(2)
  })

  it('preserves unavailable imported CTC values instead of converting them to zero', () => {
    const report = createDashboardReport(base)
    expect(report.summary.find((row) => row.metric === 'Total annual CTC')).toMatchObject({ value: null, unit: 'Not fully provided' })
    expect(report.workforce[1].annualCtcINR).toBeNull()
  })

  it('quotes CSV fields and escapes embedded quotes', () => {
    expect(toCsv([{ employeeName: 'Sample "A"', department: 'People, Finance' }])).toContain('"Sample ""A""","People, Finance"')
  })

  it('exports effective-dated imported increments with approval status and only counts approved cost as actual', () => {
    const report = createDashboardReport({
      ...base,
      current: {
        ...base.current,
        incrementAnalytics: {
          complete: true,
          approvedCount: 1,
          annualCostImpact: 1200,
          monthlyCostImpact: 100,
          budget: 150,
          budgetComplete: true,
          budgetVariance: -50,
          rows: [
            { employeeId: 'SYN-001', employeeName: 'Sample One', company: 'Northstar Labs', department: 'People', effectiveDate: '2025-03-01', incrementPercent: 10, annualCostImpact: 1200, monthlyCostImpact: 100, approvalStatus: 'Approved' },
            { employeeId: 'SYN-002', employeeName: 'Sample Two', company: 'Northstar Labs', department: 'People', effectiveDate: '2025-03-05', incrementPercent: 5, annualCostImpact: 800, monthlyCostImpact: 800 / 12, approvalStatus: 'Pending' },
          ],
        },
      },
    })
    expect(report.increments[0]).toMatchObject({ effectiveDate: '2025-03-01', annualCtcIncreaseINR: 1200, monthlyRunRateImpactINR: 100, approvalStatus: 'Approved' })
    expect(report.increments[1]).toMatchObject({ approvalStatus: 'Pending', annualCtcIncreaseINR: null, monthlyRunRateImpactINR: null })
    expect(report.summary.find((row) => row.metric === 'Increment monthly run-rate impact').value).toBe(100)
    expect(report.summary.find((row) => row.metric === 'Increment budget variance').value).toBe(-50)
  })

  it('uses the configured increment policy bands in report exports', () => {
    const report = createDashboardReport({
      ...base,
      incrementBandLimits: [5, 10, 15],
      current: {
        ...base.current,
        incrementAnalytics: {
          complete: true,
          rows: [
            { employeeId: 'SYN-001', employeeName: 'Sample One', incrementPercent: 10, approvalStatus: 'Approved' },
          ],
        },
      },
    })
    expect(report.increments[0].policyBand).toBe('10–<15%')
  })

  it('exports reported payroll component amounts separately without changing gross payroll', () => {
    const employees = [
      { ...base.employees[0], monthlyBasic: 30000, monthlyHra: 12000, employerPf: 3600 },
      base.employees[1],
    ]
    const report = createDashboardReport({ ...base, employees })
    expect(report.workforce[0]).toMatchObject({ monthlyGrossSalaryINR: 50000, monthlyBasic: 30000, monthlyHra: 12000, employerPf: 3600 })
    expect(report.employeeCost[0]).toMatchObject({ monthlyGrossSalaryINR: 50000, monthlyBasic: 30000, monthlyHra: 12000, employerPf: 3600 })
    expect(report.payroll.find((row) => row.department === 'Filtered total').monthlyGrossPayrollINR).toBe(1050000)
    expect(REPORT_COLUMNS.workforce).toContain('monthlyBasic')
  })

  it('keeps headers in an empty filtered CSV export', () => {
    expect(toCsv([], ['employeeId', 'monthlyGrossSalaryINR'])).toContain('"Employee ID","Monthly gross (INR)"')
  })

  it('does not claim an annual CTC total when the filtered workforce is empty', () => {
    const report = createDashboardReport({ ...base, employees: [] })
    expect(report.summary.find((row) => row.metric === 'Total annual CTC').value).toBeNull()
  })

  it('builds employee, attendance, movement, and weighted project reports from dashboard rows', () => {
    const employees = base.employees.map((employee, index) => ({
      ...employee,
      monthlyBase: index === 0 ? 40000 : undefined,
      monthlySalary: index === 0 ? 50000 : employee.monthlySalary,
      hireDate: index === 0 ? '2025-03-10' : '2024-06-01',
      lopDays: index === 0 ? 1 : 0,
      leaveTakenYtd: 2,
      performanceScore: 4.2,
    }))
    const report = createDashboardReport({
      ...base,
      employees,
      current: { ...base.current, joiners: [{ ...employees[0] }], exits: [] },
      projectAssignments: [{ ...employees[0], project: 'Sample Project', allocation: 50 }],
      planning: {
        recruitment: { complete: false, rows: [{ requisitionId: 'SYN-REQ-01', status: 'Open' }] },
      },
    })
    expect(report.headcount).toHaveLength(2)
    expect(report.movements).toContainEqual(expect.objectContaining({ movementType: 'Joiner', employeeId: 'SYN-001' }))
    expect(report.attendance[0].attendancePercentage).toBe(95)
    expect(report.leaveLop[0].lopDays).toBe(1)
    expect(report.increments[0].annualCtcIncreaseINR).toBe(138000)
    expect(report.increments[0].monthlyRunRateImpactINR).toBe(11500)
    expect(report.increments[1].annualCtcIncreaseINR).toBeNull()
    expect(report.projectCost[0]).toMatchObject({ uniqueHeadcount: 1, allocationWeightedFTE: 0.5, allocationWeightedCostINR: 25000 })
    expect(report.recruitment[0].dataCompleteness).toBe('Provisional')
  })

  it('uses the imported model project cost totals rather than month-end employee snapshots', () => {
    const report = createDashboardReport({
      ...base,
      current: {
        ...base.current,
        projectAllocationData: [{ project: 'Imported Project', headcount: 3, allocationWeightedFTE: 1.25, cost: 87500 }],
        projectAllocationRows: [{ employeeId: 'SYN-EXITED', id: 'SYN-EXITED-PRJ-A', name: 'Sample Exited', department: 'People', project: 'Imported Project', allocation: 75, monthlySalary: 50000 }],
      },
      projectAssignments: [{ ...base.employees[0], project: 'Imported Project', allocation: 50 }],
    })
    expect(report.projectCost).toEqual([{ project: 'Imported Project', uniqueHeadcount: 3, allocationWeightedFTE: 1.25, allocationWeightedCostINR: 87500, costBasis: 'Synthetic monthly gross salary' }])
    expect(report.projectAllocation[0]).toMatchObject({ employeeId: 'SYN-EXITED', employeeName: 'Sample Exited', allocationPercentage: 75 })
  })

  it('preserves unavailable imported project costs and exports the selected cost basis', () => {
    const report = createDashboardReport({
      ...base,
      current: {
        ...base.current,
        projectAllocationCostBasisLabel: 'Payroll monthly gross',
        projectAllocationData: [{ project: 'Imported Project', headcount: 1, allocationWeightedFTE: 0.5, cost: null, costBasis: 'Payroll monthly gross' }],
        projectAllocationRows: [{ employeeId: 'SYN-EXITED', id: 'SYN-EXITED-PRJ-A', name: 'Sample Exited', project: 'Imported Project', allocation: 50, monthlySalary: null, allocationWeightedCost: null }],
      },
    })
    expect(report.projectCost[0]).toMatchObject({ allocationWeightedCostINR: null, costBasis: 'Payroll monthly gross' })
    expect(report.projectAllocation[0]).toMatchObject({ monthlyGrossSalaryINR: null, allocationWeightedCostINR: null, costBasis: 'Payroll monthly gross' })
  })
})

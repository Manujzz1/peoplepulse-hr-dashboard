import { describe, expect, it } from 'vitest'
import { createHrModel, getImportedAvailableMonths, getImportedDashboardReadiness, getImportedEmployeeDirectory, getImportedMonthMetrics, getImportedTrendData, KPI_CATALOG, KPI_DEFINITIONS } from './hrModel'

const completeMonths = (month) => ({ completeMonths: [month] })

const staged = {
  employeeMaster: {
    completeAsOf: '2025-03-31',
    rows: [
      { employeeId: 'EMP-1', employeeName: 'Sample One', department: 'Engineering', location: 'Pune', employmentType: 'Permanent', hireDate: '2024-02-01', exitDate: '' },
      { employeeId: 'EMP-2', employeeName: 'Sample Two', department: 'Sales', location: 'Mumbai', employmentType: 'Permanent', hireDate: '2024-04-01', exitDate: '2025-03-15' },
      { employeeId: 'EMP-3', employeeName: 'Sample Three', department: 'Engineering', location: 'Pune', employmentType: 'Contract', hireDate: '2025-03-20', exitDate: '' },
    ],
  },
  projectMaster: { complete: true, rows: [{ projectId: 'PROJ-A', projectName: 'Sample Alpha' }] },
  payroll: { ...completeMonths('2025-03'), rows: [
    { employeeId: 'EMP-1', reportingMonth: '2025-03', monthlyGrossSalary: 1000, annualCtc: 13800 },
    { employeeId: 'EMP-3', reportingMonth: '2025-03', monthlyGrossSalary: 500, annualCtc: 6900 },
  ] },
  attendance: { completeMonths: ['2025-01', '2025-02', '2025-03'], rows: [
    { employeeId: 'EMP-1', reportingMonth: '2025-01', attendancePercentage: 96, lopDays: 0, leaveTaken: 1 },
    { employeeId: 'EMP-2', reportingMonth: '2025-01', attendancePercentage: 94, lopDays: 1, leaveTaken: 0 },
    { employeeId: 'EMP-1', reportingMonth: '2025-02', attendancePercentage: 95, lopDays: 0, leaveTaken: 1 },
    { employeeId: 'EMP-2', reportingMonth: '2025-02', attendancePercentage: 93, lopDays: 0, leaveTaken: 1 },
    { employeeId: 'EMP-1', reportingMonth: '2025-03', attendancePercentage: 95, lopDays: 1, leaveTaken: 2 },
    { employeeId: 'EMP-3', reportingMonth: '2025-03', attendancePercentage: 90, lopDays: 0, leaveTaken: 1 },
  ] },
  performance: { ...completeMonths('2025-03'), rows: [
    { employeeId: 'EMP-1', reportingMonth: '2025-03', performanceScore: 4.5, incrementPercent: 8 },
    { employeeId: 'EMP-3', reportingMonth: '2025-03', performanceScore: 4.0, incrementPercent: 5 },
  ] },
  projectAllocation: { ...completeMonths('2025-03'), rows: [
    { employeeId: 'EMP-1', reportingMonth: '2025-03', projectId: 'PROJ-A', allocationPercentage: 50, monthlyGrossCost: 1000 },
    { employeeId: 'EMP-3', reportingMonth: '2025-03', projectId: 'PROJ-A', allocationPercentage: 25, monthlyGrossCost: 2000 },
  ] },
}

describe('standardised monthly HR model', () => {
  it('documents formula, inputs, scope, completeness, unit, rounding and example for every catalogued KPI', () => {
    const required = ['name', 'description', 'formula', 'fields', 'period', 'filters', 'completeness', 'unit', 'rounding', 'example']
    expect(Object.keys(KPI_CATALOG).length).toBeGreaterThanOrEqual(20)
    Object.values(KPI_CATALOG).forEach((definition) => {
      required.forEach((field) => expect(definition[field], `${definition.name} ${field}`).toBeTruthy())
    })
    expect(KPI_DEFINITIONS.attritionRate).toContain('average headcount')
    expect(Object.keys(KPI_DEFINITIONS)).toEqual(Object.keys(KPI_CATALOG))
    expect(KPI_CATALOG.annualCtc.formula).toContain('synthetic benefits assumption')
    expect(KPI_CATALOG.incrementImpact.completeness).toContain('Demo values use synthetic sample salaries')
    expect(KPI_CATALOG.recruitmentTimeToHire.formula).toContain('offer accepted date − requisition date')
    expect(KPI_CATALOG.recruitmentTimeToFill.formula).toContain('joining date − requisition date')
  })

  it('calculates effective-dated headcount movements and average-headcount attrition', () => {
    const metrics = getImportedMonthMetrics(createHrModel(staged), '2025-03')
    expect(metrics.headcount).toMatchObject({ opening: 2, closing: 2, average: 2, joiners: 1, exits: 1, netMovement: 0, attritionRate: 50, complete: true })
    expect(KPI_DEFINITIONS.attritionRate).toContain('average headcount')
  })

  it('uses explicit Exit Records to confirm departures without treating omitted employees as exits', () => {
    const withExitRecords = structuredClone(staged)
    withExitRecords.exitRecords = { rows: [{ employeeId: 'EMP-1', exitDate: '2025-03-10', exitType: 'Voluntary' }] }
    const model = createHrModel(withExitRecords)
    const metrics = getImportedMonthMetrics(model, '2025-03')
    expect(metrics.headcount.exits).toBe(2)
    expect(metrics.headcount.closing).toBe(1)
    expect(model.employees.get('EMP-1').exitDate).toBe('2025-03-10')
    expect(model.employees.get('EMP-3').exitDate).toBe('')
    expect(metrics.headcount.exitTypeDistribution).toContainEqual({ exitType: 'Voluntary', count: 1 })
    expect(metrics.headcount.exitTypeDistribution).toContainEqual({ exitType: 'Not specified', count: 1 })
    expect(metrics.headcount.averageTenureAtExitYears).toBeGreaterThan(0)
  })

  it('preserves Employee Master dates and flags conflicting Exit Records for reconciliation', () => {
    const withConflict = structuredClone(staged)
    withConflict.exitRecords = { rows: [{ employeeId: 'EMP-2', exitDate: '2025-03-20', exitType: 'Voluntary' }] }
    const model = createHrModel(withConflict)
    expect(model.employees.get('EMP-2').exitDate).toBe('2025-03-15')
    expect(model.exitRecordConflicts).toEqual(['EMP-2'])
    expect(getImportedDashboardReadiness(model, '2025-03').reasons).toContain('Some Exit Records conflict with Employee Master exit dates or contain multiple exit dates for the same employee.')
  })

  it('does not label imported attendance leave as FYTD when earlier financial-year coverage is missing', () => {
    const acrossFinancialYear = structuredClone(staged)
    acrossFinancialYear.attendance.completeMonths = ['2024-04', '2024-05', '2025-01', '2025-02', '2025-03']
    acrossFinancialYear.attendance.rows.push(
      { employeeId: 'EMP-1', reportingMonth: '2024-04', attendancePercentage: 95, leaveTaken: 3 },
      { employeeId: 'EMP-1', reportingMonth: '2024-05', attendancePercentage: 96, leaveTaken: 2 },
    )
    const metrics = getImportedMonthMetrics(createHrModel(acrossFinancialYear), '2025-03')
    expect(metrics.headcount.activeEmployees.find((employee) => employee.employeeId === 'EMP-1').leaveTakenYtd).toBeNull()
  })

  it('uses attendance leave-taken as an FYTD employee total only with complete month and employee coverage', () => {
    const completeAttendance = structuredClone(staged)
    completeAttendance.employeeMaster.rows = [staged.employeeMaster.rows[0]]
    const financialMonths = []
    for (let year = 2024; year <= 2025; year += 1) {
      const firstMonth = year === 2024 ? 4 : 1
      const lastMonth = year === 2025 ? 3 : 12
      for (let month = firstMonth; month <= lastMonth; month += 1) financialMonths.push(`${year}-${String(month).padStart(2, '0')}`)
    }
    completeAttendance.attendance = {
      completeMonths: financialMonths,
      rows: financialMonths.map((reportingMonth) => ({ employeeId: 'EMP-1', reportingMonth, attendancePercentage: 95, leaveTaken: 1 })),
    }
    const metrics = getImportedMonthMetrics(createHrModel(completeAttendance), '2025-03')
    expect(metrics.headcount.activeEmployees[0].leaveTakenYtd).toBe(12)
  })

  it('uses the selected financial-year start month for imported leave periods', () => {
    const model = createHrModel(staged)
    const defaultYear = getImportedMonthMetrics(model, '2025-03')
    const julyYear = getImportedMonthMetrics(model, '2025-03', {}, '', { financialYearStartMonth: 7 })
    expect(defaultYear.leave.periodMonths[0]).toBe('2024-04')
    expect(julyYear.leave.periodMonths[0]).toBe('2024-07')
    expect(julyYear.leave.periodMonths).toHaveLength(9)
  })

  it('calculates imported FYTD leave utilisation from opening balances, credits, and leave used', () => {
    const importedLeave = structuredClone(staged)
    const financialMonths = []
    for (let year = 2024; year <= 2025; year += 1) {
      const firstMonth = year === 2024 ? 4 : 1
      const lastMonth = year === 2025 ? 3 : 12
      for (let month = firstMonth; month <= lastMonth; month += 1) financialMonths.push(`${year}-${String(month).padStart(2, '0')}`)
    }
    importedLeave.leave = {
      completeMonths: financialMonths,
      rows: [
        ...financialMonths.map((reportingMonth, index) => ({ employeeId: 'EMP-1', reportingMonth, leaveType: 'Annual', openingBalance: index === 0 ? 5 : 0, daysAvailed: 1, daysCredited: 1 })),
        { employeeId: 'EMP-3', reportingMonth: '2025-03', leaveType: 'Annual', openingBalance: 2, daysAvailed: 1, daysCredited: 1 },
      ],
    }
    importedLeave.attendance.rows = importedLeave.attendance.rows.map(({ leaveTaken: _leaveTaken, ...row }) => row)
    const metrics = getImportedMonthMetrics(createHrModel(importedLeave), '2025-03')
    expect(metrics.leave).toMatchObject({ complete: true, available: true, availableDays: 20, availedDays: 13, utilisationPercentage: 65 })
    expect(metrics.leave.byDepartment).toEqual([{ department: 'Engineering', availableDays: 20, availedDays: 13, headcount: 2, utilisation: 65 }])
    expect(metrics.headcount.activeEmployees.find((employee) => employee.employeeId === 'EMP-1').leaveTakenYtd).toBe(12)
    importedLeave.employeeMaster.rows = importedLeave.employeeMaster.rows.map((employee) => ({
      ...employee,
      company: employee.employeeId === 'EMP-3' ? 'Northstar Services' : 'Northstar Labs',
    }))
    const companyMetrics = getImportedMonthMetrics(createHrModel(importedLeave), '2025-03', { company: 'Northstar Services' })
    expect(companyMetrics.leave.availableDays).toBe(3)
    expect(companyMetrics.leave.availedDays).toBe(1)
    expect(companyMetrics.leave.utilisationPercentage).toBeCloseTo(100 / 3, 10)
    expect(companyMetrics.leave.byDepartment).toEqual([{ department: 'Engineering', availableDays: 3, availedDays: 1, headcount: 1, utilisation: 33.3 }])
    expect(getImportedDashboardReadiness(createHrModel(importedLeave), '2025-03').ready).toBe(true)
  })

  it('keeps imported leave utilisation unavailable when balances do not reconcile', () => {
    const importedLeave = structuredClone(staged)
    importedLeave.leave = {
      completeMonths: ['2025-03'],
      rows: [
        { employeeId: 'EMP-1', reportingMonth: '2025-03', leaveType: 'Annual', openingBalance: 4, daysAvailed: 2, daysCredited: 1, closingBalance: 10 },
        { employeeId: 'EMP-3', reportingMonth: '2025-03', leaveType: 'Annual', openingBalance: 2, daysAvailed: 0, daysCredited: 1 },
      ],
    }
    const leave = getImportedMonthMetrics(createHrModel(importedLeave), '2025-03').leave
    expect(leave.utilisationPercentage).toBeNull()
    expect(leave.balanceMismatchCount).toBe(1)
    expect(leave.complete).toBe(false)
    expect(getImportedMonthMetrics(createHrModel(importedLeave), '2025-03').headcount.activeEmployees.find((employee) => employee.employeeId === 'EMP-1').leaveTakenYtd).toBeNull()
  })

  it('aggregates payroll, attendance, performance and project allocation from monthly records', () => {
    const metrics = getImportedMonthMetrics(createHrModel(staged), '2025-03')
    expect(metrics.payroll).toMatchObject({ gross: 1500, annualCtc: 20700, employeeCount: 2, missingEmployeeCount: 0, complete: true })
    expect(metrics.attendance).toMatchObject({ averagePercentage: 92.5, lopDays: 1, leaveTaken: 3, complete: true })
    expect(metrics.attendance.dayReconciliation).toMatchObject({ available: false, rowCount: 2, checkedRows: 0 })
    expect(metrics.performance).toMatchObject({ averageScore: 4.25, averageIncrementPercent: 6.5, highPerformers: 1, complete: true })
    expect(metrics.projects).toMatchObject({ allocationWeightedCost: 625, uniqueEmployees: 2, allocatedFte: 0.75, complete: true })
  })

  it('keeps reported payroll components separate from gross salary and withholds component totals on partial coverage', () => {
    const payrollWithComponents = structuredClone(staged)
    payrollWithComponents.payroll.rows[0] = { ...payrollWithComponents.payroll.rows[0], monthlyBasic: 500, monthlyHra: 200 }
    payrollWithComponents.payroll.rows[1] = { ...payrollWithComponents.payroll.rows[1], monthlyBasic: 250, monthlyHra: 100 }
    const complete = getImportedMonthMetrics(createHrModel(payrollWithComponents), '2025-03')
    expect(complete.payroll).toMatchObject({ gross: 1500, annualCtc: 20700, complete: true })
    expect(complete.payroll.componentTotals.find((row) => row.component === 'Basic')).toMatchObject({ amount: 750, complete: true, reportedCount: 2, employeeCount: 2 })
    expect(complete.payroll.componentTotals.find((row) => row.component === 'HRA').amount).toBe(300)
    expect(complete.payroll.componentTotals.find((row) => row.component === 'Arrears')).toMatchObject({ amount: null, complete: false, reportedCount: 0 })

    payrollWithComponents.payroll.rows[1].monthlyBasic = null
    const partial = getImportedMonthMetrics(createHrModel(payrollWithComponents), '2025-03')
    expect(partial.payroll.componentTotals.find((row) => row.component === 'Basic')).toMatchObject({ amount: null, complete: false, reportedCount: 1 })
    expect(partial.payroll.gross).toBe(1500)
  })

  it('withholds payroll completeness and dashboard readiness when a supplied file control total does not reconcile', () => {
    const payrollWithDifference = {
      ...structuredClone(staged),
      payroll: {
        ...structuredClone(staged.payroll),
        reconciliationBatches: [{ reportingMonth: '2025-03', fileName: 'synthetic-payroll.csv', stagedAt: '2025-03-31T12:00:00Z', rowCount: 2, validRowsGrossTotal: 1500, sourceControlTotal: 1490, difference: 10 }],
      },
    }
    const model = createHrModel(payrollWithDifference)
    const metrics = getImportedMonthMetrics(model, '2025-03')
    expect(metrics.payroll).toMatchObject({ gross: 1500, complete: false, missingEmployeeCount: null, controlMismatch: true })
    expect(getImportedTrendData(model).find((point) => point.reportingMonth === '2025-03').payroll).toBeNull()
    expect(getImportedDashboardReadiness(model, '2025-03').reasons).toContain('Payroll rows do not reconcile to the latest source-file control total for 2025-03.')
    expect(getImportedMonthMetrics(model, '2025-03', {}, '', { projectCostBasis: 'payroll' }).projects).toMatchObject({ costAvailable: false, allocationWeightedCost: null })
    expect(getImportedMonthMetrics(model, '2025-03', {}, '', { projectCostBasis: 'hybrid' }).projects).toMatchObject({ costAvailable: true, allocationWeightedCost: 1000 })
  })

  it('uses one explicitly selected gross-cost basis and withholds cost when that basis is incomplete', () => {
    const model = createHrModel(staged)
    const payrollBasis = getImportedMonthMetrics(model, '2025-03', {}, '', { projectCostBasis: 'payroll' })
    const allocationBasis = getImportedMonthMetrics(model, '2025-03', {}, '', { projectCostBasis: 'allocation' })
    expect(payrollBasis.projects).toMatchObject({ allocationWeightedCost: 625, costAvailable: true, costBasisId: 'payroll' })
    expect(allocationBasis.projects).toMatchObject({ allocationWeightedCost: 1000, costAvailable: true, costBasisId: 'allocation' })

    const missingAllocationCost = structuredClone(staged)
    missingAllocationCost.projectAllocation.rows[1].monthlyGrossCost = ''
    const unavailable = getImportedMonthMetrics(createHrModel(missingAllocationCost), '2025-03', {}, '', { projectCostBasis: 'allocation' })
    expect(unavailable.projects).toMatchObject({ allocationWeightedCost: null, costAvailable: false })
    expect(unavailable.projects.byProject[0].cost).toBeNull()

    const incompletePayroll = structuredClone(staged)
    incompletePayroll.payroll.completeMonths = []
    const unavailablePayroll = getImportedMonthMetrics(createHrModel(incompletePayroll), '2025-03', {}, '', { projectCostBasis: 'payroll' })
    expect(unavailablePayroll.projects).toMatchObject({ allocationWeightedCost: null, costAvailable: false, costBasisId: 'payroll' })
  })

  it('reports day-level attendance reconciliation only when every selected row has the required inputs', () => {
    const model = createHrModel({
      ...staged,
      attendance: { completeMonths: ['2025-03'], rows: [
        { employeeId: 'EMP-1', reportingMonth: '2025-03', calendarDays: 31, workingDays: 22, presentDays: 20, weeklyOffDays: 8, holidayDays: 1, paidLeaveDays: 2, unpaidLeaveDays: 0, payableDays: 29, attendancePercentage: 90.91 },
        { employeeId: 'EMP-3', reportingMonth: '2025-03', calendarDays: 12, workingDays: 9, presentDays: 9, weeklyOffDays: 2, holidayDays: 1, paidLeaveDays: 0, unpaidLeaveDays: 0, payableDays: 12, attendancePercentage: 100 },
      ] },
    })
    expect(getImportedMonthMetrics(model, '2025-03').attendance.dayReconciliation).toEqual({
      available: true, rowCount: 2, checkedRows: 2, reconciledRows: 2, mismatchRows: 0,
    })

    model.attendance[1].payableDays = 13
    expect(getImportedMonthMetrics(model, '2025-03').attendance.dayReconciliation).toMatchObject({
      available: true, rowCount: 2, reconciledRows: 1, mismatchRows: 1,
    })
  })

  it('applies complete employee history to historical filters and employee directory attributes', () => {
    const model = createHrModel({
      ...staged,
      employeeHistory: { complete: true, rows: [
        { employeeId: 'EMP-1', effectiveFrom: '2025-03-01', effectiveTo: '', department: 'Sales', location: 'Mumbai', designation: 'Senior Analyst', grade: 'G2', employmentType: 'Permanent' },
        { employeeId: 'EMP-1', effectiveFrom: '2025-04-01', effectiveTo: '', department: 'Finance', designation: 'Finance Analyst' },
      ] },
    })
    const february = getImportedMonthMetrics(model, '2025-02', { department: 'Engineering' })
    const marchEngineering = getImportedMonthMetrics(model, '2025-03', { department: 'Engineering' })
    const marchSales = getImportedMonthMetrics(model, '2025-03', { department: 'Sales' })

    expect(february.payroll.gross).toBe(0)
    expect(marchEngineering.payroll.gross).toBe(500)
    expect(marchSales.payroll.gross).toBe(1000)
    expect(getImportedEmployeeDirectory(model, '2025-02-28', { department: 'Engineering' }).find((employee) => employee.employeeId === 'EMP-1')?.department).toBe('Engineering')
    expect(getImportedEmployeeDirectory(model, '2025-03-31', { department: 'Sales' }).find((employee) => employee.employeeId === 'EMP-1')?.designation).toBe('Senior Analyst')
    expect(getImportedEmployeeDirectory(model, '2025-02-28').find((employee) => employee.employeeId === 'EMP-1')?.effectiveHistory).toHaveLength(0)
    expect(getImportedEmployeeDirectory(model, '2025-03-31').find((employee) => employee.employeeId === 'EMP-1')?.effectiveHistory).toHaveLength(1)
    expect(getImportedEmployeeDirectory(model, '2025-04-30').find((employee) => employee.employeeId === 'EMP-1')?.effectiveHistory).toHaveLength(2)

    model.completeness.employeeHistory = false
    expect(getImportedMonthMetrics(model, '2025-03', { department: 'Sales' }).payroll.gross).toBe(0)
    expect(getImportedEmployeeDirectory(model, '2025-03-31').find((employee) => employee.employeeId === 'EMP-1')?.effectiveHistory).toHaveLength(0)
  })

  it('uses only approved effective-dated increment rows for cost impact and compares the matching budget', () => {
    const revisions = structuredClone(staged)
    revisions.increments = {
      completeMonths: ['2025-03'],
      rows: [
        { employeeId: 'EMP-1', effectiveDate: '2025-03-01', currentCtc: 12000, revisedCtc: 13200, incrementPercentage: 10, approvalStatus: 'Approved' },
        { employeeId: 'EMP-3', effectiveDate: '2025-03-15', currentCtc: 24000, revisedCtc: 26400, incrementPercentage: 10, approvalStatus: 'Pending' },
        { employeeId: 'EMP-2', effectiveDate: '2025-03-20', currentCtc: 9000, revisedCtc: 10000, approvalStatus: 'Rejected' },
      ],
    }
    revisions.hrBudget = { completeMonths: ['2025-03'], rows: [{ reportingMonth: '2025-03', department: 'Engineering', budgetCategory: 'Increment', budgetAmount: 150 }] }
    const metrics = getImportedMonthMetrics(createHrModel(revisions), '2025-03').increments
    expect(metrics).toMatchObject({
      approvedCount: 1,
      pendingCount: 1,
      rejectedCount: 1,
      averagePercentage: 10,
      annualCostImpact: 1200,
      monthlyCostImpact: 100,
      budget: 150,
      budgetVariance: -50,
      complete: true,
    })
    expect(metrics.byDepartment).toEqual([{ department: 'Engineering', approvedCount: 1, incrementCount: 1, annualCostImpact: 1200, monthlyCostImpact: 100, incrementTotal: 10, averageIncrementPercent: 10 }])
    expect(getImportedMonthMetrics(createHrModel(revisions), '2025-03', {}, '2025-03-10').increments).toMatchObject({
      approvedCount: 1, pendingCount: 0, rejectedCount: 0, monthlyCostImpact: 100,
    })
    expect(getImportedMonthMetrics(createHrModel(revisions), '2025-03', { location: 'Pune' }).increments.budget).toBeNull()
  })

  it('withholds increment actuals when the effective month is not certified complete', () => {
    const revisions = structuredClone(staged)
    revisions.increments = { completeMonths: [], rows: [{ employeeId: 'EMP-1', effectiveDate: '2025-03-01', currentCtc: 12000, revisedCtc: 13200, approvalStatus: 'Approved' }] }
    const metrics = getImportedMonthMetrics(createHrModel(revisions), '2025-03').increments
    expect(metrics).toMatchObject({ monthlyCostImpact: null, averagePercentage: null, approvedRows: [], complete: false })
  })

  it('keeps payroll and attendance period totals reconciled for employees exiting during the month', () => {
    const withLeaverPayroll = structuredClone(staged)
    withLeaverPayroll.payroll.rows.push({ employeeId: 'EMP-2', reportingMonth: '2025-03', monthlyGrossSalary: 700, annualCtc: 9660 })
    withLeaverPayroll.attendance.rows.push({ employeeId: 'EMP-2', reportingMonth: '2025-03', attendancePercentage: 88, lopDays: 2, leaveTaken: 1 })
    withLeaverPayroll.projectAllocation.rows.push({ employeeId: 'EMP-2', reportingMonth: '2025-03', projectId: 'PROJ-A', allocationPercentage: 40, monthlyGrossCost: 700 })
    const metrics = getImportedMonthMetrics(createHrModel(withLeaverPayroll), '2025-03')
    expect(metrics.headcount.closing).toBe(2)
    expect(metrics.payroll).toMatchObject({ gross: 2200, annualCtc: 30360, employeeCount: 3, missingAnnualCtcCount: 0 })
    expect(metrics.payroll.byDepartment.find((row) => row.department === 'Sales')).toMatchObject({ headcount: 1, payroll: 700 })
    expect(metrics.attendance).toMatchObject({ averagePercentage: 91, lopDays: 3 })
    expect(metrics.attendance.byDepartment.find((row) => row.department === 'Sales')).toMatchObject({ headcount: 1, attendance: 88 })
    expect(metrics.projects).toMatchObject({ allocationWeightedCost: 905, uniqueEmployees: 3, allocatedFte: 1.15 })
    expect(metrics.projects.byProject[0]).toMatchObject({ headcount: 3, allocationWeightedFTE: 1.15, cost: 905 })
    expect(metrics.projects.allocationRows).toEqual(expect.arrayContaining([expect.objectContaining({ employeeId: 'EMP-2', allocation: 40, monthlySalary: 700 })]))
  })

  it('applies department filters consistently and does not infer exits from missing payroll rows', () => {
    const partial = structuredClone(staged)
    partial.payroll.rows = partial.payroll.rows.filter((row) => row.employeeId !== 'EMP-3')
    const metrics = getImportedMonthMetrics(createHrModel(partial), '2025-03', { department: 'Engineering', location: 'Pune' })
    expect(metrics.headcount).toMatchObject({ opening: 1, closing: 2, joiners: 1, exits: 0 })
    expect(metrics.payroll).toMatchObject({ gross: 1000, employeeCount: 1, missingEmployeeCount: 1, complete: true })
  })

  it('applies company filters to imported headcount, payroll, attendance, allocations and trends', () => {
    const multiCompany = structuredClone(staged)
    multiCompany.employeeMaster.rows = multiCompany.employeeMaster.rows.map((employee) => ({
      ...employee,
      company: employee.employeeId === 'EMP-3' ? 'Northstar Services' : 'Northstar Labs',
    }))
    const filters = { company: 'Northstar Services' }
    const model = createHrModel(multiCompany)
    const metrics = getImportedMonthMetrics(model, '2025-03', filters)
    const trend = getImportedTrendData(model, filters).find((point) => point.reportingMonth === '2025-03')
    expect(metrics.headcount).toMatchObject({ opening: 0, closing: 1, joiners: 1 })
    expect(metrics.payroll.gross).toBe(500)
    expect(metrics.attendance.averagePercentage).toBe(90)
    expect(metrics.projects.allocationWeightedCost).toBe(125)
    expect(trend).toMatchObject({ headcount: 1, payroll: 500, attendance: 90 })
  })

  it('marks partial periods and unresolved references instead of treating them as complete', () => {
    const partial = structuredClone(staged)
    partial.payroll.completeMonths = []
    partial.attendance.rows.push({ employeeId: 'UNKNOWN-1', reportingMonth: '2025-03', attendancePercentage: 80 })
    partial.projectAllocation.rows.push({ employeeId: 'EMP-1', reportingMonth: '2025-03', projectId: 'UNKNOWN-P', allocationPercentage: 10 })
    const metrics = getImportedMonthMetrics(createHrModel(partial), '2025-03')
    expect(metrics.payroll.complete).toBe(false)
    expect(metrics.payroll.missingEmployeeCount).toBeNull()
    expect(metrics.dataQuality.unmatchedEmployeeReferences).toBe(1)
    expect(metrics.dataQuality.unmatchedProjectReferences).toBe(1)
  })

  it('requires the standard YYYY-MM reporting month', () => {
    expect(() => getImportedMonthMetrics(createHrModel(staged), '03/2025')).toThrow(/YYYY-MM/)
  })

  it('exposes the available historical periods and readiness without connecting staging to the dashboard', () => {
    const model = createHrModel(staged)
    expect(getImportedAvailableMonths(model)).toContain('2025-03')
    expect(getImportedTrendData(model).find((item) => item.reportingMonth === '2025-03')).toMatchObject({ month: 'Mar', headcount: 2, attrition: 50, payroll: 1500, payrollComplete: true, attendanceComplete: true })
    const readiness = getImportedDashboardReadiness(model, '2025-03')
    expect(readiness.ready).toBe(false)
    expect(readiness.reasons).toContain('Attendance is not confirmed complete for 2024-04; year-to-date leave utilisation would be incomplete.')
  })

  it('does not mark a roster complete beyond its confirmed as-of date', () => {
    const partial = structuredClone(staged)
    partial.employeeMaster.completeAsOf = '2025-03-15'
    const model = createHrModel(partial)
    const metrics = getImportedMonthMetrics(model, '2025-03')
    expect(metrics.headcount.closing).toBe(2)
    expect(metrics.headcount.complete).toBe(false)
    expect(getImportedMonthMetrics(model, '2025-03', {}, '2025-03-10').headcount.complete).toBe(true)
    expect(() => getImportedMonthMetrics(model, '2025-03', {}, '2025-02-28')).toThrow(/belong to the selected reporting month/)
  })
})

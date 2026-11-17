import { describe, expect, it } from 'vitest'
import { createHrModel, getImportedAvailableMonths } from './hrModel'
import { getPlanningReport } from './planningModel'

const month = '2025-04'
const staged = {
  employeeMaster: { completeAsOf: '2025-04-30', rows: [{ employeeId: 'EMP-1', employeeName: 'Sample One', company: 'Northstar Labs', department: 'Engineering', location: 'Pune', employmentType: 'Permanent', hireDate: '2024-01-01', exitDate: '' }] },
  payroll: { completeMonths: [month], rows: [{ employeeId: 'EMP-1', reportingMonth: month, monthlyGrossSalary: 85000, annualCtc: 1173000 }] },
  recruitment: { completeMonths: [month], rows: [
    { requisitionId: 'REQ-1', company: 'Northstar Labs', reportingMonth: month, department: 'Engineering', designation: 'Analyst', requisitionDate: '2025-04-01', approvedPositions: 3, filledPositions: 1, status: 'Open', offersExtended: 2, offersAccepted: 1, offerDate: '2025-04-08', offerAcceptedDate: '2025-04-10', joiningDate: '2025-04-21' },
    { requisitionId: 'REQ-2', company: 'Northstar Services', reportingMonth: month, department: 'Engineering', designation: 'Lead', requisitionDate: '2025-04-02', approvedPositions: 1, filledPositions: 1, status: 'Closed', offersExtended: 1, offersAccepted: 1, offerDate: '2025-04-06', offerAcceptedDate: '2025-04-08', joiningDate: '2025-04-12' },
  ] },
  contractManpower: { completeMonths: [month], rows: [
    { contractorId: 'CNT-1', company: 'Northstar Labs', reportingMonth: month, vendor: 'Sample Vendor', department: 'Engineering', location: 'Pune', contractStartDate: '2024-11-01', contractEndDate: '2025-05-15', monthlyGross: 60000, vendorServiceCharges: 6000, monthlyGstAmount: 1188, status: 'Active' },
    { contractorId: 'CNT-2', company: 'Northstar Services', reportingMonth: month, vendor: 'Sample Vendor', department: 'Engineering', location: 'Mumbai', contractStartDate: '2025-01-01', contractEndDate: '2025-03-31', monthlyGross: 50000, vendorServiceCharges: 5000, monthlyGstAmount: 0, status: 'Expired' },
  ] },
  increments: { completeMonths: [month], rows: [
    { employeeId: 'EMP-1', effectiveDate: '2025-04-15', currentCtc: 1000000, revisedCtc: 1180000, incrementPercentage: 18, approvalStatus: 'Approved' },
  ] },
  hrBudget: { completeMonths: [month], rows: [
    { reportingMonth: month, department: 'Engineering', budgetCategory: 'Payroll', budgetAmount: 100000, budgetOwner: 'Sample Owner' },
    { reportingMonth: month, department: 'Engineering', budgetCategory: 'Contract Manpower', budgetAmount: 70000, budgetOwner: 'Sample Owner' },
    { reportingMonth: month, department: 'Engineering', budgetCategory: 'Increment', budgetAmount: 15000, budgetOwner: 'Sample Owner', company: 'Northstar Labs' },
  ] },
}

describe('recruitment, contract, and HR budget analytics', () => {
  it('adds planning reporting months to the shared period selector source', () => {
    expect(getImportedAvailableMonths(createHrModel(staged))).toContain(month)
  })

  it('reports approved openings, offer acceptance, and requisition-to-join time', () => {
    const report = getPlanningReport(createHrModel(staged), 'recruitment', month, '2025-04-30')
    expect(report.complete).toBe(true)
    expect(report.metrics).toMatchObject({ openPositions: 2, openRequisitions: 1, positionsFilled: 2, approvedPositions: 4, averageTimeToHireDays: 7.5, averageTimeToFillDays: 15, offerAcceptanceRate: 66.7 })
  })

  it('withholds time-to-hire when accepted-offer dates are missing instead of using joining dates as a proxy', () => {
    const incompleteOffers = structuredClone(staged)
    delete incompleteOffers.recruitment.rows[1].offerAcceptedDate
    const metrics = getPlanningReport(createHrModel(incompleteOffers), 'recruitment', month, '2025-04-30').metrics
    expect(metrics.averageTimeToHireDays).toBeNull()
    expect(metrics.acceptedOfferDateCoverage).toEqual({ complete: false, recorded: 1, eligible: 2 })
    expect(metrics.averageTimeToFillDays).toBe(15)
  })

  it('applies company selection to company-tagged planning records', () => {
    const model = createHrModel(staged)
    const recruitment = getPlanningReport(model, 'recruitment', month, '2025-04-30', { company: 'Northstar Services' })
    const contracts = getPlanningReport(model, 'contracts', month, '2025-04-30', { company: 'Northstar Services' })
    expect(recruitment.rows.map((row) => row.requisitionId)).toEqual(['REQ-2'])
    expect(contracts.rows.map((row) => row.contractorId)).toEqual(['CNT-2'])
  })

  it('counts active contract resources and adds only explicitly reported cost components', () => {
    const report = getPlanningReport(createHrModel(staged), 'contracts', month, '2025-04-30', { location: 'Pune' })
    expect(report.metrics).toMatchObject({ activeContractors: 1, vendorCount: 1, monthlyGross: 60000, vendorServiceCharges: 6000, reportedGst: 1188, totalMonthlyCost: 67188, contractsExpiringIn30Days: 1 })
    expect(report.rows).toHaveLength(1)
    const missingLocation = structuredClone(staged)
    missingLocation.contractManpower.rows.push({ ...missingLocation.contractManpower.rows[0], contractorId: 'CNT-3', location: '' })
    const locationFiltered = getPlanningReport(createHrModel(missingLocation), 'contracts', month, '2025-04-30', { location: 'Pune' })
    expect(locationFiltered.rows).toHaveLength(1)
  })

  it('compares budget only where the matching actual source is complete', () => {
    const report = getPlanningReport(createHrModel(staged), 'budget', month, '2025-04-30')
    expect(report.rows.find((row) => row.budgetCategory === 'Payroll')).toMatchObject({ actual: 85000, variance: 15000 })
    expect(report.rows.find((row) => row.budgetCategory === 'Contract Manpower')).toMatchObject({ actual: 67188, variance: 2812 })
    expect(report.rows.find((row) => row.budgetCategory === 'Increment')).toMatchObject({ actual: 15000, variance: 0 })
    expect(report.metrics).toMatchObject({ actualAvailable: true, actualTotal: 167188, unavailableActualCount: 0 })
  })

  it('segments payroll budget actuals by company without duplicating combined department payroll', () => {
    const multiCompany = structuredClone(staged)
    multiCompany.employeeMaster.rows.push({ employeeId: 'EMP-2', employeeName: 'Sample Two', company: 'Northstar Services', department: 'Engineering', location: 'Pune', employmentType: 'Permanent', hireDate: '2024-02-01', exitDate: '' })
    multiCompany.payroll.rows.push({ employeeId: 'EMP-2', reportingMonth: month, monthlyGrossSalary: 50000, annualCtc: 690000 })
    multiCompany.hrBudget.rows[0].company = 'Northstar Labs'
    multiCompany.hrBudget.rows.push({ reportingMonth: month, company: 'Northstar Services', department: 'Engineering', budgetCategory: 'Payroll', budgetAmount: 60000 })

    const report = getPlanningReport(createHrModel(multiCompany), 'budget', month, '2025-04-30')
    expect(report.rows.filter((row) => row.budgetCategory === 'Payroll')).toEqual(expect.arrayContaining([
      expect.objectContaining({ company: 'Northstar Labs', actual: 85000, variance: 15000 }),
      expect.objectContaining({ company: 'Northstar Services', actual: 50000, variance: 10000 }),
    ]))
  })

  it('uses effective-dated department attributes when segmenting payroll budget actuals', () => {
    const transferred = structuredClone(staged)
    transferred.employeeHistory = { complete: true, rows: [{ employeeId: 'EMP-1', effectiveFrom: '2025-04-01', department: 'People' }] }
    transferred.hrBudget.rows[0].department = 'People'

    const report = getPlanningReport(createHrModel(transferred), 'budget', month, '2025-04-30')
    expect(report.rows.find((row) => row.budgetCategory === 'Payroll')).toMatchObject({ actual: 85000, variance: 15000 })
  })

  it('does not show payroll actuals without declared complete payroll and roster sources', () => {
    const partial = structuredClone(staged)
    partial.payroll.completeMonths = []
    const report = getPlanningReport(createHrModel(partial), 'budget', month, '2025-04-30')
    expect(report.rows.find((row) => row.budgetCategory === 'Payroll')).toMatchObject({ actual: null, variance: null })
  })

  it('honours the selected as-of date when verifying payroll actual source coverage', () => {
    const partialRoster = structuredClone(staged)
    partialRoster.employeeMaster.completeAsOf = '2025-04-20'
    const report = getPlanningReport(createHrModel(partialRoster), 'budget', month, '2025-04-20')
    expect(report.rows.find((row) => row.budgetCategory === 'Payroll')).toMatchObject({ actual: 85000, variance: 15000 })
  })

  it('withholds budget actuals when the budget cannot be segmented by selected location or employment type', () => {
    const model = createHrModel(staged)
    const locationFiltered = getPlanningReport(model, 'budget', month, '2025-04-30', { location: 'Pune' })
    const employmentFiltered = getPlanningReport(model, 'budget', month, '2025-04-30', { employmentType: 'Permanent' })
    expect(locationFiltered.dimensionFiltersSupported).toBe(false)
    expect(locationFiltered.rows.every((row) => row.actual == null && row.variance == null)).toBe(true)
    expect(employmentFiltered.rows.every((row) => row.actual == null && row.variance == null)).toBe(true)
  })

  it('does not disclose increment actuals to users without the increment permission', () => {
    const report = getPlanningReport(createHrModel(staged), 'budget', month, '2025-04-30', {}, { canReadIncrements: false })
    expect(report.rows.find((row) => row.budgetCategory === 'Increment')).toMatchObject({ actual: null, variance: null, actualBasis: 'Increment actual requires increments.read permission' })
  })
})

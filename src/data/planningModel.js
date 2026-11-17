import { getImportedMonthMetrics } from './hrModel'

const isPresent = (value) => value !== null && value !== undefined && value !== ''
const number = (value) => isPresent(value) && Number.isFinite(Number(value)) ? Number(value) : 0
const total = (rows, key) => rows.reduce((sum, row) => sum + number(row[key]), 0)
const matchesDepartment = (row, filters) => !filters.department || filters.department === 'All departments' || row.department === filters.department
const matchesLocation = (row, filters) => !filters.location || filters.location === 'All locations' || row.location === filters.location
const matchesCompany = (row, filters) => !filters.company || filters.company === 'All companies' || (filters.company === 'Not specified' ? !row.company : row.company === filters.company)
const daysBetween = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
const costOf = (record) => number(record.monthlyGross) + number(record.vendorServiceCharges) + number(record.monthlyGstAmount)
const payrollDepartmentKey = (company, department) => `${company}\u0000${department}`

function recruitmentReport(model, month, asOfDate, filters) {
  const rows = model.recruitment.filter((row) => row.reportingMonth === month && matchesDepartment(row, filters) && matchesCompany(row, filters))
  const openRows = rows.filter((row) => row.status === 'Open')
  const onHoldRows = rows.filter((row) => row.status === 'On Hold')
  const offers = rows.filter((row) => isPresent(row.offersExtended) && isPresent(row.offersAccepted))
  const offerDataComplete = rows.length > 0 && offers.length === rows.length
  const acceptedOfferRows = rows.filter((row) => number(row.offersAccepted) > 0)
  const acceptedDateCoverageComplete = acceptedOfferRows.length > 0 && acceptedOfferRows.every((row) => isPresent(row.offerAcceptedDate))
  const acceptedHires = acceptedOfferRows.filter((row) => row.offerAcceptedDate <= asOfDate && isPresent(row.requisitionDate))
  const filledRequisitions = rows.filter((row) => isPresent(row.joiningDate) && row.joiningDate <= asOfDate && isPresent(row.requisitionDate))
  const accepted = total(offers, 'offersAccepted')
  const extended = total(offers, 'offersExtended')
  const averageDuration = (cohort, endField) => cohort.length
    ? cohort.reduce((sum, row) => sum + daysBetween(row.requisitionDate, row[endField]), 0) / cohort.length
    : null
  const timeToHire = acceptedDateCoverageComplete ? averageDuration(acceptedHires, 'offerAcceptedDate') : null
  const timeToFill = averageDuration(filledRequisitions, 'joiningDate')
  return {
    complete: model.completeness.recruitment.has(month),
    rows,
    metrics: {
      openPositions: openRows.reduce((sum, row) => sum + Math.max(number(row.approvedPositions) - number(row.filledPositions), 0), 0),
      openRequisitions: openRows.length,
      onHoldRequisitions: onHoldRows.length,
      positionsFilled: total(rows, 'filledPositions'),
      approvedPositions: total(rows, 'approvedPositions'),
      averageTimeToHireDays: timeToHire == null ? null : Math.round(timeToHire * 10) / 10,
      averageTimeToFillDays: timeToFill == null ? null : Math.round(timeToFill * 10) / 10,
      acceptedOfferDateCoverage: { complete: acceptedDateCoverageComplete, recorded: acceptedOfferRows.filter((row) => isPresent(row.offerAcceptedDate)).length, eligible: acceptedOfferRows.length },
      timeToFillRequisitions: filledRequisitions.length,
      offerAcceptanceRate: offerDataComplete && extended ? Math.round(accepted / extended * 1000) / 10 : null,
      offersExtended: extended,
      offersAccepted: accepted,
    },
  }
}

function activeContracts(rows, asOfDate) {
  return rows.filter((row) => row.status === 'Active' && row.contractStartDate <= asOfDate && (!row.contractEndDate || row.contractEndDate >= asOfDate))
}

function contractReport(model, month, asOfDate, filters) {
  const rows = model.contractManpower.filter((row) => row.reportingMonth === month && matchesDepartment(row, filters) && matchesLocation(row, filters) && matchesCompany(row, filters))
  const active = activeContracts(rows, asOfDate)
  const asOfTimestamp = Date.parse(`${asOfDate}T00:00:00Z`)
  const expiryEnd = asOfTimestamp + 30 * 86400000
  const expiring = active.filter((row) => {
    if (!row.contractEndDate) return false
    const end = Date.parse(`${row.contractEndDate}T00:00:00Z`)
    return end >= asOfTimestamp && end <= expiryEnd
  })
  return {
    complete: model.completeness.contractManpower.has(month),
    rows,
    metrics: {
      activeContractors: new Set(active.map((row) => row.contractorId)).size,
      vendorCount: new Set(active.map((row) => row.vendor)).size,
      monthlyGross: total(active, 'monthlyGross'),
      vendorServiceCharges: total(active, 'vendorServiceCharges'),
      reportedGst: total(active, 'monthlyGstAmount'),
      totalMonthlyCost: active.reduce((sum, row) => sum + costOf(row), 0),
      contractsExpiringIn30Days: expiring.length,
    },
  }
}

function budgetReport(model, month, asOfDate, filters, { canReadIncrements = true } = {}) {
  const budgetRows = model.hrBudget.filter((row) => row.reportingMonth === month && matchesDepartment(row, filters) && matchesCompany(row, filters))
  const payrollIsComplete = model.completeness.payroll.has(month)
  const contractIsComplete = model.completeness.contractManpower.has(month)
  const rosterIsComplete = Boolean(model.employeeMasterAsOf)
  const dimensionFiltersSupported = (!filters.location || filters.location === 'All locations') && (!filters.employmentType || filters.employmentType === 'All employment types')
  let payrollActualAvailable = false
  let payrollByDepartment = new Map()
  let payrollByDepartmentAndCompany = new Map()
  if (payrollIsComplete && rosterIsComplete) {
    const data = getImportedMonthMetrics(model, month, filters, asOfDate)
    const hasUnknownPayrollReferences = model.payroll.some((row) => row.reportingMonth === month && !model.employees.has(String(row.employeeId).trim().toUpperCase()))
    payrollActualAvailable = data.headcount.complete && data.payroll.missingEmployeeCount === 0 && !hasUnknownPayrollReferences
    if (payrollActualAvailable) {
      data.payroll.byDepartment.forEach((row) => {
        payrollByDepartment.set(row.department, number(row.payroll))
      })
      data.payroll.byDepartmentAndCompany.forEach((row) => {
        payrollByDepartmentAndCompany.set(payrollDepartmentKey(row.company, row.department), number(row.payroll))
      })
    }
  }
  const contractByDepartment = new Map()
  if (contractIsComplete) {
    activeContracts(model.contractManpower.filter((row) => row.reportingMonth === month && matchesDepartment(row, filters) && matchesCompany(row, filters)), asOfDate).forEach((row) => {
      contractByDepartment.set(row.department, (contractByDepartment.get(row.department) || 0) + costOf(row))
    })
  }
  const incrementSource = getImportedMonthMetrics(model, month, filters, asOfDate).increments
  const incrementActualAvailable = canReadIncrements && dimensionFiltersSupported && incrementSource.complete
  const incrementByDepartment = new Map(incrementSource.byDepartment.map((row) => [row.department, row.monthlyCostImpact]))
  const actualAvailable = {
    Payroll: payrollActualAvailable && dimensionFiltersSupported,
    'Contract Manpower': contractIsComplete && dimensionFiltersSupported,
    Increment: incrementActualAvailable,
    Recruitment: false,
    Other: false,
  }
  const rows = budgetRows.map((row) => {
    const payrollActual = row.company
      ? payrollByDepartmentAndCompany.get(payrollDepartmentKey(row.company, row.department))
      : filters.company === 'Not specified'
        ? payrollByDepartmentAndCompany.get(payrollDepartmentKey('Not specified', row.department))
        : payrollByDepartment.get(row.department)
    const actual = row.budgetCategory === 'Payroll' ? payrollActual
      : row.budgetCategory === 'Contract Manpower' ? contractByDepartment.get(row.department)
        : row.budgetCategory === 'Increment' ? incrementByDepartment.get(row.department)
        : null
    return {
      ...row,
      actual: actualAvailable[row.budgetCategory] ? actual ?? 0 : null,
      variance: actualAvailable[row.budgetCategory] ? number(row.budgetAmount) - (actual ?? 0) : null,
      actualBasis: row.budgetCategory === 'Increment' && !canReadIncrements ? 'Increment actual requires increments.read permission'
        : !dimensionFiltersSupported ? 'Budget data has no location or employment-type dimensions'
        : row.budgetCategory === 'Payroll' ? 'Complete monthly Payroll and Employee Master'
        : row.budgetCategory === 'Contract Manpower' ? 'Complete monthly Contract Manpower rows'
          : row.budgetCategory === 'Increment' ? 'Approved effective-dated annual CTC changes divided by 12; complete Increment source'
          : 'No matching actual source in this phase',
    }
  })
  return {
    complete: model.completeness.hrBudget.has(month),
    rows,
    dimensionFiltersSupported,
    metrics: {
      totalBudget: total(budgetRows, 'budgetAmount'),
      actualAvailable: rows.length > 0 && rows.every((row) => row.actual !== null),
      actualTotal: rows.length > 0 && rows.every((row) => row.actual !== null) ? total(rows, 'actual') : null,
      varianceTotal: rows.length > 0 && rows.every((row) => row.variance !== null) ? total(rows, 'variance') : null,
      unavailableActualCount: rows.filter((row) => row.actual === null).length,
    },
  }
}

export function getPlanningReport(model, page, month, asOfDate, filters = {}, options = {}) {
  if (page === 'recruitment') return recruitmentReport(model, month, asOfDate, filters)
  if (page === 'contracts') return contractReport(model, month, asOfDate, filters)
  if (page === 'budget') return budgetReport(model, month, asOfDate, filters, options)
  throw new Error(`Unknown planning report: ${page}`)
}

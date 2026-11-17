import { describe, expect, it } from 'vitest'
import { getExecutivePeriodComparisons } from './periodComparisons'

const months = (start, count, payrollStart = 1000) => Array.from({ length: count }, (_, index) => {
  const date = new Date(`${start}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + index)
  const reportingMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return { reportingMonth, headcount: 100 + index, payroll: payrollStart + index * 100, payrollComplete: true }
})

describe('executive period comparisons', () => {
  it('compares monthly payroll with the same month in the prior year only when both months are present and complete', () => {
    const points = months('2024-01', 24)
    const [, , yearOnYear] = getExecutivePeriodComparisons(points, '2025-06')
    expect(yearOnYear).toMatchObject({
      label: 'Selected month vs same month prior year',
      currentPeriod: '2025-06 to 2025-06',
      previousPeriod: '2024-06 to 2024-06',
      headcountChange: 11.4,
      payrollChange: 80,
    })

    const missingPrior = points.filter((point) => point.reportingMonth !== '2024-06')
    expect(getExecutivePeriodComparisons(missingPrior, '2025-06')[2].payrollChange).toBeNull()
    const incompleteCurrent = points.map((point) => point.reportingMonth === '2025-06' ? { ...point, payrollComplete: false } : point)
    expect(getExecutivePeriodComparisons(incompleteCurrent, '2025-06')[2].payrollChange).toBeNull()
    const incompleteHeadcount = points.map((point) => point.reportingMonth === '2025-06' ? { ...point, headcountComplete: false } : point)
    expect(getExecutivePeriodComparisons(incompleteHeadcount, '2025-06')[2].headcountChange).toBeNull()
  })

  it('compares quarter-to-date with the same elapsed months in the prior quarter', () => {
    const points = months('2025-01', 12)
    const [quarter] = getExecutivePeriodComparisons(points, '2025-05')
    expect(quarter).toMatchObject({
      currentPeriod: '2025-04 to 2025-05',
      previousPeriod: '2025-01 to 2025-02',
      headcountChange: 3,
      payrollChange: 28.6,
    })
  })

  it('compares April-to-date financial year periods only when all matching months are available and complete', () => {
    const points = [...months('2024-01', 12), ...months('2025-01', 12, 1200).map((point) => ({ ...point, headcount: point.headcount + 10 }))]
    const [, year] = getExecutivePeriodComparisons(points, '2025-06')
    expect(year.label).toBe('Financial year to date vs prior financial year')
    expect(year.currentPeriod).toBe('2025-04 to 2025-06')
    expect(year.previousPeriod).toBe('2024-04 to 2024-06')
    expect(year.headcountChange).toBeCloseTo(9.5, 1)
    expect(year.payrollChange).toBe(14.3)

    const incomplete = points.map((point) => point.reportingMonth === '2025-05' ? { ...point, payroll: null } : point)
    expect(getExecutivePeriodComparisons(incomplete, '2025-06')[1].payrollChange).toBeNull()
  })

  it('rolls January through March into the prior April-start financial year', () => {
    const points = months('2023-04', 24)
    const comparison = getExecutivePeriodComparisons(points, '2025-02')[1]
    expect(comparison.currentPeriod).toBe('2024-04 to 2025-02')
    expect(comparison.previousPeriod).toBe('2023-04 to 2024-02')
    expect(comparison.headcountChange).not.toBeNull()
  })

  it('compares configured July-to-June reporting years with matching months', () => {
    const points = months('2023-07', 24)
    const comparison = getExecutivePeriodComparisons(points, '2025-06', 7)[1]
    expect(comparison.currentPeriod).toBe('2024-07 to 2025-06')
    expect(comparison.previousPeriod).toBe('2023-07 to 2024-06')
    expect(comparison.label).toBe('Reporting year to date vs prior reporting year')
  })

  it('keeps available quarter comparisons and omits year comparisons when prior-year history is missing', () => {
    const [quarter, year] = getExecutivePeriodComparisons(months('2025-01', 12), '2025-12')
    expect(quarter.headcountChange).toBe(2.8)
    expect(quarter.payrollChange).toBe(17.6)
    expect(year.headcountChange).toBeNull()
    expect(year.payrollChange).toBeNull()
    expect(getExecutivePeriodComparisons([], 'bad')).toEqual([])
  })
})

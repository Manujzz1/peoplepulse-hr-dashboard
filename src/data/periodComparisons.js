import { financialYearMonthsElapsed, normalizeFinancialYearStartMonth } from './reportingCalendar'

const parseMonth = (value) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ''))
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null
}

const monthAtOffset = (month, offset) => {
  const parsed = parseMonth(month)
  if (!parsed) return null
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const monthRange = (endMonth, count) => Array.from({ length: count }, (_, index) => monthAtOffset(endMonth, index - count + 1))
const changePercent = (current, previous) => previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null

function compareWindows(pointsByMonth, currentMonths, previousMonths, label) {
  const current = currentMonths.map((month) => pointsByMonth.get(month))
  const previous = previousMonths.map((month) => pointsByMonth.get(month))
  const currentEnd = current.at(-1)
  const previousEnd = previous.at(-1)
  const currentHeadcount = currentEnd?.headcount
  const previousHeadcount = previousEnd?.headcount
  const completePayroll = (points) => points.length > 0 && points.every((point) => point && point.payroll != null && Number.isFinite(Number(point.payroll)) && point.payrollComplete !== false)
  const currentPayroll = completePayroll(current) ? current.reduce((sum, point) => sum + Number(point.payroll), 0) : null
  const previousPayroll = completePayroll(previous) ? previous.reduce((sum, point) => sum + Number(point.payroll), 0) : null
  const validHeadcount = currentEnd?.headcountComplete !== false && previousEnd?.headcountComplete !== false
    && Number.isFinite(Number(currentHeadcount)) && currentHeadcount != null
    && Number.isFinite(Number(previousHeadcount)) && previousHeadcount != null

  return {
    label,
    currentPeriod: `${currentMonths[0]} to ${currentMonths.at(-1)}`,
    previousPeriod: `${previousMonths[0]} to ${previousMonths.at(-1)}`,
    headcountChange: validHeadcount ? changePercent(Number(currentHeadcount), Number(previousHeadcount)) : null,
    payrollChange: currentPayroll != null && previousPayroll > 0 ? changePercent(currentPayroll, previousPayroll) : null,
  }
}

export function getExecutivePeriodComparisons(trends, selectedMonth, financialYearStartMonth = 4) {
  const parsed = parseMonth(selectedMonth)
  if (!parsed) return []
  const pointsByMonth = new Map(trends.filter((point) => parseMonth(point.reportingMonth)).map((point) => [point.reportingMonth, point]))
  const quarterStartMonth = Math.floor((parsed.month - 1) / 3) * 3 + 1
  const monthsElapsed = parsed.month - quarterStartMonth + 1
  const currentQuarter = monthRange(selectedMonth, monthsElapsed)
  const previousQuarter = currentQuarter.map((month) => monthAtOffset(month, -3))
  const normalizedStartMonth = normalizeFinancialYearStartMonth(financialYearStartMonth)
  const elapsedMonths = financialYearMonthsElapsed(selectedMonth, normalizedStartMonth)
  const currentYear = monthRange(selectedMonth, elapsedMonths)
  const previousYear = currentYear.map((month) => monthAtOffset(month, -12))
  const financialYearLabel = normalizedStartMonth === 4 ? 'Financial year' : 'Reporting year'
  return [
    compareWindows(pointsByMonth, currentQuarter, previousQuarter, 'Quarter to date vs prior quarter'),
    compareWindows(pointsByMonth, currentYear, previousYear, `${financialYearLabel} to date vs prior ${financialYearLabel.toLowerCase()}`),
    compareWindows(pointsByMonth, [selectedMonth], [monthAtOffset(selectedMonth, -12)], 'Selected month vs same month prior year'),
  ]
}

export const REPORTING_MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
])

export function normalizeFinancialYearStartMonth(value = 4) {
  const month = Number(value)
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 4
}

export function financialYearMonthsFor(reportingMonth, startMonth = 4) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(reportingMonth ?? ''))
  if (!match) return []
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const configuredStartIndex = normalizeFinancialYearStartMonth(startMonth) - 1
  const startYear = monthIndex >= configuredStartIndex ? year : year - 1
  const months = []
  for (let currentYear = startYear; currentYear <= year; currentYear += 1) {
    const firstMonth = currentYear === startYear ? configuredStartIndex : 0
    const lastMonth = currentYear === year ? monthIndex : 11
    for (let month = firstMonth; month <= lastMonth; month += 1) {
      months.push(`${currentYear}-${String(month + 1).padStart(2, '0')}`)
    }
  }
  return months
}

export function financialYearRangeLabel(startMonth = 4) {
  const start = normalizeFinancialYearStartMonth(startMonth)
  return `${REPORTING_MONTHS[start - 1]}–${REPORTING_MONTHS[(start + 10) % 12]}`
}

export function financialYearMonthsElapsed(reportingMonth, startMonth = 4) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(reportingMonth ?? ''))
  if (!match) return 0
  const month = Number(match[2])
  return (month - normalizeFinancialYearStartMonth(startMonth) + 12) % 12 + 1
}

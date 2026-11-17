const EXECUTIVE_HIGHLIGHTS = [
  'Closing headcount',
  'Joiners',
  'Exits',
  'Attrition rate',
  'Monthly gross payroll',
  'Average attendance',
]

const CONFIDENTIAL_REPORTS = new Set([
  'headcount', 'movements', 'payroll', 'departments', 'employeeCost', 'attendance', 'leaveLop',
  'performance', 'increments', 'projectAllocation', 'projectCost', 'recruitment', 'contracts', 'budget', 'consolidated',
])

export function getExecutivePdfHighlights(summaryRows) {
  const values = new Map(summaryRows.map((row) => [row.metric, row]))
  return EXECUTIVE_HIGHLIGHTS.map((metric) => values.get(metric)).filter(Boolean)
}

export function isConfidentialReport(reportKey) {
  return CONFIDENTIAL_REPORTS.has(reportKey)
}

export function getExecutivePdfTableStartY(hasTrend) {
  return hasTrend ? 306 : 226
}

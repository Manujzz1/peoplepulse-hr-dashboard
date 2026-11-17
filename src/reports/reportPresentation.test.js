import { describe, expect, it } from 'vitest'
import { getExecutivePdfHighlights, getExecutivePdfTableStartY, isConfidentialReport } from './reportPresentation'

describe('management report PDF presentation', () => {
  it('selects actual workforce and business KPIs rather than report metadata for executive highlight cards', () => {
    const rows = [
      { metric: 'Reporting month', value: '2025-03', unit: '' },
      { metric: 'As of date', value: '2025-03-31', unit: '' },
      { metric: 'Closing headcount', value: 105, unit: 'employees' },
      { metric: 'Joiners', value: 8, unit: 'employees' },
      { metric: 'Exits', value: 3, unit: 'employees' },
      { metric: 'Attrition rate', value: null, unit: '%' },
      { metric: 'Monthly gross payroll', value: 12500000, unit: 'INR' },
      { metric: 'Average attendance', value: 96, unit: '%' },
    ]
    expect(getExecutivePdfHighlights(rows).map((row) => row.metric)).toEqual([
      'Closing headcount', 'Joiners', 'Exits', 'Attrition rate', 'Monthly gross payroll', 'Average attendance',
    ])
    expect(getExecutivePdfHighlights(rows)[3].value).toBeNull()
  })

  it('marks detailed employee and compensation reports confidential and reserves room for PDF content', () => {
    expect(isConfidentialReport('summary')).toBe(false)
    expect(isConfidentialReport('projectCost')).toBe(true)
    expect(isConfidentialReport('employeeCost')).toBe(true)
    expect(getExecutivePdfTableStartY(false)).toBeGreaterThan(112)
    expect(getExecutivePdfTableStartY(true)).toBeGreaterThan(getExecutivePdfTableStartY(false))
  })
})

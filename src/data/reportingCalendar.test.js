import { describe, expect, it } from 'vitest'
import { financialYearMonthsElapsed, financialYearMonthsFor, financialYearRangeLabel, normalizeFinancialYearStartMonth } from './reportingCalendar'

describe('configurable reporting calendar', () => {
  it('keeps the Indian April-to-March calendar as the default', () => {
    expect(financialYearMonthsFor('2025-03')).toEqual(Array.from({ length: 12 }, (_, index) => {
      const month = index + 4
      return month <= 12 ? `2024-${String(month).padStart(2, '0')}` : `2025-${String(month - 12).padStart(2, '0')}`
    }))
    expect(financialYearRangeLabel()).toBe('April–March')
  })

  it('builds year-to-date periods from any selected month', () => {
    expect(financialYearMonthsFor('2025-03', 7)).toEqual(['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'])
    expect(financialYearMonthsFor('2025-12', 1)).toHaveLength(12)
    expect(financialYearMonthsElapsed('2025-06', 7)).toBe(12)
    expect(financialYearMonthsElapsed('2025-06', 1)).toBe(6)
    expect(financialYearRangeLabel(7)).toBe('July–June')
  })

  it('falls back to April for invalid month values and rejects invalid reporting periods', () => {
    expect(normalizeFinancialYearStartMonth(13)).toBe(4)
    expect(financialYearMonthsFor('2025-13', 7)).toEqual([])
    expect(financialYearMonthsElapsed('invalid', 7)).toBe(0)
  })
})

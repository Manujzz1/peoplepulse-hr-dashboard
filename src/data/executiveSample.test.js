import { describe, expect, it } from 'vitest'
import { getExecutiveSample, SAMPLE_MONTHS, SAMPLE_NOTICE, SAMPLE_VERSION } from './executiveSample'

describe('versioned Executive Preview sample', () => {
  it('balances the monthly roster, attendance, recruiting and HR actions for all twelve months', () => {
    const { history } = getExecutiveSample('2025-12')
    expect(history.map((row) => row.reportingMonth)).toEqual(SAMPLE_MONTHS)
    for (const row of history) {
      expect(row.headcount).toBe(row.opening + row.joiners - row.exits)
      expect(row.attrition).toBeCloseTo(100 * row.exits / ((row.opening + row.headcount) / 2))
      expect(row.absenceRate).toBeCloseTo(100 * row.absent / row.scheduled)
      expect(row.attendanceRate).toBeCloseTo(100 * (row.scheduled - row.absent - row.leaveDays) / row.scheduled)
      expect(row.training).toBeGreaterThan(0)
      expect(row.trainingByProgram.reduce((total, program) => total + program.hours, 0)).toBe(row.training)
      expect(row.openActions).toBe(row.actionRows.filter(({ status }) => status !== 'Complete').length)
      const funnel = Object.values(row.recruitment)
      expect(funnel).toEqual([...funnel].sort((a, b) => b - a))
      expect(row.recruitment.positionsFilled).toBe(row.joiners)
      const { responses, promoters, passives, detractors, enps } = row.engagement
      expect(responses).toBe(promoters + passives + detractors)
      expect(enps).toBeCloseTo((promoters - detractors) * 100 / responses)
      expect(row.active.every((person) => person.age - person.tenureYears >= 21)).toBe(true)
    }
    expect(history.at(-1).exits).toBeGreaterThan(0)
    expect(getExecutiveSample('2025-12').reportingYearLeaveAccrued).toBeGreaterThan(getExecutiveSample('2025-12').reportingYearLeave)
    expect(SAMPLE_NOTICE).toContain('NOT ACTUAL ADTL REPORTING')
    expect(SAMPLE_VERSION).toContain('v2')
  })

  it('keeps the filtered cohort and action attributes consistent and respects the as-of date', () => {
    const all = getExecutiveSample('2025-12')
    const filters = { department: 'Engineering', location: 'Bengaluru', employmentType: 'Permanent' }
    const filtered = getExecutiveSample('2025-12', undefined, filters)
    expect(filtered.current.active).toEqual(all.current.active.filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value)))
    expect(filtered.current.actionRows.every((row) => all.current.actionRows.some((candidate) => JSON.stringify(row) === JSON.stringify(candidate)))).toBe(true)
    const partial = getExecutiveSample('2025-12', '2025-12-08')
    expect(partial.current.scheduled).toBeLessThan(all.current.scheduled)
    expect(partial.current.training).toBeLessThan(all.current.training)
    expect(partial.current.headcount).toBe(partial.current.opening + partial.current.joiners - partial.current.exits)
    expect(getExecutiveSample('2025-12', undefined, {}, 4).reportingYearLeave).toBeLessThan(all.reportingYearLeave)
  })

  it('does not invent rates when the selection is empty', () => {
    expect(getExecutiveSample('2026-01')).toBeNull()
    const { current, selectedDate } = getExecutiveSample('2025-02', '2025-02-31', { department: 'Missing' })
    expect(selectedDate).toBe('2025-02-28')
    expect(current).toMatchObject({ headcount: 0, absenceRate: null, attrition: null, attendanceRate: null, training: 0, openActions: 0 })
  })

  it('uses reporting-date status and department transfers for the selected cohort', () => {
    const exited = getExecutiveSample('2025-12', undefined, { status: 'Exited' })
    expect(exited.current.headcount).toBe(0)
    expect(exited.history.reduce((total, row) => total + row.exits, 0)).toBeGreaterThan(0)
    const before = getExecutiveSample('2025-06').current.active
    const after = getExecutiveSample('2025-07').current.active
    expect(after.some((row) => before.some((previous) => previous.id === row.id && previous.department !== row.department))).toBe(true)
  })
})

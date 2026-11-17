import { describe, expect, it } from 'vitest'
import { mergeImportStage, rollbackImportStage } from './staging'

const stage = (rows, completeMonths = []) => ({ rows, completeMonths, fileName: 'sample.csv' })

describe('monthly import staging', () => {
  it('appends new periods and preserves existing rows and completeness', () => {
    const existing = stage([
      { employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 50000 },
    ], ['2025-04'])
    const incoming = stage([
      { employeeId: 'SYN-1', reportingMonth: '2025-05', monthlyGrossSalary: 52000 },
    ], ['2025-05'])
    const merged = mergeImportStage(existing, incoming, 'payroll')
    expect(merged.rows.map((row) => row.reportingMonth)).toEqual(['2025-04', '2025-05'])
    expect(merged.completeMonths).toEqual(['2025-04', '2025-05'])
  })

  it('rejects a colliding append without mutating the existing stage', () => {
    const existing = stage([{ employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 50000 }], ['2025-04'])
    const incoming = stage([{ employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 55000 }])
    expect(() => mergeImportStage(existing, incoming, 'payroll')).toThrow(/Replace periods/)
    expect(existing.rows[0].monthlyGrossSalary).toBe(50000)
  })

  it('replaces only periods present in the file and clears old completeness when replacement is unconfirmed', () => {
    const existing = stage([
      { employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 50000 },
      { employeeId: 'SYN-1', reportingMonth: '2025-05', monthlyGrossSalary: 51000 },
    ], ['2025-04', '2025-05'])
    const incoming = stage([{ employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 54000 }])
    const merged = mergeImportStage(existing, incoming, 'payroll', 'replace-months')
    expect(merged.rows).toEqual([
      { employeeId: 'SYN-1', reportingMonth: '2025-05', monthlyGrossSalary: 51000 },
      { employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 54000 },
    ])
    expect(merged.completeMonths).toEqual(['2025-05'])
  })

  it('uses effective month and employee-date keys for increment imports', () => {
    const existing = stage([{ employeeId: 'SYN-1', effectiveDate: '2025-04-01', currentCtc: 100000 }], ['2025-04'])
    const incoming = stage([{ employeeId: 'SYN-1', effectiveDate: '2025-05-01', currentCtc: 110000 }], ['2025-05'])
    expect(mergeImportStage(existing, incoming, 'increments').rows).toHaveLength(2)
  })

  it('rolls back a new category or restores its previous in-memory stage', () => {
    const previous = stage([{ employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 50000 }], ['2025-04'])
    const current = stage([{ employeeId: 'SYN-1', reportingMonth: '2025-04', monthlyGrossSalary: 54000 }], ['2025-04'])
    const unrelated = stage([{ projectId: 'SYN-PROJ' }])
    expect(rollbackImportStage({ payroll: current, projectMaster: unrelated }, 'payroll', previous)).toEqual({ payroll: previous, projectMaster: unrelated })
    expect(rollbackImportStage({ payroll: current, projectMaster: unrelated }, 'payroll', null)).toEqual({ projectMaster: unrelated })
  })
})

import { describe, expect, it } from 'vitest'
import { createPayrollReconciliationBatch, getLatestPayrollReconciliationBatch, getPayrollControlMismatches, mergePayrollReconciliationBatches } from './payrollReconciliation'

const rows = [
  { reportingMonth: '2025-04', monthlyGrossSalary: 50000.25 },
  { reportingMonth: '2025-04', monthlyGrossSalary: 49999.75 },
  { reportingMonth: '2025-05', monthlyGrossSalary: 60000 },
]

describe('payroll source control reconciliation', () => {
  it('compares only valid gross rows from the selected import period', () => {
    expect(createPayrollReconciliationBatch(rows, '2025-04', '100000', { fileName: 'payroll.csv' })).toMatchObject({
      reportingMonth: '2025-04',
      fileName: 'payroll.csv',
      rowCount: 2,
      validRowsGrossTotal: 100000,
      sourceControlTotal: 100000,
      difference: 0,
    })
  })

  it('keeps an absent total explicitly unavailable and rejects invalid totals', () => {
    const batch = createPayrollReconciliationBatch(rows, '2025-04', '', { stagedAt: '2025-04-30T12:00:00Z' })
    expect(batch).toMatchObject({ sourceControlTotal: null, difference: null, validRowsGrossTotal: 100000 })
    expect(() => createPayrollReconciliationBatch(rows, '2025-04', '-1')).toThrow(/non-negative/)
  })

  it('keeps per-file batch controls when appending and removes replaced months only', () => {
    const april = createPayrollReconciliationBatch(rows, '2025-04', '100000', { stagedAt: '2025-04-30T12:00:00Z' })
    const laterApril = createPayrollReconciliationBatch(rows, '2025-04', '100000', { stagedAt: '2025-05-01T12:00:00Z' })
    const may = createPayrollReconciliationBatch(rows, '2025-05', '60000', { stagedAt: '2025-05-01T12:00:00Z' })
    const appended = mergePayrollReconciliationBatches([april, may], [laterApril], ['2025-04'], 'append')
    expect(getLatestPayrollReconciliationBatch(appended, '2025-04')).toEqual(laterApril)
    expect(mergePayrollReconciliationBatches(appended, [laterApril], ['2025-04'], 'replace-months')).toEqual([may, laterApril])
  })

  it('does not clear a prior mismatch on replacement without a matching control total', () => {
    const mismatch = createPayrollReconciliationBatch(rows, '2025-04', '99000', { stagedAt: '2025-04-30T12:00:00Z' })
    const noControl = createPayrollReconciliationBatch(rows, '2025-04', '', { stagedAt: '2025-05-01T12:00:00Z' })
    const noControlReplacement = mergePayrollReconciliationBatches([mismatch], [noControl], ['2025-04'], 'replace-months')
    expect(getPayrollControlMismatches(noControlReplacement, '2025-04')).toEqual([mismatch])

    const matching = createPayrollReconciliationBatch(rows, '2025-04', '100000', { stagedAt: '2025-05-02T12:00:00Z' })
    const reconciledReplacement = mergePayrollReconciliationBatches(noControlReplacement, [matching], ['2025-04'], 'replace-months')
    expect(getPayrollControlMismatches(reconciledReplacement, '2025-04')).toEqual([])
  })
})

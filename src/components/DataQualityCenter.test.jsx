/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DataQualityCenter from './DataQualityCenter'
import { createHrModel } from '../data/hrModel'

describe('Data Quality dashboard', () => {
  it('shows readiness and explicitly unavailable reconciliation checks when no records are staged', () => {
    render(<DataQualityCenter model={createHrModel({})} stagedImports={{}} selectedMonth="2025-12" selectedDate="2025-12-31" filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }} />)

    expect(screen.getByText('In-memory source audit')).toBeTruthy()
    expect(screen.getByText('0 / 15')).toBeTruthy()
    expect(screen.getByText('Payroll control-total difference')).toBeTruthy()
    expect(screen.getByText(/no file control total was entered for this period/)).toBeTruthy()
    expect(screen.getByText(/attendance day reconciliation/i)).toBeTruthy()
    expect(screen.getByText(/readiness issue/i)).toBeTruthy()
  })

  it('shows the latest staged file control-total difference for the selected payroll month', () => {
    const payroll = {
      rows: [{ employeeId: 'SYN-1', reportingMonth: '2025-12', monthlyGrossSalary: 50000 }],
      completeMonths: [],
      reconciliationBatches: [{ reportingMonth: '2025-12', fileName: 'synthetic-payroll.csv', stagedAt: '2025-12-31T12:00:00Z', rowCount: 1, validRowsGrossTotal: 50000, sourceControlTotal: 49000, difference: 1000 }],
    }
    render(<DataQualityCenter model={createHrModel({ payroll })} stagedImports={{ payroll }} selectedMonth="2025-12" selectedDate="2025-12-31" filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }} />)

    expect(screen.getByText('Difference +INR 1,000')).toBeTruthy()
  })
})

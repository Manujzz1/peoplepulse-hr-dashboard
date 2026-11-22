// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveAccessProfile, getAllowedReportKeys } from '../auth/accessControl'
import { createHrModel, getImportedMonthMetrics } from '../data/hrModel'
import ReportsCenter from './ReportsCenter'

const { currentProfile, savePdf } = vi.hoisted(() => ({
  currentProfile: vi.fn(),
  savePdf: vi.fn(),
}))

vi.mock('../auth/supabaseClient', () => ({ supabase: {} }))
vi.mock('../auth/accessControl', async (importOriginal) => ({
  ...await importOriginal(),
  loadCurrentAccessProfile: currentProfile,
}))
vi.mock('jspdf', async (importOriginal) => {
  const { jsPDF } = await importOriginal()
  return {
    jsPDF: function (...args) {
      const pdf = new jsPDF(...args)
      pdf.save = () => savePdf(pdf.output('arraybuffer'))
      return pdf
    },
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function reportFixture() {
  const selectedMonth = '2025-03'
  const selectedDate = '2025-03-31'
  const filters = { company: 'Synthetic A' }
  const roster = [
    { employeeId: 'SYN-A1', employeeName: 'Synthetic Alpha', company: 'Synthetic A' },
    { employeeId: 'SYN-B1', employeeName: 'Synthetic Bravo', company: 'Synthetic B' },
  ]
  const model = createHrModel({
    employeeMaster: { rows: roster.map((row) => ({ ...row, hireDate: '2025-01-01' })), completeAsOf: selectedDate },
    payroll: {
      rows: roster.map(({ employeeId }, index) => ({ employeeId, reportingMonth: selectedMonth, monthlyGrossSalary: [52000, 93000][index] })),
      completeMonths: [selectedMonth],
    },
  })
  const getPeriodMetrics = (month, scope, date) => {
    const metrics = getImportedMonthMetrics(model, month, scope, date)
    return { headcount: metrics.headcount.closing, employees: metrics.headcount.activeEmployees, payroll: metrics.payroll.gross }
  }
  const payrollProfile = {
    ...deriveAccessProfile(
      [{ role_key: 'payroll_specialist', organization_id: 'synthetic-org', company_id: 'company-a' }],
      ['employee.read', 'payroll.read'].map((permission_key) => ({ role_key: 'payroll_specialist', permission_key })),
    ),
    userId: 'synthetic-user',
  }
  currentProfile.mockResolvedValue(payrollProfile)
  const captureBlob = vi.fn(() => 'blob:synthetic')
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: captureBlob, revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const popup = { close: vi.fn(), document: { write: vi.fn(), close: vi.fn() } }
  vi.spyOn(window, 'open').mockReturnValue(popup)
  render(<ReportsCenter
    employees={getPeriodMetrics(selectedMonth, filters, selectedDate).employees}
    departments={[]} trends={[]} projectAssignments={[]} selectedMonth={selectedMonth} selectedDate={selectedDate}
    filters={filters} getPeriodMetrics={getPeriodMetrics} sourceLabel="Synthetic scoped fixture" dataSource="live"
    authStatus="authenticated" allowedReports={getAllowedReportKeys(payrollProfile)}
    liveLoadedAt={new Date().toISOString()} liveUserId={payrollProfile.userId} liveScopeKey={payrollProfile.scopeKey}
  />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Report' }), { target: { value: 'employeeCost' } })
  return { captureBlob, popup, payrollProfile }
}

function readBlob(blob, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    if (type === 'text') reader.readAsText(blob)
    else reader.readAsArrayBuffer(blob)
  })
}

describe('scoped live report exports with synthetic data', () => {
  it('exports only the selected company and omits workbooks outside the current role', async () => {
    const { captureBlob, popup } = reportFixture()
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    await waitFor(() => expect(captureBlob).toHaveBeenCalledTimes(1))
    const csv = await readBlob(captureBlob.mock.calls[0][0], 'text')
    expect(csv).toContain('Synthetic Alpha')
    expect(csv).toContain('52000')
    expect(csv).not.toContain('Synthetic Bravo')

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
    await waitFor(() => expect(captureBlob).toHaveBeenCalledTimes(2))
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await readBlob(captureBlob.mock.calls[1][0]))
    const employeeCost = workbook.getWorksheet('Employee Cost')
    expect(employeeCost.getRow(2).values).toEqual(expect.arrayContaining(['Synthetic Alpha', 52000]))
    expect(employeeCost.rowCount).toBe(2)
    expect(workbook.getWorksheet('Consolidated MIS')).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(savePdf).toHaveBeenCalledOnce())
    const pdf = Buffer.from(savePdf.mock.calls[0][0]).toString('latin1')
    expect(pdf).toContain('SYN-A1')
    expect(pdf).not.toContain('SYN-B1')

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    await waitFor(() => expect(popup.document.write).toHaveBeenCalledOnce())
    expect(popup.document.write.mock.calls[0][0]).toContain('Synthetic Alpha')
    expect(popup.document.write.mock.calls[0][0]).not.toContain('Synthetic Bravo')
    expect(currentProfile).toHaveBeenCalledTimes(4)
  })

  it.each(['Download CSV', 'Download Excel', 'Download PDF', 'Print / Save as PDF'])('denies %s after company access changes', async (button) => {
    const { captureBlob, popup, payrollProfile } = reportFixture()
    currentProfile.mockResolvedValue({ ...payrollProfile, scopeKey: 'changed-company' })
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect((await screen.findByRole('alert')).textContent).toContain('do not allow exporting')
    expect(captureBlob).not.toHaveBeenCalled()
    expect(savePdf).not.toHaveBeenCalled()
    expect(popup.document.write).not.toHaveBeenCalled()
  })
})

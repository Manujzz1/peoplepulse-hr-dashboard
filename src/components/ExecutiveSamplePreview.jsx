import { useMemo, useState } from 'react'
import ExecutiveDashboard from './ExecutiveDashboard'
import { getExecutiveSample, SAMPLE_FILTERS, SAMPLE_MONTHS, SAMPLE_NOTICE, SAMPLE_VERSION } from '../data/executiveSample'
import { serializeCsv } from '../data/csv'

const headers = ['Source', 'Dataset', 'Scope', 'Period', 'Category', 'Metric', 'Value']
const readable = (value) => value == null ? 'Unavailable' : typeof value === 'number' ? Math.round(value * 100) / 100 : value

function saveCsv(rows) {
  const objectUrl = URL.createObjectURL(new Blob([serializeCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = 'peoplepulse-executive-fictional-sample.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export default function ExecutiveSamplePreview() {
  const [financialYearStartMonth, setFinancialYearStartMonth] = useState(1)
  const [month, setMonth] = useState('2025-12')
  const [date, setDate] = useState('')
  const [filters, setFilters] = useState({})
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const sample = useMemo(() => getExecutiveSample(month, date, filters, financialYearStartMonth), [month, date, filters, financialYearStartMonth])
  const { current, history, selectedDate } = sample
  const metrics = {
    headcount: { complete: true, closing: current.headcount, joiners: current.joiners, exits: current.exits, attritionRate: current.attrition, activeEmployees: current.active },
    payroll: { available: true, complete: true, missingEmployeeCount: 0, missingAnnualCtcCount: 0, employeeCount: current.headcount, gross: current.payroll, annualCtc: current.annualCtc },
    attendance: { available: true, measuredEmployeeCount: current.measuredEmployees, averagePercentage: current.attendanceRate },
    leave: { complete: true, availedDays: sample.reportingYearLeave },
  }
  const scope = ['ADTL fictional sample', ...Object.values(filters).filter(Boolean)].join(' / ')
  const exportReport = async (format) => {
    setExporting(true)
    setExportError('')
    try {
      const rows = [...document.querySelectorAll('#executive-sample-preview [data-sample-export]')].map((node) =>
        [SAMPLE_NOTICE, SAMPLE_VERSION, scope, selectedDate, node.dataset.sampleCategory, node.dataset.sampleMetric, readable(node.dataset.sampleValue)])
      for (const row of history) {
        for (const [label, key] of [['Headcount', 'headcount'], ['New hires', 'joiners'], ['Exits', 'exits'], ['Turnover rate %', 'attrition'], ['Scheduled days', 'scheduled'], ['Absent scheduled days', 'absent'], ['Absence rate %', 'absenceRate'], ['Training hours', 'training']]) {
          rows.push([SAMPLE_NOTICE, SAMPLE_VERSION, scope, row.reportingMonth, 'Monthly trends', label, readable(row[key])])
        }
      }
      if (format === 'csv') saveCsv(rows)
      if (format === 'xlsx') {
        const { default: ExcelJS } = await import('exceljs')
        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet('Temporary sample data')
        sheet.addRow([SAMPLE_NOTICE])
        sheet.addRow(headers)
        sheet.addRows(rows)
        sheet.columns.forEach((column, index) => { column.width = [54, 28, 40, 16, 30, 32, 36][index] })
        const url = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'peoplepulse-executive-fictional-sample.xlsx'
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      if (format === 'pdf') {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
        const pdf = new jsPDF({ orientation: 'landscape' })
        autoTable(pdf, {
          margin: { top: 22 }, head: [headers.slice(3)], body: rows.map((row) => row.slice(3)),
          styles: { fontSize: 8 },
          willDrawPage: () => {
            pdf.setFontSize(10)
            pdf.text(SAMPLE_NOTICE, 14, 11)
            pdf.text(SAMPLE_VERSION + ' | ' + scope, 14, 17)
          },
        })
        pdf.save('peoplepulse-executive-fictional-sample.pdf')
      }
    } catch {
      setExportError('The sample export could not be created. Please try again.')
    } finally {
      setExporting(false)
    }
  }
  return <section id="executive-sample-preview" className="exec-sample-preview" aria-label="Executive sample preview">
    <div className="exec-sample-notice"><strong>{SAMPLE_NOTICE}</strong><span>{SAMPLE_VERSION} · Fictional records only</span></div>
    <div className="exec-sample-controls">
      <label>Month<select aria-label="Month" value={month} onChange={(event) => { setMonth(event.target.value); setDate('') }}>{SAMPLE_MONTHS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>As of date<input aria-label="As of date" type="date" value={selectedDate} min={month + '-01'} max={month + '-' + new Date(Date.UTC(2025, Number(month.slice(-2)), 0)).getUTCDate()} onChange={(event) => setDate(event.target.value)} /></label>
      {Object.entries(SAMPLE_FILTERS).map(([key, values]) => <label key={key}>{{ department: 'Department', location: 'Location', employmentType: 'Employment type' }[key]}
        <select aria-label={{ department: 'Department', location: 'Location', employmentType: 'Employment type' }[key]} value={filters[key] || ''} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}><option value="">All</option>{values.map((value) => <option key={value}>{value}</option>)}</select>
      </label>)}
      <label>Reporting year starts<select aria-label="Reporting year starts" value={financialYearStartMonth} onChange={(event) => setFinancialYearStartMonth(Number(event.target.value))}>{SAMPLE_MONTHS.map((value, index) => <option value={index + 1} key={value}>{new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'))}</option>)}</select></label>
      <span className="exec-sample-period">Reporting period {month}-01 to {selectedDate}</span>
      {['CSV', 'Excel', 'PDF'].map((label, index) => <button type="button" className="stage-button" key={label} disabled={exporting} onClick={() => exportReport(['csv', 'xlsx', 'pdf'][index])}>{label}</button>)}
      <button type="button" className="stage-button" onClick={() => window.print()}>Print</button>
    </div>
    <p className="exec-sample-print-scope">{scope} · {month}-01 to {selectedDate}</p>
    {exportError && <p role="alert">{exportError}</p>}
    <ExecutiveDashboard metrics={metrics} trends={history} month={month} monthEnd financialYearStartMonth={financialYearStartMonth}
      canReadPayroll canReadLeave recruitment={current.recruitment} sourceLabel={SAMPLE_NOTICE} sample={sample} />
  </section>
}

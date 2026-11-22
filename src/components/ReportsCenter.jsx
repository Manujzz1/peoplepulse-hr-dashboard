import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { Panel } from './DashboardParts'
import { getPreviousDateValue, getPreviousMonthValue } from '../data/demoData'
import { getPlanningReport } from '../data/planningModel'
import { createDashboardReport, reportColumnLabel, REPORT_COLUMNS, toCsv } from '../reports/reportData'
import { getExecutivePdfHighlights, getExecutivePdfTableStartY, isConfidentialReport } from '../reports/reportPresentation'
import { getAllowedReportKeys, loadCurrentAccessProfile } from '../auth/accessControl'
import { supabase } from '../auth/supabaseClient'
import { isCurrentExportScope, isExportAllowed, verifyLiveExportReadiness } from '../reports/exportSecurity'

const reports = [
  { key: 'summary', label: 'Executive HR MIS', title: 'Executive HR MIS' },
  { key: 'headcount', label: 'Monthly headcount', title: 'Monthly Headcount Report' },
  { key: 'movements', label: 'Joiners and exits', title: 'Joiners and Exits Report' },
  { key: 'trends', label: 'Attrition and monthly trends', title: 'Attrition and Monthly Trends' },
  { key: 'payroll', label: 'Payroll summary', title: 'Payroll Summary' },
  { key: 'departments', label: 'Department payroll', title: 'Department Payroll Report' },
  { key: 'employeeCost', label: 'Employee cost', title: 'Employee Cost Report' },
  { key: 'attendance', label: 'Attendance', title: 'Attendance Report' },
  { key: 'leaveLop', label: 'Leave and LOP', title: 'Leave and LOP Report' },
  { key: 'performance', label: 'Performance', title: 'Performance Report' },
  { key: 'increments', label: 'Increment analysis', title: 'Increment Analysis' },
  { key: 'projectAllocation', label: 'Project allocation', title: 'Project Allocation Report' },
  { key: 'projectCost', label: 'Project cost', title: 'Project Cost Report' },
  { key: 'recruitment', label: 'Recruitment', title: 'Recruitment Report' },
  { key: 'contracts', label: 'Contract manpower', title: 'Contract Manpower Report' },
  { key: 'budget', label: 'HR budget versus actual', title: 'HR Budget versus Actual' },
  { key: 'consolidated', label: 'Consolidated monthly MIS', title: 'Consolidated Monthly HR MIS' },
]

const filename = (name, month) => `peoplepulse-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${month}.csv`
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const localDateTime = () => new Date().toLocaleString('en-IN')

const formatPdfValue = (row, key) => {
  const value = row[key]
  if (value == null || value === '') return 'Unavailable'
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value)
  if ((key === 'value' && row.unit === 'INR') || /(?:INR|salary|payroll|ctc|cost|amount|budget|variance)/i.test(key)) {
    return `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`
  }
  if (row.unit === '%' || /(?:percentage|rate|attendance|attrition|increment)/i.test(key)) return `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function openPrintReport(title, rows, month, source, reportColumns, targetWindow = null) {
  const printWindow = targetWindow || window.open('', '_blank')
  if (!printWindow) throw new Error('Allow the report window to open, then try Print / Save as PDF again.')
  const columns = reportColumns
  const table = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(reportColumnLabel(column))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} · ${escapeHtml(month)}</title><style>body{font:12px Arial,sans-serif;color:#24304a;margin:32px}h1{font-size:22px;margin:0 0 6px}.meta{color:#647087;margin-bottom:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe3eb;padding:7px;text-align:left;vertical-align:top}th{background:#f1f3f8;font-weight:700}tr{break-inside:avoid}@media print{body{margin:14mm}}</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">Reporting month: ${escapeHtml(month)} · ${escapeHtml(source)} · Generated ${escapeHtml(new Date().toLocaleString())}</div>${table}<script>window.addEventListener('load',()=>window.print())</script></body></html>`)
  printWindow.document.close()
}

function sheetFor(workbook, name, rows, columns = Object.keys(rows[0] || {})) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRow(columns.map(reportColumnLabel))
  rows.forEach((row) => sheet.addRow(columns.map((column) => {
    const value = row[column] ?? null
    return typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
  })))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172544' } }
  sheet.columns.forEach((column, index) => {
    const key = columns[index]
    column.width = Math.min(Math.max(key.length + 4, ...rows.slice(0, 30).map((row) => String(row[key] ?? '').length + 2)), 34)
    if (/salary|payroll|ctc|cost/i.test(key)) column.numFmt = '₹#,##,##0;[Red]-₹#,##,##0;–'
    else if (/percentage|attrition|attendance|increment/i.test(key)) column.numFmt = '0.0"%"'
  })
  if (columns.includes('unit') && columns.includes('value')) {
    rows.forEach((row, index) => { if (row.unit === 'INR') sheet.getCell(index + 2, columns.indexOf('value') + 1).numFmt = '₹#,##,##0;[Red]-₹#,##,##0;–' })
  }
  return sheet
}

export default function ReportsCenter({ employees, departments, trends, selectedMonth, selectedDate, filters, getPeriodMetrics, sourceLabel, projectAssignments, importedModel, dataSource, incrementBandLimits, authStatus = 'demo', allowedReports = reports.map((report) => report.key), liveLoadedAt, refreshLiveWorkspace, liveUserId, liveScopeKey }) {
  const [selectedReport, setSelectedReport] = useState('summary')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const current = getPeriodMetrics(selectedMonth, filters, selectedDate)
  const previous = getPeriodMetrics(getPreviousMonthValue(selectedMonth), filters, getPreviousDateValue(selectedDate))
  const planning = useMemo(() => dataSource === 'imported' ? {
    recruitment: getPlanningReport(importedModel, 'recruitment', selectedMonth, selectedDate, filters),
    contracts: getPlanningReport(importedModel, 'contracts', selectedMonth, selectedDate, filters),
    budget: getPlanningReport(importedModel, 'budget', selectedMonth, selectedDate, filters, { canReadIncrements: allowedReports.includes('increments') }),
  } : {}, [dataSource, importedModel, selectedMonth, selectedDate, filters, allowedReports])
  const reportData = useMemo(() => createDashboardReport({
    month: selectedMonth,
    asOfDate: selectedDate,
    employees,
    departments,
    trends,
    current,
    previous,
    sourceLabel,
    projectAssignments,
    planning,
    filters,
    incrementBandLimits,
  }), [selectedMonth, selectedDate, employees, departments, trends, current, previous, sourceLabel, projectAssignments, planning, filters, incrementBandLimits])
  const visibleReports = reports.filter((report) => allowedReports.includes(report.key))
  const activeReport = visibleReports.find((report) => report.key === selectedReport) || visibleReports[0] || reports[0]
  const reportKey = activeReport.key
  const rows = reportData[reportKey] || []
  const columns = REPORT_COLUMNS[reportKey]
  const previewRows = rows.slice(0, 12)

  const getCurrentAllowedReports = async () => {
    if (authStatus !== 'authenticated' && dataSource !== 'live') return allowedReports
    if (!supabase) throw new Error('The authenticated database connection is unavailable.')
    const profile = await loadCurrentAccessProfile(supabase)
    if (dataSource === 'live' && !isCurrentExportScope(profile, liveUserId, liveScopeKey)) return []
    return getAllowedReportKeys(profile)
  }

  const verifyReportExport = async (reportKey) => {
    try {
      const currentAllowed = await getCurrentAllowedReports()
      if (!isExportAllowed(reportKey, currentAllowed)) {
        setError('Your current account permissions do not allow exporting this report.')
        setStatus('')
        return false
      }
      if (dataSource === 'live') {
        const ready = await verifyLiveExportReadiness({ loadedAt: liveLoadedAt, refresh: refreshLiveWorkspace })
        if (!ready) {
          setStatus('Live data was refreshed. Review the updated report and export again.')
          setError('')
          return false
        }
      }
      return true
    } catch {
      setError('Your current access could not be verified. Sign in again before exporting.')
    }
    setStatus('')
    return false
  }

  const exportCsv = async () => {
    if (!await verifyReportExport(reportKey)) return
    saveBlob(new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }), filename(activeReport.title, selectedMonth))
    setStatus(`${activeReport.label} CSV downloaded with the current filters.`)
    setError('')
  }

  const exportExcel = async () => {
    setStatus('Preparing the Excel report locally…')
    setError('')
    try {
      const currentAllowed = await getCurrentAllowedReports()
      if (!currentAllowed.length) {
        setError('Your current account permissions do not allow exporting these reports. Reload the workspace to refresh your access.')
        setStatus('')
        return
      }
      if (dataSource === 'live' && !await verifyLiveExportReadiness({ loadedAt: liveLoadedAt, refresh: refreshLiveWorkspace })) {
        setStatus('Live data was refreshed. Review the updated report and export again.')
        return
      }
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'PeoplePulse HR MIS'
      workbook.created = new Date()
      const worksheets = [
        ['Executive Summary', 'summary'], ['Monthly Headcount', 'headcount'], ['Joiners and Exits', 'movements'],
        ['Attrition and Trends', 'trends'], ['Payroll Summary', 'payroll'], ['Department Payroll', 'departments'],
        ['Employee Cost', 'employeeCost'], ['Attendance', 'attendance'], ['Leave and LOP', 'leaveLop'],
        ['Performance', 'performance'], ['Increment Analysis', 'increments'], ['Project Allocation', 'projectAllocation'],
        ['Project Cost', 'projectCost'], ['Recruitment', 'recruitment'], ['Contract Manpower', 'contracts'],
        ['HR Budget Actual', 'budget'], ['Consolidated MIS', 'consolidated'],
      ].filter(([, key]) => currentAllowed.includes(key))
      if (!worksheets.length) throw new Error('No reports are currently allowed for export.')
      worksheets.forEach(([name, key]) => {
        const rows = key === 'summary'
          ? [...reportData[key], { metric: 'Generated at', value: localDateTime(), unit: '' }]
          : reportData[key]
        sheetFor(workbook, name, rows, REPORT_COLUMNS[key])
      })
      const buffer = await workbook.xlsx.writeBuffer()
      saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `peoplepulse-hr-mis-${selectedMonth}.xlsx`)
      setStatus('Excel HR MIS downloaded with the current filter selection and all available report worksheets.')
    } catch {
      setError('The Excel report could not be generated in this browser.')
      setStatus('')
    }
  }

  const exportPdf = async () => {
    if (!await verifyReportExport(reportKey)) return
    setStatus('Preparing the PDF report locally...')
    setError('')
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const pdf = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const generatedAt = localDateTime()
      const filterSummary = [
        `Company: ${filters.company || 'All companies'}`,
        `Department: ${filters.department || 'All departments'}`,
        `Location: ${filters.location || 'All locations'}`,
        `Employment type: ${filters.employmentType || 'All employment types'}`,
      ].join('  |  ')
      pdf.setProperties({ title: `${activeReport.title} - ${selectedMonth}`, subject: `PeoplePulse HR MIS report for ${selectedMonth}`, creator: 'PeoplePulse HR Analytics' })
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(17)
      pdf.setTextColor(23, 37, 68)
      pdf.text(activeReport.title, 40, 44)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(83, 94, 115)
      pdf.text(`Reporting period: ${selectedMonth}  |  As of: ${selectedDate}`, 40, 62)
      pdf.text(`Source: ${sourceLabel}  |  ${rows.length} filtered records`, 40, 77)
      pdf.text(filterSummary, 40, 92, { maxWidth: pageWidth - 80 })
      const includesConfidentiality = isConfidentialReport(reportKey)
      if (includesConfidentiality) {
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(150, 39, 47)
        pdf.text('CONFIDENTIAL - For authorised HR and management review', 40, 108)
      }
      let tableStartY = includesConfidentiality ? 126 : 112
      if (reportKey === 'summary') {
        const cardY = 112
        const cardGap = 10
        const cardWidth = (pageWidth - 80 - cardGap * 2) / 3
        getExecutivePdfHighlights(rows).forEach((row, index) => {
          const column = index % 3
          const rowIndex = Math.floor(index / 3)
          const x = 40 + column * (cardWidth + cardGap)
          const y = cardY + rowIndex * 54
          pdf.setFillColor(245, 247, 250)
          pdf.setDrawColor(223, 228, 237)
          pdf.roundedRect(x, y, cardWidth, 45, 6, 6, 'FD')
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.setTextColor(83, 94, 115)
          pdf.text(String(row.metric || 'Metric'), x + 10, y + 15, { maxWidth: cardWidth - 20 })
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(12)
          pdf.setTextColor(23, 37, 68)
          pdf.text(formatPdfValue(row, 'value'), x + 10, y + 34, { maxWidth: cardWidth - 20 })
        })
        const headcountTrend = reportData.trends.filter((point) => Number.isFinite(point.headcount)).slice(-12)
        if (headcountTrend.length > 1) {
          const graph = { left: 55, right: pageWidth - 55, top: 240, bottom: 278 }
          const values = headcountTrend.map((point) => point.headcount)
          const min = Math.min(...values)
          const max = Math.max(...values)
          const span = max - min || 1
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(9)
          pdf.setTextColor(23, 37, 68)
          pdf.text('Monthly headcount trend', 40, 230)
          pdf.setDrawColor(190, 198, 212)
          pdf.line(graph.left, graph.bottom, graph.right, graph.bottom)
          pdf.setDrawColor(44, 94, 168)
          pdf.setLineWidth(1.5)
          headcountTrend.forEach((point, index) => {
            const x = graph.left + (graph.right - graph.left) * index / (headcountTrend.length - 1)
            const y = graph.bottom - (point.headcount - min) / span * (graph.bottom - graph.top)
            if (index > 0) {
              const previousPoint = headcountTrend[index - 1]
              const previousX = graph.left + (graph.right - graph.left) * (index - 1) / (headcountTrend.length - 1)
              const previousY = graph.bottom - (previousPoint.headcount - min) / span * (graph.bottom - graph.top)
              pdf.line(previousX, previousY, x, y)
            }
            pdf.setFillColor(44, 94, 168)
            pdf.circle(x, y, 2, 'F')
            if (index === 0 || index === headcountTrend.length - 1 || index % 3 === 0) {
              pdf.setFont('helvetica', 'normal')
              pdf.setFontSize(7)
              pdf.setTextColor(83, 94, 115)
              pdf.text(String(point.month), x, graph.bottom + 11, { align: 'center' })
            }
          })
          tableStartY = getExecutivePdfTableStartY(true)
        } else {
          tableStartY = getExecutivePdfTableStartY(false)
        }
      }
      autoTable(pdf, {
        startY: tableStartY,
        head: [columns.map(reportColumnLabel)],
        body: rows.length
          ? rows.map((row) => columns.map((column) => formatPdfValue(row, column)))
          : [columns.map((_, index) => index === 0 ? 'No records for these filters.' : '')],
        margin: { top: 36, right: 40, bottom: 38, left: 40 },
        styles: { font: 'helvetica', fontSize: columns.length > 8 ? 6 : 7, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [23, 37, 68], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        didDrawPage: () => {
          const pageHeight = pdf.internal.pageSize.getHeight()
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.setTextColor(100, 110, 128)
          pdf.text(`PeoplePulse  |  ${sourceLabel}  |  Generated ${generatedAt}`, 40, pageHeight - 18)
          pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pageWidth - 40, pageHeight - 18, { align: 'right' })
        },
      })
      pdf.save(filename(activeReport.title, selectedMonth).replace(/\.csv$/, '.pdf'))
      setStatus(`${activeReport.label} PDF downloaded with the current filters.`)
    } catch (pdfError) {
      setError(`The PDF report could not be generated in this browser.${pdfError instanceof Error ? ` ${pdfError.message}` : ''}`)
      setStatus('')
    }
  }

  const print = async () => {
    try {
      // Open synchronously while the click still carries browser user activation.
      const printWindow = window.open('', '_blank')
      if (!printWindow) throw new Error('Allow the report window to open, then try Print / Save as PDF again.')
      if (!await verifyReportExport(reportKey)) {
        printWindow.close()
        return
      }
      openPrintReport(activeReport.title, rows, selectedMonth, sourceLabel, columns, printWindow)
      setStatus('Print view opened. Choose “Save as PDF” in the print dialog to create a PDF.')
      setError('')
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'The print view could not be opened.')
      setStatus('')
    }
  }

  return (
    <div className="reports-center">
      <Panel title="Management Reports Centre" subtitle="Reports use the current month, as-of date, company, department, location, and employment-type filters." className="reports-controls-panel">
        <div className="report-controls">
          <label><span>Report</span><select value={reportKey} onChange={(event) => { setSelectedReport(event.target.value); setStatus(''); setError('') }}>{visibleReports.map((report) => <option key={report.key} value={report.key}>{report.label}</option>)}</select></label>
          <div className="report-actions">
            <button type="button" className="export-button" onClick={exportCsv}><Download size={14} /> Download CSV</button>
            <button type="button" className="export-button" onClick={exportExcel}><FileSpreadsheet size={14} /> Download Excel</button>
            <button type="button" className="export-button" onClick={exportPdf}><FileText size={14} /> Download PDF</button>
            <button type="button" className="export-button" onClick={print}><Printer size={14} /> Print / Save as PDF</button>
          </div>
        </div>
        <p className="report-source-note">{sourceLabel} · Reporting period {selectedMonth} · As of {selectedDate} · Company: {filters.company || 'All companies'}. Exported rows are filtered using the same dashboard selection.</p>
        {status && <p className="report-status" role="status">{status}</p>}
        {error && <p className="report-error" role="alert">{error}</p>}
      </Panel>
      <Panel title={activeReport.label} subtitle={`${rows.length} filtered records · previewing ${previewRows.length}`} className="report-preview-panel">
        <div className="report-table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{reportColumnLabel(column)}</th>)}</tr></thead><tbody>{previewRows.length ? previewRows.map((row, index) => <tr key={`${selectedReport}-${index}`}>{columns.map((column) => <td key={column}>{row[column] == null ? 'Unavailable' : row[column]}</td>)}</tr>) : <tr><td colSpan={columns.length}>No records for these filters.</td></tr>}</tbody></table></div>
      </Panel>
    </div>
  )
}

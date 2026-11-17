import { IMPORT_CATEGORIES, IMPORT_SCHEMAS, SAMPLE_ROWS } from './importSchemas'
import { serializeCsv } from '../data/csv'

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadCsvTemplate(category) {
  const headers = IMPORT_SCHEMAS[category].map((field) => field.label)
  const rows = SAMPLE_ROWS[category]
  const records = rows.map((row) => IMPORT_SCHEMAS[category].map((field) => row[field.key] ?? ''))
  downloadBlob(new Blob([serializeCsv(headers, records)], { type: 'text/csv;charset=utf-8' }), `peoplepulse-${category}-template.csv`)
}

export async function downloadXlsxTemplate(category) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PeoplePulse synthetic template'
  const label = IMPORT_CATEGORIES.find((item) => item.id === category)?.label || 'Import'
  const worksheet = workbook.addWorksheet(label.slice(0, 31))
  const schema = IMPORT_SCHEMAS[category]
  worksheet.addRow(schema.map((field) => field.label))
  worksheet.getRow(1).font = { bold: true }
  SAMPLE_ROWS[category].forEach((sample) => worksheet.addRow(schema.map((field) => sample[field.key] ?? '')))
  worksheet.columns.forEach((column) => { column.width = Math.min(Math.max(String(column.header || '').length + 4, 16), 30) })
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `peoplepulse-${category}-template.xlsx`)
}

export function downloadValidationIssues(issues, filename = 'peoplepulse-validation-errors.csv') {
  const headers = ['Source row', 'Severity', 'Field', 'Message']
  const rows = issues.map(({ rowNumber, severity, field, message }) => [rowNumber, severity, field, message])
  downloadBlob(new Blob([serializeCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

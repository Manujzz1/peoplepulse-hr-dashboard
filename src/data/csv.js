import { TEMPORARY_SAMPLE_DATA } from './sampleData'

const formulaLike = /^[\t\r\n ]*[=+\-@]/

function safeText(value) {
  if (typeof value !== 'string') return value ?? ''
  return formulaLike.test(value) ? `'${value}` : value
}

function escapeField(value) {
  return `"${String(safeText(value)).replaceAll('"', '""')}"`
}

export function serializeCsv(headers, rows, sourceLabel) {
  const records = sourceLabel === TEMPORARY_SAMPLE_DATA
    ? [[TEMPORARY_SAMPLE_DATA, ...headers], ...rows.map((row) => [TEMPORARY_SAMPLE_DATA, ...row])]
    : [headers, ...rows]
  return `\uFEFF${records.map((row) => row.map(escapeField).join(',')).join('\r\n')}`
}

const formulaLike = /^[\t\r\n ]*[=+\-@]/

function safeText(value) {
  if (typeof value !== 'string') return value ?? ''
  return formulaLike.test(value) ? `'${value}` : value
}

function escapeField(value) {
  return `"${String(safeText(value)).replaceAll('"', '""')}"`
}

export function serializeCsv(headers, rows) {
  const records = [headers, ...rows]
  return `\uFEFF${records.map((row) => row.map(escapeField).join(',')).join('\r\n')}`
}

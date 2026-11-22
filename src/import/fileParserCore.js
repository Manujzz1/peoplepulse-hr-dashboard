export function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let afterQuote = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
        afterQuote = true
      } else {
        field += char
      }
    } else if (afterQuote && char === ',') {
      row.push(field)
      field = ''
      afterQuote = false
    } else if (afterQuote && (char === '\n' || char === '\r')) {
      row.push(field)
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row)
      row = []
      field = ''
      afterQuote = false
      if (char === '\r' && input[index + 1] === '\n') index += 1
    } else if (afterQuote && (char === ' ' || char === '\t')) {
      // Permit conventional whitespace between a closing quote and delimiter.
    } else if (afterQuote) {
      throw new Error('The CSV has unexpected characters after a closing quote.')
    } else if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === '"') {
      throw new Error('The CSV has a quote inside an unquoted field.')
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      row.push(field)
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row)
      row = []
      field = ''
      if (char === '\r' && input[index + 1] === '\n') index += 1
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.')
  row.push(field)
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row)
  return rows
}

export const cellValue = (value) => {
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result)
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return value.text
    if ('hyperlink' in value) return value.text || value.hyperlink
    return ''
  }
  return value
}

export function makeSheet(name, grid) {
  const indexedRows = grid.map((row, index) => Array.isArray(row) ? { rowNumber: index + 1, values: row } : row)
  const populated = indexedRows.filter((row) => row.values.some((value) => String(value ?? '').trim() !== ''))
  if (!populated.length) return { name, headers: [], rows: [] }
  const headerRow = populated[0]
  const headers = Array.from(headerRow.values, (value, index) => ({ index, label: String(value ?? '').trim() || `Column ${index + 1}` }))
  const rows = populated.slice(1).map(({ rowNumber, values }) => ({ rowNumber, values: values.map(cellValue) }))
  return { name, headers, rows }
}

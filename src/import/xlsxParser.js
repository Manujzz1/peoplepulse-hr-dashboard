import { cellValue, makeSheet } from './fileParserCore'

export async function parseXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  let sheets
  try {
    await workbook.xlsx.load(buffer)
    sheets = workbook.worksheets.map((worksheet) => {
      const grid = []
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        grid.push({ rowNumber: row.number, values: row.values.slice(1).map(cellValue) })
      })
      return makeSheet(worksheet.name, grid)
    })
  } catch {
    throw new Error('This XLSX file could not be read. Check that it is a valid Excel workbook.')
  }
  if (!sheets.length) throw new Error('The workbook does not contain any worksheets.')
  return { type: 'xlsx', sheets }
}

import { cellValue, makeSheet } from './fileParserCore'

self.onmessage = async ({ data }) => {
  try {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await data.file.arrayBuffer())
    const sheets = workbook.worksheets.map((worksheet) => {
      const grid = []
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        grid.push({ rowNumber: row.number, values: row.values.slice(1).map(cellValue) })
      })
      return makeSheet(worksheet.name, grid)
    })
    if (!sheets.length) throw new Error('The workbook does not contain any worksheets.')
    self.postMessage({ parsed: { type: 'xlsx', sheets } })
  } catch (error) {
    self.postMessage({ error: error instanceof Error && /workbook|worksheet|xlsx|file/i.test(error.message)
      ? error.message
      : 'This XLSX file could not be read. Check that it is a valid Excel workbook.' })
  }
}

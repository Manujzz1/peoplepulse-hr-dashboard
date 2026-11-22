import { parseXlsx } from './xlsxParser'

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ parsed: await parseXlsx(await data.file.arrayBuffer()) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error && /workbook|worksheet|xlsx|file/i.test(error.message)
      ? error.message
      : 'This XLSX file could not be read. Check that it is a valid Excel workbook.' })
  }
}

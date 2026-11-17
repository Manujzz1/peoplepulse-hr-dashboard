import { makeSheet, parseCsv } from './fileParserCore'

self.onmessage = async ({ data }) => {
  try {
    const text = await data.file.text()
    if (text.includes('\u0000')) throw new Error('The selected file is not valid CSV text.')
    self.postMessage({ parsed: { type: 'csv', sheets: [makeSheet('CSV', parseCsv(text))] } })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The CSV file could not be parsed.' })
  }
}

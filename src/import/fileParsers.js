import { MAX_IMPORT_BYTES } from './importSchemas'
import { makeSheet, parseCsv } from './fileParserCore'
import { parseXlsx } from './xlsxParser'

export { parseCsv }

export async function parseFileContents(fileName, content) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'csv') {
    const text = typeof content === 'string' ? content : await content.text()
    if (text.includes('\u0000')) throw new Error('The selected file is not valid CSV text.')
    return { type: 'csv', sheets: [makeSheet('CSV', parseCsv(text))] }
  }
  if (extension !== 'xlsx') throw new Error('Unsupported file type. Choose a .csv or .xlsx file.')

  return parseXlsx(content instanceof ArrayBuffer ? content : await content.arrayBuffer())
}

function parseWithWorker(file, createWorker) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = createWorker()
    } catch {
      reject(new Error('A background parser could not be started.'))
      return
    }
    const finish = (callback, value) => {
      worker.terminate()
      callback(value)
    }
    worker.onmessage = ({ data }) => data.error
      ? finish(reject, new Error(data.error))
      : finish(resolve, data.parsed)
    worker.onerror = (event) => {
      event.preventDefault()
      finish(reject, new Error('The file could not be processed in the background.'))
    }
    try {
      worker.postMessage({ file })
    } catch {
      finish(reject, new Error('The selected file could not be passed to the background parser.'))
    }
  })
}

export async function parseImportFile(file) {
  if (!file) throw new Error('Choose a file to import.')
  if (file.size === 0) throw new Error('The selected file is empty.')
  if (file.size > MAX_IMPORT_BYTES) throw new Error('The file exceeds the 10 MB size limit.')
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'csv' && extension !== 'xlsx') throw new Error('Unsupported file type. Choose a .csv or .xlsx file.')
  if (typeof Worker !== 'undefined') {
    const createWorker = extension === 'csv'
      ? () => new Worker(new URL('./csvParser.worker.js', import.meta.url), { type: 'module' })
      : () => new Worker(new URL('./fileParser.worker.js', import.meta.url), { type: 'module' })
    return parseWithWorker(file, createWorker)
  }
  return parseFileContents(file.name, extension === 'csv' ? await file.text() : await file.arrayBuffer())
}

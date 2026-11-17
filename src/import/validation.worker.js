import { validateMappedRows } from './validateImport'

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: validateMappedRows(data.input) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The rows could not be validated.' })
  }
}

import { useEffect, useState } from 'react'
import { Panel } from './DashboardParts'

const PAGE_SIZE = 50
const displayValue = (value) => value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')

export default function ImportBatchReview({ batch, inspect, close, review, busy }) {
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    inspect(batch.id, offset).then(
      (page) => { if (active) setResult({ offset, page }) },
      (error) => { if (active) setResult({ offset, error: error.message }) },
    )
    return () => { active = false }
  }, [batch.id, inspect, offset, attempt])

  const current = result?.offset === offset ? result : null
  const rows = current?.page?.rows || []
  const fields = [...new Set(rows.flatMap(Object.keys))]
  const goToPage = (nextOffset) => {
    setResult(null)
    setOffset(nextOffset)
  }
  const retryPage = () => {
    setResult(null)
    setAttempt((count) => count + 1)
  }

  return <Panel title="Inspect unpublished batch" subtitle={`${batch.dataset_type} · ${batch.reporting_month || 'No reporting month'}`}>
    <button type="button" className="export-button" onClick={close}>Close inspection</button>
    {!current && <p role="status">Loading inspection…</p>}
    {current?.error && <>
      <p role="alert">{current.error}</p>
      <button type="button" className="export-button" onClick={retryPage}>Retry inspection</button>
    </>}
    {offset > 0 && <button type="button" className="export-button" onClick={() => goToPage(offset - PAGE_SIZE)}>Previous page</button>}
    {current?.page && <>
      {rows.length ? <div className="import-table-scroll"><table>
        <thead><tr>{fields.map((field) => <th key={field}>{field.replaceAll('_', ' ')}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={offset + index}>{fields.map((field) =>
          <td key={field}>{displayValue(row[field])}</td>)}</tr>)}</tbody>
      </table></div> : <p>No staged rows on this page.</p>}
      {current.page.issues.length > 0 && <ul aria-label="Validation issues">
        {current.page.issues.map((issue, index) => <li key={offset + index}>
          Row {issue.row} {issue.severity}{issue.field ? ` in ${issue.field}` : ''}. {issue.message}
        </li>)}
      </ul>}
      <button type="button" className="export-button" disabled={!current.page.hasMore} onClick={() => goToPage(offset + PAGE_SIZE)}>Next page</button>
      {batch.status === 'Validated' && <button type="button" className="export-button" disabled={busy || !rows.length} onClick={review}>Mark reviewed</button>}
    </>}
  </Panel>
}

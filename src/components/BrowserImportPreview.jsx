import { useState } from 'react'
import { IMPORT_CATEGORIES, IMPORT_SCHEMAS, MAX_IMPORT_BYTES } from '../import/importSchemas'

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
function parseCsv(s) {
  const rows = []; let row = [], cell = '', quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') { if (quoted && s[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); if (row.some((x) => String(x).trim())) rows.push(row)
      row = []; cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  row.push(cell); if (row.some((x) => String(x).trim())) rows.push(row)
  return rows
}
async function readRows(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text())
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose a CSV or XLSX file.')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('No worksheet found.')
  const rows = []
  sheet.eachRow((r) => {
    const cells = []
    for (let i = 1; i <= r.cellCount; i++) {
      const v = r.getCell(i).value
      cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : v && typeof v === 'object' ? String(v.text ?? v.result ?? '') : String(v ?? ''))
    }
    if (cells.some((x) => x.trim())) rows.push(cells)
  })
  return rows
}
function inspect(rows, category) {
  if (rows.length < 2) throw new Error('A header and at least one record are required.')
  const schema = IMPORT_SCHEMAS[category] || []
  const header = rows[0].map(norm)
  const mapped = schema.map((f) => ({ ...f, column: header.findIndex((h) => [f.key, f.label, ...(f.aliases || [])].some((alias) => norm(alias) === h)) }))
  const missing = mapped.filter((f) => f.required && f.column < 0)
  if (missing.length) throw new Error('Missing required columns: ' + missing.map((f) => f.label).join(', '))
  const records = rows.slice(1).map((row) => Object.fromEntries(mapped.filter((f) => f.column >= 0).map((f) => [f.key, String(row[f.column] ?? '').trim()])))
  const errors = []
  records.forEach((record, i) => mapped.forEach((f) => {
    const value = record[f.key]
    if (f.required && !value) errors.push('Row ' + (i + 2) + ': missing ' + f.label)
    if (value && ['nonNegative', 'percentage'].includes(f.type) && (!Number.isFinite(Number(value.replace(/,/g, ''))) || Number(value.replace(/,/g, '')) < 0)) errors.push('Row ' + (i + 2) + ': invalid ' + f.label)
  }))
  return { records, errors, ignored: rows[0].filter((_, i) => !mapped.some((f) => f.column === i)) }
}
export default function BrowserImportPreview() {
  const [category, setCategory] = useState('employeeMaster')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function upload(file) {
    setResult(null); setError('')
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) { setError('File exceeds 10 MB.'); return }
    setBusy(true)
    try {
      const rows = await readRows(file)
      if (rows.length > 20001) throw new Error('Maximum 20,000 records per preview.')
      setResult({ ...inspect(rows, category), name: file.name })
    } catch (e) { setError(e.message || 'Unable to read file') }
    finally { setBusy(false) }
  }
  const grouping = result && ['department', 'reportingMonth', 'location', 'employmentType', 'leaveType', 'projectName'].find((key) => result.records.some((r) => r[key]))
  const groups = new Map()
  if (result && grouping) result.records.forEach((r) => groups.set(r[grouping] || 'Unspecified', (groups.get(r[grouping] || 'Unspecified') || 0) + 1))
  const chart = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 12)
  const maximum = Math.max(1, ...chart.map((x) => x[1]))
  return <section id="browser-import-preview" aria-label="Local import preview" style={{ marginTop: 24, padding: 20, border: '1px solid #94a3b8', borderRadius: 12 }}>
    <h2>Excel / CSV upload and visualization</h2>
    <p><strong>Browser-only preview.</strong> Nothing is saved to Supabase. This public website is for fictional or anonymized files only; do not upload confidential employee or payroll records.</p>
    <label>Category <select value={category} onChange={(e) => { setCategory(e.target.value); setResult(null) }}>{IMPORT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label style={{ display: 'block', marginTop: 12 }}>Choose CSV or Excel <input aria-label="Choose CSV or Excel" type="file" accept=".csv,.xlsx" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} /></label>
    {busy && <p role="status">Reading your file locally…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div>
      <h3>File preview: {result.name}</h3>
      <p>{result.records.length} rows · {result.errors.length} basic validation errors</p>
      {result.ignored.length > 0 && <p>Unmapped columns: {result.ignored.join(', ')}</p>}
      {result.errors.length > 0 && <div role="alert"><strong>Validation issues:</strong><ul>{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      <h3>Uploaded file visualization — record counts</h3>
      {chart.length ? chart.map(([name, count]) => <div key={name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,1fr) 3fr 48px', gap: 8, alignItems: 'center', margin: '8px 0' }}><span>{name}</span><div style={{ background: '#e2e8f0', height: 16 }}><div style={{ width: count / maximum * 100 + '%', background: '#2563eb', height: '100%' }} /></div><strong>{count}</strong></div>) : <p>No grouping field detected.</p>}
      <p>Uploaded records are visualized separately. The fictional Executive Dashboard above is not changed or mixed with uploaded records.</p>
      <button type="button" onClick={() => setResult(null)}>Clear preview</button>
    </div>}
  </section>
}

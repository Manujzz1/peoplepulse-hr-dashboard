import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Clock3, Database, Download, FileSpreadsheet,
  FileText, Info, Trash2, UploadCloud,
} from 'lucide-react'
import { Panel } from './DashboardParts'
import ImportBatchReview from './ImportBatchReview'
import { autoMapColumns, findDuplicateMappings, validateMappedRows } from '../import/validateImport'
import { IMPORT_CATEGORIES, IMPORT_SCHEMAS, MAX_IMPORT_BYTES, MONTHLY_IMPORT_CATEGORIES } from '../import/importSchemas'
import { parseImportFile } from '../import/fileParsers'
import { downloadCsvTemplate, downloadValidationIssues, downloadXlsxTemplate } from '../import/templates'
import { mergeImportStage } from '../import/staging'
import { createPayrollReconciliationBatch } from '../import/payrollReconciliation'
import { getPayrollControlMismatches } from '../import/payrollReconciliation'
import { createHrModel, getImportedAvailableMonths, getImportedDashboardReadiness } from '../data/hrModel'

const showValue = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '')
const currentTimestamp = () => new Date().toISOString()
const formatTimestamp = (value) => new Date(value).toLocaleString()

function StatusBanner({ kind, icon: Icon, children }) {
  return <div className={`import-notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}><Icon size={16} /><span>{children}</span></div>
}

function SummaryCard({ label, value, tone }) {
  return <div className={`import-summary-card ${tone || ''}`}><span>{label}</span><strong>{value}</strong></div>
}

export default function DataImportCenter({ dataSource, onDataSourceChange, stagedImports, setStagedImports, importHistory = [], importRollback, onImportStaged = () => {}, onRollback = () => {}, onStagedRemoved = () => {}, liveImportsEnabled = false, databaseReady = false, databaseCompanies = [], databaseWorkspace = null, databaseBatches = [], databasePermissions = {}, onSubmitDatabase = async () => {}, onTransitionBatch = async () => {}, onInspectBatch }) {
  const [category, setCategory] = useState('employeeMaster')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState([])
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState({})
  const [loading, setLoading] = useState(false)
  const [validationState, setValidationState] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [markComplete, setMarkComplete] = useState(false)
  const [importMode, setImportMode] = useState('append')
  const [masterAsOf, setMasterAsOf] = useState('')
  const [payrollControlTotals, setPayrollControlTotals] = useState({})
  const [databaseCompanyId, setDatabaseCompanyId] = useState('')
  const [databaseActionLoading, setDatabaseActionLoading] = useState(false)
  const [inspectionId, setInspectionId] = useState(null)
  const requestId = useRef(0)

  const activeSheet = sheets.find((sheet) => sheet.name === sheetName)
  const validationSource = useMemo(() => ({ activeSheet, category, mapping, stagedImports, databaseCompanyId, databaseWorkspace }), [activeSheet, category, mapping, stagedImports, databaseCompanyId, databaseWorkspace])
  const currentValidationState = validationState?.source === validationSource ? validationState : null
  const validation = currentValidationState?.result || null
  const payrollMonths = useMemo(() => category === 'payroll' && validation
    ? [...new Set(validation.validRows.map((row) => row.reportingMonth).filter(Boolean))].sort()
    : [], [category, validation])
  const payrollFileGrossTotals = useMemo(() => Object.fromEntries(payrollMonths.map((month) => [
    month,
    validation.validRows.filter((row) => row.reportingMonth === month).reduce((sum, row) => sum + Number(row.monthlyGrossSalary || 0), 0),
  ])), [payrollMonths, validation])
  const validating = Boolean(activeSheet?.headers.length) && !currentValidationState
  const duplicateMappings = findDuplicateMappings(mapping)
  const unmappedRequired = (IMPORT_SCHEMAS[category] || []).filter((field) => field.required && (mapping[field.key] === '' || mapping[field.key] == null))
  useEffect(() => {
    if (!activeSheet || !activeSheet.headers.length) return undefined
    const databaseCompanyRows = (rows) => rows.filter((row) => row.company_id === databaseCompanyId)
    const employees = databaseCompanyRows(databaseWorkspace?.rowsByTable?.employees || [])
    const employeeIds = stagedImports.employeeMaster?.rows?.map((row) => row.employeeId) || employees.map((row) => row.employee_code)
    const projectIds = stagedImports.projectMaster?.rows?.map((row) => row.projectId) || databaseCompanyRows(databaseWorkspace?.rowsByTable?.projects || []).map((row) => row.project_code)
    const departmentNames = stagedImports.departmentMaster?.rows?.map((row) => row.department) || databaseCompanyRows(databaseWorkspace?.rowsByTable?.departments || []).map((row) => row.department_name)
    const locationNames = stagedImports.locationMaster?.rows?.map((row) => row.location) || databaseCompanyRows(databaseWorkspace?.rowsByTable?.locations || []).map((row) => row.location_name)
    const employeeRecords = stagedImports.employeeMaster?.rows || employees.map((row) => ({ employeeId: row.employee_code, hireDate: row.hire_date, exitDate: row.exit_date || '' }))
    const input = {
      category,
      headers: activeSheet.headers,
      rows: activeSheet.rows,
      mapping,
      context: {
        employeeIds: category === 'employeeMaster' ? null : stagedImports.employeeMaster || databaseCompanyId ? employeeIds : null,
        employeeRecords: category === 'employeeHistory' ? employeeRecords : null,
        projectIds: category === 'projectMaster' ? null : stagedImports.projectMaster || databaseCompanyId ? projectIds : null,
        departmentNames: category === 'departmentMaster' ? null : stagedImports.departmentMaster || databaseCompanyId ? departmentNames : null,
        locationNames: category === 'locationMaster' ? null : stagedImports.locationMaster || databaseCompanyId ? locationNames : null,
      },
    }
    let worker
    let canceled = false
    const finish = (result, error) => {
      if (canceled) return
      setValidationState({ source: validationSource, result: result || null, error: error || '' })
      if (error) setError(error)
    }
    try {
      if (typeof Worker === 'undefined') throw new Error('Worker unavailable')
      worker = new Worker(new URL('../import/validation.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => finish(data.result, data.error)
      worker.onerror = (event) => {
        event.preventDefault()
        finish(null, 'Validation could not run in the background. Try selecting the file again.')
      }
      worker.postMessage({ input })
    } catch {
      // Compatibility fallback for browsers without module workers.
      Promise.resolve().then(() => finish(validateMappedRows(input)))
        .catch(() => finish(null, 'The file could not be validated in this browser.'))
    }
    return () => {
      canceled = true
      worker?.terminate()
    }
  }, [activeSheet, category, mapping, stagedImports, validationSource, databaseWorkspace, databaseCompanyId])

  const resetFileState = () => {
    requestId.current += 1
    setValidationState(null)
    setFileName('')
    setSheets([])
    setSheetName('')
    setMapping({})
    setError('')
    setSuccess('')
    setLoading(false)
    setMarkComplete(false)
    setMasterAsOf('')
    setPayrollControlTotals({})
  }

  const selectCategory = (nextCategory) => {
    if (nextCategory === category) return
    setCategory(nextCategory)
    setImportMode('append')
    resetFileState()
  }

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    setSuccess('')
    setMarkComplete(false)
    setMasterAsOf('')
    setPayrollControlTotals({})
    setFileName(file.name)
    setSheets([])
    setMapping({})
    try {
      const parsed = await parseImportFile(file)
      if (currentRequest !== requestId.current) return
      setSheets(parsed.sheets)
      const initialSheet = parsed.sheets.find((sheet) => sheet.headers.length) || parsed.sheets[0]
      setSheetName(initialSheet?.name || '')
      setMapping(autoMapColumns(category, initialSheet?.headers || []))
      if (!initialSheet?.headers.length) setError('No header row was found in this file.')
    } catch (parseError) {
      if (currentRequest !== requestId.current) return
      setError(parseError instanceof Error ? parseError.message : 'The file could not be read.')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  const chooseSheet = (name) => {
    setSheetName(name)
    const selectedSheet = sheets.find((sheet) => sheet.name === name)
    setMapping(autoMapColumns(category, selectedSheet?.headers || []))
    setError(selectedSheet?.headers.length ? '' : 'No header row was found in this worksheet.')
    setValidationState(null)
    setSuccess('')
    setMarkComplete(false)
    setMasterAsOf('')
    setPayrollControlTotals({})
  }

  const stageRows = () => {
    if (!validation || !validation.validRows.length || duplicateMappings.length || unmappedRequired.length || (markComplete && category === 'employeeMaster' && !masterAsOf)) return
    if (importMode === 'replace-months' && validation.summary.rejectedRows > 0) {
      setError('Resolve every rejected row before replacing reporting months. Existing staged records were kept.')
      return
    }
    const canMarkComplete = markComplete && validation.summary.rejectedRows === 0 && validation.summary.warningCount === 0
    const completeMonths = canMarkComplete && MONTHLY_IMPORT_CATEGORIES.includes(category)
      ? [...new Set(validation.validRows.map((row) => row.reportingMonth || (category === 'increments' ? row.effectiveDate.slice(0, 7) : '')))]
      : []
    const stagedAt = currentTimestamp()
    let reconciliationBatches = []
    try {
      if (category === 'payroll') reconciliationBatches = payrollMonths.map((month) => createPayrollReconciliationBatch(validation.validRows, month, payrollControlTotals[month] ?? '', { fileName, stagedAt }))
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : 'Payroll control totals are invalid.')
      return
    }
    const incoming = {
      rows: validation.validRows,
      summary: validation.summary,
      fileName,
      stagedAt,
      completeMonths,
      completeAsOf: canMarkComplete && category === 'employeeMaster' ? masterAsOf : '',
      complete: canMarkComplete && !MONTHLY_IMPORT_CATEGORIES.includes(category) && category !== 'employeeMaster',
      ...(category === 'payroll' ? { reconciliationBatches } : {}),
    }
    const existing = stagedImports[category]
    if (existing) {
      const periodLabel = completeMonths.length ? completeMonths.join(', ') : [...new Set(validation.validRows.map((row) => row.reportingMonth || (category === 'increments' ? row.effectiveDate.slice(0, 7) : '')))].join(', ')
      const message = MONTHLY_IMPORT_CATEGORIES.includes(category) && importMode === 'replace-months'
        ? `Replace staged ${categoryLabel} rows for ${periodLabel} with ${validation.validRows.length} valid rows? Other reporting months will be preserved.`
        : MONTHLY_IMPORT_CATEGORIES.includes(category)
          ? `Append ${validation.validRows.length} ${categoryLabel} rows to staged data? Existing duplicate keys will be rejected.`
          : `Replace all ${existing.rows.length} staged ${categoryLabel} rows with ${validation.validRows.length} valid rows?`
      if (!globalThis.confirm(message)) return
    }
    try {
      const staged = mergeImportStage(existing, incoming, category, importMode)
      setStagedImports((current) => ({ ...current, [category]: staged }))
      const periods = [...new Set(validation.validRows.map((row) => row.reportingMonth || (row.effectiveDate ? row.effectiveDate.slice(0, 7) : '')).filter(Boolean))]
      onImportStaged({
        category,
        categoryLabel,
        fileName,
        stagedAt: incoming.stagedAt,
        stagedAtLabel: formatTimestamp(incoming.stagedAt),
        action: !existing ? 'Initial staging' : MONTHLY_IMPORT_CATEGORIES.includes(category) ? importMode === 'append' ? 'Append' : 'Replace periods' : 'Replace dataset',
        totalRows: validation.summary.totalRows,
        validRows: validation.summary.validRows,
        rejectedRows: validation.summary.rejectedRows,
        warningCount: validation.summary.warningCount,
        periods,
      }, existing || null)
      const completenessText = markComplete && !canMarkComplete ? ' Validation errors or unchecked references mean the dataset was kept marked incomplete.' : ''
      setSuccess(`${validation.validRows.length} valid rows staged in memory for ${categoryLabel}. ${staged.rows.length} total rows are now staged for this category.${completenessText} Dashboard metrics have not been changed.`)
      setError('')
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : 'The staged data could not be merged.')
    }
  }

  const removeStaged = (id) => {
    setStagedImports((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    onStagedRemoved(id)
  }

  const makeXlsxTemplate = async () => {
    setTemplateLoading(true)
    setError('')
    try {
      await downloadXlsxTemplate(category)
    } catch {
      setError('The Excel template could not be generated in this browser.')
    } finally {
      setTemplateLoading(false)
    }
  }

  const submitDatabaseBatch = async () => {
    const stage = stagedImports[category]
    if (!databaseReady || !databaseCompanyId || !stage?.rows?.length) return
    setDatabaseActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await onSubmitDatabase({ category, stage, companyId: databaseCompanyId })
      setSuccess(result.reused
        ? `This staged file already has batch ${result.batchId} (${result.status}). No duplicate rows were created.`
        : `${result.totalRows} rows were submitted as batch ${result.batchId} (${result.status}) for independent review and approval. They are not visible in dashboards until published.`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The database import could not be submitted.')
    } finally {
      setDatabaseActionLoading(false)
    }
  }

  const moveBatch = async (batch, nextStatus) => {
    setDatabaseActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await onTransitionBatch(batch, nextStatus)
      setSuccess(`Batch ${result.id} moved to ${result.status}.`)
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : `The batch could not move to ${nextStatus}.`)
    } finally {
      setDatabaseActionLoading(false)
    }
  }

  const fields = IMPORT_SCHEMAS[category]
  const categoryLabel = IMPORT_CATEGORIES.find((item) => item.id === category)?.label
  const stagedCount = Object.values(stagedImports).reduce((sum, entry) => sum + entry.rows.length, 0)
  const issueRows = validation?.issues.slice(0, 80) || []
  const completenessValid = !(markComplete && category === 'employeeMaster' && !masterAsOf)
  const canDatabasePermission = (permission) => liveImportsEnabled && (databasePermissions?.has?.('*') || databasePermissions?.has?.(permission))
  const canInspect = (batch) => canDatabasePermission('imports.review') && batch.uploaded_by !== databaseWorkspace?.userId && ['Validated', 'Reviewed'].includes(batch.status)
  const inspection = databaseBatches.find((batch) => batch.id === inspectionId && canInspect(batch))
  const stagedEmployeeIds = stagedImports.employeeMaster ? new Set(stagedImports.employeeMaster.rows.map((row) => String(row.employeeId).trim().toUpperCase())) : null
  const stagedProjectIds = stagedImports.projectMaster ? new Set(stagedImports.projectMaster.rows.map((row) => String(row.projectId).trim().toUpperCase())) : null
  const dependentStages = ['employeeHistory', 'payroll', 'attendance', 'leave', 'performance', 'increments', 'projectAllocation', 'exitRecords'].filter((id) => stagedImports[id])
  const missingStagedEmployees = stagedEmployeeIds ? dependentStages.flatMap((id) => stagedImports[id].rows.filter((row) => !stagedEmployeeIds.has(String(row.employeeId).trim().toUpperCase()))) : []
  const allocationStages = stagedImports.projectAllocation?.rows || []
  const missingStagedProjects = stagedProjectIds ? allocationStages.filter((row) => !stagedProjectIds.has(String(row.projectId).trim().toUpperCase())) : []
  const stagedModel = useMemo(() => createHrModel(stagedImports), [stagedImports])
  const stagedMonths = useMemo(() => getImportedAvailableMonths(stagedModel), [stagedModel])
  const qualityMonth = stagedMonths.at(-1) || ''
  const qualityReadiness = useMemo(() => qualityMonth ? getImportedDashboardReadiness(stagedModel, qualityMonth) : null, [stagedModel, qualityMonth])

  return (
    <div className="import-center">
      <div className="import-intro-row">
        <div><div className="eyebrow">PEOPLE PULSE <span>·</span> {dataSource === 'live' ? 'LIVE IMPORT APPROVAL' : 'LOCAL STAGING'}</div><h2>Data Import Centre</h2><p>Parse and validate files locally. Live submissions enter the database approval workflow and stay hidden from dashboards until published.</p></div>
        <label className="import-source-selector"><Database size={16} /><span>Data source</span><select value={dataSource} onChange={(event) => onDataSourceChange(event.target.value)} aria-label="Dashboard data source"><option value="live">Live organization data</option><option value="imported">Local import preview</option></select></label>
      </div>

      {dataSource === 'live' && <Panel title="Organization import scope" subtitle="The current authenticated session and RLS policies determine which companies and batches are visible.">
        <label className="filter-control"><span>Company</span><select value={databaseCompanyId} onChange={(event) => setDatabaseCompanyId(event.target.value)} aria-label="Import company"><option value="">Select a company</option>{databaseCompanies.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label>
        {!databaseReady && <StatusBanner kind="warning" icon={Info}>{liveImportsEnabled ? 'Database import requires a verified live session with import permission.' : 'Live imports are disabled in this deployment.'}</StatusBanner>}
        {databaseBatches.length > 0 && <div className="import-table-scroll"><table><thead><tr><th>Dataset</th><th>Reporting month</th><th>Status</th><th>Rows</th><th>Workflow</th></tr></thead><tbody>{databaseBatches.map((batch) => <tr key={batch.id}><td>{batch.dataset_type}</td><td>{batch.reporting_month || '—'}</td><td>{batch.status}</td><td>{batch.total_rows}</td><td>{canInspect(batch) && <button type="button" className="export-button" disabled={databaseActionLoading} onClick={() => setInspectionId(batch.id)}>Inspect</button>}{batch.status === 'Reviewed' && canDatabasePermission('imports.approve') && <button className="export-button" disabled={databaseActionLoading} onClick={() => moveBatch(batch, 'Approved')}>Approve</button>}{batch.status === 'Approved' && canDatabasePermission('imports.publish') && <button className="export-button" disabled={databaseActionLoading} onClick={() => moveBatch(batch, 'Published')}>Publish</button>}{['Validated', 'Reviewed', 'Uploaded'].includes(batch.status) && canDatabasePermission('imports.review') && <button className="export-button" disabled={databaseActionLoading} onClick={() => moveBatch(batch, 'Rejected')}>Reject</button>}</td></tr>)}</tbody></table></div>}
        {inspection && <ImportBatchReview key={JSON.stringify([databaseWorkspace?.userId, databaseWorkspace?.scopeKey, inspection.id])} batch={inspection} inspect={onInspectBatch} close={() => setInspectionId(null)} review={() => moveBatch(inspection, 'Reviewed')} busy={databaseActionLoading} />}
      </Panel>}

      <StatusBanner kind="info" icon={Info}>Imported rows remain separate from Demo Data. They can power the analytics modules only after source completeness and employee/project reference checks pass for the selected reporting period.</StatusBanner>

      <Panel title="Import categories" subtitle="Choose the type of synthetic or organisation-owned file you are validating." className="import-category-panel">
        <div className="import-category-grid">
          {IMPORT_CATEGORIES.map((item) => <button type="button" key={item.id} className={`import-category ${category === item.id ? 'active' : ''}`} onClick={() => selectCategory(item.id)}>
            <span className="import-category-icon"><FileSpreadsheet size={17} /></span><span><strong>{item.label}</strong><small>{stagedImports[item.id]?.rows.length || 0} staged rows</small></span>
          </button>)}
        </div>
      </Panel>

      <div className="import-work-grid">
        <Panel title={`Upload ${categoryLabel}`} subtitle={`CSV or Excel workbook · maximum ${MAX_IMPORT_BYTES / 1024 / 1024} MB`} className="import-upload-panel">
          <label className="upload-dropzone">
            <UploadCloud size={25} />
            <strong>{fileName || 'Choose a file to preview'}</strong>
            <span>Supported formats: .csv and .xlsx</span>
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileSelected} />
          </label>
          <div className="template-actions"><button type="button" className="export-button" onClick={() => downloadCsvTemplate(category)}><Download size={14} /> CSV template</button><button type="button" className="export-button" onClick={makeXlsxTemplate} disabled={templateLoading}><Download size={14} /> {templateLoading ? 'Preparing…' : 'Excel template'}</button></div>
          {loading && <StatusBanner kind="loading" icon={Clock3}>Reading the file locally…</StatusBanner>}
          {validating && <StatusBanner kind="loading" icon={Clock3}>Validating {activeSheet?.rows.length || 0} rows locally in the background…</StatusBanner>}
          {error && <StatusBanner kind="error" icon={AlertCircle}>{error}</StatusBanner>}
          {success && <StatusBanner kind="success" icon={CheckCircle2}>{success}</StatusBanner>}
          {sheets.length > 0 && <div className="worksheet-selector"><label htmlFor="worksheet-select">Worksheet</label><select id="worksheet-select" value={sheetName} onChange={(event) => chooseSheet(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.headers.length ? ` · ${sheet.rows.length} rows` : ' · no headers'}</option>)}</select></div>}
        </Panel>

        <Panel title="Column mapping" subtitle={category === 'attendance' ? 'Provide Attendance Percentage or both Present Days and Working Days. Optional calendar, leave, and payable-day fields are reconciled when supplied.' : 'Required fields are marked. Auto-matched headers can be changed.'} className="import-mapping-panel">
          {activeSheet?.headers.length ? <>
            <div className="mapping-list">{fields.map((field) => <label className="mapping-row" key={field.key}>
              <span><strong>{field.label}</strong><small className={field.required ? 'required' : ''}>{field.required ? 'Required' : 'Optional'} · {field.type}</small></span>
              <select aria-label={`Map ${field.label}`} value={mapping[field.key] ?? ''} onChange={(event) => { setMapping((current) => ({ ...current, [field.key]: event.target.value === '' ? '' : Number(event.target.value) })); setValidationState(null); setError(''); setSuccess('') }}>
                <option value="">Do not map</option>{activeSheet.headers.map((header) => <option key={header.index} value={header.index}>{header.label}</option>)}
              </select>
            </label>)}</div>
            {unmappedRequired.length > 0 && <StatusBanner kind="warning" icon={AlertCircle}>Map required fields: {unmappedRequired.map((field) => field.label).join(', ')}.</StatusBanner>}
            {duplicateMappings.length > 0 && <StatusBanner kind="error" icon={AlertCircle}>A source column is mapped more than once: {duplicateMappings.map((key) => fields.find((field) => field.key === key)?.label).join(', ')}.</StatusBanner>}
          </> : <div className="import-empty"><FileText size={18} /><span>Select a CSV or XLSX file to map its headers.</span></div>}
        </Panel>
      </div>

      {validation && <>
        <Panel title="Validation summary" subtitle="Only valid rows can enter this in-memory staging area." className="import-validation-panel">
          <div className="import-summary-grid"><SummaryCard label="Total rows" value={validation.summary.totalRows} /><SummaryCard label="Valid rows" value={validation.summary.validRows} tone="success" /><SummaryCard label="Rejected rows" value={validation.summary.rejectedRows} tone="error" /><SummaryCard label="Warnings" value={validation.summary.warningCount} tone="warning" /></div>
          {payrollMonths.length > 0 && <div className="payroll-control-totals"><strong>Optional payroll source control totals</strong><p>Compare each file’s valid gross rows with a control total from the source report. This check covers this file only and remains in browser memory.</p>{payrollMonths.map((month) => <label key={month}>Source gross total · {month}<input type="number" min="0" step="0.01" aria-label={`Source payroll control total ${month}`} value={payrollControlTotals[month] ?? ''} onChange={(event) => setPayrollControlTotals((current) => ({ ...current, [month]: event.target.value }))} /><small>Valid rows in this file: INR {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(payrollFileGrossTotals[month])}</small></label>)}</div>}
          <div className="completeness-confirmation">
          {stagedImports[category] && MONTHLY_IMPORT_CATEGORIES.includes(category) && <div className="staging-mode"><label><input type="radio" name="import-mode" value="append" checked={importMode === 'append'} onChange={() => setImportMode('append')} /> Append new records</label><label><input type="radio" name="import-mode" value="replace-months" checked={importMode === 'replace-months'} onChange={() => setImportMode('replace-months')} /> Replace periods in this file</label></div>}
          {category === 'employeeMaster' ? <><label><input type="checkbox" checked={markComplete} onChange={(event) => setMarkComplete(event.target.checked)} /> I confirm this is the complete employee roster.</label><label className="as-of-date">Roster as of <input type="date" value={masterAsOf} onChange={(event) => setMasterAsOf(event.target.value)} /></label></> : MONTHLY_IMPORT_CATEGORIES.includes(category) ? <label><input type="checkbox" checked={markComplete} onChange={(event) => setMarkComplete(event.target.checked)} /> I confirm this file includes all records for every reporting month it contains.</label> : <label><input type="checkbox" checked={markComplete} onChange={(event) => setMarkComplete(event.target.checked)} /> I confirm this file contains the complete {categoryLabel.toLowerCase()} dataset.</label>}
            {markComplete && (validation.summary.rejectedRows > 0 || validation.summary.warningCount > 0) && <span className="completeness-warning">Resolve errors and unchecked references before this source can be marked complete.</span>}
          </div>
          <div className="validation-actions"><span>All parsing and validation run locally in your browser.</span><div>{validation.issues.length > 0 && <button type="button" className="export-button" onClick={() => downloadValidationIssues(validation.issues, `peoplepulse-${category}-validation.csv`)}><Download size={14} /> Download validation CSV</button>}<button type="button" className="stage-button" disabled={!validation.validRows.length || duplicateMappings.length > 0 || unmappedRequired.length > 0 || !completenessValid || (importMode === 'replace-months' && validation.summary.rejectedRows > 0)} onClick={stageRows}>{stagedImports[category] ? MONTHLY_IMPORT_CATEGORIES.includes(category) ? importMode === 'append' ? 'Append valid rows' : 'Replace selected periods' : 'Replace staged dataset' : 'Stage valid rows'} <span>({validation.validRows.length})</span></button></div></div>
        </Panel>

        {issueRows.length > 0 && <Panel title="Row-level validation issues" subtitle={`Showing ${issueRows.length} of ${validation.issues.length} issues.`} className="import-issues-panel">
          <div className="import-table-scroll"><table><thead><tr><th>Source row</th><th>Severity</th><th>Field</th><th>Issue</th></tr></thead><tbody>{issueRows.map((item, index) => <tr key={`${item.rowNumber}-${item.field}-${index}`}><td>{item.rowNumber}</td><td><span className={`validation-pill ${item.severity}`}>{item.severity}</span></td><td>{item.field}</td><td>{item.message}</td></tr>)}</tbody></table></div>
        </Panel>}

        {activeSheet?.headers.length > 0 && <Panel title="Data preview" subtitle={`First ${Math.min(20, validation.rows.length)} mapped rows · values are not yet imported into the dashboard.`} className="import-preview-panel">
          <div className="import-table-scroll"><table><thead><tr><th>Source row</th>{fields.map((field) => <th key={field.key}>{field.label}</th>)}<th>Validation</th></tr></thead><tbody>{validation.rows.slice(0, 20).map((row) => {
            const rowIssues = validation.issues.filter((entry) => entry.rowNumber === row._rowNumber)
            const hasError = rowIssues.some((entry) => entry.severity === 'error')
            return <tr key={row._rowNumber}><td>{row._rowNumber}</td>{fields.map((field) => <td key={field.key}>{showValue(row[field.key])}</td>)}<td><span className={`validation-pill ${hasError ? 'error' : rowIssues.length ? 'warning' : 'valid'}`}>{hasError ? 'Rejected' : rowIssues.length ? 'Warning' : 'Valid'}</span></td></tr>
          })}</tbody></table></div>
        </Panel>}
      </>}

      <Panel title="Data quality and source completeness" subtitle={qualityMonth ? `Latest staged reporting period: ${qualityMonth}. Readiness uses the same checks as Imported Data mode.` : 'Stage reporting-month records to review dashboard readiness.'} className="import-quality-panel">
        <div className="import-summary-grid">
          <SummaryCard label="Categories staged" value={`${Object.keys(stagedImports).length} / ${IMPORT_CATEGORIES.length}`} />
          <SummaryCard label="Valid rows staged" value={stagedCount} tone="success" />
          <SummaryCard label="Employee references missing" value={stagedModel.unmatchedEmployees.length} tone={stagedModel.unmatchedEmployees.length ? 'error' : 'success'} />
          <SummaryCard label="Project references missing" value={stagedModel.unmatchedProjects.length} tone={stagedModel.unmatchedProjects.length ? 'error' : 'success'} />
        </div>
        <div className="staged-list quality-source-list">{IMPORT_CATEGORIES.map((item) => {
          const stage = stagedImports[item.id]
          const payrollMismatch = item.id === 'payroll' && getPayrollControlMismatches(stage?.reconciliationBatches, qualityMonth).length > 0
          const periodComplete = stage && !payrollMismatch && (MONTHLY_IMPORT_CATEGORIES.includes(item.id)
            ? stage.completeMonths.includes(qualityMonth)
            : item.id === 'employeeMaster' ? Boolean(stage.completeAsOf) : Boolean(stage.complete))
          const sourceIssues = stage?.summary ? stage.summary.rejectedRows + stage.summary.warningCount : 0
          const state = !stage ? 'Not staged' : payrollMismatch ? 'Payroll control-total mismatch' : sourceIssues ? 'Validation issues in source' : periodComplete ? 'Complete as declared' : 'Staged; completeness unconfirmed'
          return <div className="staged-item" key={item.id}><span className={`quality-state-dot ${!stage ? 'missing' : sourceIssues ? 'warning' : periodComplete ? 'complete' : 'incomplete'}`} /><span><strong>{item.label}</strong><small>{stage ? `${stage.rows.length} valid rows · ${state}` : state}</small></span>{stage && <small className="quality-source-period">{MONTHLY_IMPORT_CATEGORIES.includes(item.id) ? stage.completeMonths.join(', ') || 'No complete months' : item.id === 'employeeMaster' ? stage.completeAsOf ? `As of ${stage.completeAsOf}` : 'No as-of date' : stage.complete ? 'Confirmed complete' : 'Not confirmed complete'}</small>}</div>
        })}</div>
        {qualityReadiness ? <div className={`quality-readiness ${qualityReadiness.ready ? 'ready' : 'not-ready'}`}><strong>{qualityReadiness.ready ? `Ready for ${qualityMonth}` : `Not ready for ${qualityMonth}`}</strong>{!qualityReadiness.ready && <ul>{qualityReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div> : <StatusBanner kind="warning" icon={Info}>No reporting month is available yet. Employee Master and Project Master can be staged first; monthly data is needed to calculate period readiness.</StatusBanner>}
      </Panel>

      <Panel title={dataSource === 'live' ? 'Validated local files' : 'In-memory staging'} subtitle={`${stagedCount} valid rows staged across ${Object.keys(stagedImports).length} categories. Refreshing or closing this tab clears staged data.`} className="staged-panel">
        {dependentStages.length > 0 && !stagedEmployeeIds && <StatusBanner kind="warning" icon={AlertCircle}>Employee references in staged records remain unchecked until an Employee Master is staged.</StatusBanner>}
        {allocationStages.length > 0 && !stagedProjectIds && <StatusBanner kind="warning" icon={AlertCircle}>Project references in staged allocations remain unchecked until a Project Master is staged.</StatusBanner>}
        {missingStagedEmployees.length > 0 && <StatusBanner kind="error" icon={AlertCircle}>{missingStagedEmployees.length} staged records no longer match the staged Employee Master. Revalidate those files before any future dashboard connection.</StatusBanner>}
        {missingStagedProjects.length > 0 && <StatusBanner kind="error" icon={AlertCircle}>{missingStagedProjects.length} staged allocations no longer match the staged Project Master. Revalidate Project Allocation before any future dashboard connection.</StatusBanner>}
        {Object.keys(stagedImports).length ? <div className="staged-list">{IMPORT_CATEGORIES.filter((item) => stagedImports[item.id]).map((item) => {
          const stage = stagedImports[item.id]
          const completion = MONTHLY_IMPORT_CATEGORIES.includes(item.id) ? stage.completeMonths.length ? `Complete: ${stage.completeMonths.join(', ')}` : 'Reporting periods incomplete' : item.id === 'employeeMaster' ? stage.completeAsOf ? `Complete as of ${stage.completeAsOf}` : 'Roster completeness unconfirmed' : stage.complete ? 'Complete dataset confirmed' : 'Dataset completeness unconfirmed'
          return <div className="staged-item" key={item.id}><span className="staged-icon"><CheckCircle2 size={16} /></span><span><strong>{item.label}</strong><small>{stage.rows.length} valid rows · {stage.fileName} · {completion}</small></span><button type="button" className="icon-button" aria-label={`Remove staged ${item.label}`} onClick={() => removeStaged(item.id)}><Trash2 size={15} /></button></div>
        })}</div> : <div className="import-empty"><Database size={18} /><span>No files staged. Previewing or validating a file does not replace or modify any existing dashboard data.</span></div>}
        {dataSource === 'live' && stagedImports[category] && <div className="validation-actions"><span>Submitting creates an unpublished batch. Independent review, approval, and publish permissions are required before dashboard visibility.</span><button type="button" className="stage-button" disabled={!databaseReady || !databaseCompanyId || databaseActionLoading || Boolean(stagedImports[category].summary?.rejectedRows || stagedImports[category].summary?.warningCount)} onClick={submitDatabaseBatch}>{databaseActionLoading ? 'Submitting…' : 'Submit to approval workflow'}</button></div>}
      </Panel>
      <Panel title="Import history" subtitle="Recent staging actions · metadata only · one-step rollback is available for the latest action. This history is tab-scoped and cleared on sign out or refresh." className="import-history-panel">
        {importHistory.length ? <div className="import-table-scroll"><table><thead><tr><th>Staged at</th><th>Dataset</th><th>File</th><th>Action</th><th>Total</th><th>Valid</th><th>Rejected</th><th>Warnings</th><th>Periods</th><th>Status</th><th>Undo</th></tr></thead><tbody>{importHistory.slice(0, 10).map((entry) => <tr key={entry.id}><td><time dateTime={entry.stagedAt}>{entry.stagedAtLabel}</time></td><td>{entry.categoryLabel}</td><td>{entry.fileName}</td><td>{entry.action}</td><td>{entry.totalRows}</td><td>{entry.validRows}</td><td>{entry.rejectedRows}</td><td>{entry.warningCount}</td><td>{entry.periods.length ? entry.periods.join(', ') : '—'}</td><td>{entry.status}</td><td>{importRollback?.historyId === entry.id ? <button type="button" className="export-button" onClick={onRollback}>Undo staging</button> : '—'}</td></tr>)}</tbody></table></div> : <div className="import-empty"><Clock3 size={18} /><span>No successful staging actions in this tab yet. Preview and validation attempts are not recorded as imports.</span></div>}
      </Panel>
      <p className="import-privacy-note"><Info size={13} /> Uploaded files and parsed rows stay in this tab's memory. This module does not use browser storage, network uploads, analytics or logging.</p>
    </div>
  )
}
